import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder-for-build.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-key-for-build";

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  console.warn("Warning: NEXT_PUBLIC_SUPABASE_URL is not set.");
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn("Warning: SUPABASE_SERVICE_ROLE_KEY is not set.");
}

// Server-side client using service role key (never expose to client)
export const supabaseServer = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

export { createClient };
export const STORAGE_BASE_URL = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/textbook-images`;
