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
      const k = trimmed.slice(0, eqIdx).trim();
      const v = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

async function testTavily() {
  const apiKey = process.env.TAVILY_API_KEY;
  console.log("Testing Tavily key:", apiKey?.slice(0, 10) + "...");
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query: "Newton second law of motion physics principles",
      max_results: 3
    })
  });

  console.log("Tavily HTTP status:", res.status);
  const data = await res.json();
  console.log("Tavily results count:", data.results?.length);
  if (data.results && data.results.length > 0) {
    console.log("Top result title:", data.results[0].title);
    console.log("Top result URL:", data.results[0].url);
  }
}

testTavily().catch(console.error);
