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
  const { supabaseServer } = await import("../web/lib/supabase");

  console.log("=== TESTING TEACHER AGGREGATIONS DIRECTLY ===");

  // 1. Check Query Logs count
  const { count, error: qlErr } = await supabaseServer
    .from("query_logs")
    .select("id", { count: "exact", head: true });
  console.log("Total Query Logs count in DB:", count, "error:", qlErr);

  // 2. Test fetching chapters with books
  const { data: chaptersData, error: chapErr } = await supabaseServer
    .from("chapters")
    .select("id, number, title, book_id, books:book_id (id, title, part, subject_id, subjects:subject_id (name))")
    .limit(3);
  console.log("Sample chapters joined:", chaptersData, "error:", chapErr);

  // 3. Test groups with members
  const { data: groups, error: grpErr } = await supabaseServer
    .from("groups")
    .select("id, name, subject_id, subjects:subject_id (id, name)");
  console.log("Groups count:", groups?.length, "error:", grpErr);

  // 4. Test students count
  const { data: students, error: studErr } = await supabaseServer
    .from("profiles")
    .select("id, full_name, role")
    .eq("role", "student");
  console.log("Students count:", students?.length, "error:", studErr);
}

run().catch(console.error);
