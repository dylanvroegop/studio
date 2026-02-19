'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useFirestore, useUser } from '@/firebase';

export type AppearanceMode = 'dark' | 'light';

const THEME_STORAGE_KEY = 'offertehulp.appearanceMode';
const DEFAULT_MODE: AppearanceMode = 'dark';

interface SetModeOptions {
  persist?: boolean;
}

interface ThemeModeContextState {
  mode: AppearanceMode;
  resolvedMode: AppearanceMode;
  isThemeReady: boolean;
  setMode: (nextMode: AppearanceMode, options?: SetModeOptions) => Promise<void>;
}

const ThemeModeContext = createContext<ThemeModeContextState | undefined>(undefined);

function isAppearanceMode(value: unknown): value is AppearanceMode {
  return value === 'dark' || value === 'light';
}

function getModeFromDom(): AppearanceMode {
  if (typeof document === 'undefined') return DEFAULT_MODE;
  const domTheme = document.documentElement.dataset.theme;
  if (isAppearanceMode(domTheme)) return domTheme;
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function applyModeToDom(nextMode: AppearanceMode): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('dark', nextMode === 'dark');
  root.dataset.theme = nextMode;
}

function persistLocalMode(nextMode: AppearanceMode): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(THEME_STORAGE_KEY, nextMode);
}

export function ThemeModeProvider({ children }: { children: React.ReactNode }) {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  const [mode, setModeState] = useState<AppearanceMode>(() => {
    if (typeof window === 'undefined') return DEFAULT_MODE;
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isAppearanceMode(stored)) return stored;
    return getModeFromDom();
  });
  const [isThemeReady, setIsThemeReady] = useState(false);

  const setMode = useCallback(
    async (nextMode: AppearanceMode, options: SetModeOptions = {}) => {
      const { persist = true } = options;

      setModeState(nextMode);
      applyModeToDom(nextMode);
      persistLocalMode(nextMode);

      if (!persist || !user || !firestore) return;

      await setDoc(
        doc(firestore, 'users', user.uid),
        {
          settings: {
            appearanceMode: nextMode,
          },
        },
        { merge: true }
      );
    },
    [user, firestore]
  );

  useEffect(() => {
    applyModeToDom(mode);
    persistLocalMode(mode);
    setIsThemeReady(true);
  }, [mode]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return;
      if (!isAppearanceMode(event.newValue)) return;
      setModeState(event.newValue);
      applyModeToDom(event.newValue);
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useEffect(() => {
    if (isUserLoading) return;
    if (!user || !firestore) return;

    let isCancelled = false;

    const syncFromFirestore = async () => {
      try {
        const userSnap = await getDoc(doc(firestore, 'users', user.uid));
        const remoteMode = userSnap.exists()
          ? (userSnap.data()?.settings?.appearanceMode as unknown)
          : undefined;

        if (isCancelled) return;

        if (isAppearanceMode(remoteMode)) {
          await setMode(remoteMode, { persist: false });
          return;
        }

        await setMode(DEFAULT_MODE, { persist: false });
        await setDoc(
          doc(firestore, 'users', user.uid),
          {
            settings: {
              appearanceMode: DEFAULT_MODE,
            },
          },
          { merge: true }
        );
      } catch (error) {
        if (!isCancelled) {
          console.error('Theme sync failed:', error);
        }
      }
    };

    void syncFromFirestore();

    return () => {
      isCancelled = true;
    };
  }, [isUserLoading, user, firestore, setMode]);

  const value = useMemo<ThemeModeContextState>(
    () => ({
      mode,
      resolvedMode: mode,
      isThemeReady,
      setMode,
    }),
    [mode, isThemeReady, setMode]
  );

  return <ThemeModeContext.Provider value={value}>{children}</ThemeModeContext.Provider>;
}

export function useThemeMode(): ThemeModeContextState {
  const context = useContext(ThemeModeContext);
  if (!context) {
    throw new Error('useThemeMode must be used within ThemeModeProvider.');
  }
  return context;
}

export const themeModeStorageKey = THEME_STORAGE_KEY;
export const defaultAppearanceMode: AppearanceMode = DEFAULT_MODE;
