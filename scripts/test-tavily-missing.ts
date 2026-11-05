import fs from "fs";
import path from "path";

// Load web/.env.local
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

async function main() {
  const { runRagPipeline } = await import("../web/lib/rag");
  const { searchTavily } = await import("../web/lib/tavily");

  console.log("==================================================");
  console.log("TESTING ITEM 3: TAVILY MISSING & BOOKS-ONLY BEHAVIOR");
  console.log("==================================================");

  // 1. Test searchTavily with unset key
  const originalKey = process.env.TAVILY_API_KEY;
  delete process.env.TAVILY_API_KEY;

  const emptyResults = await searchTavily("quantum computing", 3);
  console.log(`Tavily search without key returned ${emptyResults.length} results -> ${emptyResults.length === 0 ? "PASS" : "FAIL"}`);

  // 2. Test RAG in books-only mode (webSearch = false) for in-book question
  const inBookRes = await runRagPipeline({
    question: "Explain Newton's second law",
    webSearch: false,
  });
  console.log(`In-book query (webSearch: false): refusal=${inBookRes.refusal}, sources=${inBookRes.metadata.sources.length} -> ${!inBookRes.refusal && inBookRes.metadata.sources.length > 0 ? "PASS" : "FAIL"}`);

  // 3. Test RAG in books-only mode (webSearch = false) for off-book question
  const offBookRes = await runRagPipeline({
    question: "Who won the 2022 FIFA World Cup?",
    webSearch: false,
  });
  console.log(`Off-book query (webSearch: false): refusal=${offBookRes.refusal} -> ${offBookRes.refusal ? "PASS" : "FAIL"}`);

  // Restore key
  process.env.TAVILY_API_KEY = originalKey;
}

main().catch(console.error);
