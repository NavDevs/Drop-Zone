import { create } from 'zustand';
import { getDeviceName, setDeviceName as persistDeviceName } from '../lib/device.js';

export type ThemeChoice = 'light' | 'dark' | 'system';

const THEME_KEY = 'dz:theme';

function readTheme(): ThemeChoice {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  } catch {
    // storage unavailable (private mode) — fall through
  }
  return 'system';
}

export function resolveTheme(choice: ThemeChoice): 'light' | 'dark' {
  if (choice !== 'system') return choice;
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Applies the resolved theme class to <html>. Safe to call outside the browser. */
export function applyTheme(choice: ThemeChoice): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', resolveTheme(choice) === 'dark');
}

interface SettingsState {
  theme: ThemeChoice;
  deviceName: string;
  setTheme: (theme: ThemeChoice) => void;
  setDeviceName: (name: string) => void;
  /** Follow OS changes while theme === 'system'. Call once at app start. */
  watchSystemTheme: () => () => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  theme: readTheme(),
  deviceName: getDeviceName(),
  setTheme: (theme) => {
    localStorage.setItem(THEME_KEY, theme);
    applyTheme(theme);
    set({ theme });
  },
  setDeviceName: (name) => {
    persistDeviceName(name);
    set({ deviceName: name });
  },
  watchSystemTheme: () => {
    if (typeof window === 'undefined' || !window.matchMedia) return () => {};
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (): void => {
      const current = useSettingsStore.getState().theme;
      if (current === 'system') applyTheme('system');
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  },
}));
