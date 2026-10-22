# Deploying DropZone

DropZone has two deployable pieces. **Both can live on Render** from the single
Blueprint at [`render.yaml`](../render.yaml):

| Piece | Path | Render service | Why there |
|-------|------|----------------|-----------|
| Web app (React + Vite) | `apps/web` | `dropzone-web` — **static site** | Pure static output; always free and never sleeps; served over HTTPS (a secure context) |
| Signaling server (Socket.IO) | `apps/signaling` | `dropzone-signaling` — **Docker web service** | Holds long-lived WebSocket connections, which static hosting cannot |

File bytes never touch either server; they go peer-to-peer over WebRTC. The
signaling server only relays SDP/candidates and room membership.

---

## Prerequisites

- Code pushed to a GitHub repository (Render deploys from Git).
- A Render account linked to that repository.

---

## 1. Deploy both services (Render Blueprint)

1. Push this repository to GitHub.
2. Render Dashboard → **New → Blueprint**.
3. Select the repository. Render reads `render.yaml` and proposes two services:
   `dropzone-signaling` (Docker, free plan, health check `/healthz`) and
   `dropzone-web` (static site).
4. When prompted for the `sync: false` variables, set:

   | Variable | Service | Value |
   |----------|---------|-------|
   | `STUN_URLS` | signaling | Leave blank to use the built-in public STUN servers |
   | `TURN_URLS` | signaling | Blank for direct-only, or `turn:<host>:3478,turns:<host>:5349` |
   | `METRICS_TOKEN` | signaling | Blank to disable `/metrics`, or any random string to protect it |

   `TURN_SECRET` is generated for you. `VITE_SIGNALING_URL` and `PORT` are wired
   up automatically — do not set them.

5. Apply. Render builds `apps/signaling/Dockerfile` with the repository root as
   build context, runs it as the non-root `node` user, and probes `/healthz`.
   The static site builds `apps/web` and publishes `apps/web/dist`.

### How the two services find each other

- `dropzone-web` gets `VITE_SIGNALING_URL` from the signaling service's host via
  a Blueprint `fromService` reference. Render injects a **bare hostname**
  (`dropzone-signaling.onrender.com`), and the client prepends `https://` — see
  `getSignalingUrl` in `apps/web/src/lib/signaling/SignalingClient.ts`.
- `dropzone-signaling` is created with `CORS_ORIGINS=*` because the server's CORS
  callback currently accepts every origin anyway. See *Hardening* below.

> If the static site's build log shows an empty `VITE_SIGNALING_URL`, set it
> manually under **dropzone-web → Environment** to
> `https://<signaling-host>` and redeploy.

---

## 2. Stop the free tier from sleeping (optional)

Render spins down a free **web service** after 15 minutes without inbound
traffic; it takes about a minute to spin back up. Static sites are unaffected.

Two things soften this:

- While anyone has a room page open, the Socket.IO heartbeat counts as inbound
  traffic, so the service stays awake for the duration of a session.
- The client waits up to 95 s for the first connection (socket.io retries in the
  background) instead of failing after 8 s, so a cold start degrades to a slower
  first load rather than an error.

To remove the delay entirely, point a free uptime monitor (UptimeRobot,
cron-job.org, or a scheduled GitHub Actions workflow) at:

```
https://<signaling-host>/healthz
```

every 10 minutes.

> **Do not ping `/robots.txt`.** While a free service is asleep Render answers
> that path itself with `disallow-all`, so the ping returns `200` and never wakes
> anything. Use a real route such as `/healthz`.

> Budget note: Render grants 750 free instance hours per workspace per month, and
> a month is 720–744 hours. Keeping one service awake around the clock consumes
> essentially the whole pool, so this must be your only free Render web service.

The alternative is Render's paid `starter` plan on the signaling service, which
removes the spin-down, the quota arithmetic, and the `/robots.txt` quirk.

---

## 3. Verify

1. Open the static site URL. The browser console should show the socket
   connecting to the signaling host, not to `:3001` on the web host.
2. `curl https://<signaling-host>/healthz` → `{"ok":true}`.
3. Open the site on two devices, create a room on one, join with the code on the
   other, and send a file.

**Use HTTPS.** `https://` and `localhost` are secure contexts; a plain-HTTP LAN
IP is not, and OPFS, File System Access, Wake Lock and Notifications are all
unavailable there.

---

## Optional: TURN for cross-network transfers

STUN alone fails behind symmetric NAT or restrictive corporate networks. To add a
relay, run `coturn` (see [`infra/docker-compose.yml`](../infra/docker-compose.yml)
for a reference configuration) and set on the signaling service:

- `TURN_URLS` — e.g. `turn:turn.example.com:3478,turns:turn.example.com:5349`
- `TURN_SECRET` — must equal coturn's `static-auth-secret`

The server mints short-lived TURN credentials (`TURN_TTL_SECONDS`, default 3600)
and pushes an ICE refresh about 60 s before they expire.

---

## Alternative topologies

### Web on Vercel, signaling on Render

[`vercel.json`](../vercel.json) is kept for this split (build
`pnpm --filter web build`, output `apps/web/dist`, SPA rewrite, security
headers). Set `VITE_SIGNALING_URL` in the Vercel project to
`https://<signaling-host>`. The static site's hostname-derived fallback does not
work on `*.vercel.app`, so the variable is mandatory there.

### Everything in one container

Build the web app and serve `apps/web/dist` from the same Express process as the
signaling server. Same-origin, so no CORS and no `VITE_SIGNALING_URL` needed —
but the HTML now cold-starts along with the socket.

### Self-host / LAN-only

```bash
cd infra
docker compose up --build
```

Runs the signaling server on `:3001` plus coturn. For local development use
`pnpm dev` instead.

---

## Hardening before a public launch

- The CORS `origin` callback in `apps/signaling/src/createServer.ts` ends with
  `callback(null, true)`, and the Socket.IO server uses `origin: true` —
  `CORS_ORIGINS` is effectively ignored. Replace the permissive fallback with a
  real allow-list check.
- Set `METRICS_TOKEN` if you expose `/metrics`.
- Add TURN, or state clearly in the UI which pairs cannot connect.
