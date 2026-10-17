import { describe, it, expect, afterAll } from 'vitest';
import { httpServer } from '../src/server.js';

describe('Health check', () => {
  afterAll(() => {
    httpServer.close();
  });

  it('returns ok', async () => {
    const addr = httpServer.address();
    const port = typeof addr === 'object' && addr ? addr.port : 3001;
    const res = await fetch(`http://localhost:${port}/healthz`);
    const data = await res.json();
    expect(data).toEqual({ ok: true });
  });
});
