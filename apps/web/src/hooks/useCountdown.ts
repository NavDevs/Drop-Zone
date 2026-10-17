import { useEffect, useState } from 'react';

/** Seconds remaining until `expiresAt` (epoch ms), ticking once per second. 0 when expired/null. */
export function useCountdown(expiresAt: number | null): number {
  const [remaining, setRemaining] = useState(() =>
    expiresAt ? Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)) : 0,
  );

  useEffect(() => {
    if (!expiresAt) {
      setRemaining(0);
      return;
    }
    const tick = (): void => setRemaining(Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [expiresAt]);

  return remaining;
}

/** mm:ss for a countdown in seconds. */
export function formatCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
