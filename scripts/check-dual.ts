import puppeteer from "../web/node_modules/puppeteer-core";
import path from "path";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ARTIFACT_DIR = "C:\\Users\\rvlgs\\.gemini\\antigravity\\brain\\03be522a-414a-41e6-b811-706577595ef7";

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
  await new Promise((r) => setTimeout(r, 2500));

  // Switch to Ask tab
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const askBtn = btns.find((b) => b.textContent?.includes("Ask"));
    if (askBtn) askBtn.click();
  });
  await new Promise((r) => setTimeout(r, 1500));

  // Find sidebar items
  const sidebarItems = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll(".w-64 .group"));
    return items.map((i) => i.textContent?.trim() || "");
  });
  console.log("Sidebar items found:", sidebarItems);

  // Click each sidebar item and check if it has content
  const itemChecks = await page.evaluate(async () => {
    const items = Array.from(document.querySelectorAll(".w-64 .group"));
    const results = [];
    for (let idx = 0; idx < items.length; idx++) {
      (items[idx] as HTMLElement).click();
      await new Promise((r) => setTimeout(r, 1500));
      const prose = document.querySelectorAll(".prose");
      const text = Array.from(prose).map((p) => p.textContent?.slice(0, 100));
      results.push({ idx, count: prose.length, text });
      if (text.some((t) => t?.toLowerCase().includes("second law") || t?.toLowerCase().includes("momentum"))) {
        break;
      }
    }
    return results;
  });
  console.log("Item checks:", JSON.stringify(itemChecks, null, 2));

  await new Promise((r) => setTimeout(r, 1000));

  const stats = await page.evaluate(() => {
    const divs = Array.from(document.querySelectorAll("div"));
    const blueCard = divs.some((d) => d.className.includes("border-l-[#1E4FF7]"));
    const orangeCard = divs.some((d) => d.className.includes("border-l-[#F5A623]"));
    const ncertHeader = !!document.body.innerText.includes("NCERT CURRICULUM EXPLANATION");
    const webHeader = !!document.body.innerText.includes("SUPPLEMENTARY CONTEXT FROM THE WEB");
    return { blueCard, orangeCard, ncertHeader, webHeader };
  });

  console.log("Dual card evaluation stats:", stats);

  const screenshotPath = path.join(ARTIFACT_DIR, "teacher-dual-sections-styled.png");
  await page.screenshot({ path: screenshotPath });
  console.log("Saved screenshot to:", screenshotPath);

  await browser.close();
}

run().catch(console.error);
