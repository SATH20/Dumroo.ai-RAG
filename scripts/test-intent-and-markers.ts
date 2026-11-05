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

async function run() {
  const { classifyIntent, getPersonalReply, extractTopicFromPersonalStatement } = await import("../web/lib/intent");
  const { extractStudentFacts } = await import("../web/lib/memory");
  const { runRagPipeline } = await import("../web/lib/rag");

  console.log("=== TEST 1: 'I find integration hard' ===");
  const intent1 = await classifyIntent("I find integration hard");
  console.log("Intent:", intent1);
  const topic1 = extractTopicFromPersonalStatement("I find integration hard");
  console.log("Topic:", topic1);
  const reply1 = await getPersonalReply("I find integration hard");
  console.log("Reply:", reply1);
  const facts1 = await extractStudentFacts("I find integration hard", []);
  console.log("Memory facts:", facts1, "Count:", facts1.length);
  const pass1 = intent1 === "PERSONAL" && facts1.length === 1 && reply1.toLowerCase().includes("class 12");
  console.log("TEST 1 PASS:", pass1);

  console.log("\n=== TEST 2: 'what is integration' ===");
  const intent2 = await classifyIntent("what is integration");
  console.log("Intent:", intent2);
  const res2 = await runRagPipeline({ question: "what is integration" });
  let text2 = "";
  let answered2 = false;
  if (res2.refusal) {
    answered2 = false;
    text2 = res2.refusalText;
  } else if (res2.stream) {
    for await (const chunk of res2.stream) {
      if (chunk.type === "token") text2 += chunk.data.delta;
      if (chunk.type === "done") answered2 = chunk.data.answered;
      if (chunk.type === "refusal") text2 = chunk.data.message;
    }
  }
  const sources2 = res2.metadata.sources || [];
  console.log("Answered:", answered2);
  console.log("Refusal Text:", text2);
  console.log("Sources count:", sources2.length);
  const pass2 = answered2 === false && (res2.refusal || !answered2) && sources2.length === 0;
  console.log("TEST 2 PASS:", pass2);

  console.log("\n=== TEST 3: 'what is newton law' ===");
  const intent3 = await classifyIntent("what is newton law");
  console.log("Intent:", intent3);
  const res3 = await runRagPipeline({ question: "what is newton law" });
  let text3 = "";
  let answered3 = false;
  if (res3.stream) {
    for await (const chunk of res3.stream) {
      if (chunk.type === "token") text3 += chunk.data.delta;
      if (chunk.type === "done") answered3 = chunk.data.answered;
    }
  }
  console.log("Answered:", answered3);
  console.log("Contains '[[':", text3.includes("[["));
  console.log("Sample text:", text3.slice(0, 150));
  const pass3 = answered3 === true && !text3.includes("[[");
  console.log("TEST 3 PASS:", pass3);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
