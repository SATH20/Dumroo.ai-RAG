import puppeteer from "../web/node_modules/puppeteer-core";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function verifyLiveTeacher() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    console.log("Navigating to live login...");
    await page.goto("https://dumroo-rag.vercel.app/login", { waitUntil: "networkidle2" });
    await page.type('input[type="email"]', "teacher@dumroo-demo.test");
    await page.type('input[type="password"]', "Demo@12345");
    await page.click('button[type="submit"]');

    console.log("Waiting for /teacher navigation...");
    await page.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {});
    
    // Wait for the loading spinner to disappear and teacher navigation to render
    await page.waitForSelector("button", { timeout: 15000 });
    await delay(3000);

    const currentUrl = page.url();
    console.log("Logged in URL:", currentUrl);

    // Check DOM on /teacher
    const domProof = await page.evaluate(() => {
      const pageText = document.body.innerText;
      const containsTeacherPortal = pageText.includes("Teacher") || pageText.includes("Ask Dumroo") || pageText.includes("Dashboard");
      const containsLoginForm = !!document.querySelector("input[type='password']");
      const containsStudentHeader = !!document.querySelector("[data-testid='student-header']");
      const containsWelcomeBack = pageText.includes("Welcome back") || pageText.includes("Sign in to Dumroo.ai");
      const buttons = Array.from(document.querySelectorAll("button")).map((b) => b.textContent?.trim());
      return {
        containsTeacherPortal,
        containsLoginForm,
        containsStudentHeader,
        containsWelcomeBack,
        buttons: buttons.slice(0, 8),
      };
    });

    console.log("Live DOM Proof on /teacher:", domProof);

  } finally {
    await browser.close();
  }
}

verifyLiveTeacher().catch(console.error);
