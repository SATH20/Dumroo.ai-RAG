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
      process.env[k] = v;
    }
  }
}

async function runTest(question: string, webSearch: boolean) {
  const { runRagPipeline } = await import("../web/lib/rag");
  const result = await runRagPipeline({
    question,
    webSearch,
    isTeacher: true,
  });

  let fullText = "";
  let refusalMessage = "";
  let answered = false;
  let webCount = result.webSources?.length || 0;

  if (result.refusal) {
    return {
      answered: false,
      refusalText: result.refusalText,
      webCount,
      snippet: "",
    };
  }

  if (result.stream) {
    for await (const chunk of result.stream) {
      if (chunk.type === "token") {
        fullText += chunk.data.delta;
      } else if (chunk.type === "refusal") {
        refusalMessage = chunk.data.message;
      } else if (chunk.type === "meta") {
        webCount = chunk.data.webSources?.length || 0;
      } else if (chunk.type === "done") {
        answered = chunk.data.answered;
      }
    }
  }

  if (refusalMessage) {
    return {
      answered: false,
      refusalText: refusalMessage,
      webCount,
      snippet: "",
    };
  }

  return {
    answered: true,
    refusalText: null,
    webCount,
    snippet: fullText.trim().slice(0, 300).replace(/\n+/g, " "),
  };
}

async function main() {
  console.log("===============================================================================");
  console.log("  WEB SEARCH TOGGLE TEST SUITE (ON vs OFF)");
  console.log("===============================================================================\n");

  const testCases = [
    {
      label: "Test 1: Out-of-curriculum query ('what is java')",
      question: "what is java",
    },
    {
      label: "Test 2: General knowledge query ('who won the 2018 FIFA World Cup')",
      question: "who won the 2018 FIFA World Cup",
    },
    {
      label: "Test 3: In-curriculum syllabus query ('Newton\\'s second law and momentum')",
      question: "Explain Newton's second law and momentum",
    },
  ];

  const resultsTable: any[] = [];

  for (const tc of testCases) {
    console.log(`--- Running: ${tc.label} ---`);

    // A. Web Search OFF
    console.log(`  [Toggle OFF] Testing "${tc.question}" (books-only)...`);
    const offRes = await runTest(tc.question, false);
    console.log(`    -> Answered: ${offRes.answered} | Refusal: "${offRes.refusalText || 'None'}"`);

    // B. Web Search ON
    console.log(`  [Toggle ON] Testing "${tc.question}" (with web search)...`);
    const onRes = await runTest(tc.question, true);
    console.log(`    -> Answered: ${onRes.answered} | Web Sources: ${onRes.webCount} | Snippet: "${onRes.snippet.slice(0, 100)}..."\n`);

    resultsTable.push({
      Scenario: tc.question,
      "Toggle OFF (Answered)": offRes.answered ? "YES" : "NO (Refusal)",
      "Toggle OFF Message": offRes.refusalText?.slice(0, 45) || offRes.snippet.slice(0, 45),
      "Toggle ON (Answered)": onRes.answered ? "YES (Web Active)" : "NO",
      "Toggle ON Web Sources": onRes.webCount,
      "Toggle ON Snippet": onRes.snippet.slice(0, 60),
    });
  }

  console.log("===============================================================================");
  console.log("SUMMARY TABLE");
  console.log("===============================================================================");
  console.table(resultsTable);
}

main().catch(console.error);
