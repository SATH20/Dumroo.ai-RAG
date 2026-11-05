import puppeteer from "../web/node_modules/puppeteer-core";
import path from "path";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACT_DIR = "C:\\Users\\rvlgs\\.gemini\\antigravity\\brain\\03be522a-414a-41e6-b811-706577595ef7";
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  await page.goto("http://localhost:3000/login", { waitUntil: "networkidle2" });
  await page.type('input[type="email"]', "teacher@dumroo-demo.test");
  await page.type('input[type="password"]', "Demo@12345");
  await page.click('button[type="submit"]');
  await page.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {});
  await delay(2500);

  // Switch to Ask tab
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const askBtn = btns.find((b) => b.textContent?.includes("Ask"));
    if (askBtn) askBtn.click();
  });
  await delay(2000);

  // Click "New discussion"
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const newD = btns.find((b) => b.textContent?.includes("New discussion"));
    if (newD) newD.click();
  });
  await delay(2000);

  // Ensure web search toggle is checked
  const toggleState = await page.evaluate(() => {
    const toggle = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
    if (toggle && !toggle.checked) {
      toggle.click();
    }
    return toggle ? toggle.checked : null;
  });
  console.log("Web search toggle checked:", toggleState);

  // Type question and click send button explicitly
  const question = "What is the current price of Bitcoin in 2025?";
  console.log("Typing question:", question);
  await page.waitForSelector('input[placeholder*="Ask a question"]');
  await page.type('input[placeholder*="Ask a question"]', question);
  await delay(500);

  await page.click('button[aria-label="Send query"]');
  console.log("Clicked Send button. Waiting for streaming to complete...");

  // Wait for response
  for (let i = 0; i < 40; i++) {
    await delay(1000);
    const state = await page.evaluate(() => {
      const isStreaming = !!document.querySelector(".animate-spin");
      const text = document.querySelector(".prose")?.textContent || "";
      const refusal = document.querySelector(".bg-amber-50")?.textContent || "";
      return { isStreaming, textLen: text.length, refusalLen: refusal.length, textSnippet: text.slice(0, 100), refusalSnippet: refusal.slice(0, 100) };
    });
    if (!state.isStreaming && i > 3 && (state.textLen > 0 || state.refusalLen > 0)) {
      console.log(`Finished at ${i}s:`, state);
      break;
    }
  }

  await delay(1500);

  const finalCheck = await page.evaluate(() => {
    const text = document.querySelector(".prose")?.textContent || "";
    const refusal = document.querySelector(".bg-amber-50")?.textContent || "";
    const orangeCard = !!document.querySelector(".border-l-\\[\\#F5A623\\]");
    return {
      textSnippet: text.slice(0, 200),
      refusalSnippet: refusal.slice(0, 200),
      orangeCard,
    };
  });
  console.log("Final Result for Bitcoin query:", finalCheck);

  const screenshotPath = path.join(ARTIFACT_DIR, "websearch-finance-bitcoin.png");
  await page.screenshot({ path: screenshotPath });
  console.log("Saved screenshot:", screenshotPath);

  await browser.close();
}

run().catch(console.error);
