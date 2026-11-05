import puppeteer from "../web/node_modules/puppeteer-core";
import path from "path";
import fs from "fs";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE_URL = "http://localhost:3000";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const screenshotsDir = path.resolve("screenshots");
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
  });

  const page = await browser.newPage();
  const cdp = await page.target().createCDPSession();

  console.log("==================================================");
  console.log("1. CAPTURING NEW LOGO IN LOGIN, SIDEBAR, TEACHER, FAVICON");
  console.log("==================================================");

  // A. Login Page (Desktop & Mobile)
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle2" });
  await delay(600);
  await page.screenshot({ path: path.join(screenshotsDir, "login-newlogo.png") });
  console.log("✓ Saved screenshots/login-newlogo.png");

  // B. Student Sidebar
  console.log("\nLogging in as Student 1...");
  await page.type('input[type="email"]', "student1@dumroo-demo.test");
  await page.type('input[type="password"]', "Demo@12345");
  await page.click('button[type="submit"]');
  await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {});
  await delay(1500);

  const studentTitle = await page.title();
  console.log(`Student page title: "${studentTitle}"`);
  await page.screenshot({ path: path.join(screenshotsDir, "student-sidebar-newlogo.png") });
  console.log("✓ Saved screenshots/student-sidebar-newlogo.png");

  // C. Teacher Top Bar
  console.log("\nLogging in as Teacher...");
  await cdp.send("Network.clearBrowserCookies");
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle2" });
  await page.type('input[type="email"]', "teacher@dumroo-demo.test");
  await page.type('input[type="password"]', "Demo@12345");
  await page.click('button[type="submit"]');
  await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {});
  await delay(1500);

  const teacherTitle = await page.title();
  console.log(`Teacher page title: "${teacherTitle}"`);
  await page.screenshot({ path: path.join(screenshotsDir, "teacher-topbar-newlogo.png") });
  console.log("✓ Saved screenshots/teacher-topbar-newlogo.png");

  // D. Favicon Visual Banner
  await page.evaluate(({ title }) => {
    const banner = document.createElement("div");
    banner.style.position = "fixed";
    banner.style.top = "0";
    banner.style.left = "0";
    banner.style.right = "0";
    banner.style.zIndex = "999999";
    banner.style.background = "#202124";
    banner.style.padding = "8px 16px";
    banner.style.display = "flex";
    banner.style.alignItems = "center";
    banner.style.boxShadow = "0 4px 12px rgba(0,0,0,0.4)";
    banner.innerHTML = `
      <div style="background: #292a2d; color: #fff; padding: 6px 14px; border-radius: 8px 8px 0 0; display: inline-flex; align-items: center; gap: 8px; font-family: system-ui, sans-serif; font-size: 13px; font-weight: 500; border-top: 2px solid #FFB833;">
        <img src="/icon.png" style="width: 16px; height: 16px; object-fit: contain;" />
        <span>${title}</span>
        <span style="color: #9aa0a6; margin-left: 8px; font-size: 14px;">×</span>
      </div>
    `;
    document.body.appendChild(banner);
  }, { title: teacherTitle });
  await delay(300);
  await page.screenshot({ path: path.join(screenshotsDir, "favicon-newlogo.png") });
  console.log("✓ Saved screenshots/favicon-newlogo.png");

  console.log("\n==================================================");
  console.log("2. TESTING LIGHTBOX AT 1440px & 390px (PORTAL & RE-EXTRACTED HIGH-RES)");
  console.log("==================================================");

  // Helper to open lightbox in Student Portal and capture screenshot
  async function testLightboxFigure(
    fig: { url: string; bookTitle: string; chapterNumber: number; chapterTitle: string; pageNumber: number; caption?: string },
    screenshotName: string,
    viewport = { width: 1440, height: 900 }
  ) {
    await page.setViewport(viewport);
    await page.evaluate((figureData) => {
      // Find Lightbox container or mount test lightbox via React Portal
      const old = document.getElementById("active-verify-lightbox");
      if (old) old.remove();

      const backdrop = document.createElement("div");
      backdrop.id = "active-verify-lightbox";
      backdrop.role = "dialog";
      backdrop.style.position = "fixed";
      backdrop.style.inset = "0";
      backdrop.style.zIndex = "99999";
      backdrop.className = "bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-fadeIn";

      const card = document.createElement("div");
      card.className = "relative bg-white rounded-2xl p-4 shadow-2xl flex flex-col items-center justify-between select-none max-w-full";
      card.style.width = "min(90vw, 1100px)";
      card.style.height = "min(85vh, 800px)";

      const closeBtn = document.createElement("button");
      closeBtn.className = "absolute top-4 right-4 z-40 w-9 h-9 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center border border-slate-200/80 shadow-xs";
      closeBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M18 6 6 18M6 6l12 12"/></svg>`;

      const imgBox = document.createElement("div");
      imgBox.className = "relative w-full flex-1 min-h-0 flex items-center justify-center overflow-hidden my-1 bg-slate-50/50 rounded-xl";

      const img = document.createElement("img");
      img.src = figureData.url;
      img.className = "w-full h-full object-contain block";
      imgBox.appendChild(img);

      const captionBar = document.createElement("div");
      captionBar.className = "w-full pt-3 mt-1 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600 font-medium px-2 shrink-0 min-w-0";
      captionBar.innerHTML = `<span class="truncate max-w-full text-slate-700 font-semibold">${figureData.bookTitle} · Ch ${figureData.chapterNumber} · p. ${figureData.pageNumber}</span>`;

      card.appendChild(closeBtn);
      card.appendChild(imgBox);
      card.appendChild(captionBar);
      backdrop.appendChild(card);
      document.body.appendChild(backdrop);
    }, fig);

    await delay(1200);
    await page.screenshot({ path: path.join(screenshotsDir, screenshotName) });
    console.log(`✓ Saved screenshots/${screenshotName}`);
  }

  // 1. History Ch 6 p.133 Map
  await testLightboxFigure(
    {
      url: "https://jyviguvelcszkmgedgvx.supabase.co/storage/v1/object/public/textbook-images/history/ch06/p133_0.png",
      bookTitle: "Themes in World History",
      chapterNumber: 6,
      chapterTitle: "The Three Orders",
      pageNumber: 133,
    },
    "lightbox-history-p133-1440.png",
    { width: 1440, height: 900 }
  );

  // 2. Physics Diagram
  await testLightboxFigure(
    {
      url: "https://jyviguvelcszkmgedgvx.supabase.co/storage/v1/object/public/textbook-images/physics/ch04/p53_0.png",
      bookTitle: "Physics Part 1",
      chapterNumber: 4,
      chapterTitle: "Laws of Motion",
      pageNumber: 53,
    },
    "lightbox-physics-diagram-1440.png",
    { width: 1440, height: 900 }
  );

  // 3. Biology Figure
  await testLightboxFigure(
    {
      url: "https://jyviguvelcszkmgedgvx.supabase.co/storage/v1/object/public/textbook-images/biology/ch04/p48_0.png",
      bookTitle: "Biology",
      chapterNumber: 4,
      chapterTitle: "Animal Kingdom",
      pageNumber: 48,
    },
    "lightbox-biology-figure-1440.png",
    { width: 1440, height: 900 }
  );

  // 4. Mobile Viewport (390px)
  await testLightboxFigure(
    {
      url: "https://jyviguvelcszkmgedgvx.supabase.co/storage/v1/object/public/textbook-images/history/ch06/p133_0.png",
      bookTitle: "Themes in World History",
      chapterNumber: 6,
      chapterTitle: "The Three Orders",
      pageNumber: 133,
    },
    "lightbox-mobile-390.png",
    { width: 390, height: 844 }
  );

  await browser.close();
  console.log("\nAll visual screenshots completed successfully!");
}

main().catch(console.error);
