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
  const res = await runRagPipeline({ question: "How do I cook pasta?" });
  console.log("topSimilarity:", res.topSimilarity);
  console.log("res.refusal:", res.refusal);
  if (res.stream) {
    let t = "";
    for await (const evt of res.stream) {
      if (evt.type === "token") t += evt.data.delta;
      if (evt.type === "refusal") console.log("refusal evt:", evt.data);
      if (evt.type === "done") console.log("done evt:", evt.data);
    }
    console.log("Output text:\n", t);
  }
}

main().catch(console.error);
