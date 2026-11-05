import puppeteer from "../web/node_modules/puppeteer-core";
import path from "path";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE_URL = "http://localhost:3000";

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle2" });

  await page.evaluate(() => {
    const backdrop = document.createElement("div");
    backdrop.style.position = "fixed";
    backdrop.style.inset = "0";
    backdrop.style.zIndex = "99999";
    backdrop.className = "bg-black/85 backdrop-blur-sm flex items-center justify-center p-6";

    const card = document.createElement("div");
    card.className = "relative bg-white rounded-2xl p-4 shadow-2xl flex flex-col items-center justify-between select-none max-w-full";
    card.style.width = "min(90vw, 1100px)";
    card.style.height = "min(85vh, 800px)";

    const closeBtn = document.createElement("button");
    closeBtn.className = "absolute top-4 right-4 z-40 w-9 h-9 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center border border-slate-200/80";
    closeBtn.innerHTML = "✕";
    card.appendChild(closeBtn);

    const imgWrap = document.createElement("div");
    imgWrap.className = "relative flex-1 w-full flex items-center justify-center overflow-hidden";

    const img = document.createElement("img");
    img.src = "https://jyviguvelcszkmgedgvx.supabase.co/storage/v1/object/public/textbook-images/history/ch02/p30_0.png?v=" + Date.now();
    img.style.maxWidth = "100%";
    img.style.maxHeight = "100%";
    img.style.objectFit = "contain";
    imgWrap.appendChild(img);
    card.appendChild(imgWrap);

    const footer = document.createElement("div");
    footer.className = "mt-3 w-full px-2 flex items-center justify-between text-xs text-slate-500 border-t border-slate-100 pt-3";
    footer.innerHTML = '<span class="font-medium text-slate-700">Themes in World History · Ch 2 · p. 30</span><span>1 of 2</span>';
    card.appendChild(footer);

    backdrop.appendChild(card);
    document.body.appendChild(backdrop);
  });

  await new Promise((r) => setTimeout(r, 2000));
  await page.screenshot({ path: path.resolve("screenshots/lightbox-history-ch2-p30-1440.png") });
  console.log("Saved screenshots/lightbox-history-ch2-p30-1440.png");
  await browser.close();
}

main().catch(console.error);
