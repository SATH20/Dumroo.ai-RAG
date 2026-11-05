import fs from "fs";
import path from "path";

const envPath = path.resolve("web/.env.local");
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      process.env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
    }
  }
}

const keys = [
  { name: "PRIMARY", key: process.env.GEMINI_API_KEY },
  { name: "BACKUP1", key: process.env.GEMINI_API_KEY_BACKUP },
  { name: "BACKUP2", key: process.env.GEMINI_API_KEY_BACKUP_2 },
];

const models = [
  "gemini-flash-lite-latest",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash",
  "gemini-2.5-flash",
];

async function run() {
  for (const m of models) {
    for (const k of keys) {
      if (!k.key) continue;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${k.key}`;
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: "hi" }] }] }),
        });
        console.log(`[${m}] [${k.name}]: ${res.status}`);
        if (!res.ok) {
          const txt = await res.text();
          console.log(`   ${txt.slice(0, 100)}`);
        }
      } catch (err: any) {
        console.log(`[${m}] [${k.name}] Err: ${err.message}`);
      }
    }
  }
}

run().catch(console.error);
