import type { CDPSession, Page } from "playwright";

export interface CoordinateOffset {
  offsetX: number;
  offsetY: number;
}

export class CDPController {
  private activePage: Page;
  private cdpSession: CDPSession | null = null;
  private offset: CoordinateOffset;

  constructor(private initialPage: Page, offset: CoordinateOffset = { offsetX: 0, offsetY: 0 }) {
    this.activePage = initialPage;
    this.offset = offset;
    this.initSession();

    // Auto-focus new tabs when opened
    initialPage.context().on("page", async (newPage) => {
      console.log("🌐 New tab detected! Auto-focusing new tab...");
      await this.setActivePage(newPage);
    });
  }

  public getActivePage(): Page {
    return this.activePage;
  }

  public async setActivePage(page: Page) {
    this.activePage = page;
    await page.bringToFront().catch(() => {});
    this.cdpSession = await page.context().newCDPSession(page).catch(() => null);
  }

  private async initSession() {
    this.cdpSession = await this.activePage.context().newCDPSession(this.activePage).catch(() => null);
  }

  async init() {
    console.log("⚡ CDP Controller ready with native input and multi-tab management!");
  }

  /**
   * Translates a coordinate captured from the video frame into real page
   * viewport coordinates, correcting for any leftover Chrome UI (e.g. the
   * automation banner) that the video shows but the page viewport doesn't
   * count as part of itself. See BrowserSession.start() for how this is
   * measured.
   */
  private toPageCoords(x: number, y: number) {
    return { x: x - this.offset.offsetX, y: y - this.offset.offsetY };
  }

  /**
   * Natively dispatches a mouse click to focus elements and place the text cursor
   */
  async dispatchClick(rawX: number, rawY: number, button: "left" | "right" | "middle" = "left") {
    try {
      const { x, y } = this.toPageCoords(rawX, rawY);
      await this.activePage.bringToFront().catch(() => {});
      // Natively click via Playwright mouse engine for 100% text box cursor focus
      await this.activePage.mouse.click(x, y, { button });
      console.log(`🎯 Natively Clicked & Focused at (${x}, ${y})`);
    } catch (err) {
      console.error("Error dispatching click:", err);
    }
  }

  /**
   * Dispatches mouse movement
   */
  async dispatchMouseMove(rawX: number, rawY: number) {
    try {
      const { x, y } = this.toPageCoords(rawX, rawY);
      await this.activePage.mouse.move(x, y);
    } catch (err) {}
  }

  /**
   * Dispatches mouse wheel scrolling
   */
  async dispatchWheel(rawX: number, rawY: number, deltaX: number, deltaY: number) {
    try {
      await this.activePage.mouse.wheel(deltaX, deltaY);
    } catch (err) {}
  }

  /**
   * Dispatches keyboard typing (text, Enter, Backspace)
   */
  async dispatchKeyPress(key: string, text?: string, code?: string) {
    try {
      if (key === "Enter") {
        await this.activePage.keyboard.press("Enter");
        console.log("⌨️ Injected Enter Key Press");
        return;
      }

      if (key === "Backspace") {
        await this.activePage.keyboard.press("Backspace");
        return;
      }

      if (key === "Tab") {
        await this.activePage.keyboard.press("Tab");
        return;
      }

      if (text && text.length === 1) {
        await this.activePage.keyboard.type(text);
      } else {
        await this.activePage.keyboard.press(key);
      }
    } catch (err) {
      console.error("Error dispatching key press:", err);
    }
  }
}
