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

async function testTeacherChatRenameDelete() {
  const { createClient } = await import("../web/lib/supabase");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const client = createClient(supabaseUrl, supabaseKey);

  console.log("=== TESTING TEACHER CHAT RENAME & DELETE ===");

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

  const authHeaders = {
    Authorization: `Bearer ${teacherToken}`,
    "Content-Type": "application/json",
  };

  // 2. Create a new teacher chat
  const initialTitle = `Test Discussion ${Date.now()}`;
  console.log(`\n2. Creating new chat: "${initialTitle}"...`);
  const createRes = await fetch("http://localhost:3000/api/chats", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ title: initialTitle, mode: "teacher" }),
  });

  if (!createRes.ok) {
    throw new Error(`Create chat failed: ${createRes.status} ${await createRes.text()}`);
  }
  const createData = await createRes.json();
  const chatId = createData.chat.id;
  console.log(`Created chat ID: ${chatId}, Title: "${createData.chat.title}"`);

  // 3. Verify it is listed in GET /api/chats?mode=teacher
  console.log("\n3. Listing teacher chats...");
  const listRes1 = await fetch("http://localhost:3000/api/chats?mode=teacher", {
    headers: authHeaders,
  });
  const listData1 = await listRes1.json();
  const found1 = listData1.chats?.find((c: any) => c.id === chatId);
  if (!found1) {
    throw new Error(`Created chat ${chatId} not found in teacher chats list!`);
  }
  console.log(`Found in list: "${found1.title}"`);

  // 4. Rename the chat
  const updatedTitle = `Renamed Discussion ${Date.now()}`;
  console.log(`\n4. Renaming chat ${chatId} to "${updatedTitle}"...`);
  const renameRes = await fetch(`http://localhost:3000/api/chats/${chatId}`, {
    method: "PATCH",
    headers: authHeaders,
    body: JSON.stringify({ title: updatedTitle }),
  });
  if (!renameRes.ok) {
    throw new Error(`Rename chat failed: ${renameRes.status} ${await renameRes.text()}`);
  }
  const renameData = await renameRes.json();
  console.log(`Renamed response: "${renameData.chat.title}"`);

  // 5. Verify the updated title in GET /api/chats?mode=teacher
  console.log("\n5. Verifying rename in teacher chats list...");
  const listRes2 = await fetch("http://localhost:3000/api/chats?mode=teacher", {
    headers: authHeaders,
  });
  const listData2 = await listRes2.json();
  const found2 = listData2.chats?.find((c: any) => c.id === chatId);
  if (!found2 || found2.title !== updatedTitle) {
    throw new Error(`Verification failed! Expected "${updatedTitle}", got "${found2?.title}"`);
  }
  console.log(`Verified updated title in list: "${found2.title}"`);

  // 6. Delete the chat
  console.log(`\n6. Deleting chat ${chatId}...`);
  const deleteRes = await fetch(`http://localhost:3000/api/chats/${chatId}`, {
    method: "DELETE",
    headers: authHeaders,
  });
  if (!deleteRes.ok) {
    throw new Error(`Delete chat failed: ${deleteRes.status} ${await deleteRes.text()}`);
  }
  console.log("Delete succeeded (200 OK)");

  // 7. Verify it is no longer in GET /api/chats?mode=teacher
  console.log("\n7. Verifying deletion in teacher chats list...");
  const listRes3 = await fetch("http://localhost:3000/api/chats?mode=teacher", {
    headers: authHeaders,
  });
  const listData3 = await listRes3.json();
  const found3 = listData3.chats?.find((c: any) => c.id === chatId);
  if (found3) {
    throw new Error(`Chat ${chatId} is still present in list after delete!`);
  }
  console.log("Verified chat is completely removed from list!");

  console.log("\n=== ALL TEACHER CHAT RENAME & DELETE TESTS PASSED! ===");
}

testTeacherChatRenameDelete().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
