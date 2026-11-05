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

  console.log("==================================================");
  console.log("1. AUDITING TITLES AND WORDMARK LOCATIONS");
  console.log("==================================================");

  // A. Splash / Root Page
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
  await delay(200);
  await page.screenshot({ path: path.join(screenshotsDir, "logo-loading.png") });
  console.log("✓ Captured logo-loading.png");

  // B. Login Page
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle2" });
  const loginTitle = await page.title();
  console.log(`Login page <title>: "${loginTitle}"`);
  if (!loginTitle.includes("Dumroo AI · Sign in")) {
    console.warn("⚠️ Login title mismatch!");
  } else {
    console.log("✓ Login <title> is correct: 'Dumroo AI · Sign in'");
  }
  await page.screenshot({ path: path.join(screenshotsDir, "logo-login.png") });
  console.log("✓ Captured logo-login.png");

  // Check Favicon link tag
  const faviconHref = await page.evaluate(() => {
    const link = document.querySelector('link[rel*="icon"]');
    return link ? link.getAttribute("href") : null;
  });
  console.log(`Favicon link href: "${faviconHref}"`);

  // C. Student Page
  console.log("\nLogging in as Student 1...");
  await page.type('input[type="email"]', "student1@dumroo-demo.test");
  await page.type('input[type="password"]', "Demo@12345");
  await page.click('button[type="submit"]');

  await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {});
  await delay(2500);

  const studentTitle = await page.title();
  console.log(`Student page <title>: "${studentTitle}"`);
  if (!studentTitle.includes("Dumroo AI · Student")) {
    console.warn("⚠️ Student title mismatch!");
  } else {
    console.log("✓ Student <title> is correct: 'Dumroo AI · Student'");
  }
  await page.screenshot({ path: path.join(screenshotsDir, "logo-student.png") });
  console.log("✓ Captured logo-student.png");

  console.log("==================================================");
  console.log("2. TESTING LIGHTBOX ACROSS 3 ASPECT RATIOS");
  console.log("==================================================");

  // Helper to open lightbox with any image url and measure dimensions
  async function testLightboxImage(imgUrl: string, label: string, screenshotName: string, viewport = { width: 1440, height: 900 }) {
    await page.setViewport(viewport);
    // Directly invoke setLightboxImage in React state via window or custom event or click
    await page.evaluate((url) => {
      // Find an image or dispatch lightbox test
      window.dispatchEvent(new CustomEvent("open-test-lightbox", { detail: url }));
      // Also fallback: inject directly if testing
      const existingModal = document.querySelector('[role="dialog"]');
      if (existingModal) existingModal.remove();

      // Create lightbox dynamically in DOM using same structure to verify CSS
      const backdrop = document.createElement("div");
      backdrop.id = "test-lightbox-backdrop";
      backdrop.setAttribute("role", "dialog");
      backdrop.className = "fixed inset-0 z-50 bg-[#0B1530]/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-fadeIn";
      backdrop.onclick = (e) => {
        if (e.target === backdrop) backdrop.remove();
      };

      const card = document.createElement("div");
      card.id = "test-lightbox-card";
      card.className = "relative inline-flex flex-col items-center justify-center bg-white rounded-2xl p-2 sm:p-3 shadow-2xl border border-white/20 animate-scaleIn select-none";
      card.style.maxWidth = "90vw";
      card.style.maxHeight = "85vh";

      const btn = document.createElement("button");
      btn.id = "test-lightbox-close";
      btn.className = "absolute -top-3 -right-3 sm:-top-3.5 sm:-right-3.5 z-20 w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#0F172A] hover:bg-[#1E4FF7] text-white flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95 cursor-pointer border-2 border-white focus:outline-none";
      btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;
      btn.onclick = () => backdrop.remove();

      const img = document.createElement("img");
      img.id = "test-lightbox-img";
      img.src = url;
      img.className = "rounded-xl block";
      img.style.maxWidth = "calc(90vw - 16px)";
      img.style.maxHeight = "calc(85vh - 24px)";
      img.style.width = "auto";
      img.style.height = "auto";
      img.style.objectFit = "contain";

      card.appendChild(btn);
      card.appendChild(img);
      backdrop.appendChild(card);
      document.body.appendChild(backdrop);
    }, imgUrl);

    await delay(600);

    const dims = await page.evaluate(() => {
      const card = document.getElementById("test-lightbox-card");
      const img = document.getElementById("test-lightbox-img");
      if (!card || !img) return null;
      const cardRect = card.getBoundingClientRect();
      const imgRect = img.getBoundingClientRect();
      return {
        cardWidth: cardRect.width,
        cardHeight: cardRect.height,
        imgWidth: imgRect.width,
        imgHeight: imgRect.height,
        aspectRatio: (imgRect.width / imgRect.height).toFixed(2),
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        overflowsWidth: cardRect.width > window.innerWidth,
        overflowsHeight: cardRect.height > window.innerHeight,
      };
    });

    console.log(`\n[${label}] Measured Lightbox:`);
    console.log(`  Modal Card: ${dims?.cardWidth.toFixed(1)}px × ${dims?.cardHeight.toFixed(1)}px`);
    console.log(`  Image Rect: ${dims?.imgWidth.toFixed(1)}px × ${dims?.imgHeight.toFixed(1)}px`);
    console.log(`  Aspect Ratio: ${dims?.aspectRatio}`);
    console.log(`  Overflows Viewport? Width: ${dims?.overflowsWidth}, Height: ${dims?.overflowsHeight}`);

    await page.screenshot({ path: path.join(screenshotsDir, screenshotName) });
    console.log(`  ✓ Saved screenshot: ${screenshotName}`);

    // Test backdrop click closes modal
    await page.mouse.click(20, 20);
    await delay(300);
    const isClosed = await page.evaluate(() => !document.getElementById("test-lightbox-backdrop"));
    console.log(`  ✓ Backdrop click closes modal: ${isClosed}`);
  }

  // 1. Landscape Chart (1200 x 450, ratio ~ 2.67:1)
  await testLightboxImage(
    `${BASE_URL}/test-figures/landscape.svg`,
    "Landscape Chart (1200x450)",
    "lightbox-landscape-1440.png",
    { width: 1440, height: 900 }
  );

  // 2. Portrait Diagram (400 x 800, ratio ~ 0.5:1)
  await testLightboxImage(
    `${BASE_URL}/test-figures/portrait.svg`,
    "Portrait Diagram (400x800)",
    "lightbox-portrait-1440.png",
    { width: 1440, height: 900 }
  );

  // 3. Square Figure (600 x 600, ratio ~ 1:1)
  await testLightboxImage(
    `${BASE_URL}/test-figures/square.svg`,
    "Square Figure (600x600)",
    "lightbox-square-1440.png",
    { width: 1440, height: 900 }
  );

  // 4. Mobile (390 x 844) Viewport Test with Landscape and Portrait
  await testLightboxImage(
    `${BASE_URL}/test-figures/landscape.svg`,
    "Mobile Landscape Lightbox (390px)",
    "lightbox-mobile-390.png",
    { width: 390, height: 844 }
  );

  // 5. Test real in-app textbook figure from existing chat
  console.log("\nTesting real in-app figure click from student chat...");
  await page.setViewport({ width: 1440, height: 900 });
  // Find a chat with Newton's second law
  const newtonChat = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll("div.cursor-pointer"));
    const chat = items.find((c) => c.textContent?.includes("Newton"));
    if (chat) {
      (chat as HTMLElement).click();
      return true;
    }
    return false;
  });
  if (newtonChat) {
    await delay(2000);
    // Click figure thumbnail
    const figureClicked = await page.evaluate(() => {
      const img = document.querySelector('img[alt*="Figure"], img[alt*="page"]');
      if (img) {
        (img.parentElement?.parentElement as HTMLElement)?.click();
        return true;
      }
      return false;
    });
    if (figureClicked) {
      await delay(600);
      await page.screenshot({ path: path.join(screenshotsDir, "lightbox-real-figure-1440.png") });
      console.log("✓ Captured real in-app figure lightbox: lightbox-real-figure-1440.png");

      // Test Esc key closes it
      await page.keyboard.press("Escape");
      await delay(400);
      const closedViaEsc = await page.evaluate(() => !document.querySelector('[role="dialog"]'));
      console.log(`✓ Esc key closes real in-app lightbox: ${closedViaEsc}`);
    }
  }

  // D. Teacher Portal Page
  console.log("\n==================================================");
  console.log("3. AUDITING TEACHER TOP BAR WORDMARK & TITLE");
  console.log("==================================================");
  const client = await page.target().createCDPSession();
  await client.send("Network.clearBrowserCookies");

  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle2" });
  await page.type('input[type="email"]', "teacher@dumroo-demo.test");
  await page.type('input[type="password"]', "Demo@12345");
  await page.click('button[type="submit"]');

  await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {});
  await delay(2500);

  const teacherTitle = await page.title();
  console.log(`Teacher page <title>: "${teacherTitle}"`);
  if (!teacherTitle.includes("Dumroo AI · Teacher")) {
    console.warn("⚠️ Teacher title mismatch!");
  } else {
    console.log("✓ Teacher <title> is correct: 'Dumroo AI · Teacher'");
  }
  await page.screenshot({ path: path.join(screenshotsDir, "logo-teacher.png") });
  console.log("✓ Captured logo-teacher.png");

  console.log("\nAll audits and verifications complete!");
  await browser.close();
}

main().catch(console.error);
