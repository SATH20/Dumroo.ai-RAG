import puppeteer from "../web/node_modules/puppeteer-core";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function inspectDOM() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    await page.goto("https://dumroo-rag.vercel.app/login", { waitUntil: "networkidle2" });
    await page.type('input[type="email"]', "teacher@dumroo-demo.test");
    await page.type('input[type="password"]', "Demo@12345");
    await page.click('button[type="submit"]');

    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {});
    await delay(3000);

    const info = await page.evaluate(() => {
      const loginEl = document.querySelector('form');
      const parent = loginEl ? loginEl.parentElement?.parentElement?.outerHTML.slice(0, 500) : "no form";
      const bodyChildren = Array.from(document.body.children).map(c => ({
        tag: c.tagName,
        className: c.className,
        outerStart: c.outerHTML.slice(0, 200)
      }));
      return { parent, bodyChildren };
    });

    console.log("LOGIN ELEMENT PARENT:\n", info.parent);
    console.log("BODY CHILDREN:\n", JSON.stringify(info.bodyChildren, null, 2));

  } finally {
    await browser.close();
  }
}

inspectDOM().catch(console.error);
