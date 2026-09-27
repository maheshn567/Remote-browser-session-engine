// Original experiment: prove Chromium launches headed on a virtual X11
// display. First rung of the guide's own learning ladder — kept here
// rather than deleted, since it's the proof this architecture's foundation
// actually works, not dead weight.
import { chromium } from "playwright";

delete process.env.WAYLAND_DISPLAY;
process.env.XDG_SESSION_TYPE = "x11";
process.env.DISPLAY = ":99";

async function main() {
  console.log("Launching Chromium on DISPLAY=:99...");
  const browser = await chromium.launch({
    headless: false,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
  });
  const page = await (await browser.newContext()).newPage();
  await page.goto("https://example.com");
  console.log("Active URL:", page.url());
  await new Promise(() => {});
}

main().catch(console.error);
