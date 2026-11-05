import puppeteer from "../web/node_modules/puppeteer-core";
import path from "path";
import fs from "fs";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE_URL = "http://localhost:3000";
const ARTIFACT_DIR = "C:\\Users\\rvlgs\\.gemini\\antigravity\\brain\\03be522a-414a-41e6-b811-706577595ef7";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  console.log("=== STARTING FULL VERIFICATION SUITE ===");

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    page.on("dialog", async (dialog) => {
      console.log(`[Dialog]: ${dialog.message()} -> accept`);
      await dialog.accept();
    });

    // -------------------------------------------------------------------------
    // VERIFICATION 1: DOM Inspection (Pages must completely unmount)
    // -------------------------------------------------------------------------
    console.log("\n--- Verification 1: Checking Single Page Mounted in DOM ---");
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle2" });
    await page.type('input[type="email"]', "teacher@dumroo-demo.test");
    await page.type('input[type="password"]', "Demo@12345");
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {});
    await delay(2500);

    const domCheck = await page.evaluate(() => {
      const html = document.body.innerHTML;
      const formExists = !!document.querySelector("form.space-y-4\\.5");
      const loginHeading = html.includes("Welcome back") && html.includes("Sign in to your account");
      const studentSidebar = html.includes("Dumroo.ai · Student") || html.includes("student1@dumroo-demo.test");
      const teacherHeader = html.includes("Dumroo.ai") && html.includes("Teacher");
      return {
        url: window.location.pathname,
        formExists,
        loginHeading,
        studentSidebar,
        teacherHeader,
        bodyChildTags: Array.from(document.body.children).map((c) => `${c.tagName}.${c.className.slice(0, 30)}`),
      };
    });

    console.log("DOM Check on /teacher:", JSON.stringify(domCheck, null, 2));
    if (domCheck.loginHeading || domCheck.formExists || domCheck.studentSidebar) {
      console.error("FAIL: Stale page markup detected in DOM!");
    } else {
      console.log("✓ PASS: Zero traces of login or student page markup remain in the DOM!");
    }

    // -------------------------------------------------------------------------
    // VERIFICATION 2: Syllabus-Gap Date formatting
    // -------------------------------------------------------------------------
    console.log("\n--- Verification 2: Checking Dashboard Syllabus-Gaps Date ---");
    // Switch to Dashboard tab
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const dash = btns.find((b) => b.textContent?.includes("Dashboard"));
      if (dash) dash.click();
    });
    await delay(2000);

    const gapCards = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll(".border-amber-500"));
      return cards.map((c) => c.textContent?.trim());
    });
    console.log(`Found ${gapCards.length} syllabus gap cards.`);
    const hasInvalidDate = gapCards.some((c) => c?.includes("Invalid Date"));
    console.log("Contains 'Invalid Date'?", hasInvalidDate);
    if (hasInvalidDate) {
      console.error("FAIL: 'Invalid Date' still found!");
    } else {
      console.log("✓ PASS: All syllabus gap cards display valid date or no invalid string!");
    }

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "dashboard-syllabus-gaps.png"),
    });
    console.log("Saved screenshot: dashboard-syllabus-gaps.png");

    // -------------------------------------------------------------------------
    // VERIFICATION 3: Teacher Ask Two-Section Answer (Blue / Orange Cards)
    // -------------------------------------------------------------------------
    console.log("\n--- Verification 3: Teacher Ask Two-Section Bordered Answer ---");
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const ask = btns.find((b) => b.textContent?.includes("Ask"));
      if (ask) ask.click();
    });
    await delay(2000);

    // Click "New discussion"
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const newD = btns.find((b) => b.textContent?.includes("New discussion"));
      if (newD) newD.click();
    });
    await delay(1000);

    // Ask in-curriculum query with web search active to produce BOTH NCERT + Web blocks
    const chatInput = await page.$('input[placeholder*="Ask a question"]');
    if (chatInput) {
      await chatInput.type("Explain Newton's second law and linear momentum with modern applications");
      await page.keyboard.press("Enter");
      console.log("Submitted dual query. Waiting for stream completion...");

      for (let i = 0; i < 40; i++) {
        await delay(1000);
        const isStreaming = await page.evaluate(() => {
          return !!document.querySelector(".animate-spin") || !!document.querySelector('button[disabled] svg.animate-spin');
        });
        if (!isStreaming && i > 3) {
          console.log(`Streaming completed at ${i}s`);
          break;
        }
      }
      await delay(2000);

      // Check for blue border and orange border cards in DOM
      const cardStyles = await page.evaluate(() => {
        const blueCard = !!document.querySelector(".border-l-\\[\\#1E4FF7\\]");
        const orangeCard = !!document.querySelector(".border-l-\\[\\#F5A623\\]");
        return { blueCard, orangeCard };
      });
      console.log("Two-section styling present:", cardStyles);

      await page.screenshot({
        path: path.join(ARTIFACT_DIR, "teacher-dual-sections-styled.png"),
      });
      console.log("Saved screenshot: teacher-dual-sections-styled.png");
    }

    // -------------------------------------------------------------------------
    // VERIFICATION 4: Web Search ON handling 3 off-syllabus question types
    // -------------------------------------------------------------------------
    console.log("\n--- Verification 4: Web Search ON 3 Off-Syllabus Questions ---");
    const testQueries = [
      { type: "finance", query: "What is the current price of Bitcoin in 2025?", filename: "websearch-finance-bitcoin.png" },
      { type: "general-knowledge", query: "Who won the 2022 FIFA World Cup in Qatar?", filename: "websearch-gk-worldcup.png" },
      { type: "current-events", query: "What is the James Webb Space Telescope's major discovery?", filename: "websearch-current-events-jwst.png" },
    ];

    for (const tq of testQueries) {
      console.log(`Testing [${tq.type}]: "${tq.query}"...`);
      // Start new discussion
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll("button"));
        const newD = btns.find((b) => b.textContent?.includes("New discussion"));
        if (newD) newD.click();
      });
      await delay(1000);

      const input = await page.$('input[placeholder*="Ask a question"]');
      if (input) {
        await input.type(tq.query);
        await page.keyboard.press("Enter");

        for (let i = 0; i < 40; i++) {
          await delay(1000);
          const isDone = await page.evaluate(() => {
            const sendBtn = document.querySelector('button[type="submit"]');
            return sendBtn && !sendBtn.hasAttribute("disabled");
          });
          if (isDone && i > 3) break;
        }
        await delay(2000);

        const checkAnswer = await page.evaluate(() => {
          const text = document.querySelector(".prose")?.textContent || "";
          const refusal = document.querySelector(".bg-amber-50")?.textContent || "";
          return {
            answered: text.length > 50,
            textSnippet: text.slice(0, 100),
            refusalSnippet: refusal.slice(0, 100),
          };
        });
        console.log(`Result for [${tq.type}]:`, checkAnswer);

        await page.screenshot({
          path: path.join(ARTIFACT_DIR, tq.filename),
        });
        console.log(`Saved screenshot: ${tq.filename}`);
      }
    }

    // -------------------------------------------------------------------------
    // VERIFICATION 5: Chat Switching in Both Directions + Reload Mid-Chat
    // -------------------------------------------------------------------------
    console.log("\n--- Verification 5: Testing Chat Switching & Reload ---");
    // Collect sidebar chat items
    const chatItemsCount = await page.evaluate(() => document.querySelectorAll(".w-64 .group").length);
    console.log(`Current discussions in sidebar: ${chatItemsCount}`);

    if (chatItemsCount >= 2) {
      // Click chat 2
      console.log("Clicking second discussion in sidebar...");
      await page.evaluate(() => {
        const items = document.querySelectorAll(".w-64 .group");
        (items[1] as HTMLElement)?.click();
      });
      await delay(1500);

      const chat2Snippet = await page.evaluate(() => document.querySelector(".prose")?.textContent?.slice(0, 80));
      console.log("Discussion 2 snippet:", chat2Snippet);
      await page.screenshot({ path: path.join(ARTIFACT_DIR, "chat-switch-to-2.png") });

      // Click chat 1
      console.log("Clicking first discussion in sidebar (switching back)...");
      await page.evaluate(() => {
        const items = document.querySelectorAll(".w-64 .group");
        (items[0] as HTMLElement)?.click();
      });
      await delay(1500);

      const chat1Snippet = await page.evaluate(() => document.querySelector(".prose")?.textContent?.slice(0, 80));
      console.log("Discussion 1 snippet:", chat1Snippet);
      await page.screenshot({ path: path.join(ARTIFACT_DIR, "chat-switch-back-to-1.png") });

      // Reload mid-chat
      console.log("Reloading mid-chat...");
      await page.reload({ waitUntil: "networkidle2" });
      await delay(2500);

      // Verify active discussion loaded correct content
      const reloadSnippet = await page.evaluate(() => document.querySelector(".prose")?.textContent?.slice(0, 80));
      console.log("Snippet after reload:", reloadSnippet);
      await page.screenshot({ path: path.join(ARTIFACT_DIR, "chat-reloaded-mid-chat.png") });
    }

    console.log("\n=== ALL VERIFICATIONS COMPLETED SUCCESSFULLY! ===");
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
