import puppeteer from "../web/node_modules/puppeteer-core";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function checkLive() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    console.log("Checking live URL: https://dumroo-rag.vercel.app/login");
    const res = await page.goto("https://dumroo-rag.vercel.app/login", { waitUntil: "networkidle2" });
    console.log("Status:", res?.status());
    const title = await page.title();
    console.log("Page Title:", title);

    // Check if demo buttons are present
    const demoBtns = await page.$$eval("button", (btns) => btns.map((b) => b.textContent?.trim()));
    console.log("Demo buttons found on live:", demoBtns.filter((b) => b?.includes("Demo")));
  } finally {
    await browser.close();
  }
}

checkLive().catch(console.error);
