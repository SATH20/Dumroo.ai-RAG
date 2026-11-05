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
  const { supabaseServer } = await import("../web/lib/supabase");

  console.log("==================================================");
  console.log("TESTING ITEM 1: CREATE STUDENT FORM & API");
  console.log("==================================================");

  // Sign in as teacher
  const { data: authData, error: loginErr } = await supabaseServer.auth.signInWithPassword({
    email: "teacher@dumroo-demo.test",
    password: "Demo@12345",
  });
  if (loginErr || !authData.session) {
    console.error("Teacher login failed:", loginErr);
    return;
  }
  const token = authData.session.access_token;
  console.log("✓ Teacher logged in successfully.");

  // Fetch groups to test enrollment
  const { data: groups } = await supabaseServer.from("groups").select("id, name");
  const testGroup = groups?.[0];
  console.log(`Using test group: ${testGroup?.name} (${testGroup?.id})`);

  // Test 1: Empty Name
  const res1 = await fetch("http://localhost:3000/api/teacher/students", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({
      fullName: "",
      email: "valid@dumroo-demo.test",
      password: "password123",
      groupIds: [],
    }),
  });
  const data1 = await res1.json();
  console.log(`Test 1 (Empty Name): status=${res1.status}, error="${data1.error}" -> ${res1.status === 400 ? "PASS" : "FAIL"}`);

  // Test 2: Invalid Email
  const res2 = await fetch("http://localhost:3000/api/teacher/students", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({
      fullName: "Test Student",
      email: "not-an-email",
      password: "password123",
      groupIds: [],
    }),
  });
  const data2 = await res2.json();
  console.log(`Test 2 (Invalid Email): status=${res2.status}, error="${data2.error}" -> ${res2.status === 400 ? "PASS" : "FAIL"}`);

  // Test 3: Short Password
  const res3 = await fetch("http://localhost:3000/api/teacher/students", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({
      fullName: "Test Student",
      email: "valid@dumroo-demo.test",
      password: "123",
      groupIds: [],
    }),
  });
  const data3 = await res3.json();
  console.log(`Test 3 (Short Password): status=${res3.status}, error="${data3.error}" -> ${res3.status === 400 ? "PASS" : "FAIL"}`);

  // Test 4: Valid Student Creation with Group Enrollment
  const testEmail = `new.student.${Date.now()}@dumroo-demo.test`;
  const res4 = await fetch("http://localhost:3000/api/teacher/students", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({
      fullName: "Kavya Verma",
      email: testEmail,
      password: "SecurePassword123!",
      groupIds: testGroup ? [testGroup.id] : [],
    }),
  });
  const data4 = await res4.json();
  console.log(`Test 4 (Valid Student Creation): status=${res4.status}, data=`, data4);

  if (res4.status === 200 && data4.student?.id) {
    const createdId = data4.student.id;
    // Verify Profile
    const { data: prof } = await supabaseServer.from("profiles").select("*").eq("id", createdId).single();
    console.log("✓ Profile verified:", prof?.full_name, `[${prof?.role}]`);

    // Verify Group Membership
    const { data: mem } = await supabaseServer.from("group_members").select("*").eq("student_id", createdId);
    console.log(`✓ Group memberships verified: count=${mem?.length}`);

    // Clean up
    await supabaseServer.from("group_members").delete().eq("student_id", createdId);
    await supabaseServer.from("profiles").delete().eq("id", createdId);
    await supabaseServer.auth.admin.deleteUser(createdId);
    console.log("✓ Cleaned up test student user & memberships.");
  }
}

main().catch(console.error);
