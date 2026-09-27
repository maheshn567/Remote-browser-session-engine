// Every value that was previously hardcoded across main.ts, browser.ts,
// test-cdp.ts, and videoCapture.ts lives here now. One source of truth.

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export const config = {
  port: envInt("PORT", 3001),
  frontendOrigin: process.env.FRONTEND_ORIGIN ?? "*",

  display: process.env.DISPLAY_NUM ?? ":99",
  viewport: {
    width: envInt("VIEWPORT_WIDTH", 1440),
    height: envInt("VIEWPORT_HEIGHT", 896),
  },

  rtpPort: envInt("RTP_PORT", 5004),

  // Use the machine's real installed Chrome instead of Playwright's bundled
  // Chromium when available — Google (and other login providers) are far
  // more likely to serve a broken "unsupported browser" / bot-check page to
  // the bundled Chromium than to a real Chrome binary. Falls back to
  // Playwright's Chromium automatically if unset or not installed.
  chromiumChannel: process.env.CHROMIUM_CHANNEL || undefined,

  // A realistic desktop UA string — the Playwright default UA advertises
  // "HeadlessChrome"/build metadata that automation-detection scripts key
  // off of directly.
  userAgent:
    process.env.CHROMIUM_USER_AGENT ??
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",

  // Where captured storageState JSON lives. Filesystem for this portfolio
  // stage — swap for an encrypted DB column keyed by tenant/session in a
  // real deployment. Never commit this directory: it holds live session
  // tokens. See .gitignore.
  sessionStoreDir: process.env.SESSION_STORE_DIR ?? "./sessions",

  chromiumArgs: [
    "--no-sandbox", // only safe because this always runs inside an isolated container — see README
    "--disable-setuid-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    `--window-size=${envInt("VIEWPORT_WIDTH", 1440)},${envInt("VIEWPORT_HEIGHT", 896)}`,
    "--window-position=0,0",
    // Kiosk removes Chrome's own tab strip/address bar/toolbar so the page's
    // content area fills the entire window. Without this, FFmpeg captures
    // that chrome as part of the video frame while Playwright's mouse.click
    // dispatches coordinates relative to the page content only — the two
    // don't agree, so clicks land progressively further off-target the
    // more of the window Chrome's own UI is eating into. Safe to hide here
    // because the frontend already renders its own URL bar / tab switcher.
    "--kiosk",
    // Removes the CDP automation fingerprints (navigator.webdriver, the
    // "Chrome is being controlled by automated test software" infobar,
    // etc.) that Google/Microsoft/etc. login flows check for and serve
    // broken bot-check interstitials in response to.
    "--disable-blink-features=AutomationControlled",
  ],
};
