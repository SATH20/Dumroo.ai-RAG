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

async function testScenario(
  label: string,
  question: string,
  webSearch: boolean,
  teacherToken: string
) {
  console.log(`\n============================================================`);
  console.log(`TEST SCENARIO: ${label}`);
  console.log(`Question: "${question}" | Web Search: ${webSearch ? "ON" : "OFF"}`);
  console.log(`============================================================`);

  const res = await fetch("http://localhost:3000/api/ask", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${teacherToken}`,
    },
    body: JSON.stringify({
      question,
      webSearch,
      history: [],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Request failed [${res.status}]: ${errText}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body reader");

  const decoder = new TextDecoder();
  let buffer = "";
  let metadata: any = null;
  let fullText = "";
  let isRefusal = false;
  let refusalMessage = "";
  let isCutoff = false;
  let modelUsed = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n\n");
    buffer = lines.pop() || "";

    for (const block of lines) {
      const trimmed = block.trim();
      if (!trimmed) continue;

      let event = "message";
      let dataStr = "";
      for (const line of trimmed.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        if (line.startsWith("data:")) dataStr = line.slice(5).trim();
      }

      if (!dataStr) continue;
      let data: any = {};
      try {
        data = JSON.parse(dataStr);
      } catch {
        continue;
      }

      if (event === "meta") {
        metadata = data;
      } else if (event === "token") {
        fullText += data.delta;
      } else if (event === "refusal") {
        isRefusal = true;
        refusalMessage = data.message;
      } else if (event === "cutoff") {
        isCutoff = true;
      } else if (event === "done") {
        modelUsed = data.modelUsed;
      }
    }
  }

  console.log(`\n--- RESULTS FOR: ${label} ---`);
  console.log(`Refusal: ${isRefusal}`);
  if (isRefusal) {
    console.log(`Refusal Message: ${refusalMessage}`);
  }
  console.log(`Model Used: ${modelUsed}`);
  console.log(`Cutoff event triggered: ${isCutoff}`);
  console.log(`Full Text Length: ${fullText.length} characters`);

  // Check sources
  const sourcesCount = metadata?.sources?.length || 0;
  const imagesCount = metadata?.images?.length || 0;
  const webSources = metadata?.webSources || [];
  const webSourcesCount = webSources.length;

  console.log(`NCERT Textbook Sources count: ${sourcesCount}`);
  if (sourcesCount > 0) {
    console.log(`Sources:`, metadata.sources.map((s: any) => `${s.book} Ch ${s.chapterNumber} (${s.chapterTitle})`));
  }
  console.log(`NCERT Textbook Images count: ${imagesCount}`);
  console.log(`Web Sources count: ${webSourcesCount}`);

  // Check URL deduplication
  const urls = webSources.map((ws: any) => ws.url);
  const uniqueUrls = new Set(urls);
  const hasDuplicateUrls = urls.length !== uniqueUrls.size;
  console.log(`Web Sources URLs (${urls.length}):`, urls);
  console.log(`Duplicate URLs detected: ${hasDuplicateUrls}`);

  // Check ending / completeness of fullText
  const trimmed = fullText.trim();
  const endsWithPunct = /[.!?]\s*(\*\*|"|'|\)|\])?$/.test(trimmed) || /\$\$$/.test(trimmed);
  console.log(`Answer complete (ends with proper punctuation): ${endsWithPunct}`);
  console.log(`\n--- First 300 chars of answer ---:\n${fullText.slice(0, 300)}...`);
  console.log(`\n--- Last 300 chars of answer ---:\n...${fullText.slice(-300)}`);

  return {
    isRefusal,
    refusalMessage,
    fullText,
    sourcesCount,
    imagesCount,
    webSourcesCount,
    hasDuplicateUrls,
    isCutoff,
    endsWithPunct,
  };
}

async function run() {
  const { createClient } = await import("../web/lib/supabase");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const client = createClient(supabaseUrl, supabaseKey);

  console.log("Signing in as teacher@dumroo-demo.test...");
  const { data: auth, error } = await client.auth.signInWithPassword({
    email: "teacher@dumroo-demo.test",
    password: "Demo@12345",
  });
  if (error || !auth.session) {
    throw new Error(`Login failed: ${error?.message}`);
  }
  const token = auth.session.access_token;

  // Scenario A: "what is python language" with web search ON
  const resA = await testScenario(
    "Scenario A: Off-book question with Web Search ON ('what is python language')",
    "what is python language",
    true,
    token
  );

  // Scenario B: In-book question with web search ON
  const resB = await testScenario(
    "Scenario B: In-book question with Web Search ON ('Explain Newton second law and momentum')",
    "Explain Newton's second law and linear momentum",
    true,
    token
  );

  // Scenario C: Same off-book question with web search OFF
  const resC = await testScenario(
    "Scenario C: Off-book question with Web Search OFF ('what is python language')",
    "what is python language",
    false,
    token
  );

  console.log("\n============================================================");
  console.log("FINAL VERIFICATION SUMMARY:");
  console.log("============================================================");
  console.log(`Scenario A (Off-book, Web ON):`);
  console.log(`- Zero textbook sources: ${resA.sourcesCount === 0 ? "PASS" : "FAIL"}`);
  console.log(`- Zero textbook images: ${resA.imagesCount === 0 ? "PASS" : "FAIL"}`);
  console.log(`- Web sources present: ${resA.webSourcesCount > 0 ? "PASS" : "FAIL"}`);
  console.log(`- No duplicate URLs: ${!resA.hasDuplicateUrls ? "PASS" : "FAIL"}`);
  console.log(`- Answer complete (no truncation): ${resA.endsWithPunct && !resA.isCutoff ? "PASS" : "FAIL"}`);

  console.log(`\nScenario B (In-book, Web ON):`);
  console.log(`- Textbook sources present: ${resB.sourcesCount > 0 ? "PASS" : "FAIL"}`);
  console.log(`- Web sources present: ${resB.webSourcesCount > 0 ? "PASS" : "FAIL"}`);
  console.log(`- Answer complete: ${resB.endsWithPunct && !resB.isCutoff ? "PASS" : "FAIL"}`);

  console.log(`\nScenario C (Off-book, Web OFF):`);
  console.log(`- Correctly refused: ${resC.isRefusal ? "PASS" : "FAIL"}`);
  console.log(`- Zero textbook sources: ${resC.sourcesCount === 0 ? "PASS" : "FAIL"}`);
  console.log(`============================================================\n`);
}

run().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
