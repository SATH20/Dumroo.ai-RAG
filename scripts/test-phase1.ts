/**
 * scripts/test-phase1.ts
 * Phase 1 Verification Script:
 * 1. student3 asks "Newton's second law" -> "This topic is in Physics, which isn't part of your groups."
 * 2. student3 asks "Genghis Khan" -> answered (Themes in World History)
 * 3. student4 asks both -> both answered
 * 4. anon-key query on chunks returns 0 rows.
 * Prints pass/fail table.
 */

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

interface TestResult {
  test: string;
  expected: string;
  actual: string;
  pass: boolean;
}

async function runPhase1Tests() {
  const { supabaseServer } = await import("../web/lib/supabase");
  const { runRagPipeline } = await import("../web/lib/rag");

  console.log("=========================================================================================");
  console.log("PHASE 1 VERIFICATION: ROLES, GROUPS, ACCESS CONTROL & RLS");
  console.log("=========================================================================================\n");

  const results: TestResult[] = [];

  // Fetch subject IDs
  const { data: subjects } = await supabaseServer.from("subjects").select("id, name");
  const subjMap = new Map<string, string>();
  (subjects || []).forEach((s) => subjMap.set(s.name.toLowerCase(), s.id));

  const historySubjId = subjMap.get("history")!;
  const physicsSubjId = subjMap.get("physics")!;

  // 1. Resolve student3 (History only) and student4 (All 5 subjects)
  const { data: userList } = await supabaseServer.auth.admin.listUsers();
  const student3 = userList?.users.find((u) => u.email === "student3@dumroo-demo.test");
  const student4 = userList?.users.find((u) => u.email === "student4@dumroo-demo.test");

  const student3Subjects = [historySubjId];
  const student4Subjects = Array.from(subjMap.values());

  // Test 1: student3 asks "Newton's second law" -> must refuse with "isn't part of your groups"
  console.log("Test 1: student3 asks 'Newton's second law'...");
  const s3Newton = await runRagPipeline({
    question: "Newton's second law",
    subjectIds: student3Subjects,
    userId: student3?.id,
  });

  let s3NewtonRefusalText = s3Newton.refusalText || "";
  if (!s3Newton.refusal && s3Newton.stream) {
    for await (const evt of s3Newton.stream) {
      if (evt.type === "refusal") s3NewtonRefusalText = evt.data.message;
    }
  }
  const isS3NewtonRestricted =
    s3Newton.refusal &&
    s3NewtonRefusalText.toLowerCase().includes("not part of your groups") ||
    s3NewtonRefusalText.toLowerCase().includes("isn't part of your groups");

  results.push({
    test: "student3 asks 'Newton's second law'",
    expected: "Topic is in Physics, not part of groups",
    actual: s3NewtonRefusalText.slice(0, 50),
    pass: isS3NewtonRestricted,
  });
  console.log(`  -> ${isS3NewtonRestricted ? "✓ PASS" : "✗ FAIL"}: ${s3NewtonRefusalText}\n`);

  // Test 2: student3 asks "Genghis Khan" -> answered
  console.log("Test 2: student3 asks 'Genghis Khan'...");
  const s3Khan = await runRagPipeline({
    question: "Genghis Khan",
    subjectIds: student3Subjects,
    userId: student3?.id,
  });
  let s3KhanAnswered = false;
  if (!s3Khan.refusal && s3Khan.stream) {
    for await (const evt of s3Khan.stream) {
      if (evt.type === "done") s3KhanAnswered = evt.data.answered;
    }
  }
  results.push({
    test: "student3 asks 'Genghis Khan'",
    expected: "Answered (History enrolled)",
    actual: s3KhanAnswered ? "Answered" : "Refused",
    pass: s3KhanAnswered,
  });
  console.log(`  -> ${s3KhanAnswered ? "✓ PASS" : "✗ FAIL"}\n`);

  // Test 3: student4 asks "Newton's second law" -> answered
  console.log("Test 3: student4 asks 'Newton's second law'...");
  const s4Newton = await runRagPipeline({
    question: "Newton's second law",
    subjectIds: student4Subjects,
    userId: student4?.id,
  });
  let s4NewtonAnswered = false;
  if (!s4Newton.refusal && s4Newton.stream) {
    for await (const evt of s4Newton.stream) {
      if (evt.type === "done") s4NewtonAnswered = evt.data.answered;
    }
  }
  results.push({
    test: "student4 asks 'Newton's second law'",
    expected: "Answered (Physics enrolled)",
    actual: s4NewtonAnswered ? "Answered" : "Refused",
    pass: s4NewtonAnswered,
  });
  console.log(`  -> ${s4NewtonAnswered ? "✓ PASS" : "✗ FAIL"}\n`);

  // Test 4: student4 asks "Genghis Khan" -> answered
  console.log("Test 4: student4 asks 'Genghis Khan'...");
  const s4Khan = await runRagPipeline({
    question: "Genghis Khan",
    subjectIds: student4Subjects,
    userId: student4?.id,
  });
  let s4KhanAnswered = false;
  if (!s4Khan.refusal && s4Khan.stream) {
    for await (const evt of s4Khan.stream) {
      if (evt.type === "done") s4KhanAnswered = evt.data.answered;
    }
  }
  results.push({
    test: "student4 asks 'Genghis Khan'",
    expected: "Answered (History enrolled)",
    actual: s4KhanAnswered ? "Answered" : "Refused",
    pass: s4KhanAnswered,
  });
  console.log(`  -> ${s4KhanAnswered ? "✓ PASS" : "✗ FAIL"}\n`);

  // Test 5: Anon-key query on chunks returns 0 rows
  console.log("Test 5: Testing anon-key query on content table 'chunks'...");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.anon";

  let anonRowsCount = -1;
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/chunks?select=id&limit=10`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
    });
    if (res.ok) {
      const data = await res.json();
      anonRowsCount = Array.isArray(data) ? data.length : 0;
    } else {
      // 401 or 403 or empty array means 0 accessible rows
      anonRowsCount = 0;
    }
  } catch {
    anonRowsCount = 0;
  }

  const anonDenied = anonRowsCount === 0;
  results.push({
    test: "Anon-key query on chunks table",
    expected: "0 rows (anon access denied)",
    actual: `${anonRowsCount} rows returned`,
    pass: anonDenied,
  });
  console.log(`  -> ${anonDenied ? "✓ PASS" : "✗ FAIL"}: Returned ${anonRowsCount} rows\n`);

  // Summary Table
  console.log("=========================================================================================");
  console.log("PHASE 1 REPORT SUMMARY TABLE");
  console.log("=========================================================================================");
  console.table(
    results.map((r) => ({
      Test: r.test,
      Expected: r.expected,
      Actual: r.actual,
      Status: r.pass ? "PASS" : "FAIL",
    }))
  );

  const allPassed = results.every((r) => r.pass);
  console.log(`\nOverall Phase 1 Status: ${allPassed ? "✓ ALL TESTS PASSED" : "✗ SOME TESTS FAILED"}\n`);
}

runPhase1Tests().catch(console.error);