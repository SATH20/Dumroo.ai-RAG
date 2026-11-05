import puppeteer from "../web/node_modules/puppeteer-core";
import path from "path";
import fs from "fs";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function capture(url: string, outputFile: string, width: number, height: number) {
  const dir = path.dirname(outputFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
  });

  const page = await browser.newPage();
  await page.setViewport({ width, height });
  await page.goto(url, { waitUntil: "networkidle2" });
  await page.screenshot({ path: outputFile as any, fullPage: false });
  await browser.close();
  console.log(`Saved screenshot: ${outputFile} (${width}x${height})`);
}

async function main() {
  const args = process.argv.slice(2);
  const url = args[0] || "http://localhost:3000/login";
  const name = args[1] || "login";
  await capture(url, path.resolve(`screenshots/${name}-1440.png`), 1440, 900);
  await capture(url, path.resolve(`screenshots/${name}-390.png`), 390, 844);
}

main().catch(console.error);
