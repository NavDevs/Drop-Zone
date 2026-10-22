# Deploying DropZone (Combined Service)

DropZone is hosted as a single **Web Service** on Render. A single Node.js 
process serves the React frontend assets and handles the Socket.IO signaling.

| Piece | Path | Render service | Why this way |
|-------|------|----------------|-----------|
| **DropZone Combined** | `.` | `dropzone` — **Docker web service** | Simplifies deployment and keep-alive. One process, one URL, one monitor. |

File bytes never touch the server; they go peer-to-peer over WebRTC. The 
server only relays SDP/candidates, room membership, and the static JS/HTML bundle.

---

## Prerequisites

- The code pushed to a GitHub repository.
- A Render account — free "Hobby" workspace, **no credit card required**.
- A free uptime monitor account (e.g., [cron-job.org](https://cron-job.org/)).

---

## Part 1 — Deploy the service

1. **Sign up** at <https://dashboard.render.com/register>. Signing in with GitHub 
   is recommended.
2. **Grant repo access.** Authorize Render for your GitHub account and select 
   the `Drop-Zone` repository.
3. In the dashboard click **New** → **Blueprint**.
4. Select the repository → **Connect**.
5. Render parses [`render.yaml`](../render.yaml) and shows a blueprint with **one** service:
   - `dropzone` (Web Service, Docker, Free)
6. Render prompts for the variables marked `sync: false`. **Leave both blank**:
   - `TURN_URLS` → *(blank for direct-only)*
   - `METRICS_TOKEN` → *(blank to disable /metrics)*
   
   Everything else (`STUN_URLS`, `CORS_ORIGINS`, `LOG_LEVEL`) is set automatically.
7. Click **Apply**. The build takes ~5 minutes. It builds the protocol, the 
   web app, and then the signaling server.
8. Your URL will be `https://dropzone.onrender.com`.

### How it works (Same-Origin)

- The signaling server serves the frontend from its own internal `/public` folder.
- Because they share the same URL, the client automatically finds the signaling 
  server at the same origin — no `VITE_SIGNALING_URL` config is needed.
- `STUN_URLS` is hardcoded in the blueprint to ensure NAT discovery works out 
  of the box.

---

## Part 2 — Keep it awake (cron-job.org)

The free web service spins down after **15 minutes with no traffic**. Waking 
takes ~60 seconds. To eliminate this delay, ping the service every 5 minutes.

1. Sign up at <https://cron-job.org/en/signup/>.
2. **Console** → **Create cronjob**.
3. Fill in:
   - **Title**: `DropZone keep-alive`
   - **URL**: `https://dropzone.onrender.com/healthz`
   - **Schedule**: **Every 5 minutes**
   - **Method**: `GET`
4. **Create** and **Test run**. You want HTTP `200` with `{"ok":true}`.

> **Note**: Do not point the job at your root URL or `/robots.txt`. Render 
> intercepts those while asleep. Point it at `/healthz`, which is served 
> directly by your Node.js app.

---

## Part 3 — Verify

1. Open `https://dropzone.onrender.com`.
2. Open the site on a second device (phone/laptop), enter the room code, and 
   send a test file.
3. Check the cron-job.org history after 20 minutes to ensure it's successfully 
   preventing the sleep.

---

## Hardening

- The signaling server currently accepts all origins (`CORS_ORIGINS=*`).
- The `METRICS_TOKEN` should be set if you want to use the Prometheus endpoint.
- For symmetric NAT support (corporate firewalls), you will eventually need a 
  TURN server.
