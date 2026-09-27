"use client";

import { useState, useEffect, useRef } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3001";
const SESSION_ID = "demo";

interface TabInfo {
  index: number;
  title: string;
  url: string;
  active: boolean;
}

export default function BrowserPage() {
  const [controller, setController] = useState<"AGENT" | "USER">("AGENT");
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [currentUrl, setCurrentUrl] = useState("https://accounts.google.com");
  const [tabs, setTabs] = useState<TabInfo[]>([]);

  const [hasCapturedAuth, setHasCapturedAuth] = useState(false);
  const [capturedAt, setCapturedAt] = useState<string | null>(null);
  const [replayResult, setReplayResult] = useState<
    { authenticated: boolean; finalUrl: string } | null
  >(null);
  const [replayUrl, setReplayUrl] = useState("https://mail.google.com");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const lastMouseMoveRef = useRef<number>(0);

  useEffect(() => {
    setMounted(true);

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
        if (activeTab) setCurrentUrl(activeTab.url);
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

  async function closeTab(index: number, e: React.MouseEvent) {
    e.stopPropagation();
    await fetch(`${API_URL}/sessions/${SESSION_ID}/tabs/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ index }),
    }).catch(() => {});
    fetchTabs();
  }

  function sendInput(event: any) {
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
      e.preventDefault();
      sendInput({ type: "keypress", key: e.key, code: e.code, text: e.key.length === 1 ? e.key : undefined });
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [controller]);

  function toVideoCoords(e: { clientX: number; clientY: number; currentTarget: HTMLVideoElement }) {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.round(((e.clientX - rect.left) / rect.width) * 1440),
      y: Math.round(((e.clientY - rect.top) / rect.height) * 896),
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
    const { x, y } = toVideoCoords(e as any);
    sendInput({ type: "wheel", x, y, deltaX: e.deltaX, deltaY: e.deltaY });
  }

  async function handleNavigate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
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

  if (!mounted) return null;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6 flex flex-col items-center">
      <div className="w-full max-w-6xl flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Remote Browser Preview</h1>
            <p className="text-sm text-slate-400">
              Session: <span className="font-mono text-slate-200">{SESSION_ID}</span>
            </p>
          </div>
          <span
            className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${
              controller === "USER"
                ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
            }`}
          >
            {controller === "AGENT" ? "🤖 Agent Controlling" : "👤 You Are Controlling"}
          </span>
        </div>

        {tabs.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-slate-800/80">
            {tabs.map((tab) => (
              <div
                key={tab.index}
                onClick={() => switchTab(tab.index)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-t-lg text-xs cursor-pointer border-t border-x transition max-w-[200px] truncate ${
                  tab.active
                    ? "bg-slate-900 border-slate-700 text-amber-400 font-semibold"
                    : "bg-slate-950 border-slate-850 text-slate-400 hover:text-slate-200 hover:bg-slate-900/50"
                }`}
              >
                <span className="truncate flex-1">{tab.title || "Tab " + (tab.index + 1)}</span>
                {tabs.length > 1 && (
                  <button onClick={(e) => closeTab(tab.index, e)} className="hover:text-red-400 p-0.5 rounded">
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleNavigate} className="flex gap-2">
          <input
            type="text"
            value={currentUrl}
            onChange={(e) => setCurrentUrl(e.target.value)}
            placeholder="Enter URL to navigate..."
            className="flex-1 px-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm focus:outline-none focus:border-amber-500/50 text-slate-200"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-semibold text-slate-200 transition"
          >
            Go
          </button>
        </form>

        <div className="relative w-full rounded-xl overflow-hidden border border-slate-800 bg-black shadow-2xl">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            onClick={handleVideoClick}
            onMouseMove={handleMouseMove}
            onWheel={handleWheel}
            className={`w-full h-auto rounded-xl block transition-all ${
              controller === "USER" ? "cursor-pointer" : "cursor-not-allowed"
            }`}
          />
          {!connected && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 text-slate-400">
              ⚡ Connecting WebRTC Stream...
            </div>
          )}
        </div>

        <div className="flex items-center justify-between bg-slate-900/80 border border-slate-800 p-4 rounded-xl">
          <div className="text-sm text-slate-400">
            {controller === "AGENT"
              ? "Click 'Take Control' to log in yourself, then capture the session below."
              : "Log in normally, then click 'Give Control Back' when done."}
          </div>
          {controller === "AGENT" ? (
            <button
              onClick={takeControl}
              disabled={loading}
              className="px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold transition shadow-md disabled:opacity-50"
            >
              Take Control
            </button>
          ) : (
            <button
              onClick={releaseControl}
              disabled={loading}
              className="px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold transition shadow-md disabled:opacity-50"
            >
              Give Control Back
            </button>
          )}
        </div>

        {/* The actual point: capture the session, then prove it replays with no credentials */}
        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
            Session capture &amp; replay
          </h2>
          <div className="flex items-center gap-3">
            <button
              onClick={captureAuth}
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-slate-950 font-semibold text-sm transition disabled:opacity-50"
            >
              Capture Session
            </button>
            {hasCapturedAuth && (
              <span className="text-xs text-emerald-400">
                ✓ Captured{capturedAt ? ` at ${new Date(capturedAt).toLocaleTimeString()}` : ""}
              </span>
            )}
          </div>

          {hasCapturedAuth && (
            <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
              <input
                type="text"
                value={replayUrl}
                onChange={(e) => setReplayUrl(e.target.value)}
                placeholder="URL to test replay against..."
                className="flex-1 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-slate-200"
              />
              <button
                onClick={testReplay}
                disabled={loading}
                className="px-4 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm font-semibold text-slate-100 transition disabled:opacity-50"
              >
                Test Replay
              </button>
            </div>
          )}

          {replayResult && (
            <div
              className={`text-xs px-3 py-2 rounded-lg ${
                replayResult.authenticated
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "bg-red-500/10 text-red-400 border border-red-500/20"
              }`}
            >
              {replayResult.authenticated
                ? `✓ Replay opened an authenticated session — landed on ${replayResult.finalUrl} with no credentials entered.`
                : `✗ Replay looked unauthenticated — ended up back at ${replayResult.finalUrl}.`}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
