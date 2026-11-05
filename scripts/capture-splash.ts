import puppeteer from "../web/node_modules/puppeteer-core";
import path from "path";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE_URL = "http://localhost:3000";

async function run() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${BASE_URL}/login`);
  await page.evaluate(() => {
    document.body.innerHTML = `
      <div class="min-h-screen flex flex-col items-center justify-center bg-[#F8FAFC] gap-5 font-sans">
        <div class="flex items-center gap-2.5 select-none">
          <div class="w-10 h-10 rounded-2xl flex items-center justify-center shadow-sm text-white shrink-0" style="background: linear-gradient(135deg, #1E4FF7 0%, #6A5CFF 55%, #F5A623 100%);">
            <svg class="w-5.5 h-5.5 text-white fill-white/20" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>
          </div>
          <div class="text-2xl font-heading font-extrabold tracking-tight leading-none">
            <span class="text-[#0F172A]">Dumroo</span><span class="text-[#1E4FF7]">.ai</span>
          </div>
        </div>
        <div class="w-6 h-6 border-2 border-[#1E4FF7] border-t-transparent rounded-full animate-spin"></div>
        <p class="text-xs font-semibold text-[#64748B]">Loading learning workspace…</p>
      </div>
    `;
  });
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: path.resolve("screenshots/logo-loading.png") });
  await browser.close();
  console.log("Saved screenshots/logo-loading.png");
}

run();
