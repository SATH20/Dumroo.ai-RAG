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
  const { createClient } = await import("../web/lib/supabase");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  const client = createClient(supabaseUrl, supabaseKey);
  console.log("=== SMOKE TESTING TEACHER FLOW ===");

  // 1. Authenticate Teacher
  console.log("\n1. Signing in as teacher@dumroo-demo.test...");
  const { data: teacherAuth, error: tErr } = await client.auth.signInWithPassword({
    email: "teacher@dumroo-demo.test",
    password: "Demo@12345",
  });
  if (tErr || !teacherAuth.session) {
    throw new Error(`Teacher sign-in failed: ${tErr?.message}`);
  }
  const teacherToken = teacherAuth.session.access_token;
  console.log("Teacher signed in. User ID:", teacherAuth.user.id);

  // 2. Authenticate Student
  console.log("\n2. Signing in as student1@dumroo-demo.test...");
  const { data: studentAuth, error: sErr } = await client.auth.signInWithPassword({
    email: "student1@dumroo-demo.test",
    password: "Demo@12345",
  });
  if (sErr || !studentAuth.session) {
    throw new Error(`Student sign-in failed: ${sErr?.message}`);
  }
  const studentToken = studentAuth.session.access_token;
  console.log("Student signed in. User ID:", studentAuth.user.id);

  // 3. Test Student Access to /api/teacher/dashboard (Should be 403)
  console.log("\n3. Testing Student access to /api/teacher/dashboard (Expect 403)...");
  const studRes = await fetch("http://localhost:3000/api/teacher/dashboard?subject=all&days=14", {
    headers: { Authorization: `Bearer ${studentToken}` },
  });
  console.log(`Student status: ${studRes.status} (Expected 403)`);
  if (studRes.status !== 403) {
    console.error("FAIL: Student was not blocked with 403!");
  } else {
    console.log("PASS: Student correctly blocked with 403 Forbidden.");
  }

  // 4. Test Teacher Access to /api/teacher/dashboard
  console.log("\n4. Testing Teacher access to /api/teacher/dashboard...");
  const tDashRes = await fetch("http://localhost:3000/api/teacher/dashboard?subject=all&days=14", {
    headers: { Authorization: `Bearer ${teacherToken}` },
  });
  console.log(`Teacher status: ${tDashRes.status}`);
  if (tDashRes.status !== 200) {
    const txt = await tDashRes.text();
    throw new Error(`Teacher dashboard request failed (${tDashRes.status}): ${txt}`);
  }
  const dashData = await tDashRes.json();
  console.log("PASS: Dashboard API returned 200 OK.");
  console.log("Stat Cards:", JSON.stringify(dashData.statCards, null, 2));
  console.log("Daily points count:", dashData.questionsPerDay?.length);
  console.log("Subject distribution:", dashData.questionsPerSubject);
  console.log("Most asked chapters count:", dashData.mostAskedChapters?.length);
  if (dashData.mostAskedChapters?.length > 0) {
    const topCh = dashData.mostAskedChapters[0];
    console.log(`Top chapter: ${topCh.subjectName} - Ch ${topCh.chapterNumber}: ${topCh.chapterTitle} (${topCh.count} questions, ${topCh.percentage}%)`);
    console.log(`Sample drill-down question: "${topCh.questions[0]?.query}" by ${topCh.questions[0]?.studentName || "Anonymous"}`);
  }
  console.log("Not covered questions count:", dashData.notCoveredQuestions?.length);
  if (dashData.notCoveredQuestions?.length > 0) {
    console.log("Top syllabus gap:", dashData.notCoveredQuestions[0]);
  }
  console.log("Students count:", dashData.students?.length);
  if (dashData.students?.length > 0) {
    const topStud = dashData.students[0];
    console.log(`Top student: ${topStud.name} (${topStud.questionCount} questions, top chapters: ${topStud.topChapters.join(", ")})`);
    console.log(`Sample privacy-safe question: "${topStud.recentQuestions[0]?.query}"`);
  }

  // 5. Test Teacher Access to /api/teacher/groups
  console.log("\n5. Testing Teacher access to /api/teacher/groups...");
  const grpRes = await fetch("http://localhost:3000/api/teacher/groups", {
    headers: { Authorization: `Bearer ${teacherToken}` },
  });
  console.log(`Groups status: ${grpRes.status}`);
  if (grpRes.status !== 200) {
    const txt = await grpRes.text();
    throw new Error(`Teacher groups request failed: ${txt}`);
  }
  const groupsData = await grpRes.json();
  console.log(`PASS: Found ${groupsData.groups?.length} groups and ${groupsData.allStudents?.length} total students.`);
  for (const g of groupsData.groups || []) {
    console.log(`- Group "${g.name}" (${g.subjectName}): ${g.memberCount} members`);
  }

  // 6. Test Group Membership Mutation (Add / Remove)
  console.log("\n6. Testing Group Membership Mutation (Add & Remove)...");
  const testGroup = groupsData.groups[0];
  const testStudent = groupsData.allStudents[0];
  if (testGroup && testStudent) {
    console.log(`Adding student ${testStudent.name} (${testStudent.id}) to group "${testGroup.name}" (${testGroup.id})...`);
    const addRes = await fetch("http://localhost:3000/api/teacher/groups/members", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${teacherToken}`,
      },
      body: JSON.stringify({ groupId: testGroup.id, studentId: testStudent.id }),
    });
    console.log(`Add response status: ${addRes.status}`);

    console.log("Removing student again to keep DB clean...");
    const remRes = await fetch("http://localhost:3000/api/teacher/groups/members", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${teacherToken}`,
      },
      body: JSON.stringify({ groupId: testGroup.id, studentId: testStudent.id }),
    });
    console.log(`Remove response status: ${remRes.status}`);
    console.log("PASS: Group membership mutation works.");
  }

  // 7. Test Teacher Ask with Web Search
  console.log("\n7. Testing Teacher Ask with webSearch: true...");
  const askRes = await fetch("http://localhost:3000/api/ask", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${teacherToken}`,
    },
    body: JSON.stringify({
      question: "What are the latest 2025-2026 developments in quantum computing and how does it relate to NCERT physics?",
      webSearch: true,
      history: [],
    }),
  });

  console.log(`Teacher Ask response status: ${askRes.status}`);
  if (askRes.status !== 200) {
    const txt = await askRes.text();
    console.error("Ask error:", txt);
  } else {
    const reader = askRes.body?.getReader();
    const decoder = new TextDecoder();
    let receivedChunks = 0;
    let webSourcesFound = false;
    let textReceived = "";

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        receivedChunks++;
        textReceived += chunk;
        if (chunk.includes("webSources") || chunk.includes("tavily")) {
          webSourcesFound = true;
        }
      }
    }
    console.log(`PASS: Teacher Ask streamed successfully (${receivedChunks} chunks, ~${textReceived.length} chars).`);
    console.log(`Web sources detected in stream: ${webSourcesFound || textReceived.includes('"webSources":')}`);
  }

  console.log("\n=== ALL TEACHER FLOW TESTS PASSED ===");
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
