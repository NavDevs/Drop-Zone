# DropZone — Technical Requirements Document (TRD)

**Version:** 1.0 · **Companion docs:** `PRD.md` (requirement IDs referenced as FR-xx), `WORKING.md`, `AGENTS.md`

---

## 1. Architecture

```
┌──────────────── Sender browser ────────────────┐        ┌─────────────── Receiver browser ───────────────┐
│ React UI ─ Zustand stores                      │        │ React UI ─ Zustand stores                      │
│ SignalingClient ─ PeerSession (RTCPeerConn)    │        │ SignalingClient ─ PeerSession                  │
│ TransferSender ─ Hash worker                   │        │ TransferReceiver ─ ChunkWriter ─ Hash worker   │
└───────┬───────────────────────────▲────────────┘        └───────▲───────────────────────────┬────────────┘
        │ Socket.IO (WSS)           │                              │ Socket.IO (WSS)           │
        ▼                           │                              │                           ▼
   ┌────────────────────────────────┴──────────────────────────────┴───────────────────────────┐
   │  Signaling server (Node.js + Socket.IO): rooms, presence, SDP/ICE relay, ICE server issue  │
   └───────────────────────────────────────────────────────────────────────────────────────────┘
        Sender ◄════ WebRTC (DTLS/SCTP DataChannels): direct, or via TURN relay when needed ════► Receiver
                                         ┌─────────────────┐
                                         │ STUN + coturn   │  (NAT traversal; relay only as fallback)
                                         └─────────────────┘
```

Principle: **the server is a matchmaker, not a pipe.** Only the TURN relay can carry file traffic, and it sees only DTLS ciphertext.

## 2. Tech stack

| Layer | Choice |
|-------|--------|
| Language | TypeScript (strict) everywhere |
| Monorepo | pnpm workspaces |
| Frontend | React (latest stable) + Vite, React Router, Zustand, Tailwind CSS, Framer Motion |
| Shared | `packages/protocol`: zod schemas, types, constants, binary framing, error codes |
| Signaling | Node.js 22 LTS, Express, Socket.IO 4, zod, pino, helmet, rate-limiter-flexible |
| Transfer | WebRTC DataChannel; Web Workers; File System Access API, OPFS, IndexedDB (`idb`) |
| Hashing | `hash-wasm` (streaming SHA-256) in a worker |
| QR | `qrcode.react` (render); optional `qr-scanner` for in-app scanning (P2) |
| NAT traversal | STUN (public for dev, coturn for prod) + TURN (coturn or managed) |
| Tests | Vitest, Testing Library, Playwright (Chromium, Firefox, WebKit) |
| CI/CD | GitHub Actions |
| Hosting | Vercel (web), Render/Railway/Fly (signaling, via Docker), small VPS (coturn) |

Vercel serverless cannot hold WebSocket connections, so the signaling server is **always a separate long-running service**.

## 3. Repository layout

```
dropzone/
├─ apps/
│  ├─ web/                    # Vite React app
│  │  └─ src/
│  │     ├─ routes/           # Landing, Room, Benchmark, About
│  │     ├─ components/       # RoomHeader, QrCard, PeerGrid, PeerCard, TransferList, TransferRow,
│  │     │                    # IncomingDialog, DiagnosticsDrawer, SasBadge, ThemeToggle
│  │     ├─ state/            # roomStore, peersStore, transfersStore, settingsStore
│  │     └─ lib/
│  │        ├─ signaling/     # SignalingClient.ts
│  │        ├─ rtc/           # PeerManager.ts, PeerSession.ts (perfect negotiation), sas.ts
│  │        ├─ transfer/      # TransferSender.ts, TransferReceiver.ts, flowControl.ts,
│  │        │                 # resumeStore.ts, sanitize.ts, writers/{FsAccessWriter,OpfsWriter,MemoryWriter}.ts
│  │        ├─ workers/       # hash.worker.ts, opfsWrite.worker.ts
│  │        └─ diagnostics/   # stats.ts, benchmark.ts
│  └─ signaling/
│     └─ src/ {server.ts, rooms/RoomStore.ts, rooms/codes.ts, handlers/*.ts, ice.ts, limits.ts, metrics.ts, config.ts}
├─ packages/protocol/src/ {signaling.ts, control.ts, frame.ts, errors.ts, constants.ts}
├─ infra/ {docker-compose.yml, coturn/turnserver.conf}
├─ e2e/                       # Playwright
├─ docs/                      # PRD.md TRD.md WORKING.md
├─ .github/workflows/ci.yml
└─ AGENTS.md
```

`packages/protocol` is the **single source of truth** for every message crossing a boundary. Web and signaling both import it; never duplicate types.

## 4. Identity and room model

```ts
type DeviceType = 'phone' | 'tablet' | 'laptop' | 'desktop' | 'unknown';
interface DeviceInfo { deviceId: string; name: string; type: DeviceType; }   // deviceId = crypto.randomUUID(), stored in sessionStorage (unique per tab, eases two-tab testing)

interface Room {
  code: string;                 // 6 chars
  createdAt: number;
  codeExpiresAt: number;        // only blocks NEW joins
  hardExpiresAt: number;        // createdAt + 6 h
  lastActivityAt: number;       // idle timeout 30 min
  hostDeviceId: string;
  requireApproval: boolean;
  peers: Map<string /*deviceId*/, { socketId: string; info: DeviceInfo; joinedAt: number }>;
}
```

**Room code:** alphabet `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no I, L, O, 0, 1); generated with `crypto.randomInt`; collision-checked; freed 1 h after room end. 31^6 ≈ 887 M combinations plus join rate limiting.

**Lifecycle rules**
- Code TTL (default 600 s) blocks *new joins* only. Members stay.
- Room ends when the last peer leaves, idle for 30 min, or hard max 6 h.
- Active transfers are never terminated by code expiry.
- Host closing the room emits `room:closed` to all.

## 5. Signaling protocol (Socket.IO, typed events)

All payloads validated with zod from `packages/protocol`; invalid payload → ack error `INVALID_PAYLOAD`.

### Client → server (with ack callbacks)

| Event | Payload | Ack (success) |
|-------|---------|---------------|
| `room:create` | `{ device: DeviceInfo, ttlSec?: 300\|600\|1800\|3600, requireApproval?: boolean }` | `{ code, codeExpiresAt, iceServers, peers: [] }` |
| `room:join` | `{ code, device: DeviceInfo }` | `{ code, codeExpiresAt, iceServers, peers: PeerInfo[] }` or `{ pending: true }` if approval required |
| `room:leave` | `{}` | `{}` |
| `room:regenerate` (host) | `{}` | `{ code, codeExpiresAt }` |
| `room:approve` (host) | `{ deviceId, allow: boolean }` | `{}` |
| `device:update` | `{ name }` | `{}` |
| `signal` | `{ to: deviceId, kind: 'description'\|'candidate', data }` | `{}` |

### Server → client

`peer:joined {device}` · `peer:left {deviceId}` · `peer:updated {device}` · `join:request {device}` (host) · `signal {from, kind, data}` · `room:closed {reason}` · `room:codeChanged {code, codeExpiresAt}` · `ice:refresh {iceServers}`

### Error codes
`ROOM_NOT_FOUND`, `ROOM_EXPIRED`, `ROOM_FULL`, `JOIN_DENIED`, `RATE_LIMITED`, `INVALID_PAYLOAD`, `NOT_IN_ROOM`, `PEER_NOT_FOUND`, `NOT_HOST`, `INTERNAL`.

### Limits
- `signal` payload ≤ 16 KB; ≥ 100 messages / 10 s per socket
- Room creation ≤ 10 / h / IP; join attempts ≤ 10 / min / IP; 5 failed joins → 15 min block
- Max 8 peers per room; a socket is in at most one room
- Server verifies `to` is in the **same room** as sender before relaying

### REST
- `GET /healthz` → `200 {ok:true}`
- `GET /metrics` (Prometheus; requires `Authorization: Bearer $METRICS_TOKEN`)

## 6. ICE / TURN

- Server issues `iceServers` in the `room:create`/`room:join` ack and refreshes before expiry (`ice:refresh`).
- STUN: `stun:` URLs from env (default Google STUN for dev).
- TURN time-limited credentials (coturn `use-auth-secret`):
  ```ts
  const expiry = Math.floor(Date.now()/1000) + TURN_TTL_SECONDS;     // default 3600
  const username = `${expiry}:${deviceId}`;
  const credential = createHmac('sha1', TURN_SECRET).update(username).digest('base64');
  // iceServers: [{ urls: STUN_URLS }, { urls: TURN_URLS, username, credential }]
  ```
- TURN URLs should include `turn:host:3478?transport=udp`, `turn:host:3478?transport=tcp`, and `turns:host:443?transport=tcp` (TLS on 443 passes most firewalls).
- Env override `ICE_SERVERS_JSON` supports managed providers (Cloudflare, Metered, Twilio) without code changes.

**coturn config (`infra/coturn/turnserver.conf`)**
```
listening-port=3478
tls-listening-port=5349
fingerprint
use-auth-secret
static-auth-secret=${TURN_SECRET}
realm=turn.example.com
min-port=49152
max-port=65535
total-quota=200
stale-nonce=600
no-multicast-peers
no-cli
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
cert=/etc/letsencrypt/live/turn.example.com/fullchain.pem
pkey=/etc/letsencrypt/live/turn.example.com/privkey.pem
```
Open firewall: 3478 udp/tcp, 5349 tcp (or 443 tcp), 49152–65535 udp.

## 7. WebRTC connection management

- One `RTCPeerConnection` per peer pair, created **lazily** (on first send, on receiving an offer, or on user pre-warm). Presence comes from signaling, not WebRTC.
- **Perfect negotiation:** polite peer = larger `deviceId`; handle glare with `makingOffer`/`ignoreOffer`; `onnegotiationneeded` creates offers; candidates relayed via `signal`.
- **Negotiated DataChannels** (no `ondatachannel` race), created by both sides at PC creation:
  - `control`: `{ negotiated: true, id: 0, ordered: true }` — JSON messages
  - `data-i` (i = 0..N-1): `{ negotiated: true, id: 1+i, ordered: false }` — binary chunks (reliable; order recovered via chunk index). N defaults to 1; benchmark decides.
- **Reconnection:** on `iceconnectionstatechange` = `disconnected` wait 3 s, then `failed` → `pc.restartIce()`; if the PC is `closed`/irrecoverable, rebuild the PC and channels, then run the resume protocol (§10). Exponential backoff, max 5 attempts, then surface "Connection lost: Retry".
- **SAS:** extract `a=fingerprint:sha-256 …` from local and remote SDP, sort the two strings, SHA-256 the concatenation, take first 4 bytes mod 10^6, zero-pad to 6 digits. Both sides display it; mismatch = possible tampering.
- **Wake Lock** requested while any transfer is active; released afterward.

## 8. Control channel messages (JSON, zod-validated)

```ts
type Control =
 | { t:'hello', v:1, deviceId, name, caps:{ maxMessageSize:number, fsAccess:boolean, opfs:boolean, channels:number } }
 | { t:'ping', ts:number } | { t:'pong', ts:number }                         // app-level RTT
 | { t:'offer', transferId:number, name, size:number, mime:string, lastModified:number,
     chunkSize:number, totalChunks:number, channels:number }
 | { t:'accept', transferId }
 | { t:'reject', transferId, reason:'declined'|'no-space'|'too-large'|'busy' }
 | { t:'ack', transferId, received:number }                                  // unique chunks durably written
 | { t:'resume', transferId, bitmap:string /*base64*/, received:number }     // receiver → sender
 | { t:'pause', transferId } | { t:'continue', transferId }
 | { t:'cancel', transferId, reason?:string }
 | { t:'sent-all', transferId }                                              // sender finished a pass
 | { t:'hash', transferId, algo:'sha256', hex:string }
 | { t:'verified', transferId, ok:boolean, hex?:string }
 | { t:'text', id:string, text:string }                                      // P2
```
`transferId` = random uint32, unique per session. Sender must send `hello` immediately after the control channel opens; chunk size = `min(16 KiB default, local maxMessageSize, remote maxMessageSize)` unless benchmark overrides.

## 9. Binary chunk frame (data channels)

12-byte big-endian header + payload:

| Offset | Size | Field |
|--------|------|-------|
| 0 | 1 | version (=1) |
| 1 | 1 | type (1 = DATA) |
| 2 | 2 | flags (reserved, 0) |
| 4 | 4 | transferId |
| 8 | 4 | chunkIndex |
| 12 | n | payload (≤ chunkSize; last chunk may be shorter) |

Encode/decode as pure functions in `packages/protocol/frame.ts` with unit tests (round-trip, bounds, malformed input must throw, never crash).

## 10. Transfer engine

### 10.1 Sender loop

```ts
const HIGH = 4 * MiB, LOW = 1 * MiB, WINDOW_CHUNKS = 16*MiB / chunkSize;
channel.bufferedAmountLowThreshold = LOW;

while (nextToSend()) {
  if (paused || cancelled) await waitForState();
  if (inflight() >= WINDOW_CHUNKS) await waitForAck();          // receiver-disk backpressure
  if (channel.bufferedAmount > HIGH) await once(channel, 'bufferedamountlow'); // network backpressure
  const buf = await prefetchQueue.take();                       // file.slice(i*cs,(i+1)*cs).arrayBuffer(), read-ahead 8 chunks
  channel.send(encodeFrame(transferId, idx, buf));
}
control.send({ t:'sent-all', transferId });
```
- `inflight = chunksSentThisPass − (lastAck.received − receivedAtPassStart)`.
- Multiple data channels: round-robin by chunk index; each channel has its own bufferedAmount check.
- Chunks to send = all indices not set in the receiver's bitmap (full range on a fresh transfer).
- Speed = EWMA over 1-second samples; ETA = remaining bytes / speed.

### 10.2 Receiver

1. On `offer`: sanitize name, check size limit and `navigator.storage.estimate()`, show dialog.
2. On **Accept click** (a user gesture) create a `ChunkWriter` (see 10.3) and send `accept`.
3. On each frame: parse → `writer.write(index, payload)` (serialized queue) → set bitmap bit → every 64 chunks (or 250 ms) flush, persist bitmap to IndexedDB, send `ack`.
4. When `sent-all` arrived and `received === totalChunks` → finalize writer → verify hash (§11) → `verified`.
5. Unknown `transferId` frames are dropped; frames with `index ≥ totalChunks` abort the transfer with `cancel`.

### 10.3 Storage strategy (`ChunkWriter` interface)

```ts
interface ChunkWriter {
  open(meta): Promise<void>;
  write(index: number, data: ArrayBuffer): Promise<void>;   // positional write at index*chunkSize
  flush(): Promise<void>;
  finalize(): Promise<{ saved: 'direct'|'download' }>;
  readSlices(sliceSize: number): AsyncIterable<Uint8Array>;  // for hash verification
  abort(): Promise<void>;
}
```
| Backend | When | Details |
|---------|------|---------|
| `FsAccessWriter` | Chromium desktop | `showSaveFilePicker({suggestedName})` called inside the Accept click; `createWritable({keepExistingData:true})`; `write({type:'write', position, data})`. Persist the `FileSystemFileHandle` in IndexedDB for reload-resume (re-request permission on gesture) |
| `OpfsWriter` | Firefox, Safari, Android | Stage in `navigator.storage.getDirectory()/<transferId>`; dedicated worker uses `createSyncAccessHandle().write(buf,{at})`; on finish close handle, `getFile()` → object URL → `<a download>` (disk-backed, not loaded in RAM). Clean up OPFS file after download or via "Clear" button |
| `MemoryWriter` | last resort | In-RAM Blob parts, hard cap 500 MB; otherwise reject with `too-large` |

Show a pre-accept warning when file size exceeds the backend's tested limit for that browser (PRD §9 matrix).

### 10.4 Resume

*Same session (FR-18):* on channel close or ICE failure, after reconnection both sides re-open channels; receiver sends `resume {transferId, bitmap, received}`; sender replies by starting a new pass over missing indices. Counters reset per pass as described in 10.1.

*After reload (FR-19):* receiver persists `{transferId, peerDeviceId, name, size, lastModified, chunkSize, totalChunks, bitmap, writerKind, handle?}` in IndexedDB (`resumeStore.ts`). When the same room is rejoined and the sender offers a file with matching `name+size+lastModified`, the receiver shows "Resume previous transfer?". Sender must have the file: it prompts to re-select (validate name/size/lastModified; additionally compare SHA-256 of chunk 0 and last chunk via a quick `hash-probe`). Chromium may use `showOpenFilePicker` handles stored in IndexedDB to skip re-selecting (P2).

Records older than 24 h are purged.

## 11. Integrity

- Sender hashes the file in `hash.worker.ts` (streaming SHA-256 over 4 MiB slices) **concurrently** with sending, then sends `{t:'hash'}` when ready (before or after the data completes). It does not block transfer start.
- Receiver, after finalize, re-reads the stored file in slices, hashes it, compares → `verified {ok}`.
- UI: **Verified ✓** badge, or an error with "Retry transfer".
- (SCTP/DTLS already protect against in-flight corruption. This check guards against storage/logic faults and gives users a visible guarantee.)

## 12. Diagnostics (FR-30–33)

Every 1 s via `pc.getStats()`:
1. Find the `transport` stat → `selectedCandidatePairId` → `candidate-pair` (fallback: pair with `nominated && state==='succeeded'`).
2. `local/remote candidate`: `candidateType` ∈ host/srflx/prflx/relay, `protocol`, `networkType`.
3. Classification: both `host` → **Direct (local network)**; any srflx/prflx and none relay → **Direct (internet)**; any `relay` → **Relayed (TURN)**.
4. Metrics: `currentRoundTripTime`, `availableOutgoingBitrate`, `bytesSent/Received` deltas → bitrate, `dataChannel.bufferedAmount`, app-level ping RTT.

**Benchmark (`benchmark.ts`):** sender streams N MB of generated pseudo-random bytes (no disk) over the chosen configuration matrix (chunkSize ∈ {16, 32, 64, 128, 256 KiB} where supported × channels ∈ {1, 2, 4}); records throughput, RTT, connection type; renders table + CSV. Repeat 3× and report median. To test network conditions, run Linux `tc netem` (latency/loss/bandwidth) inside Docker between two Chromium instances; document commands in `docs/benchmarking.md`.

## 13. Security

| Concern | Control |
|---------|---------|
| Confidentiality | WebRTC DTLS (mandatory). TURN sees only ciphertext |
| Signaling tampering | SAS comparison (FR-33); WSS only |
| Brute-forcing codes | 31^6 space, IP rate limits, failed-attempt lockout, TTL |
| Consent | Nothing written to disk before Accept; per-offer prompts |
| Malicious filenames | Sanitize: strip path separators and control chars, collapse `..`, trim to 255 bytes, block Windows reserved names (CON, NUL…), dedupe on collision. Never trust MIME |
| Dangerous types | Warning banner for `.exe .msi .bat .cmd .ps1 .sh .apk .scr .jar .dmg`; never auto-open |
| DoS | Message size/rate limits, max peers, max concurrent transfers per peer (default 3), receiver size cap setting |
| Web security | Helmet; CORS allowlist; strict CSP (`default-src 'self'; connect-src 'self' <api> wss://<api>; worker-src 'self' blob:; script-src 'self' 'wasm-unsafe-eval'; img-src 'self' data: blob:`); `Referrer-Policy: no-referrer`; `X-Content-Type-Options: nosniff`; `Permissions-Policy` minimal |
| Privacy | Logs hold hashed room code (sha256, 8 chars), no IPs beyond rate-limiter memory, no file names/sizes |
| Secrets | `TURN_SECRET`, `METRICS_TOKEN` only in env; never shipped to client |

## 14. Frontend requirements

- State: Zustand slices; derive UI from stores; transfer progress updates throttled (≤ 4 renders/s per transfer).
- Routing: `/`, `/r/:code`, `/benchmark`, `/about`; SPA fallback.
- Framer Motion for peer card enter/exit and progress; disable when `prefers-reduced-motion`.
- PWA: `vite-plugin-pwa`, app shell caching only; never cache signaling.
- Expose a test hook in non-production builds: `window.__dropzone = { dropConnection(peerId), getTransferState() }` for Playwright.
- Error boundaries per route; every async failure maps to a user-facing message.

## 15. Testing strategy

| Level | Scope |
|-------|-------|
| Unit (Vitest) | frame encode/decode, bitmap ops, flow-control window math, filename sanitizer, room store TTL/idle/hard-expiry (fake timers), code generator alphabet/uniqueness, TURN credential HMAC, SAS derivation, ETA/speed EWMA, zod schemas |
| Integration | Signaling server with `socket.io-client`: create/join/leave, limits, approval flow, signal relay isolation between rooms, rate limiting |
| E2E (Playwright, 2 browser contexts) | pair by code; pair by URL; send 1 MB, 100 MB, 1 GB (CI nightly); decline; cancel; drop connection at 50% via test hook and verify resume + hash; room expiry; room full. Launch Chromium with `--disable-features=WebRtcHideLocalIpsWithMdns` for local candidates |
| Cross-browser | Chromium + Firefox + WebKit matrix for pairing and ≤ 100 MB transfer in CI; manual device matrix (Android Chrome, iOS Safari) before release |
| Network | Manual/Docker `tc netem`: 50/100/300 ms RTT, 1–5% loss, 5/20 Mbps caps; forced TURN (`iceTransportPolicy: 'relay'` via debug flag) |
| Load | `artillery` or custom script: 1,000 concurrent sockets, 200 rooms on a 512 MB instance; p99 signal relay < 100 ms |
| Security | `pnpm audit`, ZAP baseline on web, fuzz frame parser |

Coverage gate: ≥ 80% lines on `packages/protocol` and `apps/signaling`; critical transfer modules ≥ 70%.

## 16. CI/CD

GitHub Actions on PR: install (pnpm cache) → lint → typecheck → unit/integration → build → Playwright (Chromium/Firefox/WebKit) → upload traces on failure. On `main`: deploy web to Vercel (preview per PR), signaling image to host (`Dockerfile`, multi-stage, non-root, healthcheck), run smoke test against production URL.

**Vercel:** root `apps/web`, build `pnpm --filter web build`, output `dist`, `vercel.json` with SPA rewrite and security headers.
**Signaling Dockerfile:** `node:22-alpine`, `pnpm deploy --filter signaling`, `USER node`, `HEALTHCHECK /healthz`.

## 17. Configuration

**Signaling:** `PORT`, `CORS_ORIGINS`, `STUN_URLS`, `TURN_URLS`, `TURN_SECRET`, `TURN_TTL_SECONDS=3600`, `ICE_SERVERS_JSON` (optional override), `ROOM_TTL_DEFAULT_SEC=600`, `MAX_PEERS=8`, `METRICS_TOKEN`, `LOG_LEVEL`, `REDIS_URL` (optional)
**Web:** `VITE_SIGNALING_URL`, `VITE_APP_URL`, `VITE_ENABLE_DEBUG_HOOKS` (false in prod)

## 18. Observability and operations

- pino JSON logs, request ids, no PII.
- Metrics: `rooms_active`, `sockets_active`, `joins_total{result}`, `signals_relayed_total`, `rate_limited_total`, `turn_credentials_issued_total`, event-loop lag.
- Alerts: signaling down, error rate > 2%, CPU > 80%, coturn bandwidth > budget.
- Optional client telemetry (opt-in): connection class, throughput bucket, browser family only. Sentry (if used) with scrubbing of URLs containing room codes.
- Horizontal scale path: Socket.IO Redis adapter + Redis-backed `RoomStore` (interface already abstracted). v1 runs one instance (in-memory).

## 19. Performance budgets

- JS first load ≤ 180 KB gz; hash-wasm and QR code lazy-loaded.
- Main thread never blocks > 50 ms during transfer (hashing and OPFS writes in workers).
- Send loop yields via awaits; no synchronous tight loops over many chunks.

## 20. Known limits (document in README)

- Direct connection is not guaranteed; relay speed depends on TURN bandwidth.
- iOS Safari and background tabs may pause transfers; resume handles it.
- Non-Chromium browsers save via a download step after the transfer completes.
- Room state is in-memory in v1; restarting signaling drops active rooms (existing WebRTC transfers continue).
