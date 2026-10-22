/**
 * Screen Wake Lock coordinator for occupied rooms and active transfers (TRD §7, §10).
 * Prevents mobile devices and laptops from sleeping, which is what makes the OS
 * suspend the tab and drop the signaling socket mid-session.
 */
let wakeLockSentinel: {
  release: () => Promise<void>;
  addEventListener?: (type: string, listener: () => void) => void;
} | null = null;
let activeCount = 0;
let requesting = false;
let visibilityBound = false;

function hasWakeLockApi(): boolean {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
}

export function isWakeLockSupported(): boolean {
  return hasWakeLockApi();
}

async function requestWakeLock(): Promise<void> {
  if (activeCount === 0 || wakeLockSentinel !== null || requesting || !hasWakeLockApi()) return;
  requesting = true;
  try {
    const sentinel = await navigator.wakeLock.request('screen');
    if (activeCount === 0) {
      // Every holder released while the request was in flight.
      await sentinel.release().catch(() => {});
      return;
    }
    wakeLockSentinel = sentinel;
    sentinel.addEventListener?.('release', () => {
      // Browsers auto-release when the page is hidden; re-acquired on return.
      wakeLockSentinel = null;
    });
  } catch (err) {
    console.warn('Wake Lock request failed:', err);
    wakeLockSentinel = null;
  } finally {
    requesting = false;
  }
}

/**
 * Mobile browsers drop the wake lock whenever the page is hidden and never
 * restore it implicitly, so it must be re-requested when the tab reappears.
 */
function bindVisibilityHandler(): void {
  if (visibilityBound || typeof document === 'undefined') return;
  visibilityBound = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void requestWakeLock();
  });
}

export async function acquireWakeLock(): Promise<void> {
  activeCount++;
  bindVisibilityHandler();
  await requestWakeLock();
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
