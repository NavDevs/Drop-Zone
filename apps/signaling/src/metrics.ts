/**
 * Minimal Prometheus-compatible metrics (text exposition format, v0.0.4).
 * Hand-rolled to avoid a dependency; covers the TRD §18 signaling metrics.
 */

interface LabeledValue {
  labels: Record<string, string>;
  value: number;
}

function escapeLabelValue(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function renderLabels(labels: Record<string, string>): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) return '';
  const inner = entries.map(([k, v]) => `${k}="${escapeLabelValue(v)}"`).join(',');
  return `{${inner}}`;
}

export class Counter {
  private values: LabeledValue[] = [];

  constructor(
    readonly name: string,
    readonly help: string,
    readonly labelNames: string[] = [],
  ) {}

  inc(labels: Record<string, string> = {}, delta = 1): void {
    const existing = this.values.find((v) => this.sameLabels(v.labels, labels));
    if (existing) {
      existing.value += delta;
    } else {
      this.values.push({ labels: { ...labels }, value: delta });
    }
  }

  private sameLabels(a: Record<string, string>, b: Record<string, string>): boolean {
    const ak = Object.keys(a);
    const bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    return ak.every((k) => a[k] === b[k]);
  }

  render(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} counter`];
    if (this.values.length === 0) {
      lines.push(`${this.name} 0`);
    } else {
      for (const v of this.values) {
        lines.push(`${this.name}${renderLabels(v.labels)} ${v.value}`);
      }
    }
    return lines.join('\n');
  }

  reset(): void {
    this.values = [];
  }
}

export class Gauge {
  private value = 0;

  constructor(
    readonly name: string,
    readonly help: string,
  ) {}

  set(v: number): void {
    this.value = v;
  }

  inc(delta = 1): void {
    this.value += delta;
  }

  dec(delta = 1): void {
    this.value -= delta;
  }

  render(): string {
    return [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} gauge`, `${this.name} ${this.value}`].join('\n');
  }

  reset(): void {
    this.value = 0;
  }
}

export class Metrics {
  readonly roomsActive = new Gauge('rooms_active', 'Rooms currently active');
  readonly socketsActive = new Gauge('sockets_active', 'Connected sockets');
  readonly joinsTotal = new Counter('joins_total', 'Join attempts by result', ['result']);
  readonly signalsRelayedTotal = new Counter('signals_relayed_total', 'Signals relayed between peers');
  readonly rateLimitedTotal = new Counter('rate_limited_total', 'Requests rejected by rate limiting', ['limiter']);
  readonly turnCredentialsIssuedTotal = new Counter('turn_credentials_issued_total', 'TURN credentials issued');

  render(): string {
    return [
      this.roomsActive.render(),
      this.socketsActive.render(),
      this.joinsTotal.render(),
      this.signalsRelayedTotal.render(),
      this.rateLimitedTotal.render(),
      this.turnCredentialsIssuedTotal.render(),
    ].join('\n\n');
  }

  reset(): void {
    this.roomsActive.reset();
    this.socketsActive.reset();
    this.joinsTotal.reset();
    this.signalsRelayedTotal.reset();
    this.rateLimitedTotal.reset();
    this.turnCredentialsIssuedTotal.reset();
  }
}

export const metrics = new Metrics();
