/**
 * Screen Wake Lock coordinator for active transfers (TRD §7, §10).
 * Prevents mobile devices and laptops from sleeping during large file transfers.
 */
let wakeLockSentinel: {
  release: () => Promise<void>;
  addEventListener?: (type: string, listener: () => void) => void;
} | null = null;
let activeCount = 0;

export async function acquireWakeLock(): Promise<void> {
  activeCount++;
  if (activeCount > 1 || wakeLockSentinel !== null) return;

  if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
    try {
      wakeLockSentinel = await navigator.wakeLock.request('screen');
      wakeLockSentinel?.addEventListener?.('release', () => {
        wakeLockSentinel = null;
      });
    } catch (err) {
      console.warn('Wake Lock request failed:', err);
      wakeLockSentinel = null;
    }
  }
}

export async function releaseWakeLock(): Promise<void> {
  activeCount = Math.max(0, activeCount - 1);
  if (activeCount === 0 && wakeLockSentinel) {
    try {
      await wakeLockSentinel.release();
    } catch {
      // ignore
    }
    wakeLockSentinel = null;
  }
}
