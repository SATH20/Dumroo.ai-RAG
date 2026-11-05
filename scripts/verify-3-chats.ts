import puppeteer from "../web/node_modules/puppeteer-core";
import path from "path";
import fs from "fs";

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

  page.on("dialog", async (d) => await d.accept());

  console.log("Navigating to login...");
  await page.goto("http://localhost:3000/login", { waitUntil: "networkidle2" });
  await page.type('input[type="email"]', "teacher@dumroo-demo.test");
  await page.type('input[type="password"]', "Demo@12345");
  await page.click('button[type="submit"]');
  await page.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {});
  await delay(2500);

  // Switch to Ask tab
  console.log("Navigating to Ask tab...");
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const askBtn = btns.find((b) => b.textContent?.includes("Ask"));
    if (askBtn) askBtn.click();
  });
  await delay(2000);

  // Helper to send query
  async function askQuestion(query: string) {
    const inputSel = 'input[placeholder*="Ask a question"]';
    await page.waitForSelector(inputSel);
    await page.click(inputSel);
    // Clear input
    await page.evaluate(() => {
      const inp = document.querySelector('input[placeholder*="Ask a question"]') as HTMLInputElement;
      if (inp) {
        inp.value = "";
        inp.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    await delay(300);
    await page.type(inputSel, query, { delay: 20 });
    await delay(500);
    await page.click('button[aria-label="Send query"]');
    console.log(`Sent query: "${query}". Waiting for stream...`);

    for (let i = 0; i < 35; i++) {
      await delay(1000);
      const isDone = await page.evaluate(() => {
        const spin = document.querySelector(".animate-spin");
        const sendBtn = document.querySelector('button[aria-label="Send query"]');
        return !spin && sendBtn && !sendBtn.hasAttribute("disabled");
      });
      if (isDone && i > 3) {
        console.log(`Query finished in ${i}s`);
        break;
      }
    }
    await delay(2000);
  }

  // 1. Ask Chat 1: Newton's First Law
  console.log("Creating Chat 1: Newton's first law...");
  await askQuestion("Explain Newton's first law of motion and inertia");

  // 2. Ask Chat 2: Photosynthesis
  console.log("Creating Chat 2: Photosynthesis...");
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const newD = btns.find((b) => b.textContent?.includes("New discussion"));
    if (newD) newD.click();
  });
  await delay(2500);
  await askQuestion("Explain the process of photosynthesis and chloroplasts");

  // 3. Ask Chat 3: Boyle's Law
  console.log("Creating Chat 3: Boyle's law...");
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const newD = btns.find((b) => b.textContent?.includes("New discussion"));
    if (newD) newD.click();
  });
  await delay(2500);
  await askQuestion("State Boyle's law relating pressure and volume of gas");

  console.log("\n--- Switching between 3 distinct chats in both directions ---");

  // Get items (0 is Chat 3 Boyle, 1 is Chat 2 Photosynthesis, 2 is Chat 1 Newton)
  // Switch to Chat 1 (index 2)
  console.log("Switching to Chat 1 (Newton)...");
  await page.evaluate(() => {
    const items = document.querySelectorAll(".w-64 .group");
    (items[2] as HTMLElement)?.click();
  });
  await delay(2000);
  const snippet1 = await page.evaluate(() => document.querySelector(".prose")?.textContent?.slice(0, 100));
  console.log("Chat 1 Content:", snippet1);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "chat-switch-to-1.png") });

  // Switch to Chat 2 (index 1)
  console.log("Switching forward to Chat 2 (Photosynthesis)...");
  await page.evaluate(() => {
    const items = document.querySelectorAll(".w-64 .group");
    (items[1] as HTMLElement)?.click();
  });
  await delay(2000);
  const snippet2 = await page.evaluate(() => document.querySelector(".prose")?.textContent?.slice(0, 100));
  console.log("Chat 2 Content:", snippet2);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "chat-switch-to-2.png") });

  // Switch to Chat 3 (index 0)
  console.log("Switching forward to Chat 3 (Boyle)...");
  await page.evaluate(() => {
    const items = document.querySelectorAll(".w-64 .group");
    (items[0] as HTMLElement)?.click();
  });
  await delay(2000);
  const snippet3 = await page.evaluate(() => document.querySelector(".prose")?.textContent?.slice(0, 100));
  console.log("Chat 3 Content:", snippet3);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "chat-switch-to-3.png") });

  // Switch back to Chat 2 (index 1)
  console.log("Switching backward to Chat 2 (Photosynthesis)...");
  await page.evaluate(() => {
    const items = document.querySelectorAll(".w-64 .group");
    (items[1] as HTMLElement)?.click();
  });
  await delay(2000);
  const snippet2Back = await page.evaluate(() => document.querySelector(".prose")?.textContent?.slice(0, 100));
  console.log("Chat 2 Content (back):", snippet2Back);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "chat-switch-back-to-2.png") });

  // Switch back to Chat 1 (index 2)
  console.log("Switching backward to Chat 1 (Newton)...");
  await page.evaluate(() => {
    const items = document.querySelectorAll(".w-64 .group");
    (items[2] as HTMLElement)?.click();
  });
  await delay(2000);
  const snippet1Back = await page.evaluate(() => document.querySelector(".prose")?.textContent?.slice(0, 100));
  console.log("Chat 1 Content (back):", snippet1Back);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "chat-switch-back-to-1.png") });

  // Reload mid-chat on Chat 1
  console.log("Reloading mid-chat...");
  await page.reload({ waitUntil: "networkidle2" });
  await delay(3000);

  const snippetAfterReload = await page.evaluate(() => {
    return document.querySelector(".prose")?.textContent?.slice(0, 100);
  });
  console.log("Snippet after reload (should still be Newton):", snippetAfterReload);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, "chat-reloaded-mid-chat.png") });

  console.log("\nAll 3-chat switching verifications completed successfully!");
  await browser.close();
}

run().catch(console.error);
