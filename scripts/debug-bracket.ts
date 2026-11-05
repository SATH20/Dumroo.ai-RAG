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

async function test() {
  const { runRagPipeline } = await import("../web/lib/rag");
  const res = await runRagPipeline({ question: "what is newton law" });
  let text = "";
  if (res.stream) {
    for await (const chunk of res.stream) {
      if (chunk.type === "token") {
        if (chunk.data.delta.includes("[[")) {
          console.log("FOUND [[ IN DELTA:", JSON.stringify(chunk.data.delta));
        }
        text += chunk.data.delta;
      }
    }
  }
  const idx = text.indexOf("[[");
  console.log("Total text length:", text.length);
  console.log("Index of [[ in text:", idx);
  if (idx !== -1) {
    console.log("Context around [[ :", JSON.stringify(text.slice(Math.max(0, idx - 20), idx + 30)));
  } else {
    console.log("No [[ found in text!");
  }
}

test().catch(console.error);
