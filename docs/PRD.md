# DropZone — Product Requirements Document (PRD)

**Version:** 1.0 · **Status:** Ready for build · **Companion docs:** `TRD.md`, `WORKING.md`, `AGENTS.md`

---

## 1. Overview

DropZone is a browser-based app for sending files directly between devices. Users create or join a short-lived **room**, see the other devices in it, and send files that travel over an encrypted **WebRTC DataChannel**. A signaling server only helps devices find each other; it never stores or sees file contents.

No installs, no accounts, no cloud storage of files.

## 2. Problem

- Sending a large file between a phone and laptop (or between two people's devices) usually means uploading to a cloud service, waiting twice, and giving a third party a copy.
- Email/chat apps cap file size and recompress media.
- Existing P2P tools often fail on large files (memory blowups), cannot resume, and give no insight when a transfer is slow.

## 3. Goals

| # | Goal |
|---|------|
| G1 | Transfer files of any practical size (tested to 5 GB on desktop Chromium) without loading them into memory |
| G2 | Pairing in under 10 seconds via QR code or 6-character code |
| G3 | Transfers survive network blips (auto-resume) |
| G4 | Users can see *why* a transfer is fast or slow (direct vs relayed, RTT, throughput) |
| G5 | Verifiable integrity (SHA-256) and consent (explicit accept) on every transfer |
| G6 | Production-grade: deployed, observable, tested across browsers and networks |

## 4. Non-goals (v1)

- Accounts, login, cloud storage, persistent history of file contents
- Native mobile/desktop apps
- Folder transfer (zip is out of scope; multiple files are supported)
- Guaranteeing direct connections (a TURN relay is sometimes unavoidable)
- True "nearby" radio discovery (Bluetooth/mDNS). Discovery is **room-based**; same-network auto-grouping is a P2 stretch

## 5. Personas

1. **Aisha, student**: moves lecture videos and project zips between phone and laptop on campus Wi-Fi.
2. **Rohan, freelancer**: sends 2–4 GB design files to a client without uploading.
3. **Meera, privacy-minded user**: wants no account and no server-side copy of her files.

## 6. User stories

- As a sender, I create a room and show a QR code so my phone joins instantly.
- As a receiver, I see who wants to send me what, and accept or decline.
- As a sender, I drop several files and see per-file progress, speed, and ETA.
- As a user, if my Wi-Fi drops mid-transfer, it continues where it stopped.
- As a user, I see whether my transfer is direct or relayed.
- As a cautious user, I can confirm the connection is not tampered with by comparing a short code on both screens.
- As a power user, I can run a benchmark to compare speeds under different settings.

## 7. Functional requirements

Priority: **P0** = must ship in v1 · **P1** = should ship in v1 · **P2** = stretch.

### 7.1 Rooms and pairing

| ID | Requirement | Pri | Acceptance criteria |
|----|-------------|-----|---------------------|
| FR-01 | Create room → 6-char code from unambiguous alphabet, default TTL 10 min (choices 5/10/30/60) | P0 | Code displayed; expires after TTL for *new joins*; existing members unaffected |
| FR-02 | Join by entering code or opening `/r/<code>` | P0 | Valid code joins; invalid/expired shows clear error |
| FR-03 | QR code encoding the join URL | P0 | Scanning with a phone camera opens the room and joins |
| FR-04 | Auto-generated device name (e.g. "Swift Otter") + device-type icon; user can rename | P0 | Name visible to peers; rename propagates live |
| FR-05 | Peer list with state: online / connecting / connected (direct) / connected (relayed) / offline | P0 | State updates in real time |
| FR-06 | Max 8 devices per room; host can close room; session idle timeout 30 min, hard max 6 h | P0 | Join beyond limit rejected with `ROOM_FULL`; active transfers are never killed by TTL |
| FR-07 | Optional host approval of joiners | P1 | Toggle; joiner waits for approval |
| FR-08 | Regenerate/extend room code | P1 | Old code invalid immediately |
| FR-09 | Same-network auto-grouping (by hashed public IP) | P2 | Opt-in only |

### 7.2 Transfer

| ID | Requirement | Pri | Acceptance criteria |
|----|-------------|-----|---------------------|
| FR-10 | Select files via picker, drag-and-drop, paste; multiple files queue | P0 | Queue shows each file |
| FR-11 | Receiver explicitly accepts/declines every offer; shows name, size, sender | P0 | Nothing is written to disk before Accept |
| FR-12 | Bytes travel over WebRTC DataChannel only (no server upload) | P0 | Network tab shows zero file bytes to app servers; via TURN only when relayed |
| FR-13 | Chunked transfer, constant memory (< 300 MB tab usage) for any file size | P0 | 5 GB file transfers on Chromium desktop without crash |
| FR-14 | Backpressure on both send buffer and receiver disk | P0 | No unbounded `bufferedAmount` growth; slow receiver throttles sender |
| FR-15 | Live progress %, speed, size, ETA per transfer | P0 | Updates ≥ 2×/s; ETA within ±20% on steady link |
| FR-16 | Cancel (either side) | P0 | Both sides clean up partial data |
| FR-17 | Pause/continue | P1 | Pause stops sending within 1 s; continue resumes |
| FR-18 | Auto-resume after connection loss (same session) | P0 | Kill connection at 50%: transfer completes without restarting from 0 |
| FR-19 | Resume after page reload | P1 | Receiver reopens room; sender re-selects file (or reuses saved handle on Chromium); transfer continues |
| FR-20 | SHA-256 integrity verification with "Verified" badge | P0 | Mismatch shows error and offers retry |
| FR-21 | Send to multiple peers concurrently | P1 | Independent progress per peer |
| FR-22 | Send text/clipboard snippet | P2 | Appears as a copyable item on receiver |

### 7.3 Network insight and trust

| ID | Requirement | Pri | Acceptance criteria |
|----|-------------|-----|---------------------|
| FR-30 | Connection badge: **Direct (local network)**, **Direct (internet)**, **Relayed (TURN)** | P0 | Matches `getStats()` selected candidate pair |
| FR-31 | Diagnostics drawer: RTT, ICE state, candidate types, protocol (udp/tcp), outgoing bitrate, bytes sent/received | P1 | Refreshes every 1 s |
| FR-32 | Benchmark page: send generated data under chosen chunk size/channel count; results table + CSV export | P1 | No disk I/O during benchmark |
| FR-33 | Short Authentication String (SAS) shown on both devices | P1 | Same 6-digit code on both ends of a connection |

### 7.4 Platform and UX

| ID | Requirement | Pri |
|----|-------------|-----|
| FR-40 | Fully responsive; usable one-handed on a phone | P0 |
| FR-41 | Dark/light theme; respects `prefers-reduced-motion` | P0 |
| FR-42 | Installable PWA (app shell only; no offline transfers) | P1 |
| FR-43 | In-session transfer list only. No persistent history of file names unless user opts in | P0 |
| FR-44 | Filename sanitization and warning on executable types; never auto-open files | P0 |
| FR-45 | Warn before accepting if free storage is insufficient | P1 |

## 8. UX flows and screens

1. **Landing `/`**: two big actions: *Create room*, *Join with code*. Short privacy blurb.
2. **Room `/r/:code`**
   - Header: room code, countdown to code expiry, copy-link, QR toggle, leave.
   - Peer grid: cards with device icon, name, connection badge. Click a card (or drop files on it) to send.
   - Transfer list: rows with file name, size, direction, progress bar, speed, ETA, actions (cancel/pause/open).
   - Incoming dialog: sender, file list, sizes, **Accept / Decline**, storage warning.
   - Diagnostics drawer (per peer) and SAS display.
3. **Benchmark `/benchmark`**
4. **About/Privacy `/about`**: what the server sees (room code, device names, SDP/ICE metadata), what it never sees (file contents/names).

Empty, loading, error, and offline states must be designed for every screen. Errors use plain language with a next action (e.g. "Code expired: ask your friend for a new one").

## 9. Non-functional requirements

| Area | Requirement |
|------|-------------|
| Performance | Connect < 3 s p50 (direct), < 6 s p50 (relay). Throughput target ≥ 100 Mbps on same-LAN Chromium↔Chromium (measured and documented, not promised) |
| Memory | Tab stays < 300 MB during any transfer |
| Initial load | ≤ 180 KB gzipped JS for first paint (hash/WASM lazy-loaded); Lighthouse performance ≥ 90 |
| Reliability | Signaling availability 99.5%; reconnect to signaling automatically with backoff |
| Security | HTTPS only; DTLS-encrypted transfers; rate limiting; strict CSP; no file data or file names in server logs |
| Privacy | No accounts, no third-party trackers; optional anonymous telemetry is opt-in |
| Accessibility | WCAG 2.1 AA: keyboard navigable, ARIA live region for progress (throttled), contrast |
| Compatibility | See matrix below |

### Browser support matrix (targets; verify in Phase 8)

| Browser | Large files | Notes |
|---------|-------------|-------|
| Chrome/Edge desktop | Full (File System Access API) | Reference platform |
| Firefox desktop | Large via OPFS staging | Save step uses download of OPFS file |
| Safari macOS | Large via OPFS staging | Warn above ~2 GB |
| Chrome Android | Large via OPFS staging | Keep screen awake during transfer |
| Safari iOS | Limited | Warn above ~1 GB; background tab suspends transfer |

## 10. Success metrics

- Transfer success rate ≥ 95% (excluding user cancel)
- Resume success rate ≥ 90% after forced disconnect
- Share of direct vs relayed connections (tracked to size TURN cost)
- Pairing time p50 < 10 s
- Zero file-content bytes in server logs (audited)

## 11. Risks and honest constraints

| Risk | Mitigation |
|------|------------|
| Symmetric NAT / corporate firewalls block direct connections | TURN relay (UDP/TCP/TLS 443); UI clearly says "Relayed"; file bytes remain DTLS-encrypted end to end |
| TURN bandwidth cost | Ephemeral credentials, per-session quotas, monitoring; direct preferred automatically |
| Mobile browsers suspend background tabs | Wake Lock during transfer; clear warning; resume support |
| Signaling server could tamper with SDP | SAS verification (FR-33) |
| Abuse (malware distribution) | Explicit accept, no auto-open, executable warnings, rate limits, no server-side storage |
| Browser memory/disk API differences | Writer abstraction with three backends and capability detection |

## 12. Release plan

| Milestone | Scope |
|-----------|-------|
| M1 Alpha | Rooms, pairing, small-file transfer (FR-01–06, 10–12) |
| M2 Beta | Chunking, backpressure, large files, progress, accept/decline, integrity (FR-13–16, 20, 30) |
| M3 RC | Resume, QR polish, diagnostics, SAS, benchmark, PWA, multi-peer (FR-17–19, 21, 31–33, 42) |
| M4 v1.0 | Production deploy, TURN, hardening, cross-browser/network testing, docs |

## 13. Open questions (defaults chosen; change only if you disagree)

- Hash algorithm → **SHA-256** (universally understood).
- Default data channels → **1**, decided by benchmark in Phase 7.
- Telemetry → **off by default**.
- TURN → start with a managed provider or self-hosted coturn; both supported via env config.
