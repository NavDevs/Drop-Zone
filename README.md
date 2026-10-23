# DropZone

**Peer-to-peer file transfer in the browser.** Files travel directly from one device to another over encrypted WebRTC data channels — no upload, no cloud storage, no accounts.

[**Live Demo (Render)**](https://dropzone-b9au.onrender.com/)

> The signaling server only introduces peers to each other. It never sees file bytes, file names, or file sizes.

---

## Contents

- [How it works](#how-it-works)
- [Features](#features)
- [Repository layout](#repository-layout)
- [Requirements](#requirements)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Scripts](#scripts)
- [Testing](#testing)
- [Deployment](#deployment)
- [Security and privacy model](#security-and-privacy-model)
- [Browser support and secure contexts](#browser-support-and-secure-contexts)
- [Known limitations](#known-limitations)
- [Documentation](#documentation)

---

## How it works

```
  Device A                    Signaling server                    Device B
  ┌────────┐                    (Socket.IO)                     ┌────────┐
  │ Browser│◄──── join room / exchange SDP + ICE candidates ───►│ Browser│
  └───┬────┘                    no file data                     └───┬────┘
      │                                                              │
      └──────────── encrypted WebRTC DataChannel (DTLS) ────────────┘
                     file bytes, chunk by chunk, P2P
```

1. **Signaling.** Both devices open a Socket.IO connection to the signaling server. One creates a room and shares the 6-character code (or QR) with the other, who joins it.
2. **Negotiation.** The server relays SDP offers/answers and ICE candidates between peers in the same room. It enforces room membership before relaying anything.
3. **Transfer.** A WebRTC data channel opens directly between the browsers. Files are chunked (16 KiB default), streamed, and verified with SHA-256 on arrival.

Three data channels are opened: `control` (JSON messages — offers, accepts, progress) and one or more binary channels (ID 1+) carrying a 12-byte framed chunk header.

---

## Features

| | |
|---|---|
| **Direct P2P transfer** | WebRTC data channels; bytes never traverse the server |
| **End-to-end encrypted** | DTLS (mandatory for WebRTC) plus SAS verification for a shared short-authentication string |
| **No size limit** | Chunked streaming with dual backpressure — SCTP `bufferedAmount` and a 16 MiB receiver ACK window — so memory stays flat on multi-GB files |
| **Resumable** | Chunk bitmap persisted in IndexedDB; a dropped connection resumes and re-verifies |
| **Integrity** | Streaming SHA-256 computed while sending and re-checked on the receiving side |
| **Multi-peer rooms** | Up to 8 devices per room; concurrent transfers per peer |
| **Host controls** | Host approves joiners, regenerates the room code, and closes the room |
| **Storage backends** | File System Access → OPFS (Web Worker) → in-memory, chosen by capability detection with automatic fallback |
| **Diagnostics** | Live link classification (direct-local / direct-internet / relayed), RTT, throughput, benchmark page with CSV export |
| **Accessible & responsive** | Tailwind, labelled controls, `aria-live` progress, reduced-motion support, mobile-friendly |

---

## Repository layout

```
DROP_ZONE/
├── apps/
│   ├── web/                 React 19 + Vite + Zustand single-page app
│   │   └── src/lib/rtc/     PeerManager, PeerSession, negotiated channels
│   │   └── src/lib/transfer/ Sender, receiver, chunk writers, hashing, resume
│   └── signaling/           Node 22 + Express + Socket.IO signaling server
│       └── src/handlers/    room / peer / signal event handlers
├── packages/
│   └── protocol/            Single source of truth: zod schemas, error codes,
│                            constants, binary frame encode/decode
├── e2e/                     Playwright specs (chromium, firefox, webkit)
├── infra/docker-compose.yml signaling + coturn (TURN) for self-hosting
├── docs/                    PRD, TRD, WORKING (phased plan), DECISIONS, DEPLOYMENT
├── render.yaml              Render Blueprint — hosts both the SPA and the server
└── vercel.json              Alternative: web on Vercel, signaling elsewhere
```

Every cross-boundary message — signaling events, the control channel, and the binary frame — is defined **only** in `packages/protocol`. Nothing is redeclared elsewhere.

---

## Requirements

- **Node.js ≥ 22**
- **pnpm ≥ 9** (`corepack enable` will pick up the pinned `pnpm@10.32.1`)

---

## Quick start

```bash
pnpm install
cp .env.example .env          # optional; the defaults work for local dev
pnpm dev                      # web on :5173, signaling on :3001
```

Open <http://localhost:5173>, create a room, then open the same URL in a second
tab (or another browser) and join with the code.

Useful scoped scripts:

```bash
pnpm dev:web
pnpm dev:signaling
```

### Testing across devices on your LAN

Start the dev servers and open `http://<your-lan-ip>:5173` on the phone. The web
app derives the signaling URL from the page hostname, so `http://192.168.1.4:5173`
talks to `http://192.168.1.4:3001` automatically.

> A plain-IP HTTP origin is **not** a secure context, so OPFS, File System Access,
> Wake Lock and Notifications are unavailable there. Transfers still work (they
> fall back to the in-memory writer) but the experience is degraded. Use the
> HTTPS deployment for real device testing.

---

## Configuration

Copy `.env.example` to `.env` at the repo root. The signaling server reads its
variables from the process environment; the web app reads only `VITE_*` values at
build time.

### Signaling server

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3001` | Listen port (hosts like Render inject this) |
| `CORS_ORIGINS` | `http://localhost:5173` | Allowed web origins, comma-separated |
| `STUN_URLS` | public Google/Cloudflare STUN | NAT discovery, comma-separated |
| `TURN_URLS` | *(empty)* | TURN relay URLs; empty disables relayed fallback |
| `TURN_SECRET` | *(empty)* | Shared secret for time-limited TURN credentials |
| `TURN_TTL_SECONDS` | `3600` | TURN credential lifetime |
| `ICE_SERVERS_JSON` | *(empty)* | Escape hatch for a fully custom ICE server list |
| `ROOM_TTL_DEFAULT_SEC` | `600` | Default room TTL |
| `MAX_PEERS` | `8` | Maximum peers per room |
| `METRICS_TOKEN` | *(empty)* | Bearer token for `GET /metrics`; empty disables it |
| `LOG_LEVEL` | `info` | pino log level |
| `REDIS_URL` | *(empty)* | Reserved for a shared room store (in-memory by default) |

### Web app

| Variable | Default | Purpose |
|---|---|---|
| `VITE_SIGNALING_URL` | derived from hostname | Signaling origin. A bare hostname is upgraded to `https://` |
| `VITE_APP_URL` | `http://localhost:5173` | Public app URL used in invite links |
| `VITE_ENABLE_DEBUG_HOOKS` | `true` | Exposes debug helpers; turn off in production |

---

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Run the web app and signaling server together |
| `pnpm build` | Build every workspace package |
| `pnpm lint` | ESLint across the monorepo |
| `pnpm typecheck` | TypeScript project-reference build (`tsc -b`) |
| `pnpm test` | Vitest unit + integration suites |
| `pnpm e2e` | Playwright end-to-end tests |

Monorepo type-checking uses **`tsc -b` build mode**, not `tsc --noEmit` — with
composite project references, `--noEmit` propagates to `packages/protocol` and
fails with `TS6310`.

---

## Testing

```bash
pnpm test     # protocol + signaling + web unit/integration tests
pnpm e2e      # Playwright: presence, WebRTC handshake, transfer
```

CI (`.github/workflows/ci.yml`) runs lint → typecheck → test → Playwright on
chromium for every push and pull request.

Write the test first for bug fixes, and add tests alongside every feature.

---

## Deployment

`render.yaml` provisions **both halves on Render** from a single Blueprint:

| Service | Runtime | Notes |
|---|---|---|
| `dropzone-web` | static site | Always free and always on; SPA rewrite + security headers; global CDN |
| `dropzone-signaling` | Docker web service | Long-running Socket.IO server; health check `/healthz` |

**Steps**

1. Render Dashboard → **New → Blueprint** → select this repository.
2. Approve the two services. `dropzone-web` picks up the signaling host
   automatically via a `fromService` reference, and the client upgrades the bare
   hostname to `https://`.
3. Open the static site URL.

### About the free tier's 15-minute sleep

Render spins down a free **web service** after 15 minutes without inbound
traffic. A static site is unaffected, and while anyone has a room page open the
Socket.IO heartbeat counts as inbound traffic — so the sleep only delays the
*first* visit after a long idle period (~60 s cold start).

The client already tolerates this: it lets socket.io retry for up to 95 s instead
of failing at 8 s. To remove the delay entirely, point a free uptime pinger at
`https://<signaling-host>/healthz` every 10 minutes.

> Use `/healthz`. While a free service is asleep Render answers `/robots.txt`
> itself, so pings to that path return `200` and never wake anything.

`docs/DEPLOYMENT.md` has the full walkthrough, the TURN/coturn setup for
cross-network transfers, the alternative single-service topology, and
self-hosting with Docker Compose.

---

## Security and privacy model

What the design guarantees:

- **File bytes, names, and sizes never reach the server** and are never logged.
- **Nothing is written to disk on the receiver until the user clicks Accept.**
- Received files are **never auto-opened**.
- The server **verifies same-room membership before relaying** `signal` payloads,
  so a client cannot signal a peer it does not share a room with.
- Filenames are sanitized, including Windows-reserved names and dangerous
  extensions.
- Transfer state lives in **IndexedDB**, never `localStorage`; only the per-tab
  `deviceId` uses `sessionStorage`.
- No analytics, trackers, or third-party scripts are loaded.
- Heavy work (hashing, OPFS writes) runs in Web Workers so the main thread stays
  responsive.

Verify what you're connecting to: the SAS (short authentication string) derived
from both peers' DTLS fingerprints should match on both screens.

**Before a public launch**, tighten the CORS origin callback in
`apps/signaling/src/createServer.ts`, which currently accepts every origin. This
is recorded in `docs/DECISIONS.md`.

---

## Browser support and secure contexts

| Capability | `https://` or `localhost` | plain-HTTP LAN IP |
|---|---|---|
| WebRTC transfer | yes | yes |
| OPFS / File System Access | yes | no — falls back to in-memory |
| Wake Lock (mobile keep-alive) | yes | no |
| Notifications | yes | no |

Targets: current Chrome, Edge, Firefox, and Safari (desktop and mobile). Both
tabs must be open for a transfer to progress; the receiver chooses the storage
destination when prompted.

---

## Known limitations

- **Signaling is a single in-memory process.** Restarting it drops all rooms.
  `REDIS_URL` is reserved for a shared store but is not implemented.
- **A TURN relay is needed** for peers behind symmetric NAT or restrictive
  corporate networks. Without `TURN_URLS`, those pairs fail to connect.
- **The receiver must stay on the page.** Background tabs are throttled, and
  mobile operating systems may suspend a hidden tab — a wake lock is held while a
  room is occupied, but this is best-effort.
- **Free-tier hosting sleeps** as described above.
- The PWA manifest points at the SVG favicon and the app has no service-worker
  offline cache, so there is nothing to use offline and iOS gets a generic home
  screen icon. Add 192/512 px PNG icons if you want a polished install prompt.
- The `DROP_ZONE` signaling server has no authentication beyond room codes and
  rate limits; treat room codes as the only secret.

---

## Documentation

| Document | Contents |
|---|---|
| [`docs/PRD.md`](docs/PRD.md) | Product requirements, numbered functional requirements |
| [`docs/TRD.md`](docs/TRD.md) | Technical design: protocol, storage, backpressure, deployment |
| [`docs/WORKING.md`](docs/WORKING.md) | Phased implementation plan and gates |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Log of ambiguous calls and their rationale |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Render, TURN, Docker Compose, self-hosting |
| [`docs/benchmarking.md`](docs/benchmarking.md) | Transfer benchmark methodology and results |
| [`AGENTS.md`](AGENTS.md) | Conventions and hard constraints for contributors |

**Status:** Phases 0–8 are implemented (protocol, signaling, rooms, WebRTC,
transfer, reliability, diagnostics). Phase 9 — production hardening and
deployment — is in progress.
