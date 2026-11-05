/**
 * scripts/seed.ts
 * Idempotent seed script using service role:
 * 1 Teacher: teacher@dumroo-demo.test (Demo@12345)
 * 5 Students: student1..5@dumroo-demo.test (Demo@12345)
 * 5 Groups (one per subject)
 * Group memberships:
 *   student1: Physics + Maths
 *   student2: Chemistry + Biology
 *   student3: History only
 *   student4: all five
 *   student5: Maths only
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

async function seed() {
  const { supabaseServer } = await import("../web/lib/supabase");

  console.log("=========================================================================================");
  console.log("SEEDING AUTH USERS, PROFILES, GROUPS, AND MEMBERSHIPS");
  console.log("=========================================================================================\n");

  const DEMO_PASSWORD = "Demo@12345";

  const usersToCreate = [
    { email: "teacher@dumroo-demo.test", name: "Prof. Sharma (Teacher)", role: "teacher" },
    { email: "student1@dumroo-demo.test", name: "Student 1 (Physics + Maths)", role: "student" },
    { email: "student2@dumroo-demo.test", name: "Student 2 (Chemistry + Biology)", role: "student" },
    { email: "student3@dumroo-demo.test", name: "Student 3 (History only)", role: "student" },
    { email: "student4@dumroo-demo.test", name: "Student 4 (All Subjects)", role: "student" },
    { email: "student5@dumroo-demo.test", name: "Student 5 (Maths only)", role: "student" },
  ];

  const userMap = new Map<string, string>(); // email -> userId

  // 1. Fetch existing auth users
  const { data: userList, error: listErr } = await supabaseServer.auth.admin.listUsers();
  if (listErr) {
    throw new Error(`Failed to list auth users: ${listErr.message}`);
  }

  for (const u of usersToCreate) {
    const existing = userList.users.find((eu) => eu.email?.toLowerCase() === u.email.toLowerCase());
    let userId: string;

    if (existing) {
      userId = existing.id;
      console.log(`User already exists: ${u.email} (${userId}), updating password & metadata...`);
      await supabaseServer.auth.admin.updateUserById(userId, {
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: u.name, role: u.role },
      });
    } else {
      console.log(`Creating user: ${u.email}...`);
      const { data: created, error: createErr } = await supabaseServer.auth.admin.createUser({
        email: u.email,
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: u.name, role: u.role },
      });
      if (createErr || !created.user) {
        throw new Error(`Failed to create ${u.email}: ${createErr?.message}`);
      }
      userId = created.user.id;
      console.log(`Created user ${u.email} -> ID: ${userId}`);
    }

    userMap.set(u.email, userId);

    // Upsert into profiles
    const { error: profErr } = await supabaseServer.from("profiles").upsert(
      {
        id: userId,
        full_name: u.name,
        role: u.role,
      },
      { onConflict: "id" }
    );
    if (profErr) {
      console.warn(`Could not upsert profile for ${u.email}:`, profErr.message);
    }
  }

  // 2. Fetch subjects
  const { data: subjects, error: subjErr } = await supabaseServer.from("subjects").select("id, name");
  if (subjErr || !subjects || subjects.length === 0) {
    throw new Error(`Failed to fetch subjects: ${subjErr?.message}`);
  }

  const subjectMap = new Map<string, string>(); // name.toLowerCase() -> id
  subjects.forEach((s) => subjectMap.set(s.name.toLowerCase(), s.id));

  // 3. Create 5 groups (one per subject)
  const groupSpecs = [
    { subject: "physics", name: "Physics - Section A" },
    { subject: "maths", name: "Mathematics - Section A" },
    { subject: "chemistry", name: "Chemistry - Section A" },
    { subject: "biology", name: "Biology - Section A" },
    { subject: "history", name: "History - Section A" },
  ];

  const groupMap = new Map<string, string>(); // subjectName -> groupId

  for (const g of groupSpecs) {
    const subjectId = subjectMap.get(g.subject);
    if (!subjectId) {
      console.warn(`Subject ${g.subject} not found in DB!`);
      continue;
    }

    // Check if group exists
    const { data: existingGroups } = await supabaseServer
      .from("groups")
      .select("id, name")
      .eq("subject_id", subjectId)
      .eq("name", g.name);

    let groupId: string;
    if (existingGroups && existingGroups.length > 0) {
      groupId = existingGroups[0].id;
      console.log(`Group exists: ${g.name} (${groupId})`);
    } else {
      const { data: createdGroup, error: grpErr } = await supabaseServer
        .from("groups")
        .insert({ subject_id: subjectId, name: g.name })
        .select()
        .single();
      if (grpErr || !createdGroup) {
        throw new Error(`Failed to create group ${g.name}: ${grpErr?.message}`);
      }
      groupId = createdGroup.id;
      console.log(`Created group: ${g.name} -> ID: ${groupId}`);
    }
    groupMap.set(g.subject, groupId);
  }

  // 4. Enroll students into groups
  // student1: Physics + Maths
  // student2: Chemistry + Biology
  // student3: History only
  // student4: all five
  // student5: Maths only
  const enrollments: Array<{ studentEmail: string; subjects: string[] }> = [
    { studentEmail: "student1@dumroo-demo.test", subjects: ["physics", "maths"] },
    { studentEmail: "student2@dumroo-demo.test", subjects: ["chemistry", "biology"] },
    { studentEmail: "student3@dumroo-demo.test", subjects: ["history"] },
    { studentEmail: "student4@dumroo-demo.test", subjects: ["physics", "maths", "chemistry", "biology", "history"] },
    { studentEmail: "student5@dumroo-demo.test", subjects: ["maths"] },
  ];

  // Clear existing group_members for clean idempotent re-seed
  for (const e of enrollments) {
    const studentId = userMap.get(e.studentEmail);
    if (!studentId) continue;
    await supabaseServer.from("group_members").delete().eq("student_id", studentId);

    for (const subj of e.subjects) {
      const groupId = groupMap.get(subj);
      if (!groupId) continue;
      const { error: memberErr } = await supabaseServer.from("group_members").insert({
        group_id: groupId,
        student_id: studentId,
      });
      if (memberErr) {
        console.warn(`Failed to enroll ${e.studentEmail} in ${subj}:`, memberErr.message);
      }
    }
    console.log(`Enrolled ${e.studentEmail} in: ${e.subjects.join(", ")}`);
  }

  console.log("\n=========================================================================================");
  console.log("SEED COMPLETED SUCCESSFULLY!");
  console.log("=========================================================================================");
  console.log("Demo Credentials (Password: Demo@12345 for all):");
  console.log("  Teacher: teacher@dumroo-demo.test (All Subjects)");
  console.log("  Student 1: student1@dumroo-demo.test (Physics, Maths)");
  console.log("  Student 2: student2@dumroo-demo.test (Chemistry, Biology)");
  console.log("  Student 3: student3@dumroo-demo.test (History only)");
  console.log("  Student 4: student4@dumroo-demo.test (All five subjects)");
  console.log("  Student 5: student5@dumroo-demo.test (Maths only)");
  console.log("=========================================================================================\n");
}

seed().catch(console.error);