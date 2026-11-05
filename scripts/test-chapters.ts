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
  
  // Test Physics Part 1 Ch 4
  const physChId = "fdec0a4b-f4fd-4e9e-97f7-43ae94a6f90a";
  const { data: chunks } = await supabaseServer
    .from("chunks")
    .select("id, chapter_id, section_title, page_number, page_end, chunk_index, token_count, content")
    .eq("chapter_id", physChId)
    .order("chunk_index", { ascending: true });

  console.log(`Physics Ch 4 total chunks: ${chunks?.length}`);
  const totalTokens = (chunks || []).reduce((acc: number, c: any) => acc + (c.token_count || Math.ceil(c.content.length / 4)), 0);
  console.log(`Physics Ch 4 total tokens: ${totalTokens}`);

  // Test Biology Ch 11
  const bioChId = "5ae8412b-6707-4592-8131-9e6be82234b5";
  const { data: bioChunks } = await supabaseServer
    .from("chunks")
    .select("id, chapter_id, section_title, page_number, page_end, chunk_index, token_count, content")
    .eq("chapter_id", bioChId)
    .order("chunk_index", { ascending: true });

  console.log(`Biology Ch 11 total chunks: ${bioChunks?.length}`);
  const bioTotalTokens = (bioChunks || []).reduce((acc: number, c: any) => acc + (c.token_count || Math.ceil(c.content.length / 4)), 0);
  console.log(`Biology Ch 11 total tokens: ${bioTotalTokens}`);
}

main().catch(console.error);
