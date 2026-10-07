'use client';

export type LocalMeetingStatus = 'recording' | 'paused' | 'interrupted' | 'ready' | 'queued';

export interface LocalMeeting {
  id: string;
  userId: string;
  clientId: string;
  quoteId: string | null;
  title: string;
  consent: true;
  createdAt: number;
  updatedAt: number;
  durationMs: number;
  status: LocalMeetingStatus;
  warning?: string;
}

export interface LocalMeetingSegment {
  userId: string;
  meetingId: string;
  index: number;
  startMs: number;
  durationMs: number;
  blob: Blob;
  finalized: boolean;
  recovered?: boolean;
  inMemoryOnly?: boolean;
}

const DATABASE = 'calvora-client-meetings';
const sessionMemory = new Map<string, LocalMeeting>();
const segmentMemory = new Map<string, LocalMeetingSegment>();
let database: Promise<IDBDatabase> | undefined;
let writes: Promise<void> = Promise.resolve();

function sessionKey(userId: string, meetingId: string): string {
  return `${userId}:${meetingId}`;
}

function segmentKey(segment: Pick<LocalMeetingSegment, 'userId' | 'meetingId' | 'index'>): string {
  return `${sessionKey(segment.userId, segment.meetingId)}:${segment.index}`;
}

function openDatabase(): Promise<IDBDatabase> {
  if (!database) {
    database = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('Lokale opslag is niet beschikbaar. Open Calvora in Safari en probeer opnieuw.'));
        return;
      }
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore('sessions', { keyPath: 'key' }).createIndex('userId', 'userId');
        db.createObjectStore('segments', { keyPath: 'key' }).createIndex('sessionKey', 'sessionKey');
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); database = undefined; };
        resolve(db);
      };
      request.onerror = () => reject(request.error || new Error('Lokale opslag kon niet worden geopend.'));
      request.onblocked = () => reject(new Error('Sluit andere Calvora-tabbladen en probeer opnieuw.'));
    }).catch((error) => { database = undefined; throw error; });
  }
  return database;
}

async function commit(storeName: string, action: (store: IDBObjectStore) => void): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Lokale opslag is mislukt.'));
    transaction.onabort = () => reject(transaction.error || new Error('Lokale opslag is afgebroken.'));
    action(transaction.objectStore(storeName));
  });
}

function enqueueWrite(action: () => Promise<void>): Promise<void> {
  const next = writes.then(action);
  writes = next.catch(() => undefined);
  return next;
}

async function readAll<T>(storeName: string, index: string, key: string): Promise<T[]> {
  await writes;
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, 'readonly').objectStore(storeName).index(index).getAll(key);
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error || new Error('Lokale opname kon niet worden gelezen.'));
  });
}

/** Bewaar de laatste versie in geheugen totdat IndexedDB de transactie bevestigt. */
export function saveLocalMeeting(meeting: LocalMeeting): Promise<void> {
  const snapshot = { ...meeting };
  const key = sessionKey(meeting.userId, meeting.id);
  sessionMemory.set(key, snapshot);
  return enqueueWrite(async () => {
    await commit('sessions', (store) => { store.put({ ...snapshot, key }); });
    if (sessionMemory.get(key) === snapshot) sessionMemory.delete(key);
  });
}

export function saveLocalMeetingSegment(segment: LocalMeetingSegment): Promise<void> {
  const snapshot = { ...segment };
  const key = segmentKey(segment);
  segmentMemory.set(key, snapshot);
  return enqueueWrite(async () => {
    await commit('segments', (store) => {
      store.put({ ...snapshot, key, sessionKey: sessionKey(segment.userId, segment.meetingId) });
    });
    if (segmentMemory.get(key) === snapshot) segmentMemory.delete(key);
  });
}

export async function listLocalMeetings(userId: string): Promise<LocalMeeting[]> {
  const memory = [...sessionMemory.values()].filter((meeting) => meeting.userId === userId);
  const saved = await readAll<LocalMeeting>('sessions', 'userId', userId).catch((error) => {
    if (!memory.length) throw error;
    return [];
  });
  const merged = new Map(saved.map((meeting) => [meeting.id, meeting]));
  for (const meeting of sessionMemory.values()) {
    if (meeting.userId === userId) merged.set(meeting.id, meeting);
  }
  return [...merged.values()].sort((a, b) => b.createdAt - a.createdAt);
}

export async function getLocalMeetingSegments(userId: string, meetingId: string): Promise<LocalMeetingSegment[]> {
  const memory = [...segmentMemory.values()].filter((segment) => segment.userId === userId && segment.meetingId === meetingId);
  let memoryOnly = false;
  const saved = await readAll<LocalMeetingSegment>('segments', 'sessionKey', sessionKey(userId, meetingId)).catch((error) => {
    if (!memory.length) throw error;
    memoryOnly = true;
    return [];
  });
  const merged = new Map(saved.map((segment) => [segment.index, segment]));
  for (const segment of segmentMemory.values()) {
    if (segment.userId === userId && segment.meetingId === meetingId) merged.set(segment.index, { ...segment, ...(memoryOnly ? { inMemoryOnly: true } : {}) });
  }
  return [...merged.values()].sort((a, b) => a.index - b.index);
}

/** Probeer elke mislukte audio-write opnieuw voordat nieuwe audio wordt opgenomen. */
export async function flushLocalMeetings(userId: string, meetingId?: string): Promise<void> {
  await writes;
  const segments = [...segmentMemory.values()].filter((segment) => segment.userId === userId && (!meetingId || segment.meetingId === meetingId));
  const sessions = [...sessionMemory.values()].filter((meeting) => meeting.userId === userId && (!meetingId || meeting.id === meetingId));
  for (const segment of segments) await saveLocalMeetingSegment(segment);
  for (const meeting of sessions) await saveLocalMeeting(meeting);
}

export async function deleteLocalMeeting(userId: string, meetingId: string): Promise<void> {
  await enqueueWrite(async () => {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(['sessions', 'segments'], 'readwrite');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
      transaction.objectStore('sessions').delete(sessionKey(userId, meetingId));
      const cursor = transaction.objectStore('segments').index('sessionKey').openCursor(sessionKey(userId, meetingId));
      cursor.onsuccess = () => {
        if (cursor.result) { cursor.result.delete(); cursor.result.continue(); }
      };
    });
    sessionMemory.delete(sessionKey(userId, meetingId));
    for (const [key, segment] of segmentMemory.entries()) {
      if (segment.userId === userId && segment.meetingId === meetingId) segmentMemory.delete(key);
    }
  });
}

/** PCM maakt een hersteld, decodeerbaar fragment zelfstandig afspeelbaar. */
export function meetingAudioToWav(buffer: AudioBuffer): Blob {
  const channels = Math.min(2, buffer.numberOfChannels);
  const dataSize = buffer.length * channels * 2;
  const data = new ArrayBuffer(44 + dataSize);
  const view = new DataView(data);
  const writeText = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
  };
  writeText(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); writeText(8, 'WAVE');
  writeText(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, channels, true); view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true);
  writeText(36, 'data'); view.setUint32(40, dataSize, true);
  const samples = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel));
  for (let i = 0; i < buffer.length; i += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const value = Math.max(-1, Math.min(1, samples[channel][i]));
      view.setInt16(44 + (i * channels + channel) * 2, value < 0 ? value * 32768 : value * 32767, true);
    }
  }
  return new Blob([data], { type: 'audio/wav' });
}

/** Een onafgesloten media-container wordt nooit zonder decodecontrole geüpload. */
export async function recoverLocalMeetingSegments(userId: string, meetingId: string): Promise<void> {
  const segments = await getLocalMeetingSegments(userId, meetingId);
  for (const segment of segments) {
    if (segment.finalized) continue;
    const audioContext = new AudioContext();
    try {
      const buffer = await audioContext.decodeAudioData(await segment.blob.arrayBuffer());
      if (!buffer.length || !Number.isFinite(buffer.duration) || buffer.duration <= 0) {
        throw new Error('Geen herstelbare audio gevonden.');
      }
      await saveLocalMeetingSegment({
        ...segment,
        blob: meetingAudioToWav(buffer),
        durationMs: Math.round(buffer.duration * 1000),
        finalized: true,
        recovered: true,
      });
    } catch {
      throw new Error('Het laatste audiodeel kon niet veilig worden hersteld. Download de bewaarde audio; deze opname wordt niet onvolledig verwerkt.');
    } finally {
      await audioContext.close().catch(() => undefined);
    }
  }
}
