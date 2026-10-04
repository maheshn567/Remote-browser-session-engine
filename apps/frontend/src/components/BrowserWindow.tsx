"use client";

import { useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Close, Eye, Globe, Lock, Reload } from "./icons";

export interface TabInfo {
  index: number;
  title: string;
  url: string;
  active: boolean;
}

export type HistoryAction = "back" | "forward" | "reload";

interface BrowserWindowProps {
  tabs: TabInfo[];
  url: string;
  loading: boolean;
  interactive: boolean;
  connected: boolean;
  viewport: { width: number; height: number };
  onUrlChange: (url: string) => void;
  onUrlFocusChange: (focused: boolean) => void;
  onNavigate: () => void;
  onHistory: (action: HistoryAction) => void;
  onSwitchTab: (index: number) => void;
  onCloseTab: (index: number) => void;
  children: ReactNode;
}

function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

function TabFavicon({ url }: { url: string }) {
  const host = hostOf(url).replace(/^www\./, "");
  if (!host) return <Globe className="size-3.5 shrink-0 text-faint" />;
  return (
    <span className="grid size-4 shrink-0 place-items-center rounded-[4px] bg-accent-soft text-[9px] font-semibold uppercase text-accent">
      {host[0]}
    </span>
  );
}

function TrafficLights() {
  return (
    <div className="flex items-center gap-2 px-4" aria-hidden="true">
      <span className="size-3 rounded-full bg-[var(--light-close)] ring-1 ring-black/10" />
      <span className="size-3 rounded-full bg-[var(--light-min)] ring-1 ring-black/10" />
      <span className="size-3 rounded-full bg-[var(--light-max)] ring-1 ring-black/10" />
    </div>
  );
}

function Omnibox({
  url,
  loading,
  onUrlChange,
  onFocusChange,
  onNavigate,
}: {
  url: string;
  loading: boolean;
  onUrlChange: (url: string) => void;
  onFocusChange: (focused: boolean) => void;
  onNavigate: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const secure = url.startsWith("https://");
  const host = hostOf(url);
  const rest = host ? url.slice(url.indexOf(host) + host.length) : "";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onNavigate();
      }}
      className="relative flex h-8 flex-1 items-center gap-2 rounded-full bg-sunken px-3 ring-1 ring-line-subtle transition focus-within:bg-surface focus-within:ring-2 focus-within:ring-accent"
    >
      <span className={secure ? "text-muted" : "text-faint"} title={secure ? "Secure connection" : "Not secure"}>
        {secure ? <Lock className="size-3.5" /> : <Globe className="size-3.5" />}
      </span>
      <div className="relative min-w-0 flex-1">
        <input
          type="text"
          value={url}
          spellCheck={false}
          aria-label="Address"
          onChange={(e) => onUrlChange(e.target.value)}
          onFocus={(e) => {
            setFocused(true);
            onFocusChange(true);
            e.currentTarget.select();
          }}
          onBlur={() => {
            setFocused(false);
            onFocusChange(false);
          }}
          placeholder="Search or enter address"
          className={`w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-faint ${
            !focused && host ? "text-transparent" : ""
          }`}
        />
        {!focused && host && (
          <div className="pointer-events-none absolute inset-0 flex items-center truncate text-[13px]">
            <span className="text-ink">{host}</span>
            <span className="truncate text-faint">{rest}</span>
          </div>
        )}
      </div>
      {loading && (
        <span className="load-bar absolute inset-x-4 -bottom-px h-px overflow-hidden rounded-full" />
      )}
    </form>
  );
}

export function BrowserWindow({
  tabs,
  url,
  loading,
  interactive,
  connected,
  viewport,
  onUrlChange,
  onUrlFocusChange,
  onNavigate,
  onHistory,
  onSwitchTab,
  onCloseTab,
  children,
}: BrowserWindowProps) {
  const visibleTabs = tabs.length > 0 ? tabs : [{ index: 0, title: "New Tab", url, active: true }];

  return (
    <div className="overflow-hidden rounded-xl bg-surface shadow-window">
      {/* Title bar + tab strip */}
      <div className="flex h-11 items-end bg-chrome pr-2">
        <div className="flex h-full items-center self-stretch">
          <TrafficLights />
        </div>
        <div role="tablist" className="flex min-w-0 flex-1 items-end gap-px overflow-x-auto [scrollbar-width:none]">
          {visibleTabs.map((tab) => (
            <div
              key={tab.index}
              role="tab"
              aria-selected={tab.active}
              tabIndex={0}
              title={tab.url}
              onClick={() => onSwitchTab(tab.index)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSwitchTab(tab.index)}
              className={`group relative flex h-9 w-56 min-w-28 shrink cursor-default items-center gap-2 rounded-t-lg pl-3 pr-1.5 text-xs transition-colors ${
                tab.active
                  ? "bg-chrome-tab text-ink"
                  : "text-muted hover:bg-chrome-hover hover:text-ink"
              }`}
            >
              <TabFavicon url={tab.url} />
              <span className="flex-1 truncate">{tab.title || `Tab ${tab.index + 1}`}</span>
              {tabs.length > 1 && (
                <button
                  type="button"
                  aria-label={`Close ${tab.title}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(tab.index);
                  }}
                  className={`grid size-5 place-items-center rounded-full text-muted hover:bg-chrome-hover hover:text-ink ${
                    tab.active ? "" : "opacity-0 group-hover:opacity-100"
                  }`}
                >
                  <Close className="size-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-1 border-b border-line-subtle bg-chrome-tab px-2 py-1.5">
        <button type="button" className="chrome-icon-btn" aria-label="Back" onClick={() => onHistory("back")}>
          <ArrowLeft />
        </button>
        <button type="button" className="chrome-icon-btn" aria-label="Forward" onClick={() => onHistory("forward")}>
          <ArrowRight />
        </button>
        <button
          type="button"
          className="chrome-icon-btn mr-1"
          aria-label="Reload"
          onClick={() => onHistory("reload")}
        >
          <Reload className={loading ? "animate-spin" : ""} />
        </button>
        <Omnibox
          url={url}
          loading={loading}
          onUrlChange={onUrlChange}
          onFocusChange={onUrlFocusChange}
          onNavigate={onNavigate}
        />
        <span
          className={`ml-1 hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium sm:inline-flex ${
            interactive ? "bg-warning-soft text-warning" : "bg-sunken text-muted"
          }`}
        >
          <Eye className="size-3.5" />
          {interactive ? "Interactive" : "View only"}
        </span>
      </div>

      {/* Viewport */}
      <div
        className="relative bg-black"
        style={{ aspectRatio: `${viewport.width} / ${viewport.height}` }}
      >
        {children}
        {!connected && (
          <div className="absolute inset-0 grid place-items-center bg-sunken">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="size-8 animate-spin rounded-full border-2 border-line border-t-accent" />
              <div>
                <p className="text-sm font-medium text-ink">Connecting to remote browser</p>
                <p className="text-xs text-muted">Negotiating WebRTC stream…</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between gap-4 border-t border-line-subtle bg-chrome-tab px-3 py-1.5 font-mono text-[11px] text-faint">
        <span className="flex items-center gap-1.5">
          <span
            className={`size-1.5 rounded-full ${connected ? "live-dot bg-success text-success" : "bg-faint"}`}
          />
          {connected ? "Live · WebRTC" : "Offline"}
        </span>
        <span className="truncate">
          {viewport.width}×{viewport.height}
        </span>
      </div>
    </div>
  );
}
