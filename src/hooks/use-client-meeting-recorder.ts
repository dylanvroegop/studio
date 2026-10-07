'use client';

import { useEffect, useRef, useState } from 'react';
import { useUser } from '@/firebase';
import { MEETING_MAX_CHUNK_BYTES, MEETING_MAX_DURATION_MS } from '@/lib/client-meetings';
import {
  deleteLocalMeeting, flushLocalMeetings, getLocalMeetingSegments, listLocalMeetings,
  recoverLocalMeetingSegments, saveLocalMeeting, saveLocalMeetingSegment,
  type LocalMeeting, type LocalMeetingSegment,
} from '@/lib/client-meeting-local';

export type RecorderPhase = 'idle' | 'starting' | 'recording' | 'saving' | 'paused' | 'stopped';
interface RecorderInput { clientId: string; quoteId?: string | null; title: string; consent: boolean }
interface SegmentCapture {
  recorder: MediaRecorder;
  pieces: Blob[];
  index: number;
  startMs: number;
  stoppedByApp: boolean;
  stopped: Promise<void>;
}

// Een remount mag nooit naast het nog afsluitende opnameproces een microfoon openen.
const recordingLocks = new Map<string, symbol>();
const SEGMENT_DURATION_MS = 60_000;
const SAVE_INTERVAL_MS = 3_000;

function recordingMimeType(): string {
  const types = ['audio/webm;codecs=opus', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm'];
  const type = types.find((value) => MediaRecorder.isTypeSupported(value));
  if (!type) throw new Error('Deze browser ondersteunt geen geschikt opnameformaat. Gebruik een actuele Safari of Chrome.');
  return type;
}

function describeError(error: unknown): string {
  if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError')) {
    return 'Microfoontoegang geweigerd. Sta de microfoon voor Calvora toe in de browserinstellingen en probeer opnieuw.';
  }
  if (error instanceof DOMException && error.name === 'NotFoundError') return 'Er is geen microfoon gevonden.';
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return 'De lokale opslag is vol. De opname is onderbroken. Bewaar de audio voordat je deze pagina sluit.';
  }
  return error instanceof Error ? error.message : 'De opname kon niet worden voltooid.';
}

export function useClientMeetingRecorder(userId: string) {
  const { user } = useUser();
  const [phase, setPhase] = useState<RecorderPhase>('idle');
  const [durationMs, setDurationMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sessions, setSessions] = useState<LocalMeeting[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [localReady, setLocalReady] = useState(false);
  const mounted = useRef(true);
  const owner = useRef(Symbol('meeting-recorder'));
  const session = useRef<LocalMeeting | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const capture = useRef<SegmentCapture | null>(null);
  const segmentIndex = useRef(0);
  const completedDuration = useRef(0);
  const runningSince = useRef<number | null>(null);
  const desired = useRef<'recording' | 'paused' | 'stopped'>('stopped');
  const operations = useRef<Promise<unknown>>(Promise.resolve());
  const segmentWrites = useRef<Promise<void>>(Promise.resolve());
  const storageFailure = useRef<Error | null>(null);
  const rotateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wakeLock = useRef<WakeLockSentinel | null>(null);
  const uploadLock = useRef(false);
  const lifecycle = useRef<{ interrupt: (reason: string) => void; cleanup: () => void } | null>(null);

  function changePhase(value: RecorderPhase): void { if (mounted.current) setPhase(value); }
  function reportError(value: unknown): void { if (mounted.current) setError(describeError(value)); }
  function elapsed(): number {
    return Math.min(MEETING_MAX_DURATION_MS, Math.round(completedDuration.current + (runningSince.current === null ? 0 : performance.now() - runningSince.current)));
  }
  function freezeTime(): void {
    completedDuration.current = elapsed();
    runningSince.current = null;
    if (mounted.current) setDurationMs(completedDuration.current);
  }
  function serialize<T>(action: () => Promise<T>): Promise<T> {
    const next = operations.current.then(action);
    operations.current = next.catch(() => undefined);
    return next;
  }
  async function refresh(): Promise<void> {
    try {
      const values = await listLocalMeetings(userId);
      if (mounted.current) { setSessions(values); setLocalReady(true); }
    } catch (cause) { reportError(cause); }
  }
  function releaseStream(): void {
    const previous = stream.current;
    stream.current = null;
    previous?.getTracks().forEach((track) => { track.onended = null; track.onmute = null; track.stop(); });
    const lock = wakeLock.current;
    wakeLock.current = null;
    if (lock) void lock.release().catch(() => undefined);
  }
  async function requestStream(): Promise<void> {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      throw new Error('Opnemen vereist HTTPS en een browser met microfoontoegang.');
    }
    stream.current = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false,
    });
    if (!mounted.current || desired.current !== 'recording' || document.visibilityState !== 'visible') {
      releaseStream();
      throw new Error('Opname onderbroken. Open deze pagina en druk op Hervatten.');
    }
    stream.current.getAudioTracks().forEach((track) => {
      track.onended = () => lifecycle.current?.interrupt('De microfoon is gestopt. Controleer de opname en hervat handmatig.');
      track.onmute = () => lifecycle.current?.interrupt('De microfoon is onderbroken, bijvoorbeeld door een telefoongesprek. Hervat handmatig.');
    });
    if ('wakeLock' in navigator) {
      void navigator.wakeLock.request('screen').then((lock) => {
        if (!mounted.current || desired.current !== 'recording') void lock.release().catch(() => undefined);
        else wakeLock.current = lock;
      }).catch(() => undefined);
    }
  }
  function retainStorageFailure(cause: unknown): void {
    if (!storageFailure.current) {
      storageFailure.current = cause instanceof Error ? cause : new Error('Lokale opslag is mislukt.');
      lifecycle.current?.interrupt('Lokaal opslaan is mislukt. Bewaar de audio voordat je deze pagina sluit.');
    }
  }
  function persistSnapshot(segment: SegmentCapture, finalized: boolean): Promise<void> {
    const current = session.current;
    if (!current || !segment.pieces.length) return Promise.resolve();
    const duration = elapsed();
    const snapshot: LocalMeetingSegment = {
      userId, meetingId: current.id, index: segment.index, startMs: segment.startMs,
      durationMs: Math.max(1, duration - segment.startMs),
      blob: new Blob(segment.pieces, { type: segment.recorder.mimeType }), finalized,
    };
    const meeting = { ...current, durationMs: duration, updatedAt: Date.now() };
    segmentWrites.current = segmentWrites.current.then(async () => {
      await saveLocalMeetingSegment(snapshot);
      await saveLocalMeeting(meeting);
    }).catch(retainStorageFailure);
    return segmentWrites.current;
  }
  function beginSegment(): void {
    if (!stream.current || desired.current !== 'recording' || !mounted.current) return;
    const recorder = new MediaRecorder(stream.current, { mimeType: recordingMimeType(), audioBitsPerSecond: 64_000 });
    let stopped!: () => void;
    const segment: SegmentCapture = {
      recorder, pieces: [], index: segmentIndex.current, startMs: elapsed(), stoppedByApp: false,
      stopped: new Promise<void>((resolve) => { stopped = resolve; }),
    };
    capture.current = segment;
    recorder.ondataavailable = (event) => {
      if (capture.current !== segment) return;
      if (event.data.size) { segment.pieces.push(event.data); void persistSnapshot(segment, false); }
    };
    recorder.onstop = () => {
      stopped();
      if (!segment.stoppedByApp && desired.current === 'recording') {
        lifecycle.current?.interrupt('De browser heeft de opname gestopt. Controleer de audio en hervat handmatig.');
      }
    };
    recorder.onerror = () => lifecycle.current?.interrupt('De browser heeft de opname onderbroken. Controleer de bewaarde audio.');
    try {
      recorder.start(SAVE_INTERVAL_MS);
    } catch (cause) {
      segment.stoppedByApp = true;
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
      stopped();
      capture.current = null;
      throw cause;
    }
    runningSince.current = performance.now();
    changePhase('recording');
    rotateTimer.current = setTimeout(() => {
      void serialize(async () => {
        if (desired.current !== 'recording') return;
        await finishSegment();
        if (storageFailure.current) throw storageFailure.current;
        if (elapsed() >= MEETING_MAX_DURATION_MS) {
          lifecycle.current?.interrupt('De maximale opnameduur van 90 minuten is bereikt. Je kunt deze opname nu verwerken.');
          return;
        }
        beginSegment();
      }).catch((cause) => {
        reportError(cause);
        lifecycle.current?.interrupt('Het volgende audiodeel kon niet worden gestart. Controleer de opname en hervat handmatig.');
      });
    }, Math.min(SEGMENT_DURATION_MS, MEETING_MAX_DURATION_MS - elapsed()));
  }
  async function finishSegment(): Promise<void> {
    if (rotateTimer.current) { clearTimeout(rotateTimer.current); rotateTimer.current = null; }
    const segment = capture.current;
    if (!segment) return;
    freezeTime();
    segment.stoppedByApp = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      if (segment.recorder.state !== 'inactive') segment.recorder.stop();
      await Promise.race([
        segment.stopped,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error('De browser kon het laatste audiodeel niet afsluiten. De bewaarde fragmenten blijven beschikbaar voor herstel.')), 8_000);
        }),
      ]);
    } catch (cause) {
      await persistSnapshot(segment, false);
      // Een laat Safari-event mag na herstel nooit het oude deel weer overschrijven.
      segment.recorder.ondataavailable = null;
      segment.recorder.onstop = null;
      segment.recorder.onerror = null;
      capture.current = null;
      throw cause;
    } finally { if (timeout) clearTimeout(timeout); }
    // Het laatste dataavailable-event komt vóór stop. Voeg alle containerfragmenten samen.
    await segmentWrites.current;
    await persistSnapshot(segment, true);
    if (segment.pieces.length) segmentIndex.current += 1;
    segment.recorder.ondataavailable = null;
    segment.recorder.onstop = null;
    segment.recorder.onerror = null;
    capture.current = null;
  }
  async function persistStatus(status: LocalMeeting['status'], warning?: string): Promise<void> {
    if (!session.current) return;
    session.current = { ...session.current, status, durationMs: elapsed(), updatedAt: Date.now(), ...(warning ? { warning } : {}) };
    await saveLocalMeeting(session.current);
  }
  function pause(reason?: string): Promise<void> {
    if (!session.current || desired.current === 'stopped') return Promise.resolve();
    desired.current = 'paused';
    // Stop de tijd direct; wachtrijen en browsergebeurtenissen tellen niet als spreektijd.
    if (capture.current?.recorder.state === 'recording') capture.current.recorder.pause();
    freezeTime();
    changePhase('saving');
    if (reason && mounted.current) setNotice(reason);
    return serialize(async () => {
      try {
        await finishSegment();
        await persistStatus(reason ? 'interrupted' : 'paused', reason);
      } catch (cause) {
        reportError(cause);
      } finally {
        releaseStream();
        changePhase('paused');
        await refresh();
      }
    });
  }
  async function start(input: RecorderInput): Promise<void> {
    if (recordingLocks.has(userId) || uploadLock.current) return;
    if (!input.consent) { reportError(new Error('Bevestig eerst dat de klant akkoord is met opnemen en AI-verwerking.')); return; }
    if (!input.clientId || !input.title.trim()) { reportError(new Error('Kies een klant en vul een titel in.')); return; }
    recordingLocks.set(userId, owner.current);
    desired.current = 'recording';
    changePhase('starting');
    setError(null); setNotice(null); setDurationMs(0);
    storageFailure.current = null; completedDuration.current = 0; runningSince.current = null; segmentIndex.current = 0;
    await serialize(async () => {
      try {
        recordingMimeType();
        await flushLocalMeetings(userId);
        const created: LocalMeeting = {
          id: crypto.randomUUID(), userId, clientId: input.clientId, quoteId: input.quoteId || null,
          title: input.title.trim(), consent: true, createdAt: Date.now(), updatedAt: Date.now(),
          durationMs: 0, status: 'recording',
        };
        // Zonder bevestigde lokale opslag vragen we niet eens om de microfoon.
        await saveLocalMeeting(created);
        session.current = created;
        if (mounted.current) setCurrentId(created.id);
        await requestStream();
        beginSegment();
        await refresh();
        void navigator.storage?.persist?.().catch(() => undefined);
      } catch (cause) {
        desired.current = 'stopped'; releaseStream();
        recordingLocks.delete(userId); changePhase('stopped'); reportError(cause);
        await refresh();
      }
    });
  }
  async function resume(): Promise<void> {
    if (!session.current || elapsed() >= MEETING_MAX_DURATION_MS || desired.current === 'recording') return;
    changePhase('starting'); desired.current = 'recording'; setError(null);
    await serialize(async () => {
      try {
        // Een volle opslag moet eerst weer schrijven voordat er nieuwe audio bij komt.
        await flushLocalMeetings(userId, session.current?.id);
        await recoverLocalMeetingSegments(userId, session.current!.id);
        const saved = await getLocalMeetingSegments(userId, session.current!.id);
        const last = saved[saved.length - 1];
        segmentIndex.current = last ? last.index + 1 : 0;
        completedDuration.current = last ? last.startMs + last.durationMs : 0;
        await persistStatus('recording');
        storageFailure.current = null;
        await requestStream();
        beginSegment();
        if (mounted.current) setNotice(null);
      } catch (cause) { desired.current = 'paused'; releaseStream(); changePhase('paused'); reportError(cause); }
    });
  }
  async function stop(): Promise<LocalMeeting | null> {
    if (!session.current) return null;
    desired.current = 'stopped';
    if (capture.current?.recorder.state === 'recording') capture.current.recorder.pause();
    freezeTime(); changePhase('saving');
    return serialize(async () => {
      try {
        await finishSegment();
        await persistStatus('ready');
        if (storageFailure.current) throw storageFailure.current;
        return session.current;
      } catch (cause) { reportError(cause); return null; }
      finally {
        releaseStream(); recordingLocks.delete(userId); changePhase('stopped');
        if (mounted.current) setCurrentId(null);
        await refresh();
      }
    });
  }
  async function upload(meeting: LocalMeeting): Promise<boolean> {
    if (uploadLock.current || recordingLocks.has(userId)) return false;
    uploadLock.current = true; setUploadingId(meeting.id); setUploadProgress(0); setError(null);
    try {
      if (!user || user.uid !== userId || meeting.userId !== userId) throw new Error('Log opnieuw in om deze opname te uploaden.');
      await recoverLocalMeetingSegments(userId, meeting.id);
      const segments = await getLocalMeetingSegments(userId, meeting.id);
      if (!segments.length) throw new Error('Deze opname bevat nog geen audio.');
      if (segments.some((segment, index) => !segment.finalized || segment.inMemoryOnly || segment.index !== index || segment.blob.size > MEETING_MAX_CHUNK_BYTES)) {
        throw new Error('De audio is onvolledig of een deel is te groot. Bewaar de audio voordat je de lokale opname verwijdert.');
      }
      const request = async (url: string, init: RequestInit) => {
        const token = await user.getIdToken();
        const response = await fetch(url, { ...init, signal: AbortSignal.timeout(120_000), headers: { ...init.headers, Authorization: `Bearer ${token}` } });
        if (!response.ok) {
          const result = await response.json().catch(() => null);
          throw new Error(result?.error || `Upload mislukt (${response.status}). De audio blijft lokaal bewaard.`);
        }
        return response;
      };
      await request('/api/client-meetings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: meeting.id, clientId: meeting.clientId, quoteId: meeting.quoteId, title: meeting.title, consent: true }),
      });
      for (let index = 0; index < segments.length; index += 1) {
        const segment = segments[index];
        await request(`/api/client-meetings/${meeting.id}/chunks/${index}`, {
          method: 'PUT', headers: {
            'Content-Type': segment.blob.type, 'x-duration-ms': String(segment.durationMs), 'x-start-ms': String(segment.startMs),
          }, body: segment.blob,
        });
        if (mounted.current) setUploadProgress(Math.round(((index + 1) / segments.length) * 95));
      }
      await request(`/api/client-meetings/${meeting.id}/process`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chunkCount: segments.length }),
      });
      // Ook na queuebevestiging blijft de kopie beschikbaar tot expliciete verwijdering.
      await saveLocalMeeting({ ...meeting, status: 'queued', updatedAt: Date.now() });
      if (mounted.current) setUploadProgress(100);
      return true;
    } catch (cause) { reportError(cause); return false; }
    finally { uploadLock.current = false; if (mounted.current) setUploadingId(null); await refresh(); }
  }
  async function remove(meetingId: string): Promise<void> {
    if (meetingId === session.current?.id && recordingLocks.has(userId)) return;
    try { await deleteLocalMeeting(userId, meetingId); await refresh(); }
    catch (cause) { reportError(cause); }
  }

  lifecycle.current = {
    interrupt: (reason) => {
      if (desired.current === 'recording') void pause(reason).catch(reportError);
    },
    cleanup: () => {
      if (recordingLocks.get(userId) !== owner.current) return;
      desired.current = 'stopped';
      if (capture.current?.recorder.state === 'recording') capture.current.recorder.pause();
      freezeTime();
      void serialize(async () => {
        try { await finishSegment(); await persistStatus('interrupted', 'Opname onderbroken doordat de pagina is verlaten. Controleer de laatste audio.'); }
        catch { /* Geheugenbuffers blijven in client-meeting-local beschikbaar bij opslagfouten. */ }
        finally {
          releaseStream();
          if (recordingLocks.get(userId) === owner.current) recordingLocks.delete(userId);
        }
      });
    },
  };

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const visibility = () => {
      if (document.visibilityState !== 'visible') lifecycle.current?.interrupt('Opname onderbroken: Calvora staat niet meer in beeld. Controleer de opname en druk op Hervatten.');
      else void refresh();
    };
    const pageHide = () => lifecycle.current?.interrupt('Opname onderbroken doordat de pagina is verlaten.');
    const deleted = () => { void refresh(); };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', pageHide);
    window.addEventListener('client-meeting-deleted', deleted);
    const timer = setInterval(() => {
      if (runningSince.current !== null) {
        setDurationMs(elapsed());
        if (elapsed() >= MEETING_MAX_DURATION_MS) lifecycle.current?.interrupt('De maximale opnameduur van 90 minuten is bereikt. Stop en verwerk deze opname.');
      }
    }, 250);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', pageHide);
      window.removeEventListener('client-meeting-deleted', deleted);
      lifecycle.current?.cleanup();
    };
    // De recorder leeft per ingelogde gebruiker. Eventhandlers lezen actuele functies via refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return {
    phase, durationMs, error, notice, sessions, currentId, uploadingId, uploadProgress, localReady,
    busy: ['starting', 'recording', 'saving', 'paused'].includes(phase) || Boolean(uploadingId),
    start, pause, resume, stop, upload, remove, refresh,
  };
}
