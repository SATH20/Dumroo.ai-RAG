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

async function clean() {
  const { supabaseServer } = await import("../web/lib/supabase");
  const { data: msgs, error } = await supabaseServer
    .from("messages")
    .select("id, content");

  if (error) {
    console.error("Error fetching messages:", error);
    process.exit(1);
  }

  let cleanedCount = 0;
  for (const m of msgs || []) {
    if (m.content && (m.content.includes("[[COVERED]]") || m.content.includes("[[NOT_COVERED]]"))) {
      const cleaned = m.content.replace(/\[\[(?:NOT_)?COVERED\]\]\s*/g, "").trim();
      await supabaseServer.from("messages").update({ content: cleaned }).eq("id", m.id);
      cleanedCount++;
    }
  }

  console.log(`Found and cleaned ${cleanedCount} messages with markers.`);
}

clean().catch((err) => {
  console.error(err);
  process.exit(1);
});
