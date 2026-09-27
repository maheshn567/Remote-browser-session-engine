# 🌐 Remote Browser Preview & Session Capture Engine

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16.3-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![Fastify](https://img.shields.io/badge/Fastify-5.11-000000?style=for-the-badge&logo=fastify&logoColor=white)](https://fastify.dev/)
[![Playwright](https://img.shields.io/badge/Playwright-1.62-45BA4B?style=for-the-badge&logo=playwright&logoColor=white)](https://playwright.dev/)
[![WebRTC](https://img.shields.io/badge/WebRTC-werift-333333?style=for-the-badge&logo=webrtc&logoColor=white)](https://webrtc.org/)
[![Bun](https://img.shields.io/badge/Bun-1.3-FBF0DF?style=for-the-badge&logo=bun&logoColor=black)](https://bun.sh/)
[![Auth](https://img.shields.io/badge/Auth-Credential--Free_Handoff-emerald?style=for-the-badge&logo=shield&logoColor=white)](#-key-technical-features)

<!-- TODO: record a 20–30s GIF of: Take Control → log in → Capture Session → Test Replay succeeds -->
<!-- ![Demo](docs/demo.gif) -->

A high-performance, self-hosted, from-scratch remote browser control engine and session capture platform — providing the core infrastructure found in commercial products like **Browserbase**, **Anchor Browser**, **Airtop**, and **Steel.dev**.

It enables humans to remotely view and interact with real Chromium tabs in real-time over a low-latency WebRTC stream, complete complex interactive logins (including 2FA, SMS verification, CAPTCHAs, and SAML/SSO), capture the resulting authentication tokens, and replay them headlessly in automated agent workflows — **without raw user credentials ever touching the application codebase**.

---

## 🎯 Executive Overview & Recruiter Highlights

### Why This Project Stands Out
- **Full-Stack Systems Architecture**: Combines low-level Linux virtual displays (`Xvfb`), real-time media encoding (`FFmpeg` VP8/RTP), WebRTC signaling & ICE candidate gathering (`werift`), Chrome DevTools Protocol (`CDP`), and modern React 19 / Next.js web interfaces.
- **Credential-Free Auth Design**: Addresses the core security dilemma of AI browser agents: *How do you let an AI access an account without handing over the password?*
- **Clean, Typed Codebase**: TypeScript strict mode, modular design, isolated session contexts, centralized configuration, and targeted unhandled-rejection filtering.

---

## 🏗️ System Architecture

```
                 ┌─────────────────────────────────────────────────────────────┐
                 │                   Next.js 16 Client (React 19)              │
                 │  - Interactive HTML5 Video Stream (low-latency WebRTC)      │
                 │  - Dual Control Modes (Agent Autonomous vs Human Live)      │
                 │  - Real-time Multi-Tab Management & Navigation Bar          │
                 └──────────────┬──────────────────────────────▲───────────────┘
                                │ WebRTC SDP/ICE               │ WebRTC Video Track
                                │ Signalling & RTCDataChannel  │ (VP8 Payload @ 30fps)
                                ▼                              │
                 ┌─────────────────────────────────────────────┴───────────────┐
                 │                 Fastify Server (Bun Runtime)                │
                 │                                                             │
                 │  ┌─────────────────────────┐   ┌──────────────────────────┐ │
                 │  │   SessionManager        │   │  WebRTC Gateway (werift) │ │
                 │  │  - Context Isolation    │   │  - SDP Offer/Answer      │ │
                 │  │  - Session Lifecycle    │   │  - UDP Port 5004 Listener│ │
                 │  └───────────┬─────────────┘   └────────────▲─────────────┘ │
                 └──────────────┼──────────────────────────────│───────────────┘
                                │ Playwright / CDP Commands    │ RTP VP8 Packets
                                ▼                              │
                 ┌─────────────────────────────────────────────┴───────────────┐
                 │                Chromium / Linux Environment                 │
                 │                                                             │
                 │  ┌─────────────────────────┐   ┌──────────────────────────┐ │
                 │  │ Chromium Browser        │   │ FFmpeg x11grab           │ │
                 │  │ - Isolated Contexts     │──►│ - Virtual Display :99    │ │
                 │  │ - CDP Input Dispatcher  │   │ - VP8 RTP Video Encoder  │ │
                 │  └─────────────────────────┘   └──────────────────────────┘ │
                 └─────────────────────────────────────────────────────────────┘
                                                │
                                                ▼
                                    storageState Capture JSON
                                    (Cookies + localStorage)
```

---

## ✨ Key Technical Features

### 1. 🛡️ Credential-Free Session Handoff
Commercial browser automation platforms often suffer from a major security flaw: asking users to type sensitive passwords into third-party agent forms. 
- **Direct Login**: The user views a real Chromium tab streamed over WebRTC and logs into the target site directly (e.g., Google, GitHub, Okta).
- **Session Snapshotting**: Upon successful login, Playwright's `context.storageState()` extracts only the resulting session cookies and `localStorage` state.
- **Headless Replay**: Automated agents consume the captured session state in an isolated context to perform downstream tasks without ever accessing or storing passwords.

### 2. ⚡ Ultra-Low Latency WebRTC Video Pipeline
- **X11 Display Grab**: `FFmpeg` captures the headless `Xvfb` virtual display (`:99`) at 30 FPS in real-time.
- **Real-Time VP8 Encoding**: Software encoding via `libvpx`, tuned with low-latency flags (`-quality realtime -cpu-used 8 -g 30`).
- **UDP to WebRTC Gateway**: RTP video packets are streamed over local UDP (port 5004) directly into `werift` (Pure TypeScript WebRTC stack), which manages SDP exchange and full ICE candidate gathering for instant browser media playback.

### 3. 🎮 Interactive Input Forwarding & Chrome DevTools Protocol (CDP)
- **Pixel-Accurate Mapping**: Mouse movements, clicks, and scroll wheel actions on the Next.js canvas are converted dynamically to the 1440x896 viewport.
- **Native Keyboard & Click Dispatch**: Input events pass over WebRTC `RTCDataChannel` (or HTTP fallback) to `CDPController`, injecting native click focus and keystrokes directly into Chromium via Playwright's mouse/keyboard engine.

### 4. 📑 Multi-Tab & Session Context Management
- **Efficient Context Sharing**: Multiple isolated user sessions (`BrowserSession`) share a single launched Chromium process, minimizing RAM overhead while ensuring cookie and storage isolation per session.
- **Auto-Focus New Tabs**: `CDPController` listens for context page creation events, automatically focusing newly spawned popups or tabs (e.g. OAuth popup windows).
- **Tab Switching & Closure**: Full tab lifecycle APIs (`/tabs`, `/tabs/switch`, `/tabs/close`) reflected in the UI tab bar.

---

## 🚀 Quick Start Guide

### Prerequisites
- **Node.js** (v20+) or **Bun** (v1.1+)
- **Linux Environment** (or WSL2 / Docker container)
- **FFmpeg** and **Xvfb** installed on your host system:
  ```bash
  sudo apt-get update && sudo apt-get install -y xvfb ffmpeg
  ```

### One-command start
Once dependencies are installed once (see below), `./start.sh` starts Xvfb (if not already running), the backend, and the frontend together in one terminal — handy for local dev and for live demos/screen-shares.
```bash
./start.sh          # starts everything, Ctrl+C to stop
./start.sh stop     # stops Xvfb + dev servers
```

### Manual step-by-step (first-time setup, or if you want separate terminals)

**1. Start Virtual Display (Xvfb)**
```bash
Xvfb :99 -screen 0 1440x896x24 &
export DISPLAY=:99
```

**2. Launch Backend (Fastify + Playwright + WebRTC)**
```bash
cd apps/browser-server
cp .env.example .env
bun install
bunx playwright install chromium
bun run dev
```
*Backend runs on `http://localhost:3001`.*

**3. Launch Frontend (Next.js 16)**
```bash
cd apps/frontend
cp .env.local.example .env.local
bun install
bun run dev
```
*Frontend interface accessible at `http://localhost:3000`.*

---

## 🧪 Interactive Demo Workflow

1. Open **`http://localhost:3000`** in your web browser.
2. Click **Take Control** to transfer control from the automated agent to your mouse/keyboard.
3. Log into any service (e.g., Google Accounts or GitHub) inside the remote Chromium canvas.
4. Click **Give Control Back**, then click **Capture Session**.
5. Test Headless Replay: Enter a target URL (e.g. `https://mail.google.com`) and click **Test Replay**.
6. Observe a brand new, headless browser context launch and navigate directly to the authenticated page with **zero password interaction**.

---

## 📡 REST API Reference

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/sessions/:id` | `GET` | Get session state and active controller (`AGENT` vs `USER`). |
| `/sessions/:id/take-control` | `POST` | Grant interactive human input control over WebRTC. |
| `/sessions/:id/release-control` | `POST` | Return session control back to automated agent mode. |
| `/sessions/:id/navigate` | `POST` | Navigate active browser tab to specified target URL. |
| `/sessions/:id/tabs` | `GET` | List all open tabs in the current browser session. |
| `/sessions/:id/tabs/switch` | `POST` | Switch active focused tab by index. |
| `/sessions/:id/tabs/close` | `POST` | Close tab by index. |
| `/sessions/:id/capture-auth` | `POST` | Snapshot `storageState` (cookies + localStorage) to disk. |
| `/sessions/:id/has-captured-auth` | `GET` | Check if session auth snapshot exists for given session ID. |
| `/sessions/:id/replay` | `POST` | Replay auth snapshot in a fresh headless context to verify session reuse. |
| `/sessions/:id/webrtc/offer` | `POST` | WebRTC SDP offer exchange endpoint. Returns SDP answer with complete ICE candidates. |

---

## 🛠️ Tech Stack & Dependencies

| Category | Technology | Description |
| :--- | :--- | :--- |
| **Frontend** | React 19, Next.js 16 | App Router, WebRTC Video Rendering, Tailwind CSS |
| **Backend API** | Fastify 5 | High-performance TypeScript HTTP framework |
| **Browser Engine** | Playwright & CDP | Chrome DevTools Protocol & Context management |
| **Media & WebRTC** | `werift`, FFmpeg | Pure TS WebRTC protocol stack, VP8/RTP streaming |
| **Runtime** | Bun 1.3 | Fast JavaScript runtime & package manager |
| **Virtual Environment** | Xvfb (X11) | Headless virtual framebuffer for Linux |

---

## 💡 Engineering Design & Roadmap

```
Phase 1: Basic Streaming    Phase 2: Auth Capture & CDP   Phase 3: Production Security (Next)
┌───────────────────────┐   ┌──────────────────────────┐   ┌──────────────────────────────┐
│  Xvfb + FFmpeg + UDP  │──►│  Multi-Session Contexts  │──►│  Docker Sandbox per Session  │
│  WebRTC Video Stream  │   │  Auth Capture & Replay   │   │  Per-Session Display/Video   │
└───────────────────────┘   └──────────────────────────┘   └──────────────────────────────┘
```

- **Current State**: Isolated Playwright `BrowserContext` instances per session sharing an X11 virtual display. Ideal for single-user interactive session capture and headless background replay.
- **Next Milestone**: Containerizing each session inside isolated Docker environments to enable multi-tenant concurrent live streaming and sandboxed execution.

### ⚠️ Known Limitations
This is a portfolio-stage prototype. These gaps are known and deliberate for now:
- **Session snapshots are stored as plaintext JSON** in `sessions/` (gitignored). Captured cookies are bearer credentials; production would store them encrypted (e.g. AES-GCM with a KMS-managed key) and scoped per tenant.
- **Replay verification is heuristic** — it checks whether the final URL looks like a login page. A real deployment would use per-site checks (e.g. an authenticated API call).
- **Single shared display** — all sessions render to one Xvfb display, so only one live stream is meaningful at a time (addressed by the Docker milestone above).
- **No automated test suite or CI yet.**

---

## 📄 License

MIT © [Mahesh N]

