import { chromium, type Browser } from "playwright";
import { BrowserSession } from "./BrowserSession.ts";
import { config } from "../config.ts";

/**
 * Owns the one launched Chromium process and hands out isolated sessions
 * (BrowserContexts) from it. Replaces the old main.ts pattern of a single
 * global browser/context/page — that pattern only ever supported one
 * session at a time, which is fine for a demo and wrong for anything real.
 */
export class SessionManager {
  private browser: Browser | null = null;
  private sessions = new Map<string, BrowserSession>();

  async launch() {
    // Force X11 software rendering on the configured virtual display.
    delete process.env.WAYLAND_DISPLAY;
    process.env.XDG_SESSION_TYPE = "x11";
    process.env.DISPLAY = config.display;

    console.log(`🚀 Launching Chromium on DISPLAY=${config.display}...`);
    this.browser = await chromium.launch({
      headless: false,
      channel: config.chromiumChannel, // real installed Chrome, if configured — see config.ts
      args: config.chromiumArgs,
    });
  }

  private requireBrowser(): Browser {
    if (!this.browser) throw new Error("SessionManager.launch() must be called first");
    return this.browser;
  }

  async createSession(id: string, initialUrl?: string): Promise<BrowserSession> {
    const existing = this.sessions.get(id);
    if (existing) return existing;

    const session = new BrowserSession(id, this.requireBrowser());
    await session.start(initialUrl);
    this.sessions.set(id, session);
    return session;
  }

  get(id: string): BrowserSession | undefined {
    return this.sessions.get(id);
  }

  async closeSession(id: string) {
    const session = this.sessions.get(id);
    if (!session) return;
    await session.close();
    this.sessions.delete(id);
  }

  /** For the replay flow, which needs a fresh throwaway context, not an existing session. */
  getBrowser(): Browser {
    return this.requireBrowser();
  }

  async shutdown() {
    for (const session of this.sessions.values()) {
      await session.close();
    }
    await this.browser?.close();
  }
}
