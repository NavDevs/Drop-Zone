import { describe, it, expect } from 'vitest';
import { Metrics, Counter, Gauge } from '../src/metrics.js';

describe('Counter', () => {
  it('renders with zero default', () => {
    const c = new Counter('joins_total', 'Joins');
    const out = c.render();
    expect(out).toContain('# TYPE joins_total counter');
    expect(out).toContain('joins_total 0');
  });

  it('accumulates labeled values', () => {
    const c = new Counter('joins_total', 'Joins', ['result']);
    c.inc({ result: 'ok' });
    c.inc({ result: 'ok' });
    c.inc({ result: 'full' });
    const out = c.render();
    expect(out).toContain('joins_total{result="ok"} 2');
    expect(out).toContain('joins_total{result="full"} 1');
  });

  it('escapes label values', () => {
    const c = new Counter('x_total', 'X', ['l']);
    c.inc({ l: 'a"b\\c' });
    expect(c.render()).toContain('l="a\\"b\\\\c"');
  });
});

describe('Gauge', () => {
  it('renders current value', () => {
    const g = new Gauge('rooms_active', 'Rooms');
    g.set(3);
    g.dec();
    g.inc(2);
    const out = g.render();
    expect(out).toContain('# TYPE rooms_active gauge');
    expect(out).toContain('rooms_active 4');
  });
});

describe('Metrics', () => {
  it('renders all TRD §18 metrics', () => {
    const m = new Metrics();
    m.roomsActive.set(2);
    m.socketsActive.inc();
    m.joinsTotal.inc({ result: 'ok' });
    m.signalsRelayedTotal.inc();
    m.rateLimitedTotal.inc({ limiter: 'signal' });
    m.turnCredentialsIssuedTotal.inc();
    const out = m.render();
    for (const name of [
      'rooms_active',
      'sockets_active',
      'joins_total',
      'signals_relayed_total',
      'rate_limited_total',
      'turn_credentials_issued_total',
    ]) {
      expect(out).toContain(name);
    }
  });

  it('reset clears state', () => {
    const m = new Metrics();
    m.roomsActive.set(5);
    m.joinsTotal.inc({ result: 'ok' }, 3);
    m.reset();
    expect(m.render()).toContain('rooms_active 0');
    expect(m.render()).toContain('joins_total 0');
  });
});
