'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { parseScenarioAmount } from '@/lib/bank-cost-scenario';
import { workspaceSchema, type Workspace } from '@/lib/vision/model';
import { mergeEdits } from '@/lib/vision/merge';

export function readKostenCash(userId: string): number | null {
  try {
    const raw = JSON.parse(localStorage.getItem('kosten-totalen-scenario-v1:' + userId) || 'null')?.cash;
    const amount = typeof raw === 'string' && raw.trim() ? parseScenarioAmount(raw) : null;
    return amount !== null && amount >= 0 ? amount : null;
  } catch {
    return null;
  }
}

export function download(name: string, data: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function request<T>(user: User, path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', 'Bearer ' + (await user.getIdToken()));
  if (init.body) headers.set('Content-Type', 'application/json');
  const r = await fetch('/api/vision' + path, {
    signal: AbortSignal.timeout(125000),
    ...init,
    headers,
    cache: 'no-store',
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(Error(data.error ?? 'Geen verbinding met Vision.'), { status: r.status });
  return data;
}
interface Saved {
  revision: number;
  document: Workspace;
}
export function useVision(user: User) {
  const [w, setW] = useState<Workspace | null>(null),
    [status, setStatus] = useState('Laden…'),
    [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const locked = useRef(false);
  const base = useRef<Saved | null>(null),
    local = useRef<Workspace | null>(null),
    alive = useRef(false),
    loadId = useRef<symbol | null>(null);
  const busy = useRef<Promise<boolean> | null>(null),
    timer = useRef<ReturnType<typeof setTimeout>>(),
    storage = 'vision-pending-v1:' + user.uid;
  const checkpoint = useCallback(() => {
    try {
      if (local.current === base.current?.document) localStorage.removeItem(storage);
      else
        localStorage.setItem(storage, JSON.stringify({ base: base.current?.document, local: local.current }));
    } catch {
      setError(
        'De tijdelijke kopie op dit apparaat kon niet worden bijgewerkt. Houd dit scherm open tot het opslaan klaar is.',
      );
    }
  }, [storage]);
  const flush = useCallback(async (): Promise<boolean> => {
    clearTimeout(timer.current);
    if (locked.current) return false;
    if (busy.current) return busy.current;
    const task = async () => {
      try {
        while (alive.current && base.current && local.current && local.current !== base.current.document) {
          const current = base.current,
            document = local.current;
          setStatus('Opslaan…');
          try {
            const saved = await request<{ revision: number }>(user, '', {
              method: 'PUT',
              body: JSON.stringify({ revision: current.revision, document }),
            });
            if (!alive.current) return false;
            base.current = { revision: saved.revision, document };
          } catch (e) {
            if ((e as { status?: number }).status !== 409) throw e;
            const remote = await request<Saved>(user, '');
            if (!alive.current) return false;
            try {
              local.current = workspaceSchema.parse(
                mergeEdits(current.document, local.current, remote.document),
              );
            } catch {
              locked.current = true;
              setConflict(true);
              throw Error(
                'Twee apparaten wijzigden hetzelfde veld. Download je lokale kopie en laad de serverversie.',
              );
            }
            base.current = remote;
            setW(local.current);
          }
          checkpoint();
        }
        if (alive.current) {
          setStatus('Opgeslagen');
          setError('');
        }
        return true;
      } catch (e) {
        if (alive.current) {
          setStatus('Nog niet opgeslagen');
          setError((e as Error).message);
        }
        return false;
      }
    };
    busy.current = task();
    try {
      return await busy.current;
    } finally {
      busy.current = null;
    }
  }, [checkpoint, user]);
  const change = useCallback(
    (fn: (old: Workspace) => Workspace) => {
      if (!local.current) return;
      const next = fn(local.current);
      local.current = next;
      setW(next);
      setStatus('Wijzigingen opslaan…');
      checkpoint();
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 420);
    },
    [checkpoint, flush],
  );
  const load = useCallback(
    async (discard = false) => {
      const version = Symbol();
      loadId.current = version;
      try {
        const saved = await request<Saved>(user, '');
        if (!alive.current || version !== loadId.current) return;
        let doc = saved.document;
        const cache = discard ? null : localStorage.getItem(storage);
        base.current = saved;
        locked.current = false;
        setConflict(false);
        setError('');
        if (cache) {
          const pending = JSON.parse(cache);
          const safe = workspaceSchema.parse(pending.local);
          try {
            doc = workspaceSchema.parse(mergeEdits(pending.base, safe, doc));
          } catch {
            locked.current = true;
            base.current = { ...saved, document: workspaceSchema.parse(pending.base) };
            local.current = safe;
            setW(safe);
            setConflict(true);
            setStatus('Opslagconflict');
            setError('Lokale en opgeslagen wijzigingen overlappen. Download eerst je lokale kopie.');
            return;
          }
        } else if (doc.manual.cash === null) {
          const cash = readKostenCash(user.uid);
          if (cash !== null && cash >= 0) doc = { ...doc, manual: { ...doc.manual, cash } };
        }
        local.current = doc;
        setW(doc);
        checkpoint();
        setStatus('Opgeslagen');
        if (doc !== saved.document) void flush();
      } catch (e) {
        if (alive.current) {
          setStatus('Niet geladen');
          setError((e as Error).message);
        }
      }
    },
    [checkpoint, flush, storage, user],
  );
  useEffect(() => {
    alive.current = true;
    void load();
    const retry = () => {
      if (local.current) void flush();
      else void load();
    };
    window.addEventListener('online', retry);
    return () => {
      alive.current = false;
      loadId.current = null;
      clearTimeout(timer.current);
      window.removeEventListener('online', retry);
    };
  }, [load, flush]);
  return { w, change, status, error, conflict, flush, load };
}
export type Change = (fn: (w: Workspace) => Workspace) => void;
