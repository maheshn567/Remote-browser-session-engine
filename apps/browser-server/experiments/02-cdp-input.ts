// Original experiment: prove synthetic input (a CDP-session-backed click)
// actually drives navigation on the same Chromium instance noVNC/WebRTC
// would stream. Second rung of the learning ladder.
import { chromium } from "playwright";
import { CDPController } from "../src/browser/cdpController.ts";

process.env.DISPLAY = ":99";

async function testCDP() {
  const browser = await chromium.launch({ headless: false, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.goto("https://example.com");

  const cdp = new CDPController(page);
  await cdp.init();
  await page.waitForTimeout(2000);
  await cdp.dispatchClick(150, 300);
  await page.waitForTimeout(3000);
  console.log("URL after synthetic click:", page.url());

  await browser.close();
}

testCDP().catch(console.error);
