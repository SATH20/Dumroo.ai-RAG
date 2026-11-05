import puppeteer from "../web/node_modules/puppeteer-core";
import path from "path";
import fs from "fs";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE_URL = "http://localhost:3000";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const screenshotsDir = path.resolve("screenshots");
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
  });

  try {
    const page = await browser.newPage();

    // ==========================================
    // PASS 2: STUDENT REFUSAL CARD
    // ==========================================
    console.log("Navigating to login for student refusal check...");
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle2" });

    await page.type('input[type="email"]', "student1@dumroo-demo.test");
    await page.type('input[type="password"]', "Demo@12345");
    await page.click('button[type="submit"]');

    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {});
    await delay(2000);

    // Start a new chat
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const newChat = buttons.find((b) => b.textContent?.includes("New chat"));
      if (newChat) newChat.click();
    });
    await delay(1500);

    console.log("Submitting off-syllabus question: How do I cook pasta?...");
    const textarea = await page.$("textarea");
    if (textarea) {
      await textarea.type("How do I cook pasta?");
      await page.keyboard.press("Enter");

      console.log("Waiting for refusal card...");
      for (let i = 0; i < 30; i++) {
        await delay(1000);
        const hasRefusal = await page.evaluate(() => {
          const body = document.body.innerText;
          return (
            body.includes("Not covered in your syllabus") ||
            body.includes("Not in your Class 11 textbooks") ||
            body.includes("This topic isn't covered in your NCERT textbooks")
          );
        });
        if (hasRefusal) {
          console.log("Found refusal card at second", i);
          break;
        }
      }
      await delay(2000);

      await page.screenshot({
        path: path.join(screenshotsDir, "pass2-student-refusal-1440.png"),
        fullPage: false,
      });
      console.log("Saved pass2-student-refusal-1440.png");
    }

    // ==========================================
    // PASS 3: TEACHER DASHBOARD & CHARTS
    // ==========================================
    console.log("Clearing cookies and navigating to teacher login...");
    const client = await page.target().createCDPSession();
    await client.send("Network.clearBrowserCookies");

    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle2" });

    await page.type('input[type="email"]', "teacher@dumroo-demo.test");
    await page.type('input[type="password"]', "Demo@12345");
    await page.click('button[type="submit"]');

    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {});
    await delay(3500);

    console.log("Capturing pass3-teacher-dashboard-1440.png with fixed AreaChart...");
    await page.screenshot({
      path: path.join(screenshotsDir, "pass3-teacher-dashboard-1440.png"),
      fullPage: false,
    });

    console.log("Capturing pass3-teacher-dashboard-390.png...");
    await page.setViewport({ width: 390, height: 844 });
    await delay(1500);
    await page.screenshot({
      path: path.join(screenshotsDir, "pass3-teacher-dashboard-390.png"),
      fullPage: false,
    });

    // Reset to 1440
    await page.setViewport({ width: 1440, height: 900 });
    await delay(500);

    // ==========================================
    // PASS 3: TEACHER ASK TAB
    // ==========================================
    console.log("Switching to teacher Ask tab...");
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const askBtn = buttons.find((b) => b.textContent?.includes("Ask"));
      if (askBtn) askBtn.click();
    });
    await delay(2500);

    // Select the "newtons second law" chat from history
    await page.evaluate(() => {
      const chatItems = Array.from(document.querySelectorAll("div.cursor-pointer"));
      const newtonChat = chatItems.find((el) => el.textContent?.toLowerCase().includes("newton"));
      if (newtonChat) (newtonChat as HTMLElement).click();
    });
    await delay(2500);

    console.log("Capturing pass3-teacher-ask-1440.png...");
    await page.screenshot({
      path: path.join(screenshotsDir, "pass3-teacher-ask-1440.png"),
      fullPage: false,
    });

    console.log("Refined screenshots captured successfully!");
  } catch (err) {
    console.error("Capture script failed:", err);
  } finally {
    await browser.close();
  }
}

main();
