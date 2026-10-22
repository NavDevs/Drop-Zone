import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface FakeSentinel {
  release: ReturnType<typeof vi.fn>;
  addEventListener: (type: string, listener: () => void) => void;
  fireRelease: () => void;
}

function installWakeLock(): { request: ReturnType<typeof vi.fn>; sentinels: FakeSentinel[] } {
  const sentinels: FakeSentinel[] = [];
  const request = vi.fn(async () => {
    let onRelease: (() => void) | null = null;
    const sentinel: FakeSentinel = {
      release: vi.fn(async () => {}),
      addEventListener: (_type, listener) => {
        onRelease = listener;
      },
      fireRelease: () => onRelease?.(),
    };
    sentinels.push(sentinel);
    return sentinel;
  });
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });
  return { request, sentinels };
}

function becomeVisible(): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  document.dispatchEvent(new Event('visibilitychange'));
}

/** Fresh module instance per test so the reference-counted sentinel state resets. */
async function loadModule(): Promise<typeof import('../lib/transfer/wakeLock.js')> {
  vi.resetModules();
  return import('../lib/transfer/wakeLock.js');
}

describe('wakeLock', () => {
  let boundListeners: Array<{ type: string; listener: EventListener }> = [];

  beforeEach(() => {
    boundListeners = [];
    const original = document.addEventListener.bind(document);
    // Capture listeners the module binds so each test starts from a clean document.
    vi.spyOn(document, 'addEventListener').mockImplementation((type, listener) => {
      boundListeners.push({ type, listener: listener as EventListener });
      original(type, listener as EventListener);
    });
  });

  afterEach(() => {
    for (const { type, listener } of boundListeners) document.removeEventListener(type, listener);
    vi.restoreAllMocks();
    delete (navigator as unknown as { wakeLock?: unknown }).wakeLock;
  });

  it('requests a screen lock on acquire and releases it on release', async () => {
    const { request, sentinels } = installWakeLock();
    const mod = await loadModule();

    await mod.acquireWakeLock();
    expect(request).toHaveBeenCalledWith('screen');
    expect(sentinels).toHaveLength(1);

    await mod.releaseWakeLock();
    expect(sentinels[0]!.release).toHaveBeenCalled();
  });

  it('re-acquires the lock when the document becomes visible again', async () => {
    const { request, sentinels } = installWakeLock();
    const mod = await loadModule();

    await mod.acquireWakeLock();
    expect(sentinels).toHaveLength(1);

    // Browsers release the lock when the page is hidden.
    sentinels[0]!.fireRelease();
    becomeVisible();

    expect(request).toHaveBeenCalledTimes(2);
  });

  it('does not re-acquire once every holder has released', async () => {
    const { request, sentinels } = installWakeLock();
    const mod = await loadModule();

    await mod.acquireWakeLock();
    sentinels[0]!.fireRelease();
    await mod.releaseWakeLock();
    becomeVisible();

    expect(request).toHaveBeenCalledTimes(1);
  });

  it('does not re-request while a lock is already held', async () => {
    const { request } = installWakeLock();
    const mod = await loadModule();

    await mod.acquireWakeLock();
    await mod.acquireWakeLock();
    becomeVisible();

    expect(request).toHaveBeenCalledTimes(1);
  });

  it('reports support only when the API is present', async () => {
    const mod = await loadModule();
    expect(mod.isWakeLockSupported()).toBe(false);
  });
});
