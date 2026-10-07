'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, Loader2, Mic, Pause, Play, Square, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useClientMeetingRecorder } from '@/hooks/use-client-meeting-recorder';
import { formatMeetingTime, MEETING_MAX_DURATION_MS } from '@/lib/client-meetings';
import { getLocalMeetingSegments, type LocalMeeting, type LocalMeetingSegment } from '@/lib/client-meeting-local';

export interface MeetingRecorderProps {
  userId: string;
  clientId: string;
  quoteId?: string | null;
  title: string;
  onUploaded: (meetingId: string) => void;
  onBusyChange?: (busy: boolean) => void;
}

interface AudioPart { segment: LocalMeetingSegment; url: string }

function SavedAudio({ meeting }: { meeting: LocalMeeting }) {
  const [parts, setParts] = useState<AudioPart[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    let urls: string[] = [];
    void getLocalMeetingSegments(meeting.userId, meeting.id).then((segments) => {
      if (cancelled) return;
      const loaded = segments.map((segment) => ({ segment, url: URL.createObjectURL(segment.blob) }));
      urls = loaded.map((part) => part.url);
      setParts(loaded);
      if (!loaded.length) setError('Er is geen audio in deze lokale opname opgeslagen.');
    }).catch(() => { if (!cancelled) setError('De lokale audio kon niet worden gelezen.'); });
    return () => { cancelled = true; urls.forEach((url) => URL.revokeObjectURL(url)); };
  }, [meeting.id, meeting.userId]);
  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>;
  if (!parts.length) return <p className="text-sm text-muted-foreground">Audio laden…</p>;
  return (
    <div className="space-y-3 border-t pt-3">
      {parts.map(({ segment, url }) => (
        <div key={segment.index} className="space-y-1">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span>Deel {segment.index + 1} · {formatMeetingTime(segment.startMs)}–{formatMeetingTime(segment.startMs + segment.durationMs)}</span>
            <a
              href={url}
              download={`gesprek-${meeting.id}-deel-${segment.index + 1}.${segment.blob.type.includes('mp4') ? 'm4a' : segment.blob.type.includes('wav') ? 'wav' : 'webm'}`}
              className="inline-flex min-h-9 items-center gap-1 underline underline-offset-4"
            ><Download className="h-3.5 w-3.5" /> Bewaren</a>
          </div>
          <audio controls preload="none" src={url} className="h-10 w-full" aria-label={`Audiodeel ${segment.index + 1}`} />
          {!segment.finalized && <p className="text-xs text-amber-500">Dit deel is onderbroken en mogelijk niet volledig afspeelbaar. Bij upload wordt eerst gecontroleerd of herstel mogelijk is.</p>}
          {segment.inMemoryOnly && <p className="text-xs text-destructive">Noodkopie uit het geheugen. Andere audiodelen konden niet uit de lokale opslag worden gelezen. Bewaar dit deel voordat je de pagina sluit.</p>}
          {segment.recovered && <p className="text-xs text-amber-500">Hersteld na onderbreking. Controleer of het einde van het gesprek aanwezig is.</p>}
        </div>
      ))}
    </div>
  );
}

export function MeetingRecorder({ userId, clientId, quoteId, title, onUploaded, onBusyChange }: MeetingRecorderProps) {
  const recorder = useClientMeetingRecorder(userId);
  const [consent, setConsent] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [audioId, setAudioId] = useState<string | null>(null);
  const busyCallback = useRef(onBusyChange);
  busyCallback.current = onBusyChange;
  useEffect(() => { busyCallback.current?.(recorder.busy); }, [recorder.busy]);
  useEffect(() => () => { busyCallback.current?.(false); }, []);

  const active = ['recording', 'paused', 'saving', 'starting'].includes(recorder.phase);
  const waiting = recorder.phase === 'saving' || recorder.phase === 'starting';
  const local = recorder.sessions.filter((meeting) => meeting.id !== recorder.currentId);
  const pausedMeeting = recorder.phase === 'paused' ? recorder.sessions.find((meeting) => meeting.id === recorder.currentId) : undefined;

  async function upload(meeting: LocalMeeting): Promise<void> {
    if (await recorder.upload(meeting)) onUploaded(meeting.id);
  }
  async function finish(): Promise<void> {
    const meeting = await recorder.stop();
    if (meeting) await upload(meeting);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-lg border p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">Gesprek opnemen</h2>
          <span className="font-mono text-lg tabular-nums" aria-label="Opnameduur">{formatMeetingTime(recorder.durationMs)}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Houd Calvora zichtbaar en het scherm ontgrendeld. Bij schermvergrendeling, wisselen van app of een oproep kan de opname stoppen. Maximaal 90 minuten.
        </p>
        {!active && (
          <label className="flex cursor-pointer items-start gap-2 text-sm leading-5">
            <Checkbox checked={consent} onCheckedChange={(checked) => setConsent(checked === true)} disabled={Boolean(recorder.uploadingId)} className="mt-0.5" />
            <span>De klant is akkoord met opnemen en verwerking door AI.</span>
          </label>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {!active ? (
            <Button
              type="button"
              disabled={!consent || !clientId || !title.trim() || !recorder.localReady || Boolean(recorder.uploadingId)}
              onClick={() => { void recorder.start({ clientId, quoteId, title, consent }); setConsent(false); }}
              className="min-h-11"
            ><Mic className="mr-2 h-4 w-4" />Start opname</Button>
          ) : (
            <>
              {recorder.phase === 'recording' && (
                <Button type="button" variant="outline" onClick={() => { void recorder.pause().catch(() => undefined); }} className="min-h-11">
                  <Pause className="mr-2 h-4 w-4" />Pauzeren
                </Button>
              )}
              {recorder.phase === 'paused' && (
                <Button type="button" variant="outline" disabled={recorder.durationMs >= MEETING_MAX_DURATION_MS} onClick={() => { void recorder.resume(); }} className="min-h-11">
                  <Play className="mr-2 h-4 w-4" />Hervatten
                </Button>
              )}
              <Button type="button" disabled={waiting} onClick={() => { void finish(); }} className="min-h-11">
                {waiting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Square className="mr-2 h-4 w-4" />}
                {recorder.phase === 'starting' ? 'Microfoon openen…' : recorder.phase === 'saving' ? 'Audio opslaan…' : 'Stop en verwerk'}
              </Button>
              <span role="status" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                {recorder.phase === 'recording' && <span className="h-2 w-2 rounded-full bg-red-500" />}
                {recorder.phase === 'recording' ? 'Opname loopt' : recorder.phase === 'paused' ? 'Gepauzeerd' : ''}
              </span>
            </>
          )}
        </div>
        {recorder.uploadingId && (
          <div role="status" aria-live="polite" className="space-y-1 text-sm">
            <div className="flex justify-between gap-2"><span>Audio uploaden…</span><span>{recorder.uploadProgress}%</span></div>
            <progress max={100} value={recorder.uploadProgress} className="h-2 w-full accent-primary" aria-label="Uploadvoortgang" />
            <p className="text-xs text-muted-foreground">Laat deze pagina open tot de upload klaar is. Daarna gaat de verwerking op de server verder.</p>
          </div>
        )}
        {recorder.notice && <p role="status" className="text-sm text-amber-500">{recorder.notice}</p>}
        {recorder.error && <p role="alert" className="text-sm text-destructive">{recorder.error}</p>}
        {pausedMeeting && (
          <div className="space-y-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setAudioId(audioId === pausedMeeting.id ? null : pausedMeeting.id)}>
              <Download className="mr-2 h-4 w-4" />{audioId === pausedMeeting.id ? 'Audio sluiten' : 'Bewaarde audio controleren'}
            </Button>
            {audioId === pausedMeeting.id && <SavedAudio meeting={pausedMeeting} />}
          </div>
        )}
        <p className="text-xs text-muted-foreground">Audio wordt tussentijds op dit apparaat bewaard. Een abrupt gesloten browser kan het laatste deel missen. Wis browsergegevens pas nadat de opname is verwerkt.</p>
      </div>

      {local.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Opnamen op dit apparaat</h3>
          <p className="text-xs text-muted-foreground">Lokale kopieën blijven bewaard tot je ze hieronder verwijdert. Na een onderbreking kun je opnieuw uploaden.</p>
          {local.map((meeting) => (
            <div key={meeting.id} className="space-y-2 rounded-lg border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium">{meeting.title}</p>
                  <p className="text-xs text-muted-foreground">{new Date(meeting.createdAt).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' })} · {formatMeetingTime(meeting.durationMs)} · {meeting.status === 'queued' ? 'Ontvangen door server' : meeting.status === 'ready' ? 'Nog te uploaden' : 'Onderbroken opname'}</p>
                </div>
                <Button type="button" variant="ghost" size="icon" disabled={recorder.busy} onClick={() => setConfirmDeleteId(meeting.id)} aria-label={`Lokale opname ${meeting.title} verwijderen`}><Trash2 className="h-4 w-4" /></Button>
              </div>
              {meeting.warning && <p className="text-xs text-amber-500">{meeting.warning}</p>}
              <div className="flex flex-wrap gap-2">
                {meeting.status !== 'queued' ? (
                  <Button type="button" variant="outline" size="sm" disabled={recorder.busy} onClick={() => { void upload(meeting); }}>
                    <Upload className="mr-2 h-4 w-4" />Upload en verwerk
                  </Button>
                ) : <Button type="button" variant="outline" size="sm" disabled={recorder.busy} onClick={() => onUploaded(meeting.id)}>Open gesprek</Button>}
                <Button type="button" variant="outline" size="sm" onClick={() => setAudioId(audioId === meeting.id ? null : meeting.id)}><Download className="mr-2 h-4 w-4" />{audioId === meeting.id ? 'Audio sluiten' : 'Audio beluisteren / bewaren'}</Button>
              </div>
              {audioId === meeting.id && <SavedAudio meeting={meeting} />}
              {confirmDeleteId === meeting.id && (
                <div className="space-y-2 rounded-md border border-destructive/40 p-3">
                  <p className="text-sm">Deze lokale audio verwijderen? {meeting.status === 'queued' ? 'Het gesprek op de server blijft bestaan.' : 'Nog niet geüploade audio gaat hierdoor verloren.'}</p>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => setConfirmDeleteId(null)}>Annuleren</Button>
                    <Button type="button" variant="destructive" size="sm" disabled={recorder.busy} onClick={() => { void recorder.remove(meeting.id); setConfirmDeleteId(null); }}>Verwijder lokale audio</Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
