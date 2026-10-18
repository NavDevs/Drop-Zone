import { describe, it, expect } from 'vitest';
import type { ControlMessage, OfferMessage } from '@dropzone/protocol';
import { TransferReceiver } from '../lib/transfer/TransferReceiver.js';
import { MemoryWriter } from '../lib/transfer/MemoryWriter.js';
import type { TransferTransport } from '../lib/transfer/transport.js';

function createMockTransport() {
  const controlSent: ControlMessage[] = [];
  const transport: TransferTransport = {
    sendControl: (msg) => {
      controlSent.push(msg);
      return true;
    },
    sendData: () => true,
    getBufferedAmount: () => 0,
    whenBufferedAmountLow: () => Promise.resolve(),
    dataChannelCount: () => 1,
    getRemoteMaxMessageSize: () => 16384,
  };
  return { transport, controlSent };
}

describe('TransferReceiver', () => {
  const offer: OfferMessage = {
    t: 'offer',
    transferId: 50,
    name: 'received.txt',
    size: 11,
    mime: 'text/plain',
    lastModified: 1000,
    chunkSize: 5,
    totalChunks: 3,
    channels: 1,
  };

  it('sends accept message and opens writer on start', async () => {
    const { transport, controlSent } = createMockTransport();
    const writer = new MemoryWriter();
    const receiver = new TransferReceiver(offer, transport, writer);

    await receiver.start();
    expect(receiver.getState()).toBe('active');
    expect(controlSent).toContainEqual({ t: 'accept', transferId: 50 });
  });

  it('receives chunks, handles sent-all, and finalizes with completed file', async () => {
    const { transport, controlSent } = createMockTransport();
    const writer = new MemoryWriter();

    let completedFile: File | null = null;
    const receiver = new TransferReceiver(offer, transport, writer, {
      onComplete: (file) => {
        completedFile = file;
      },
    });

    await receiver.start();

    const encoder = new TextEncoder();
    await receiver.handleChunk(0, encoder.encode('hello'));
    await receiver.handleChunk(1, encoder.encode(' wor'));
    await receiver.handleChunk(2, encoder.encode('ld'));

    await receiver.handleControl({ t: 'sent-all', transferId: 50 });

    expect(receiver.getState()).toBe('done');
    expect(completedFile).not.toBeNull();
    const finalFile = completedFile as unknown as File;
    expect(finalFile.name).toBe('received.txt');

    const content = await finalFile.text();
    expect(content).toBe('hello world');

    // Should have sent ack
    expect(controlSent.some((m) => m.t === 'ack' && m.transferId === 50)).toBe(true);
  });

  it('handles remote cancel and aborts writer', async () => {
    const { transport } = createMockTransport();
    const writer = new MemoryWriter();

    let cancelled = false;
    const receiver = new TransferReceiver(offer, transport, writer, {
      onCancelled: () => {
        cancelled = true;
      },
    });

    await receiver.start();
    await receiver.handleControl({ t: 'cancel', transferId: 50, reason: 'sender aborted' });

    expect(receiver.getState()).toBe('cancelled');
    expect(cancelled).toBe(true);
  });
});
