import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { createSignalingServer, type SignalingServer } from '../src/createServer.js';

describe('Health check', () => {
  let server: SignalingServer;

  beforeAll(async () => {
    server = createSignalingServer({ logLevel: 'silent', enableSweeper: false });
    await new Promise<void>((resolve) => server.httpServer.listen(0, resolve));
  });

  afterAll(async () => {
    await server.close();
  });

  it('returns ok', async () => {
    const res = await fetch(`http://localhost:${server.port()}/healthz`);
    const data = await res.json();
    expect(data).toEqual({ ok: true });
  });
});
