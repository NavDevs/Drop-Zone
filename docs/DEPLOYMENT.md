# Deploying DropZone

DropZone has two deployable pieces. **Both live on Render** from the single
Blueprint at [`render.yaml`](../render.yaml):

| Piece | Path | Render service | Why there |
|-------|------|----------------|-----------|
| Web app (React + Vite) | `apps/web` | `dropzone-web` — **static site** | Pure static output. Always free, never sleeps, served over HTTPS (a secure context) from Render's CDN |
| Signaling server (Socket.IO) | `apps/signaling` | `dropzone-signaling` — **Docker web service** | Holds long-lived WebSocket connections, which static hosting cannot |

File bytes never touch either server; they go peer-to-peer over WebRTC. The
signaling server only relays SDP/candidates and room membership.

---

## Prerequisites

- The code pushed to a GitHub repository.
- A Render account — free "Hobby" workspace, **no credit card required**.
- A free uptime monitor account (UptimeRobot or cron-job.org) — only needed for
  the keep-alive in Part 2.

---

## Part 1 — Deploy both services (brand-new Render account)

1. **Sign up** at <https://dashboard.render.com/register>. Signing in with GitHub
   is the least work.
2. **Grant repo access.** When asked, authorize Render for GitHub. You can choose
   *Only select repositories* and pick just this one.
3. In the dashboard click **New** → **Blueprint**.
4. Select the repository → **Connect**.
5. Render parses `render.yaml` and shows a blueprint with **two** services:

   | Service | Type | Plan |
   |---|---|---|
   | `dropzone-signaling` | Web Service (Docker) | Free |
   | `dropzone-web` | Static Site | Free |

6. Render prompts for the two variables marked `sync: false`. **Leave both
   blank** — blank means "direct connections only" and "no metrics endpoint":

   | Variable | What to enter |
   |---|---|
   | `TURN_URLS` | *(blank is fine — add later for cross-network transfers)* |
   | `METRICS_TOKEN` | *(blank is fine — set it to protect `/metrics`)* |

   Everything else is wired automatically: `STUN_URLS`, `CORS_ORIGINS`,
   `TURN_SECRET`, `VITE_SIGNALING_URL` and `PORT`. Do not set `PORT` or
   `VITE_SIGNALING_URL` yourself.

7. Click **Apply**. Both services build (about 2–5 minutes). The signaling
   service is healthy when `GET /healthz` returns `{"ok":true}`.
8. Note the two URLs, e.g.
   - `https://dropzone-web.onrender.com`
   - `https://dropzone-signaling.onrender.com`

### How the two services find each other

- `dropzone-web` receives `VITE_SIGNALING_URL` from the signaling service's host
  through a Blueprint `fromService` reference. Render injects a **bare hostname**
  (`dropzone-signaling.onrender.com`) and the client prepends `https://` — see
  `getSignalingUrl` in `apps/web/src/lib/signaling/SignalingClient.ts`.
- `dropzone-signaling` is created with `CORS_ORIGINS=*` because the server's CORS
  callback currently accepts every origin anyway. See *Hardening* below.
- `STUN_URLS` is set to the public STUN list explicitly rather than left to the
  app's default, because an **empty** environment variable overrides that default
  and would leave the server with no STUN servers at all.

> If the static site's build log shows an empty `VITE_SIGNALING_URL`, set it
> manually under **dropzone-web → Environment** to `https://<signaling-host>` and
> redeploy.

---

## Part 2 — Keep the signaling server awake

**The static site never sleeps.** Only the free *web service* does: Render spins
it down after **15 minutes with no inbound traffic** (HTTP requests *and*
WebSocket messages count) and takes about **one minute** to wake, showing a
Render loading page meanwhile.

Two things already soften this, so you may not need Part 2 at all:

- While anyone has a room page open, the Socket.IO heartbeat counts as inbound
  traffic, so the service stays awake for the whole session.
- The client waits up to 95 s for the first connection instead of failing at 8 s,
  so a cold start degrades to a slow first load rather than an error.

To eliminate the delay, send it one request every few minutes.

### Set up the keep-alive with cron-job.org

1. Sign up at <https://cron-job.org/en/signup/> — entirely free (donation-funded),
   no credit card.
2. Confirm your email, then open **Console** → **Create cronjob**.
3. Fill in:

   | Field | Value |
   |---|---|
   | Title | `DropZone signaling keep-alive` |
   | URL | `https://dropzone-signaling.onrender.com/healthz` |
   | Execution schedule | **Every 5 minutes** |
   | Request method | `GET` |

4. Under **Advanced**, enable *Save responses in job history* while you are
   setting up, so you can inspect each run.
5. **Create**, then use **Test run** — expect HTTP `200` with body `{"ok":true}`.
6. Add your email under **Notifications** so failures actually reach you.

Free-plan facts that matter here: 1-minute minimum interval, unlimited jobs under
fair use, a 30-second request timeout, and **the job is auto-disabled after 25
consecutive failures** (re-enable it in the console if that ever happens).

> **Why every 5 minutes and not 1:** Render sleeps after 15 idle minutes, and
> cron-job.org documents that runs can be delayed during peak hours. Five minutes
> leaves comfortable headroom; ten also works. One minute just adds noise.

> **The first run after a sleep may show as failed.** Waking takes ~60 s while
> cron-job.org aborts at 30 s, but the wake is already triggered — confirm that
> the *next* run succeeds.

> ### Do not point the job at `/robots.txt`
> While a free service is asleep, Render intercepts that path itself and answers
> `Disallow: /`. The job would return `200` forever while your service sleeps.
> Point it at `/healthz`, a route your app actually serves.

### Alternative: UptimeRobot

UptimeRobot's free plan does the same job and adds uptime alerting: 50 monitors,
5-minute interval, no card. Point an HTTP(s) monitor at the same `/healthz` URL.
Its free plan is **non-commercial use only**.

A scheduled GitHub Actions workflow also works, but GitHub disables scheduled
runs after 60 days of repository inactivity, which quietly kills the keep-alive.

### The arithmetic you should know before relying on this

Render grants **750 free instance hours per workspace per calendar month**, and
keeping one web service awake around the clock consumes essentially all of it
(a month is 720–744 hours). Consequences:

- This must be your workspace's **only** free web service. A second one will
  exhaust the pool and Render suspends **all** free web services until the 1st of
  the next month.
- Static sites do **not** consume instance hours, so `dropzone-web` costs nothing
  from this pool.
- Render's own docs say free instances are for prototyping and demos — *"Do not
  use them for production applications"* — and Render reserves the right to
  restart a free service at any time. A keep-alive prevents the *idle sleep*; it
  is not an uptime guarantee.

---

## Part 3 — Verify

1. Open `https://dropzone-web.onrender.com`. The browser console should show the
   socket connecting to the signaling host, not to `:3001` on the web host.
2. `curl https://dropzone-signaling.onrender.com/healthz` → `{"ok":true}`.
3. Open the site on two devices, create a room on one, join with the code on the
   other, and send a file.
4. To confirm the keep-alive: leave it idle for 20 minutes and load the site
   again. If it responds immediately it never slept; if you see Render's loading
   page for ~60 s, your monitor is not pinging a real route.

**Use HTTPS.** `https://` and `localhost` are secure contexts; a plain-HTTP LAN
IP is not, and OPFS, File System Access, Wake Lock and Notifications are all
unavailable there.

---

## What "free forever" actually costs you

| Limit | Value | Effect on DropZone |
|---|---|---|
| Free instance hours | 750 / month / workspace | One always-on web service ≈ 720–744 h, so it just fits — but only one |
| Idle spin-down | 15 min → ~60 s wake | Removed by the keep-alive |
| Outbound bandwidth | 5 GB / month, then $0.15/GB | The JS bundle is ~156 KB gzipped, so ~30k page loads. Signaling traffic is negligible. **Without a payment method on file, Render suspends free services for the rest of the month if you exceed it** |
| RAM / CPU | 512 MB / 0.1 CPU | Fine for Node + Socket.IO with a handful of rooms |
| Free Postgres | expires after 30 days | Not used — DropZone has no database |
| UptimeRobot free plan | non-commercial use only | Fine for a college project |

If any of those become a real constraint: Render's **Starter** compute plan
($7/mo on the signaling service) removes the sleep, the quota arithmetic and the
`/robots.txt` quirk in one step. A genuinely always-on free VM (Oracle Cloud
"Always Free", or GCP's `e2-micro`) sidesteps the whole game but means running a
server yourself.

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
`https://<signaling-host>` — the hostname-derived fallback does not work on
`*.vercel.app`, so the variable is mandatory there.

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
