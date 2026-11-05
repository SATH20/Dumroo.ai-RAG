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
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: auth } = await client.auth.signInWithPassword({
    email: "teacher@dumroo-demo.test",
    password: "Demo@12345",
  });

  const res = await fetch("http://localhost:3000/api/ask", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${auth!.session!.access_token}`,
    },
    body: JSON.stringify({
      question: "Explain Newton's second law and linear momentum",
      webSearch: true,
      history: [],
    }),
  });

  const reader = res.body?.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  while (true) {
    const { done, value } = await reader!.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n\n");
    buffer = lines.pop() || "";
    for (const b of lines) {
      for (const l of b.split("\n")) {
        if (l.startsWith("data:")) {
          try {
            const d = JSON.parse(l.slice(5).trim());
            if (d.delta) full += d.delta;
          } catch {}
        }
      }
    }
  }

  console.log("=== FULL_TEXT_START ===");
  console.log(full);
  console.log("=== FULL_TEXT_END ===");
}

run().catch(console.error);
