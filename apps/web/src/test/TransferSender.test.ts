import { describe, it, expect } from 'vitest';
import { decodeFrame, type ControlMessage } from '@dropzone/protocol';
import { TransferSender } from '../lib/transfer/TransferSender.js';
import type { TransferTransport } from '../lib/transfer/transport.js';

function createMockTransport() {
  const controlSent: ControlMessage[] = [];
  const dataSent: ArrayBuffer[] = [];
  let bufferedAmount = 0;
  let lowResolve: (() => void) | null = null;

  const transport: TransferTransport = {
    sendControl: (msg) => {
      controlSent.push(msg);
      return true;
    },
    sendData: (frame) => {
      dataSent.push(frame);
      return true;
    },
    getBufferedAmount: () => bufferedAmount,
    whenBufferedAmountLow: () =>
      new Promise<void>((resolve) => {
        lowResolve = resolve;
      }),
    dataChannelCount: () => 1,
    getRemoteMaxMessageSize: () => 16384,
  };

  return {
    transport,
    controlSent,
    dataSent,
    setBufferedAmount: (amt: number) => {
      bufferedAmount = amt;
    },
    triggerBufferedAmountLow: () => {
      bufferedAmount = 0;
      lowResolve?.();
    },
  };
}

describe('TransferSender', () => {
  it('sends offer and transitions to offering state', () => {
    const { transport, controlSent } = createMockTransport();
    const file = new File(['hello world'], 'test.txt', { type: 'text/plain' });
    const sender = new TransferSender(42, file, transport, { chunkSize: 5 });

    sender.start();
    expect(sender.getState()).toBe('offering');
    expect(controlSent).toHaveLength(1);
    expect(controlSent[0]).toMatchObject({
      t: 'offer',
      transferId: 42,
      name: 'test.txt',
      size: 11,
      chunkSize: 5,
      totalChunks: 3,
    });
  });

  it('runs send loop upon receiving accept and sends all chunks + sent-all', async () => {
    const { transport, controlSent, dataSent } = createMockTransport();
    const file = new File(['hello world'], 'test.txt', { type: 'text/plain' });

    let completed = false;
    const sender = new TransferSender(100, file, transport, {
      chunkSize: 5,
      onComplete: () => {
        completed = true;
      },
    });

    sender.start();
    sender.handleControl({ t: 'accept', transferId: 100 });

    // Wait for async loop to complete
    await new Promise((r) => setTimeout(r, 50));

    expect(sender.getState()).toBe('done');
    expect(completed).toBe(true);
    expect(dataSent).toHaveLength(3);

    // Verify binary frames
    const f0 = decodeFrame(dataSent[0]!);
    expect(f0.transferId).toBe(100);
    expect(f0.chunkIndex).toBe(0);
    expect(new TextDecoder().decode(f0.payload)).toBe('hello');

    const f1 = decodeFrame(dataSent[1]!);
    expect(f1.transferId).toBe(100);
    expect(f1.chunkIndex).toBe(1);
    expect(new TextDecoder().decode(f1.payload)).toBe(' worl');

    const f2 = decodeFrame(dataSent[2]!);
    expect(f2.transferId).toBe(100);
    expect(f2.chunkIndex).toBe(2);
    expect(new TextDecoder().decode(f2.payload)).toBe('d');

    // Verify sent-all control message
    expect(controlSent).toContainEqual({ t: 'sent-all', transferId: 100 });
  });

  it('handles reject from remote peer', () => {
    const { transport } = createMockTransport();
    const file = new File(['test'], 'test.txt');

    let declinedReason: string | null = null;
    const sender = new TransferSender(200, file, transport, {
      onDeclined: (reason) => {
        declinedReason = reason;
      },
    });

    sender.start();
    sender.handleControl({ t: 'reject', transferId: 200, reason: 'declined' });

    expect(sender.getState()).toBe('declined');
    expect(declinedReason).toBe('declined');
  });

  it('handles cancel from remote peer', () => {
    const { transport } = createMockTransport();
    const file = new File(['test'], 'test.txt');

    let cancelled = false;
    const sender = new TransferSender(300, file, transport, {
      onCancelled: () => {
        cancelled = true;
      },
    });

    sender.start();
    sender.handleControl({ t: 'cancel', transferId: 300, reason: 'cancelled' });

    expect(sender.getState()).toBe('cancelled');
    expect(cancelled).toBe(true);
  });
});
