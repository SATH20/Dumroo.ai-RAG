import fs from "fs";
import path from "path";

// Load .env.local if not already in process.env
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
  console.log("Testing RAG pipeline with 'Who won the 2018 FIFA World Cup?'...");
  const res = await runRagPipeline({ question: "Who won the 2018 FIFA World Cup?" });
  console.log("Standalone query:", res.standaloneQuery);
  console.log("Top similarity:", res.topSimilarity);
  console.log("Refusal:", res.refusal);
  if (res.refusal) {
    console.log("Refusal reason:", res.refusalReason, "Message:", res.refusalText);
  }

  console.log("\nTesting RAG pipeline with 'Explain digestion in the human stomach'...");
  const res2 = await runRagPipeline({ question: "Explain digestion in the human stomach" });
  console.log("Standalone query:", res2.standaloneQuery);
  console.log("Top similarity:", res2.topSimilarity);
  console.log("Refusal:", res2.refusal);
  if (res2.stream) {
    for await (const evt of res2.stream) {
      if (evt.type === "token") process.stdout.write(evt.data.delta);
      if (evt.type === "refusal") console.log("\n[REFUSAL EVENT]:", evt.data.message);
      if (evt.type === "done") console.log("\n[DONE EVENT]:", evt.data);
    }
  }
}

main().catch(console.error);
