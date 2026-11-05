import fs from "fs";
import path from "path";
import { createClient } from "../web/node_modules/@supabase/supabase-js";

const envPath = path.resolve("web/.env.local");
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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const sb = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("=== SUPABASE STORAGE & FIGURES DIAGNOSIS ===");
  const { data: sampleImages, error } = await sb.from("images").select("*").limit(20);
  if (error) {
    console.error("Error fetching images:", error);
    return;
  }
  console.log("Found images:", sampleImages?.length);
  if (sampleImages) {
    for (const img of sampleImages.slice(0, 10)) {
      console.log(`Image id=${img.id}: width=${img.width}, height=${img.height}, page=${img.page_number}, path=${img.storage_path}`);
    }
    // Also fetch the first 3 image URLs to inspect actual HTTP image dimensions
    const storageBase = `${supabaseUrl}/storage/v1/object/public/textbook-images`;
    for (const img of sampleImages.slice(0, 3)) {
      const fullUrl = `${storageBase}/${img.storage_path}`;
      try {
        const res = await fetch(fullUrl);
        const buf = Buffer.from(await res.arrayBuffer());
        console.log(`HTTP URL: ${fullUrl}`);
        console.log(`  Status: ${res.status}, Content-Type: ${res.headers.get("content-type")}, Size: ${buf.byteLength} bytes`);
        // Check PNG dimensions from IHDR chunk if PNG
        if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504E47) {
          const w = buf.readUInt32BE(16);
          const h = buf.readUInt32BE(20);
          console.log(`  Actual PNG pixel dimensions: ${w} x ${h}`);
        } else if (buf.length > 4 && buf[0] === 0xFF && buf[1] === 0xD8) {
          console.log(`  JPEG image detected, size ${buf.byteLength} bytes`);
        }
      } catch (err: any) {
        console.log(`  Fetch error: ${err.message}`);
      }
    }
  }

  // Check page_images as well
  const { data: samplePages } = await sb.from("page_images").select("*").limit(5);
  console.log("\nFound page_images:", samplePages?.length);
  if (samplePages) {
    for (const p of samplePages) {
      console.log(`Page image id=${p.id}: page=${p.page_number}, path=${p.storage_path}`);
    }
  }
}

run();
