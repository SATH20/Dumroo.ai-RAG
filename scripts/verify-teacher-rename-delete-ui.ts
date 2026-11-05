import puppeteer from "../web/node_modules/puppeteer-core";
import path from "path";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE_URL = "http://localhost:3000";
const ARTIFACT_DIR = "C:\\Users\\rvlgs\\.gemini\\antigravity\\brain\\03be522a-414a-41e6-b811-706577595ef7";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  console.log("Launching browser for Teacher Chat UI Rename & Delete verification...");
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    // Handle any window.confirm calls automatically by accepting
    page.on("dialog", async (dialog) => {
      console.log(`[Dialog ${dialog.type()}]: "${dialog.message()}" -> Accepting`);
      await dialog.accept();
    });

    console.log("Navigating to login...");
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle2" });
    await page.type('input[type="email"]', "teacher@dumroo-demo.test");
    await page.type('input[type="password"]', "Demo@12345");
    await page.click('button[type="submit"]');

    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {});
    await delay(2500);

    // Switch to Ask tab
    console.log("Switching to Ask tab...");
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const askBtn = buttons.find((b) => b.textContent?.includes("Ask"));
      if (askBtn) askBtn.click();
    });
    await delay(2000);

    // Click "New discussion"
    console.log("Clicking 'New discussion'...");
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const newDiscBtn = buttons.find((b) => b.textContent?.includes("New discussion"));
      if (newDiscBtn) newDiscBtn.click();
    });
    await delay(1500);

    // Find the chat item and hover to reveal action buttons
    console.log("Hovering over discussion item in sidebar...");
    const chatItem = await page.$('.w-64 .group');
    if (chatItem) {
      await chatItem.hover();
      await delay(500);

      // Take screenshot with hover icons visible
      await page.screenshot({
        path: path.join(ARTIFACT_DIR, "teacher-chat-actions-hover.png"),
      });
      console.log("Saved hover screenshot to teacher-chat-actions-hover.png");

      // Click rename button
      console.log("Clicking Rename button...");
      const renameBtn = await page.$('button[aria-label="Rename discussion"]');
      if (renameBtn) {
        await renameBtn.click();
        await delay(500);

        // Type new name in the input (text is auto-selected on focus)
        console.log("Typing new name: 'Physics Chapter 5 Lesson Plan'...");
        const renameInput = await page.$('.w-64 input[type="text"]');
        if (renameInput) {
          // Select all using ctrl+a and type new title
          await renameInput.focus();
          await page.keyboard.down("Control");
          await page.keyboard.press("A");
          await page.keyboard.up("Control");
          await renameInput.type("Physics Chapter 5 Lesson Plan");
          await page.keyboard.press("Enter");
          await delay(1500);

          // Verify new title appears
          const text = await page.evaluate(() => {
            const el = document.querySelector('.w-64 .group span.truncate');
            return el?.textContent || "";
          });
          console.log(`Discussion title after rename: "${text}"`);

          // Take screenshot of renamed discussion
          await page.screenshot({
            path: path.join(ARTIFACT_DIR, "teacher-chat-renamed.png"),
          });
          console.log("Saved renamed screenshot to teacher-chat-renamed.png");

          // Now test deleting the chat
          console.log("Hovering and clicking Delete button...");
          await chatItem.hover();
          await delay(500);
          const deleteBtn = await page.$('button[aria-label="Delete discussion"]');
          if (deleteBtn) {
            await deleteBtn.click();
            await delay(2000);

            // Take screenshot after deletion
            await page.screenshot({
              path: path.join(ARTIFACT_DIR, "teacher-chat-after-delete.png"),
            });
            console.log("Saved post-delete screenshot to teacher-chat-after-delete.png");
          } else {
            console.warn("Delete button not found!");
          }
        } else {
          console.warn("Rename input not found!");
        }
      } else {
        console.warn("Rename button not found!");
      }
    } else {
      console.warn("Chat item not found in sidebar!");
    }

    console.log("Teacher chat UI verification complete!");
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
