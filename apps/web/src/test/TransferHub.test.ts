import { describe, it, expect, afterEach } from 'vitest';
import type { ControlMessage } from '@dropzone/protocol';
import { TransferHub, SEND_READY_TIMEOUT_MS } from '../lib/transfer/TransferHub.js';
import type { PeerManager } from '../lib/rtc/PeerManager.js';
import type { TransferTransport } from '../lib/transfer/transport.js';
import { useTransfersStore } from '../state/transfersStore.js';

const REMOTE = '22222222-2222-4222-8222-222222222222';

interface FakePeerManager {
  manager: PeerManager;
  controlSent: ControlMessage[];
  markReady: () => void;
  failWait: () => void;
}

/**
 * Minimal PeerManager stand-in that exposes the readiness surface TransferHub
 * depends on, so we can drive the "channel not open yet" handshake hang.
 */
function createFakePeerManager(): FakePeerManager {
  const readyHandlers = new Set<(deviceId: string) => void>();
  const controlSent: ControlMessage[] = [];
  let ready = false;
  let waitResolve: ((value: boolean) => void) | null = null;

  const transport: TransferTransport = {
    sendControl: (message) => {
      controlSent.push(message);
      return true;
    },
    sendData: () => true,
    getBufferedAmount: () => 0,
    whenBufferedAmountLow: () => Promise.resolve(),
    dataChannelCount: () => 1,
    getRemoteMaxMessageSize: () => 16384,
  };

  const manager = {
    subscribeControl: () => () => {},
    subscribeChunk: () => () => {},
    subscribeSessionRemoved: () => () => {},
    subscribeReady: (listener: (deviceId: string) => void) => {
      readyHandlers.add(listener);
      return () => readyHandlers.delete(listener);
    },
    ensureSession: () => {},
    getTransport: () => transport,
    isReady: () => ready,
    waitForReady: () =>
      new Promise<boolean>((resolve) => {
        waitResolve = resolve;
      }),
    removeSession: () => {},
  } as unknown as PeerManager;

  return {
    manager,
    controlSent,
    markReady: () => {
      ready = true;
      for (const listener of readyHandlers) listener(REMOTE);
      waitResolve?.(true);
      waitResolve = null;
    },
    failWait: () => {
      waitResolve?.(false);
      waitResolve = null;
    },
  };
}

async function sendOne(hub: TransferHub, name = 'a.txt'): Promise<number> {
  const file = new File(['hello'], name, { type: 'text/plain' });
  const ids = await hub.sendFiles(REMOTE, [file]);
  return ids[0]!;
}

describe('TransferHub readiness gating', () => {
  let hub: TransferHub;

  afterEach(() => {
    hub?.destroy();
    useTransfersStore.getState().reset();
  });

  it('queues the offer instead of dispatching while the peer is not ready', async () => {
    const fake = createFakePeerManager();
    hub = new TransferHub(fake.manager);

    const transferId = await sendOne(hub);

    expect(useTransfersStore.getState().transfers[transferId]!.status).toBe('queued');
    expect(fake.controlSent).toHaveLength(0);
  });

  it('dispatches the queued offer once the control channel opens', async () => {
    const fake = createFakePeerManager();
    hub = new TransferHub(fake.manager);

    const transferId = await sendOne(hub);
    fake.markReady();
    await Promise.resolve();

    expect(useTransfersStore.getState().transfers[transferId]!.status).toBe('offering');
    expect(fake.controlSent.some((message) => message.t === 'offer')).toBe(true);
  });

  it('fails the transfer with a visible error if the peer never becomes ready', async () => {
    const fake = createFakePeerManager();
    hub = new TransferHub(fake.manager);

    const transferId = await sendOne(hub);
    fake.failWait();
    await Promise.resolve();

    const record = useTransfersStore.getState().transfers[transferId]!;
    expect(record.status).toBe('error');
    expect(record.error).toContain('Could not connect to peer');
    expect(fake.controlSent.some((message) => message.t === 'offer')).toBe(false);
  });

  it('dispatches immediately when the peer is already ready', async () => {
    const fake = createFakePeerManager();
    fake.markReady();
    hub = new TransferHub(fake.manager);

    const transferId = await sendOne(hub);

    expect(useTransfersStore.getState().transfers[transferId]!.status).toBe('offering');
    expect(fake.controlSent.some((message) => message.t === 'offer')).toBe(true);
  });

  it('bounds the wait with a finite readiness timeout', () => {
    expect(SEND_READY_TIMEOUT_MS).toBeGreaterThan(0);
    expect(Number.isFinite(SEND_READY_TIMEOUT_MS)).toBe(true);
  });
});
