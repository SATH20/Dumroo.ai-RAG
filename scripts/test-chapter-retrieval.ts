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

async function testQuery(q: string) {
  const { runRagPipeline } = await import("../web/lib/rag");
  console.log(`\n==================================================`);
  console.log(`TESTING DIRECT CHAPTER QUERY: "${q}"`);
  console.log(`==================================================`);
  const res = await runRagPipeline({ question: q, isTeacher: true } as any);
  console.log("Refusal:", res.refusal);
  console.log("Sources:", res.metadata?.sources);
  console.log("Images count:", res.metadata?.images?.length);
  let text = "";
  if (res.stream) {
    for await (const evt of res.stream) {
      if (evt.type === "token") text += evt.data.delta;
    }
  }
  console.log(`Response preview (first 300 chars):\n${text.slice(0, 300)}...`);
  console.log(`Citations found:`, text.match(/\[(?:Physics|Biology|NCERT)[^\]]+\]/g)?.slice(0, 5));
}

async function main() {
  await testQuery("summarize Physics Part 1 chapter 4");
  await testQuery("make a 5-question quiz on Biology chapter 11");
}

main().catch(console.error);
