import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabaseServer } from "@/lib/supabase";

async function getAuthUser(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  const ssrClient = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll() {},
    },
  });

  const { data: { user } } = await ssrClient.auth.getUser();
  return user;
}

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: memory } = await supabaseServer
      .from("user_memory")
      .select("facts, updated_at")
      .eq("user_id", user.id)
      .maybeSingle();

    return NextResponse.json({ facts: memory?.facts || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch memory" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { fact } = await req.json();

    const { data: memory } = await supabaseServer
      .from("user_memory")
      .select("facts")
      .eq("user_id", user.id)
      .maybeSingle();

    const existingFacts: string[] = memory?.facts || [];
    const updatedFacts = existingFacts.filter((f) => f.toLowerCase() !== (fact || "").toLowerCase());

    await supabaseServer.from("user_memory").upsert(
      {
        user_id: user.id,
        facts: updatedFacts,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    return NextResponse.json({ ok: true, facts: updatedFacts });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to delete fact" }, { status: 500 });
  }
}
