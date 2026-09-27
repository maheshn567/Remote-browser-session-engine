import type { Browser, BrowserContext, Page } from "playwright";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { CDPController } from "./cdpController.ts";
import { config } from "../config.ts";

export type Controller = "AGENT" | "USER";
export type BrowserState = "STARTING" | "RUNNING" | "USER_CONTROL" | "CLOSED";

/**
 * One isolated browsing session. Each session gets its own Playwright
 * BrowserContext — separate cookies, storage, and cache — sharing a single
 * launched Browser process rather than paying for a whole new Chromium per
 * session. This is what actually makes "multiple concurrent sessions"
 * possible instead of the single global demo session the first version had.
 */
export class BrowserSession {
  controller: Controller = "AGENT";
  state: BrowserState = "STARTING";

  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private cdp: CDPController | null = null;

  constructor(
    public readonly id: string,
    private readonly browser: Browser,
  ) {}

  async start(initialUrl = "about:blank") {
    this.context = await this.browser.newContext({
      viewport: config.viewport,
      userAgent: config.userAgent,
    });
    // Patch the automation fingerprints login providers check for
    // (navigator.webdriver, missing chrome.runtime, empty plugins/languages)
    // before any page script runs. Keeps Google/etc. from serving a
    // broken bot-check page instead of the real login flow.
    await this.context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      // @ts-ignore
      window.chrome = window.chrome || { runtime: {} };
      Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
      Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
    });
    this.page = await this.context.newPage();
    await this.page.goto(initialUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });

    // Chrome sometimes keeps a thin UI strip above the page content even in
    // --kiosk mode (e.g. the "controlled by automated test software" banner
    // on real Chrome). FFmpeg captures the whole window including that
    // strip, so the video frame isn't pure page content — click coordinates
    // computed from the video need this offset subtracted before they're
    // dispatched via CDP, which only knows about the actual page viewport.
    // Cast via globalThis — this callback runs in the browser (where
    // globalThis === window), but this tsconfig has no DOM lib so the
    // `window` identifier itself doesn't resolve at the type level.
    const metrics = await this.page.evaluate(() => {
      const win = globalThis as any;
      return {
        innerWidth: win.innerWidth,
        innerHeight: win.innerHeight,
        outerWidth: win.outerWidth,
        outerHeight: win.outerHeight,
      };
    });
    const chromeOffsetY = Math.max(0, metrics.outerHeight - metrics.innerHeight);
    const chromeOffsetX = Math.max(0, Math.round((metrics.outerWidth - metrics.innerWidth) / 2));
    if (chromeOffsetY > 0 || chromeOffsetX > 0) {
      console.log(`[BrowserSession ${this.id}] Detected leftover Chrome UI offset: x=${chromeOffsetX}px, y=${chromeOffsetY}px. Compensating input coordinates.`);
    }

    this.cdp = new CDPController(this.page, { offsetX: chromeOffsetX, offsetY: chromeOffsetY });
    await this.cdp.init();

    this.state = "RUNNING";
    this.controller = "AGENT";
  }

  getPage(): Page {
    if (!this.page) throw new Error(`Session ${this.id} not started`);
    return this.page;
  }

  getContext(): BrowserContext {
    if (!this.context) throw new Error(`Session ${this.id} not started`);
    return this.context;
  }

  getCdp(): CDPController {
    if (!this.cdp) throw new Error(`Session ${this.id} not started`);
    return this.cdp;
  }

  takeControl() {
    this.controller = "USER";
    this.state = "USER_CONTROL";
  }

  releaseControl() {
    this.controller = "AGENT";
    this.state = "RUNNING";
  }

  /**
   * The actual point of the project: after a human completes a login inside
   * this live session, snapshot the resulting cookies + localStorage. No
   * password is ever seen, stored, or requested — this captures only what
   * the site itself issued after the user authenticated directly with it.
   */
  async captureAuth(): Promise<{ path: string; capturedAt: string }> {
    const context = this.getContext();
    const storageState = await context.storageState();

    await mkdir(config.sessionStoreDir, { recursive: true });
    const path = join(config.sessionStoreDir, `${this.id}.json`);
    const capturedAt = new Date().toISOString();

    await writeFile(
      path,
      JSON.stringify({ capturedAt, sourceUrl: this.page?.url(), storageState }, null, 2),
      "utf-8",
    );

    return { path, capturedAt };
  }

  static async hasCapturedAuth(sessionId: string): Promise<boolean> {
    try {
      await readFile(join(config.sessionStoreDir, `${sessionId}.json`), "utf-8");
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Proves the capture actually works: spins up a fresh, separate context
   * pre-loaded with the saved storageState and navigates to a target URL —
   * no credentials involved. Returns whether the resulting page looks
   * authenticated (a crude heuristic here; replace with a real per-site
   * check when this becomes more than a demo).
   */
  static async replay(
    browser: Browser,
    sessionId: string,
    targetUrl: string,
  ): Promise<{ authenticated: boolean; finalUrl: string }> {
    const raw = await readFile(join(config.sessionStoreDir, `${sessionId}.json`), "utf-8");
    const { storageState } = JSON.parse(raw);

    const context = await browser.newContext({ storageState, viewport: config.viewport });
    const page = await context.newPage();
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });

    const finalUrl = page.url();
    // Crude but honest: most login walls redirect you back to a
    // signin/accounts URL if the session didn't stick. Good enough for a
    // demo; a real implementation would check for a site-specific
    // logged-in marker instead.
    const authenticated = !/signin|accounts\.google|login/i.test(finalUrl);

    await context.close();
    return { authenticated, finalUrl };
  }

  async close() {
    await this.context?.close();
    this.state = "CLOSED";
  }
}
