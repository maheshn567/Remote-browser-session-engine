import type { ReactNode } from "react";
import { Alert, Bot, Camera, Check, Cursor, Play } from "./icons";

export type Controller = "AGENT" | "USER";

export interface ReplayResult {
  authenticated: boolean;
  finalUrl: string;
}

interface SessionPanelProps {
  controller: Controller;
  busy: boolean;
  hasCapturedAuth: boolean;
  capturedAt: string | null;
  replayUrl: string;
  replayResult: ReplayResult | null;
  onTakeControl: () => void;
  onReleaseControl: () => void;
  onCapture: () => void;
  onReplayUrlChange: (url: string) => void;
  onReplay: () => void;
}

function Step({
  n,
  title,
  description,
  done,
  disabled,
  children,
}: {
  n: number;
  title: string;
  description: string;
  done?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <li className={`relative flex gap-3 ${disabled ? "opacity-55" : ""}`}>
      <span
        className={`z-10 grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${
          done ? "bg-success text-white" : "bg-surface text-muted ring-1 ring-line"
        }`}
      >
        {done ? <Check className="size-3.5" strokeWidth={3} /> : n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2.5 pb-6">
        <div>
          <h3 className="text-sm font-medium text-ink">{title}</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">{description}</p>
        </div>
        {children}
      </div>
    </li>
  );
}

export function SessionPanel({
  controller,
  busy,
  hasCapturedAuth,
  capturedAt,
  replayUrl,
  replayResult,
  onTakeControl,
  onReleaseControl,
  onCapture,
  onReplayUrlChange,
  onReplay,
}: SessionPanelProps) {
  const userControlling = controller === "USER";

  return (
    <aside className="flex flex-col gap-4">
      {/* Controller card */}
      <section className="rounded-xl bg-surface p-4 shadow-card">
        <p className="text-[11px] font-medium uppercase tracking-wider text-faint">Controller</p>
        <div className="mt-2 flex items-center gap-3">
          <span
            className={`grid size-9 place-items-center rounded-lg ${
              userControlling ? "bg-warning-soft text-warning" : "bg-accent-soft text-accent"
            }`}
          >
            {userControlling ? <Cursor /> : <Bot />}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink">{userControlling ? "You" : "Agent"}</p>
            <p className="text-xs text-muted">
              {userControlling ? "Mouse and keyboard go to the remote page" : "Your input is paused"}
            </p>
          </div>
        </div>
      </section>

      {/* Workflow */}
      <section className="rounded-xl bg-surface p-4 shadow-card">
        <p className="mb-4 text-[11px] font-medium uppercase tracking-wider text-faint">Capture &amp; replay</p>
        <ol className="relative before:absolute before:bottom-6 before:left-3 before:top-3 before:w-px before:bg-line-subtle">
          <Step
            n={1}
            title="Sign in yourself"
            description="Take control of the remote browser and log in as you normally would."
            done={hasCapturedAuth}
          >
            {userControlling ? (
              <button type="button" onClick={onReleaseControl} disabled={busy} className="btn-secondary self-start">
                <Bot className="size-4" /> Give control back
              </button>
            ) : (
              <button type="button" onClick={onTakeControl} disabled={busy} className="btn-primary self-start">
                <Cursor className="size-4" /> Take control
              </button>
            )}
          </Step>

          <Step
            n={2}
            title="Capture the session"
            description="Save cookies and storage from the signed-in browser."
            done={hasCapturedAuth}
          >
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={onCapture} disabled={busy} className="btn-secondary">
                <Camera className="size-4" /> {hasCapturedAuth ? "Recapture" : "Capture session"}
              </button>
              {hasCapturedAuth && (
                <span className="text-xs text-success">
                  Saved{capturedAt ? ` at ${new Date(capturedAt).toLocaleTimeString()}` : ""}
                </span>
              )}
            </div>
          </Step>

          <Step
            n={3}
            title="Test replay"
            description="Open a fresh browser with the captured session — no credentials entered."
            done={!!replayResult?.authenticated}
            disabled={!hasCapturedAuth}
          >
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                onReplay();
              }}
            >
              <input
                type="text"
                value={replayUrl}
                onChange={(e) => onReplayUrlChange(e.target.value)}
                disabled={!hasCapturedAuth}
                aria-label="Replay target URL"
                placeholder="https://…"
                className="field font-mono text-xs"
              />
              <button type="submit" disabled={busy || !hasCapturedAuth} className="btn-primary">
                <Play className="size-3.5" /> Run replay
              </button>
            </form>

            {replayResult && (
              <div
                role="status"
                className={`flex gap-2 rounded-lg p-3 text-xs leading-relaxed ${
                  replayResult.authenticated ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
                }`}
              >
                {replayResult.authenticated ? (
                  <Check className="mt-0.5 size-3.5 shrink-0" />
                ) : (
                  <Alert className="mt-0.5 size-3.5 shrink-0" />
                )}
                <p className="min-w-0">
                  {replayResult.authenticated ? "Authenticated. Landed on " : "Looked unauthenticated. Ended at "}
                  <span className="break-all font-mono">{replayResult.finalUrl}</span>
                </p>
              </div>
            )}
          </Step>
        </ol>
      </section>
    </aside>
  );
}
