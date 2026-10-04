"use client";

import { useState, useEffect, useRef } from "react";
import { BrowserWindow, type HistoryAction, type TabInfo } from "@/components/BrowserWindow";
import { SessionPanel, type Controller, type ReplayResult } from "@/components/SessionPanel";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3001";
const SESSION_ID = "demo";
const VIEWPORT = { width: 1440, height: 896 };

export default function BrowserPage() {
  const [controller, setController] = useState<Controller>("AGENT");
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [currentUrl, setCurrentUrl] = useState("https://accounts.google.com");
  const [tabs, setTabs] = useState<TabInfo[]>([]);

  const [hasCapturedAuth, setHasCapturedAuth] = useState(false);
  const [capturedAt, setCapturedAt] = useState<string | null>(null);
  const [replayResult, setReplayResult] = useState<ReplayResult | null>(null);
  const [replayUrl, setReplayUrl] = useState("https://mail.google.com");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const lastMouseMoveRef = useRef<number>(0);
  // While the user is editing the address bar, tab polling must not overwrite it.
  const editingUrlRef = useRef(false);

  useEffect(() => {
    async function initWebRTC() {
      try {
        const pc = new RTCPeerConnection({ iceServers: [] });
        peerConnectionRef.current = pc;

        pc.addTransceiver("video", { direction: "recvonly" });

        const dc = pc.createDataChannel("input");
        dataChannelRef.current = dc;

        pc.ontrack = (event) => {
          if (videoRef.current) {
            const stream = event.streams[0] || new MediaStream([event.track]);
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(console.error);
            setConnected(true);
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const fullOfferSdp = pc.localDescription?.sdp || offer.sdp;
        const res = await fetch(`${API_URL}/sessions/${SESSION_ID}/webrtc/offer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sdp: fullOfferSdp }),
        });

        const data = await res.json();
        if (data.sdp) {
          await pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: data.sdp }));
        }
      } catch (err) {
        console.error("WebRTC Setup Error:", err);
      }
    }

    initWebRTC();
    checkCapturedAuth();
    const interval = setInterval(fetchTabs, 2000);

    return () => {
      peerConnectionRef.current?.close();
      clearInterval(interval);
    };
  }, []);

  async function fetchTabs() {
    try {
      const res = await fetch(`${API_URL}/sessions/${SESSION_ID}/tabs`);
      const data = await res.json();
      if (data.tabs) {
        setTabs(data.tabs);
        const activeTab = data.tabs.find((t: TabInfo) => t.active);
        if (activeTab && !editingUrlRef.current) setCurrentUrl(activeTab.url);
      }
    } catch {}
  }

  async function checkCapturedAuth() {
    try {
      const res = await fetch(`${API_URL}/sessions/${SESSION_ID}/has-captured-auth`);
      const data = await res.json();
      setHasCapturedAuth(!!data.captured);
    } catch {}
  }

  async function switchTab(index: number) {
    await fetch(`${API_URL}/sessions/${SESSION_ID}/tabs/switch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ index }),
    }).catch(() => {});
    fetchTabs();
  }

  async function closeTab(index: number) {
    await fetch(`${API_URL}/sessions/${SESSION_ID}/tabs/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ index }),
    }).catch(() => {});
    fetchTabs();
  }

  async function navigateHistory(action: HistoryAction) {
    setLoading(true);
    try {
      await fetch(`${API_URL}/sessions/${SESSION_ID}/history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      }).catch(() => {});
      fetchTabs();
    } finally {
      setLoading(false);
    }
  }

  function sendInput(event: Record<string, unknown>) {
    if (dataChannelRef.current?.readyState === "open") {
      dataChannelRef.current.send(JSON.stringify(event));
    } else {
      fetch(`${API_URL}/sessions/${SESSION_ID}/input`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
      }).catch(console.error);
    }
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (controller !== "USER") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // Let the local address bar and form fields keep their keystrokes.
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      e.preventDefault();
      sendInput({ type: "keypress", key: e.key, code: e.code, text: e.key.length === 1 ? e.key : undefined });
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [controller]);

  function toVideoCoords(e: { clientX: number; clientY: number; currentTarget: HTMLVideoElement }) {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.round(((e.clientX - rect.left) / rect.width) * VIEWPORT.width),
      y: Math.round(((e.clientY - rect.top) / rect.height) * VIEWPORT.height),
    };
  }

  function handleVideoClick(e: React.MouseEvent<HTMLVideoElement>) {
    if (controller !== "USER") return;
    const { x, y } = toVideoCoords(e);
    sendInput({ type: "click", x, y, button: e.button === 2 ? "right" : "left" });
  }

  function handleMouseMove(e: React.MouseEvent<HTMLVideoElement>) {
    if (controller !== "USER") return;
    const now = Date.now();
    if (now - lastMouseMoveRef.current < 33) return;
    lastMouseMoveRef.current = now;
    const { x, y } = toVideoCoords(e);
    sendInput({ type: "mousemove", x, y });
  }

  function handleWheel(e: React.WheelEvent<HTMLVideoElement>) {
    if (controller !== "USER") return;
    const { x, y } = toVideoCoords(e);
    sendInput({ type: "wheel", x, y, deltaX: e.deltaX, deltaY: e.deltaY });
  }

  async function handleNavigate() {
    setLoading(true);
    (document.activeElement as HTMLElement | null)?.blur();
    try {
      await fetch(`${API_URL}/sessions/${SESSION_ID}/navigate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: currentUrl }),
      });
      fetchTabs();
    } finally {
      setLoading(false);
    }
  }

  async function takeControl() {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/sessions/${SESSION_ID}/take-control`, { method: "POST" });
      setController((await res.json()).controller);
    } finally {
      setLoading(false);
    }
  }

  async function releaseControl() {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/sessions/${SESSION_ID}/release-control`, { method: "POST" });
      setController((await res.json()).controller);
    } finally {
      setLoading(false);
    }
  }

  // --- The actual point of the project ---

  async function captureAuth() {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/sessions/${SESSION_ID}/capture-auth`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setHasCapturedAuth(true);
        setCapturedAt(data.capturedAt);
      }
    } finally {
      setLoading(false);
    }
  }

  async function testReplay() {
    setLoading(true);
    setReplayResult(null);
    try {
      const res = await fetch(`${API_URL}/sessions/${SESSION_ID}/replay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUrl: replayUrl }),
      });
      const data = await res.json();
      if (data.success) setReplayResult({ authenticated: data.authenticated, finalUrl: data.finalUrl });
    } finally {
      setLoading(false);
    }
  }

  const userControlling = controller === "USER";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-line-subtle bg-canvas/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="grid size-7 place-items-center rounded-lg bg-ink text-canvas">
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2.2}>
                <rect x="3" y="4" width="18" height="16" rx="3" />
                <path d="M3 9h18" />
                <circle cx="6.5" cy="6.5" r=".5" fill="currentColor" />
              </svg>
            </span>
            <span className="whitespace-nowrap text-sm font-semibold tracking-tight text-ink">Session Engine</span>
            <span className="hidden text-faint sm:inline">/</span>
            <span className="hidden rounded-md bg-surface px-2 py-0.5 font-mono text-xs text-muted shadow-card sm:inline">
              {SESSION_ID}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="hidden items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-muted shadow-card sm:inline-flex">
              <span className={`size-1.5 rounded-full ${connected ? "bg-success" : "bg-faint"}`} />
              {connected ? "Connected" : "Connecting"}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 font-medium ${
                userControlling ? "bg-warning-soft text-warning" : "bg-accent-soft text-accent"
              }`}
            >
              {userControlling ? "You are in control" : "Agent in control"}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-8 sm:px-6 lg:py-10">
        <div className="mb-6">
          <p className="text-xs font-medium uppercase tracking-wider text-faint">Live preview</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink text-balance">
            Remote browser session
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted">
            A real Chromium instance streamed over WebRTC. Sign in, capture the session, then prove it replays
            without credentials.
          </p>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <BrowserWindow
            tabs={tabs}
            url={currentUrl}
            loading={loading}
            interactive={userControlling}
            connected={connected}
            viewport={VIEWPORT}
            onUrlChange={setCurrentUrl}
            onUrlFocusChange={(focused) => (editingUrlRef.current = focused)}
            onNavigate={handleNavigate}
            onHistory={navigateHistory}
            onSwitchTab={switchTab}
            onCloseTab={closeTab}
          >
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              onClick={handleVideoClick}
              onMouseMove={handleMouseMove}
              onWheel={handleWheel}
              className={`absolute inset-0 block size-full object-contain ${
                userControlling ? "cursor-default" : "cursor-not-allowed"
              }`}
            />
          </BrowserWindow>

          <div className="lg:sticky lg:top-20">
            <SessionPanel
              controller={controller}
              busy={loading}
              hasCapturedAuth={hasCapturedAuth}
              capturedAt={capturedAt}
              replayUrl={replayUrl}
              replayResult={replayResult}
              onTakeControl={takeControl}
              onReleaseControl={releaseControl}
              onCapture={captureAuth}
              onReplayUrlChange={setReplayUrl}
              onReplay={testReplay}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
