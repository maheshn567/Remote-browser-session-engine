# Remote Browser Session Engine

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16.3-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![Fastify](https://img.shields.io/badge/Fastify-5.11-000000?logo=fastify&logoColor=white)](https://fastify.dev/)
[![Playwright](https://img.shields.io/badge/Playwright-1.62-45BA4B?logo=playwright&logoColor=white)](https://playwright.dev/)
[![WebRTC](https://img.shields.io/badge/WebRTC-werift-333333?logo=webrtc&logoColor=white)](https://webrtc.org/)
[![Bun](https://img.shields.io/badge/Bun-1.3-FBF0DF?logo=bun&logoColor=black)](https://bun.sh/)

<!-- TODO: record a 20-30s demo GIF: Take Control -> log in -> Capture Session -> Test Replay succeeds -->
<!-- ![Demo](docs/demo.gif) -->

A self-hosted remote browser control and session capture engine, built from scratch — the same category of infrastructure behind products like Browserbase, Anchor Browser, and Steel.dev.

A human logs into a real Chromium tab over a live WebRTC stream, completing whatever the login requires (2FA, SSO, CAPTCHAs). The resulting session cookies are captured and can be replayed headlessly by an automated agent, without the agent ever seeing or storing a password.

## Why it exists

AI browser agents need to act on a user's behalf — book a flight, check an inbox, manage an account — but handing an agent a raw password is a real security liability. This project solves that specific problem: a human authenticates once through a live, streamed session; the agent only ever receives the resulting session token.

## Architecture

```
                 ┌─────────────────────────────────────────────────────────────┐
                 │                   Next.js Client (React)                    │
                 │  - Video stream over WebRTC                                 │
                 │  - Human / agent control handoff                            │
                 │  - Tab management and navigation                            │
                 └──────────────┬──────────────────────────────▲───────────────┘
                                │ WebRTC SDP/ICE               │ WebRTC Video Track
                                │ Signalling & RTCDataChannel  │ (VP8 @ 30fps)
                                ▼                              │
                 ┌─────────────────────────────────────────────┴───────────────┐
                 │                 Fastify Server (Bun Runtime)                │
                 │                                                             │
                 │  ┌─────────────────────────┐   ┌──────────────────────────┐ │
                 │  │   SessionManager        │   │  WebRTC Gateway (werift) │ │
                 │  │  - Context isolation    │   │  - SDP offer/answer      │ │
                 │  │  - Session lifecycle    │   │  - UDP port 5004 listener│ │
                 │  └───────────┬─────────────┘   └────────────▲─────────────┘ │
                 └──────────────┼──────────────────────────────│───────────────┘
                                │ Playwright / CDP commands    │ RTP VP8 packets
                                ▼                              │
                 ┌─────────────────────────────────────────────┴───────────────┐
                 │                Chromium / Linux environment                 │
                 │                                                             │
                 │  ┌─────────────────────────┐   ┌──────────────────────────┐ │
                 │  │ Chromium browser        │   │ FFmpeg x11grab           │ │
                 │  │ - Isolated contexts     │──►│ - Virtual display :99    │ │
                 │  │ - CDP input dispatcher  │   │ - VP8 RTP video encoder  │ │
                 │  └─────────────────────────┘   └──────────────────────────┘ │
                 └─────────────────────────────────────────────────────────────┘
                                                │
                                                ▼
                                    storageState capture (JSON)
                                    cookies + localStorage
```

## How it works

1. **Xvfb** creates a virtual display (`:99`) that exists only in memory — no physical monitor involved.
2. **Chromium**, launched via Playwright, renders onto that virtual display exactly as it would onto a real one.
3. **FFmpeg** captures the display's pixels via `x11grab` and encodes them as VP8, streamed over local UDP as RTP.
4. A **WebRTC gateway** (`werift`) bridges those RTP packets into a real `RTCPeerConnection`, so the frontend receives a live, low-latency video feed.
5. Mouse and keyboard input from the frontend travel back over a WebRTC `RTCDataChannel` (with an HTTP fallback) to a **CDPController**, which dispatches them into Chromium via the Chrome DevTools Protocol.
6. Once the human completes a login, `context.storageState()` captures the resulting cookies and localStorage to disk — no password ever touches this step.
7. That captured state can later be loaded into a **fresh, headless** Playwright context (no Xvfb, no video) so an automated agent can act on the authenticated session directly.

## Key features

**Credential-free session handoff.** The user authenticates directly with the target site through a live stream; the captured artifact is a session token, not a password.

**Low-latency WebRTC video pipeline.** `FFmpeg` captures the virtual display in real time; the resulting VP8/RTP stream is bridged into a `werift` WebRTC connection with full SDP/ICE negotiation.

**Coordinate-accurate input forwarding.** Mouse and keyboard events from the video canvas are mapped to real page coordinates and dispatched natively through Playwright's CDP-based input engine, with leftover browser-chrome offsets corrected automatically per session.

**Multi-tab, multi-session management.** Isolated `BrowserContext` instances share a single Chromium process, keeping cookie/storage isolation per session while minimizing memory overhead. New tabs and popups (e.g. OAuth windows) are auto-focused.

## Quick start

### Prerequisites
- Node.js 20+ or Bun 1.1+
- A Linux environment (or WSL2 / a container)
- FFmpeg and Xvfb:
  ```bash
  sudo apt-get update && sudo apt-get install -y xvfb ffmpeg
  ```

### One-command start
Once dependencies are installed (see below), `./start.sh` starts Xvfb (if not already running), the backend, and the frontend together in one terminal.
```bash
./start.sh          # starts everything, Ctrl+C to stop
./start.sh stop     # stops Xvfb and both dev servers
```

### Manual setup (first run, or separate terminals)

**1. Start the virtual display**
```bash
Xvfb :99 -screen 0 1440x896x24 &
export DISPLAY=:99
```

**2. Start the backend** (Fastify + Playwright + WebRTC)
```bash
cd apps/browser-server
cp .env.example .env
bun install
bunx playwright install chromium
bun run dev
```
Runs on `http://localhost:3001`.

**3. Start the frontend** (Next.js)
```bash
cd apps/frontend
cp .env.local.example .env.local
bun install
bun run dev
```
Runs on `http://localhost:3000`.

## Demo workflow

1. Open `http://localhost:3000`.
2. Click **Take Control**.
3. Log into a real service (e.g. Google, GitHub) inside the streamed Chromium tab.
4. Click **Give Control Back**, then **Capture Session**.
5. Enter a target URL (e.g. `https://mail.google.com`) and click **Test Replay**.
6. A fresh, headless browser context loads with zero password interaction and lands on the authenticated page.

## REST API

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/sessions/:id` | `GET` | Get session state and active controller (`AGENT` vs `USER`). |
| `/sessions/:id/take-control` | `POST` | Grant interactive human control. |
| `/sessions/:id/release-control` | `POST` | Return control to agent mode. |
| `/sessions/:id/navigate` | `POST` | Navigate the active tab to a URL. |
| `/sessions/:id/tabs` | `GET` | List open tabs. |
| `/sessions/:id/tabs/switch` | `POST` | Switch the active tab by index. |
| `/sessions/:id/tabs/close` | `POST` | Close a tab by index. |
| `/sessions/:id/capture-auth` | `POST` | Snapshot `storageState` (cookies + localStorage) to disk. |
| `/sessions/:id/has-captured-auth` | `GET` | Check whether a snapshot exists for a session. |
| `/sessions/:id/replay` | `POST` | Replay a snapshot in a fresh headless context. |
| `/sessions/:id/webrtc/offer` | `POST` | WebRTC SDP offer/answer exchange. |

## Tech stack

| Category | Technology | Notes |
| :--- | :--- | :--- |
| Frontend | React, Next.js | App Router, WebRTC video rendering, Tailwind CSS |
| Backend API | Fastify | TypeScript HTTP framework |
| Browser engine | Playwright, CDP | Context isolation, native input dispatch |
| Media / WebRTC | `werift`, FFmpeg | Pure-TypeScript WebRTC stack, VP8/RTP streaming |
| Runtime | Bun | JavaScript runtime and package manager |
| Virtual display | Xvfb (X11) | In-memory virtual framebuffer |

## Roadmap

- **Current**: isolated `BrowserContext` instances per session, sharing one X11 virtual display. Suited to a single interactive session at a time plus headless background replay.
- **Next**: containerizing each session (Docker) to support concurrent multi-tenant live streaming and sandboxed execution.

## Known limitations

This is a portfolio-stage project, and these gaps are known rather than accidental:

- **Session snapshots are stored as plaintext JSON** in `sessions/` (gitignored). Captured cookies are bearer credentials; a production system would store them encrypted and scoped per tenant.
- **Replay verification is a heuristic** — it checks whether the final URL looks like a login page. A real deployment would use a per-site check instead (e.g. an authenticated API call).
- **Single shared display** — all sessions render to one Xvfb display, so only one live stream is meaningful at a time (the Docker milestone above addresses this).
- **No automated test suite or CI yet.**
