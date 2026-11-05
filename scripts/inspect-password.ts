import puppeteer from "../web/node_modules/puppeteer-core";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function inspectPasswordInput(url: string, name: string) {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.goto(`${url}/login`, { waitUntil: "networkidle2" });
    await page.type('input[type="email"]', "teacher@dumroo-demo.test");
    await page.type('input[type="password"]', "Demo@12345");
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {});
    await delay(3000);

    const inputs = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll("input[type='password']"));
      return els.map((el) => {
        const parents: string[] = [];
        let curr: HTMLElement | null = el.parentElement;
        while (curr) {
          parents.push(`${curr.tagName.toLowerCase()}${curr.id ? '#' + curr.id : ''}${curr.className ? '.' + curr.className.split(' ').slice(0, 2).join('.') : ''}`);
          curr = curr.parentElement;
        }
        return {
          outerHTML: el.outerHTML,
          parents: parents.slice(0, 6),
        };
      });
    });

    console.log(`[${name}] Password inputs on /teacher:`, inputs.length);
    if (inputs.length > 0) {
      console.log(JSON.stringify(inputs, null, 2));
    }

  } finally {
    await browser.close();
  }
}

async function run() {
  await inspectPasswordInput("http://localhost:3000", "LOCAL");
  await inspectPasswordInput("https://dumroo-rag.vercel.app", "VERCEL");
}

run().catch(console.error);
