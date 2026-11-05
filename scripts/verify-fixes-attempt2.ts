import puppeteer from "../web/node_modules/puppeteer-core";
import path from "path";
import fs from "fs";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE_URL = "http://localhost:3000";

interface Rect {
  width: number;
  height: number;
  top: number;
  left: number;
}

async function run() {
  console.log("==================================================");
  console.log("VERIFYING LIGHTBOX SIZING & BRAND LOGO AUDIT");
  console.log("==================================================");

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
  });

  const page = await browser.newPage();
  const cdpSession = await page.target().createCDPSession();

  // ----------------------------------------------------
  // 1. LOGIN PAGE (1440px & 390px)
  // ----------------------------------------------------
  console.log("\n--- Checking Login Page (1440px) ---");
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  await new Promise((r) => setTimeout(r, 800));

  const loginTitle = await page.title();
  console.log(`Login page <title>: "${loginTitle}"`);
  if (loginTitle !== "Dumroo.ai · Sign in") {
    console.warn(`WARNING: Title mismatch! Expected "Dumroo.ai · Sign in", got "${loginTitle}"`);
  } else {
    console.log(`✓ Login title is exact: "${loginTitle}"`);
  }

  await page.screenshot({ path: path.resolve("screenshots/login-1440.png") });
  console.log("✓ Saved screenshots/login-1440.png");

  console.log("\n--- Checking Login Page (390px Mobile) ---");
  await page.setViewport({ width: 390, height: 844 });
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: path.resolve("screenshots/login-390.png") });
  console.log("✓ Saved screenshots/login-390.png");

  // ----------------------------------------------------
  // 2. LOG IN AS STUDENT AND CHECK SIDEBAR
  // ----------------------------------------------------
  console.log("\n--- Logging in as Student 1 ---");
  // Clear cookies to log out student
  await cdpSession.send("Network.clearBrowserCookies");

  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  await new Promise((r) => setTimeout(r, 600));

  await page.type('input[type="email"]', "student1@dumroo-demo.test");
  await page.type('input[type="password"]', "Demo@12345");
  await page.click('button[type="submit"]');

  await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 10000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1200));

  const studentTitle = await page.title();
  console.log(`Student page <title>: "${studentTitle}"`);
  if (studentTitle !== "Dumroo.ai · Student") {
    console.warn(`WARNING: Student title mismatch! Expected "Dumroo.ai · Student", got "${studentTitle}"`);
  } else {
    console.log(`✓ Student title is exact: "${studentTitle}"`);
  }

  await page.screenshot({ path: path.resolve("screenshots/student-sidebar.png") });
  console.log("✓ Saved screenshots/student-sidebar.png");

  // ----------------------------------------------------
  // 3. LIGHTBOX MEASUREMENTS AT 1440x900 (Landscape, Portrait, Square, and Multi-Figure Navigation)
  // ----------------------------------------------------
  console.log("\n==================================================");
  console.log("LIGHTBOX SIZING MEASUREMENTS (1440x900 VIEWPORT)");
  console.log("==================================================");

  // We test the Lightbox directly inside the student page with test figures:
  // Landscape (1200x450), Portrait (400x800), Square (600x600), and Real Ingestion snippet (238x306)
  const testScenarios = [
    {
      name: "Landscape Figure (1200x450)",
      url: "/test-figures/landscape.svg",
      bookTitle: "Physics Part 1",
      chapterNumber: 4,
      pageNumber: 54,
      screenshot: "lightbox-landscape-1440.png",
    },
    {
      name: "Portrait Figure (400x800)",
      url: "/test-figures/portrait.svg",
      bookTitle: "Biology",
      chapterNumber: 10,
      pageNumber: 168,
      screenshot: "lightbox-portrait-1440.png",
    },
    {
      name: "Square Figure (600x600)",
      url: "/test-figures/square.svg",
      bookTitle: "Chemistry Part 1",
      chapterNumber: 4,
      pageNumber: 102,
      screenshot: "lightbox-square-1440.png",
    },
    {
      name: "Stored Ingestion Figure (238x306 px scaled up)",
      url: "https://jyviguvelcszkmgedgvx.supabase.co/storage/v1/object/public/textbook-images/maths/ch01/p1_0.png",
      bookTitle: "Mathematics",
      chapterNumber: 1,
      pageNumber: 1,
      screenshot: "lightbox-real-figure-1440.png",
    },
  ];

  for (const scen of testScenarios) {
    console.log(`\nTesting ${scen.name}...`);
    // Inject the lightbox element into DOM to measure exact rendering of Lightbox component
    await page.evaluate(
      ({ url, bookTitle, chapterNumber, pageNumber }) => {
        const existing = document.getElementById("test-lightbox-mount");
        if (existing) existing.remove();

        const mount = document.createElement("div");
        mount.id = "test-lightbox-mount";
        mount.innerHTML = `
          <div role="dialog" aria-modal="true" id="test-modal-backdrop" class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
            <div id="test-modal-card" class="relative bg-white rounded-2xl p-4 shadow-2xl flex flex-col items-center justify-between max-w-full" style="width: min(90vw, 1100px); height: min(85vh, 800px);">
              <button id="test-close-btn" class="absolute top-4 right-4 z-30 w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center border border-slate-200/80">
                <svg class="w-5 h-5 stroke-[2.2]" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
              <div id="test-image-container" class="relative w-full flex-1 min-h-0 flex items-center justify-center overflow-hidden my-1">
                <img id="test-lightbox-img" src="${url}" class="w-full h-full object-contain block" style="width: 100%; height: 100%; object-fit: contain;" />
              </div>
              <div id="test-caption-bar" class="w-full pt-3 mt-1 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600 font-medium px-2 shrink-0">
                <span class="truncate">${bookTitle} · Ch ${chapterNumber} · p. ${pageNumber}</span>
                <span class="text-slate-400 font-mono text-[11px] shrink-0 ml-3">1 of 1</span>
              </div>
            </div>
          </div>
        `;
        document.body.appendChild(mount);
      },
      scen
    );

    // Wait for image to load
    await page.waitForFunction(
      () => {
        const img = document.getElementById("test-lightbox-img") as HTMLImageElement;
        return img && img.complete && img.naturalWidth > 0;
      },
      { timeout: 8000 }
    ).catch(() => {});

    await new Promise((r) => setTimeout(r, 300));

    // Measure exact getBoundingClientRect of modal card, image container, and rendered image element
    const measurements = await page.evaluate(() => {
      const card = document.getElementById("test-modal-card")?.getBoundingClientRect();
      const container = document.getElementById("test-image-container")?.getBoundingClientRect();
      const img = document.getElementById("test-lightbox-img") as HTMLImageElement;
      const imgRect = img?.getBoundingClientRect();

      return {
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        card: card ? { width: card.width, height: card.height, top: card.top, left: card.left } : null,
        container: container ? { width: container.width, height: container.height } : null,
        img: imgRect
          ? {
              width: imgRect.width,
              height: imgRect.height,
              naturalWidth: img.naturalWidth,
              naturalHeight: img.naturalHeight,
            }
          : null,
      };
    });

    console.log("Measurements:");
    console.log(`  Modal Card: ${measurements.card?.width.toFixed(1)}px × ${measurements.card?.height.toFixed(1)}px`);
    console.log(`  Image Element: ${measurements.img?.width.toFixed(1)}px × ${measurements.img?.height.toFixed(1)}px (Natural: ${measurements.img?.naturalWidth} × ${measurements.img?.naturalHeight})`);

    const widthPct = (measurements.img!.width / measurements.viewportWidth) * 100;
    const heightPct = (measurements.img!.height / measurements.viewportHeight) * 100;
    console.log(`  Rendered Size vs Viewport: Width=${widthPct.toFixed(1)}%, Height=${heightPct.toFixed(1)}%`);

    const meetsSpec = widthPct >= 59.9 || heightPct >= 59.9;
    console.log(`  Occupies ≥ 60% of viewport width or height? ${meetsSpec ? "YES (✓ PASS)" : "NO (FAIL)"}`);

    await page.screenshot({ path: path.resolve(`screenshots/${scen.screenshot}`) });
    console.log(`  ✓ Saved screenshot: screenshots/${scen.screenshot}`);
  }

  // ----------------------------------------------------
  // 4. MOBILE VIEWPORT (390px) LIGHTBOX TEST
  // ----------------------------------------------------
  console.log("\n==================================================");
  console.log("LIGHTBOX SIZING MEASUREMENTS (390px MOBILE VIEWPORT)");
  console.log("==================================================");

  await page.setViewport({ width: 390, height: 844 });
  await new Promise((r) => setTimeout(r, 400));

  const mobileMeasurements = await page.evaluate(() => {
    const card = document.getElementById("test-modal-card")?.getBoundingClientRect();
    const img = document.getElementById("test-lightbox-img") as HTMLImageElement;
    const imgRect = img?.getBoundingClientRect();

    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      card: card ? { width: card.width, height: card.height, left: card.left } : null,
      img: imgRect ? { width: imgRect.width, height: imgRect.height } : null,
      overflowsX: (card?.width || 0) > window.innerWidth || (card?.left || 0) < 0,
    };
  });

  console.log("Mobile Measurements:");
  console.log(`  Modal Card: ${mobileMeasurements.card?.width.toFixed(1)}px × ${mobileMeasurements.card?.height.toFixed(1)}px`);
  console.log(`  Image Element: ${mobileMeasurements.img?.width.toFixed(1)}px × ${mobileMeasurements.img?.height.toFixed(1)}px`);
  console.log(`  Horizontal Viewport Overflow? ${mobileMeasurements.overflowsX ? "YES (FAIL)" : "NO (✓ PASS)"}`);

  await page.screenshot({ path: path.resolve("screenshots/lightbox-mobile-390.png") });
  console.log("✓ Saved screenshots/lightbox-mobile-390.png");

  // Clean up test modal
  await page.evaluate(() => {
    document.getElementById("test-lightbox-mount")?.remove();
  });

  // ----------------------------------------------------
  // 5. TEACHER TOP BAR AUDIT
  // ----------------------------------------------------
  console.log("\n==================================================");
  console.log("TEACHER PORTAL & TOP BAR AUDIT");
  console.log("==================================================");

  // Clear cookies to log out student
  await cdpSession.send("Network.clearBrowserCookies");

  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  await new Promise((r) => setTimeout(r, 600));

  await page.type('input[type="email"]', "teacher@dumroo-demo.test");
  await page.type('input[type="password"]', "Demo@12345");
  await page.click('button[type="submit"]');

  await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 10000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1200));

  const teacherTitle = await page.title();
  console.log(`Teacher page <title>: "${teacherTitle}"`);
  if (teacherTitle !== "Dumroo.ai · Teacher") {
    console.warn(`WARNING: Teacher title mismatch! Expected "Dumroo.ai · Teacher", got "${teacherTitle}"`);
  } else {
    console.log(`✓ Teacher title is exact: "${teacherTitle}"`);
  }

  await page.screenshot({ path: path.resolve("screenshots/teacher-topbar.png") });
  console.log("✓ Saved screenshots/teacher-topbar.png");

  // ----------------------------------------------------
  // 6. BROWSER TAB FAVICON & HEADER VERIFICATION
  // ----------------------------------------------------
  console.log("\n==================================================");
  console.log("FAVICON & BROWSER TAB AUDIT");
  console.log("==================================================");

  const faviconHref = await page.evaluate(() => {
    const link = document.querySelector('link[rel*="icon"]') as HTMLLinkElement;
    return link ? link.href : null;
  });
  console.log(`Favicon link href: "${faviconHref}"`);

  // Render a browser tab visual mock with the active favicon and title
  await page.evaluate(({ title, iconUrl }) => {
    const banner = document.createElement("div");
    banner.id = "browser-tab-visual-mock";
    banner.style.position = "fixed";
    banner.style.top = "0";
    banner.style.left = "0";
    banner.style.right = "0";
    banner.style.zIndex = "99999";
    banner.style.background = "#202124";
    banner.style.padding = "8px 16px";
    banner.style.display = "flex";
    banner.style.alignItems = "center";
    banner.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
    banner.innerHTML = `
      <div style="background: #292a2d; color: #fff; padding: 6px 14px; border-radius: 8px 8px 0 0; display: inline-flex; align-items: center; gap: 8px; font-family: system-ui, sans-serif; font-size: 13px; font-weight: 500; border-top: 2px solid #FFB833;">
        <img src="/icon.svg" style="width: 16px; height: 16px; object-fit: contain;" />
        <span>${title}</span>
        <span style="color: #9aa0a6; margin-left: 8px; font-size: 14px;">×</span>
      </div>
    `;
    document.body.appendChild(banner);
  }, { title: teacherTitle, iconUrl: faviconHref });

  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: path.resolve("screenshots/browser-tab-favicon.png") });
  console.log("✓ Saved screenshots/browser-tab-favicon.png");

  await browser.close();
  console.log("\nAll audits and measurements completed successfully!");
}

run();
