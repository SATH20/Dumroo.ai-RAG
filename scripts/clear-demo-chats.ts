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

const DEMO_EMAILS = [
  "teacher@dumroo-demo.test",
  "student1@dumroo-demo.test",
  "student2@dumroo-demo.test",
  "student3@dumroo-demo.test",
  "student4@dumroo-demo.test",
  "student5@dumroo-demo.test",
];

async function clearDemoChats() {
  const { supabaseServer } = await import("../web/lib/supabase");

  console.log("=== CLEARING DEMO ACCOUNT CHAT HISTORY ===");

  // 1. Get demo user IDs from auth.admin.listUsers()
  const { data: authUsersData, error: authErr } = await supabaseServer.auth.admin.listUsers();
  if (authErr || !authUsersData?.users) {
    console.error("Could not list auth users:", authErr);
    return;
  }

  const demoUsers = authUsersData.users.filter((u) => u.email && DEMO_EMAILS.includes(u.email));
  const userIds = demoUsers.map((u) => u.id);
  console.log(`Found ${demoUsers.length} demo profiles:`, demoUsers.map((u) => `${u.email} (${u.id})`));

  // 2. Fetch all chats for these users
  const { data: userChats, error: cErr } = await supabaseServer
    .from("chats")
    .select("id, title, user_id")
    .in("user_id", userIds);

  if (cErr) {
    console.error("Error fetching chats:", cErr);
    return;
  }

  const chatIds = (userChats || []).map((c) => c.id);
  console.log(`Found ${chatIds.length} existing chats to delete across demo accounts.`);

  // 3. Delete messages for these chats
  if (chatIds.length > 0) {
    const { error: msgErr } = await supabaseServer
      .from("messages")
      .delete()
      .in("chat_id", chatIds);

    if (msgErr) {
      console.error("Error deleting messages:", msgErr);
    } else {
      console.log(`Successfully deleted all messages for ${chatIds.length} chats.`);
    }

    // 4. Delete the chats
    const { error: delErr } = await supabaseServer
      .from("chats")
      .delete()
      .in("id", chatIds);

    if (delErr) {
      console.error("Error deleting chats:", delErr);
    } else {
      console.log(`Successfully deleted ${chatIds.length} chats.`);
    }
  }

  // 5. Clean any test query_logs (e.g. pasta, what is python QA queries)
  const { data: testLogs } = await supabaseServer
    .from("query_logs")
    .select("id, query")
    .or("query.ilike.%pasta%,query.ilike.%what is python%");

  if (testLogs && testLogs.length > 0) {
    await supabaseServer.from("query_logs").delete().in("id", testLogs.map((l) => l.id));
    console.log(`Cleaned ${testLogs.length} test entries from query_logs.`);
  }

  // 6. Verify 0 chats remain for all demo accounts
  const { data: remainingChats, error: remErr } = await supabaseServer
    .from("chats")
    .select("id, title, user_id")
    .in("user_id", userIds);

  console.log(`Verification: Remaining chats count for demo accounts = ${remainingChats?.length || 0}`);
  if ((remainingChats?.length || 0) === 0) {
    console.log("✓ ALL DEMO ACCOUNTS HAVE ZERO CHATS!");
  } else {
    console.error("WARNING: Remaining chats found:", remainingChats);
  }
}

clearDemoChats().catch(console.error);
