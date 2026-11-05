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

async function main() {
  const { supabaseServer } = await import("../web/lib/supabase");
  console.log("Checking DB tables with service role...");
  const { data: subj, error: subjErr } = await supabaseServer.from("subjects").select("id, name");
  console.log("Subjects:", subj, subjErr);

  const { data: prof, error: profErr } = await supabaseServer.from("profiles").select("*").limit(1);
  console.log("Profiles table check:", { exists: !profErr, error: profErr?.message });

  const { data: groups, error: grpErr } = await supabaseServer.from("groups").select("*").limit(1);
  console.log("Groups table check:", { exists: !grpErr, error: grpErr?.message });

  const { data: ql, error: qlErr } = await supabaseServer.from("query_logs").select("*").limit(1);
  console.log("query_logs table check:", { exists: !qlErr, error: qlErr?.message });
}

main().catch(console.error);