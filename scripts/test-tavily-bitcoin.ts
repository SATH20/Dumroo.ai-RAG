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

async function testBitcoin() {
  const { searchTavily } = await import("../web/lib/tavily");
  const query = "What is the current price of Bitcoin in 2025?";
  console.log("Testing searchTavily for query:", query);
  console.log("Tavily API key present?", !!process.env.TAVILY_API_KEY);

  try {
    const results = await searchTavily(query, 4);
    console.log(`Tavily returned ${results.length} results:`);
    results.forEach((r, idx) => {
      console.log(`[${idx + 1}] ${r.title} (${r.url})`);
      console.log(`    Snippet: ${r.content.slice(0, 100)}...`);
    });
  } catch (err) {
    console.error("Tavily search threw error:", err);
  }

  // Also test runRagPipeline with webSearch: true
  const { runRagPipeline } = await import("../web/lib/rag");
  console.log("\nTesting runRagPipeline with webSearch: true for Bitcoin query...");
  const ragRes = await runRagPipeline({
    question: query,
    webSearch: true,
    isTeacher: true,
  });

  console.log("ragRes refusal?", ragRes.refusal);
  console.log("ragRes refusalText:", ragRes.refusalText);
  console.log("ragRes webSources count:", ragRes.webSources?.length);

  if (ragRes.stream) {
    let full = "";
    for await (const chunk of ragRes.stream) {
      if (chunk.type === "token") full += chunk.data.delta;
      if (chunk.type === "refusal") console.log("Stream yielded refusal:", chunk.data);
    }
    console.log("Stream output preview:", full.slice(0, 300));
  }
}

testBitcoin().catch(console.error);
