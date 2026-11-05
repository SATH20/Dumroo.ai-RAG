import puppeteer from "../web/node_modules/puppeteer-core";
import path from "path";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACT_DIR = "C:\\Users\\rvlgs\\.gemini\\antigravity\\brain\\03be522a-414a-41e6-b811-706577595ef7";
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function verifyEmptyHistory() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    // 1. Verify Teacher Ask tab empty history
    console.log("Navigating to /login...");
    await page.goto("http://localhost:3000/login", { waitUntil: "networkidle2" });
    await page.type('input[type="email"]', "teacher@dumroo-demo.test");
    await page.type('input[type="password"]', "Demo@12345");
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {});
    await delay(2000);

    // Switch to Ask tab
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const askBtn = btns.find((b) => b.textContent?.includes("Ask Dumroo"));
      if (askBtn) askBtn.click();
    });
    await delay(1500);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "demo-teacher-empty-history.png"),
      fullPage: false,
    });
    console.log("Saved demo-teacher-empty-history.png");

    // 2. Clear cookies / localStorage to logout cleanly and verify Student 1
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    const client = await page.target().createCDPSession();
    await client.send("Network.clearBrowserCookies");

    await page.goto("http://localhost:3000/login", { waitUntil: "networkidle2" });
    await page.type('input[type="email"]', "student1@dumroo-demo.test");
    await page.type('input[type="password"]', "Demo@12345");
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {});
    await delay(2000);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "demo-student-empty-history.png"),
      fullPage: false,
    });
    console.log("Saved demo-student-empty-history.png");

  } finally {
    await browser.close();
  }
}

verifyEmptyHistory().catch(console.error);
