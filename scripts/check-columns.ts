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
  
  // Test query_logs select
  const { data: ql, error: qlErr } = await supabaseServer.from("query_logs").select("*").limit(1);
  console.log("query_logs sample:", ql, "error:", qlErr);

  // Test chats select
  const { data: chats, error: chErr } = await supabaseServer.from("chats").select("*").limit(1);
  console.log("chats sample:", chats, "error:", chErr);

  // Test inserting mode into chats
  const testChatId = "00000000-0000-0000-0000-000000000000";
  const { error: testModeErr } = await supabaseServer.from("chats").insert({
    id: testChatId,
    user_id: "00000000-0000-0000-0000-000000000000",
    title: "Test",
    mode: "teacher"
  });
  console.log("Insert test chat mode error:", testModeErr);

  // Test inserting is_demo into query_logs
  const { error: testDemoErr } = await supabaseServer.from("query_logs").insert({
    query: "Test",
    is_demo: true,
  });
  console.log("Insert test is_demo error:", testDemoErr);
}

main().catch(console.error);
