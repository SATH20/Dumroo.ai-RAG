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

  const { data: allStudents } = await supabaseServer
    .from("profiles")
    .select("id")
    .eq("role", "student");
  const studentIds = new Set((allStudents || []).map((s) => s.id));

  const { data: allLogs } = await supabaseServer
    .from("query_logs")
    .select("id, user_id, query, answered, created_at");

  const totalBefore = allLogs?.length || 0;
  const answeredBefore = (allLogs || []).filter((l) => l.answered).length;
  const refusedBefore = totalBefore - answeredBefore;

  // Filter: MUST have user_id AND user_id must belong to a student
  const filteredLogs = (allLogs || []).filter((l) => l.user_id && studentIds.has(l.user_id));
  const totalAfter = filteredLogs.length;
  const answeredAfter = filteredLogs.filter((l) => l.answered).length;
  const refusedAfter = totalAfter - answeredAfter;

  console.log("=== DASHBOARD DATA TOTALS ===");
  console.log(`BEFORE filtering (all rows in query_logs):`);
  console.log(`  Total queries: ${totalBefore}`);
  console.log(`  Answered: ${answeredBefore}`);
  console.log(`  Not-covered / Refused: ${refusedBefore}`);
  console.log(`  With user_id IS NULL (test/eval/anon): ${(allLogs || []).filter((l) => !l.user_id).length}`);
  console.log(`  With teacher user_id: ${(allLogs || []).filter((l) => l.user_id && !studentIds.has(l.user_id)).length}`);

  console.log(`\nAFTER filtering (student user_id only, test/eval/teacher excluded):`);
  console.log(`  Total student queries: ${totalAfter}`);
  console.log(`  Answered: ${answeredAfter} (${((answeredAfter / totalAfter) * 100).toFixed(1)}%)`);
  console.log(`  Not-covered / Refused: ${refusedAfter} (${((refusedAfter / totalAfter) * 100).toFixed(1)}%)`);

  // Check 14-day window specifically (default dashboard view)
  const range14d = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const logs14dBefore = (allLogs || []).filter((l) => l.created_at >= range14d);
  const logs14dAfter = filteredLogs.filter((l) => l.created_at >= range14d);
  console.log(`\n14-Day Default Dashboard View:`);
  console.log(`  Before: ${logs14dBefore.length} rows`);
  console.log(`  After:  ${logs14dAfter.length} rows`);
}

main().catch(console.error);
