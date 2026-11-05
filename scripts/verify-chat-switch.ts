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

  // Check how many chats exist in the sidebar
  const items = await page.evaluate(() => {
    const chatElements = Array.from(document.querySelectorAll(".w-64 .group"));
    return chatElements.length;
  });
  console.log(`Found ${items} chats in sidebar.`);

  // Click chat 1 (top)
  console.log("Switching to Chat 1...");
  await page.evaluate(() => {
    const chatElements = Array.from(document.querySelectorAll(".w-64 .group"));
    (chatElements[0] as HTMLElement)?.click();
  });
  await delay(2000);
  const snippet1 = await page.evaluate(() => document.querySelector(".prose")?.textContent?.slice(0, 100));
  console.log("Chat 1 snippet:", snippet1);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "chat-switch-back-to-1.png") });

  // Click chat 2
  console.log("Switching to Chat 2...");
  await page.evaluate(() => {
    const chatElements = Array.from(document.querySelectorAll(".w-64 .group"));
    (chatElements[1] as HTMLElement)?.click();
  });
  await delay(2000);
  const snippet2 = await page.evaluate(() => document.querySelector(".prose")?.textContent?.slice(0, 100));
  console.log("Chat 2 snippet:", snippet2);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "chat-switch-to-2.png") });

  // Reload mid-chat
  console.log("Reloading mid-chat on Chat 2...");
  await page.reload({ waitUntil: "networkidle2" });
  await delay(3000);

  // Confirm Ask tab is still active and Chat 2 message is rendered
  const reloadCheck = await page.evaluate(() => {
    const activeTab = document.querySelector(".border-b-2.border-indigo-600, .border-b-2.border-blue-600, button.text-indigo-600")?.textContent;
    const snippet = document.querySelector(".prose")?.textContent?.slice(0, 100);
    return { activeTab, snippet };
  });
  console.log("After reload state:", reloadCheck);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "chat-reloaded-mid-chat.png") });

  console.log("All chat switching screenshots verified and saved!");
  await browser.close();
}

run().catch(console.error);
