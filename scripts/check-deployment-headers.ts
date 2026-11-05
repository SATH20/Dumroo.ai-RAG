import puppeteer from "../web/node_modules/puppeteer-core";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function checkDeploymentHeaders() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    const res = await page.goto("https://dumroo-rag.vercel.app/login", { waitUntil: "networkidle2" });
    const headers = res?.headers() || {};
    console.log("Response headers:", {
      "x-vercel-id": headers["x-vercel-id"],
      "age": headers["age"],
      "date": headers["date"],
      "last-modified": headers["last-modified"],
      "etag": headers["etag"],
    });

    const scriptSources = await page.$$eval("script[src]", (scripts) =>
      scripts.map((s) => s.getAttribute("src")).filter((src) => src?.includes("/_next/static/chunks/app/teacher"))
    );
    console.log("Teacher script chunks on live:", scriptSources);

  } finally {
    await browser.close();
  }
}

checkDeploymentHeaders().catch(console.error);
