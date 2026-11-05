import fs from "fs";
import path from "path";

// Load web/.env.local synchronously before importing any lib
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

function checkCompleteSentence(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const singleDollars = (trimmed.match(/(?<!\$)\$(?!\$)/g) || []).length;
  if (singleDollars % 2 !== 0) return false;
  const doubleDollars = (trimmed.match(/\$\$/g) || []).length;
  if (doubleDollars % 2 !== 0) return false;
  const validEnd = /[.!?]\s*(\*\*|"|'|\)|\])?$/.test(trimmed) || /\$\$$/.test(trimmed) || /\]$/.test(trimmed);
  return validEnd;
}

async function runTests() {
  const { runRagPipeline } = await import("../web/lib/rag");
  console.log("=========================================================================================");
  console.log("TESTING IMMEDIATE FIXES: CASE 17, 5 REFUSALS, AND 3X SENTENCE COMPLETION");
  console.log("=========================================================================================\n");

  // 1. Test Case 17 (Follow-up: "explain the light reaction in more detail" after "photosynthesis")
  console.log("1. Testing Case 17 (Photosynthesis -> 'explain the light reaction in more detail')...");
  const initRes = await runRagPipeline({ question: "photosynthesis" });
  let initText = "";
  if (initRes.stream) {
    for await (const evt of initRes.stream) {
      if (evt.type === "token") initText += evt.data.delta;
    }
  }
  const history = [
    { role: "user", content: "photosynthesis" },
    {
      role: "assistant",
      content: initText.slice(0, 600),
      chapterIds: initRes.metadata.sources.map((s) => s.chapterId),
      sources: initRes.metadata.sources,
    },
  ];

  const case17Res = await runRagPipeline({
    question: "explain the light reaction in more detail",
    history,
  });
  let case17Answered = false;
  let case17Text = "";
  if (!case17Res.refusal && case17Res.stream) {
    for await (const evt of case17Res.stream) {
      if (evt.type === "token") case17Text += evt.data.delta;
      if (evt.type === "done") case17Answered = evt.data.answered;
    }
  }
  const case17Sources = case17Res.metadata?.sources || [];
  const foundBio11 = case17Sources.some((s: any) => s.book?.toLowerCase().includes("biology") && s.chapterNumber === 11);
  console.log(`Case 17 Result: Answered=${case17Answered}, Found Biology Ch 11=${foundBio11}, Model=${case17Res.metadata?.modelUsed || "none"}`);
  console.log(`Status: ${case17Answered && foundBio11 ? "✓ PASS" : "✗ FAIL"}\n`);

  // 2. Test 5 Refusal Cases
  console.log("2. Testing 5 Refusal Cases (must all refuse)...");
  const refusals = [
    "Who won the 2018 FIFA World Cup?",
    "Write a Python function to sort a list",
    "What is the capital of France?",
    "Explain digestion in the human stomach",
    "How do I cook pasta?",
  ];

  for (const q of refusals) {
    const res = await runRagPipeline({ question: q });
    let answered = false;
    if (!res.refusal && res.stream) {
      for await (const evt of res.stream) {
        if (evt.type === "done") answered = evt.data.answered;
      }
    }
    console.log(`  "${q}" -> Answered: ${answered} (Refusal: ${!answered}) | TopSim: ${res.metadata?.topSimilarity?.toFixed(4)} | ${!answered ? "✓ PASS" : "✗ FAIL"}`);
  }

  // 3. Test 3x Sentence Completion
  console.log("\n3. Testing 3x Sentence Completion on 'Explain Newton's second law'...");
  let completionsPass = true;
  for (let trial = 1; trial <= 3; trial++) {
    const res = await runRagPipeline({ question: "Explain Newton's second law" });
    let fullText = "";
    let isCutoff = false;
    if (res.stream) {
      for await (const evt of res.stream) {
        if (evt.type === "token") fullText += evt.data.delta;
        if (evt.type === "done") isCutoff = !!evt.data.cutoff;
      }
    }
    const isComplete = checkCompleteSentence(fullText);
    const pass = !isCutoff && isComplete;
    if (!pass) completionsPass = false;
    const endSnippet = fullText.trim().slice(-60).replace(/\n/g, " ");
    console.log(`  Trial ${trial}/3: ${pass ? "✓ COMPLETE" : "✗ INCOMPLETE"} | Cutoff: ${isCutoff} | Ends with: "...${endSnippet}"`);
  }

  console.log(`\nOverall Completion Test: ${completionsPass ? "✓ ALL PASS" : "✗ SOME FAILED"}`);
}

runTests().catch(console.error);