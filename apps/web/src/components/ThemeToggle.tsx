import { useSettingsStore, type ThemeChoice } from '../state/settingsStore.js';

const LABEL: Record<ThemeChoice, string> = { light: 'Light', dark: 'Dark', system: 'System' };
const NEXT: Record<ThemeChoice, ThemeChoice> = { light: 'dark', dark: 'system', system: 'light' };

/** Cycles light → dark → system. Accessible button announcing the current mode. */
export function ThemeToggle() {
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);

  return (
    <button
      type="button"
      onClick={() => setTheme(NEXT[theme])}
      aria-label={`Theme: ${LABEL[theme]}. Click to change.`}
      className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
    >
      {LABEL[theme]}
    </button>
  );
}
