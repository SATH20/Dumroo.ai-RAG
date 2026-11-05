import puppeteer from "../web/node_modules/puppeteer-core";
import path from "path";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE_URL = "http://localhost:3000";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle2" });
    await page.type('input[type="email"]', "teacher@dumroo-demo.test");
    await page.type('input[type="password"]', "Demo@12345");
    await page.click('button[type="submit"]');

    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {});
    await delay(2500);

    // Switch to Ask tab
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const askBtn = buttons.find((b) => b.textContent?.includes("Ask"));
      if (askBtn) askBtn.click();
    });
    await delay(2000);

    // Start a new discussion
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const newDiscBtn = buttons.find((b) => b.textContent?.includes("New discussion"));
      if (newDiscBtn) newDiscBtn.click();
    });
    await delay(1500);

    // Make sure web search checkbox is checked
    await page.evaluate(() => {
      const cb = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
      if (cb && !cb.checked && !cb.disabled) cb.click();
    });
    await delay(500);

    console.log("Asking live query with web search ON in teacher Ask tab...");
    const input = await page.$('input[placeholder*="Ask a question"]');
    if (input) {
      await input.type("Explain Newton's second law and linear momentum");
      await page.keyboard.press("Enter");
      console.log("Sent query. Waiting for response...");

      for (let i = 0; i < 40; i++) {
        await delay(1000);
        const done = await page.evaluate(() => {
          const prose = document.querySelectorAll(".prose");
          const webSources = document.querySelectorAll('a[target="_blank"]');
          return prose.length > 0 && webSources.length > 0;
        });
        if (done) {
          console.log("Done streaming with web sources at second", i);
          break;
        }
      }
      await delay(2000);

      await page.screenshot({
        path: path.resolve("screenshots/pass3-teacher-ask-1440.png"),
        fullPage: false,
      });
      console.log("Saved refined pass3-teacher-ask-1440.png!");
    }
  } catch (err) {
    console.error(err);
  } finally {
    await browser.close();
  }
}

main();
