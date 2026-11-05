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

  const { data } = await ssrClient.auth.getUser();
  if (data?.user) return data.user;

  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    const { data: tokenData } = await supabaseServer.auth.getUser(token);
    return tokenData?.user || null;
  }

  return null;
}

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const mode = req.nextUrl.searchParams.get("mode");

    let query = supabaseServer
      .from("chats")
      .select("id, title, summary, created_at, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (mode) {
      try {
        const { data: modeChats, error: modeErr } = await supabaseServer
          .from("chats")
          .select("id, title, summary, created_at, updated_at, mode")
          .eq("user_id", user.id)
          .eq("mode", mode)
          .order("updated_at", { ascending: false });

        if (!modeErr) {
          return NextResponse.json({ chats: modeChats || [] });
        }
      } catch {}
    }

    const { data: chats, error } = await query;
    if (error) throw error;

    return NextResponse.json({ chats: chats || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch chats" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const title = body.title?.trim() || "New Chat";
    const mode = body.mode === "teacher" ? "teacher" : "student";

    const insertPayload: any = {
      user_id: user.id,
      title,
      mode,
    };

    let { data: chat, error } = await supabaseServer
      .from("chats")
      .insert(insertPayload)
      .select()
      .single();

    if (error && error.message?.includes("mode")) {
      delete insertPayload.mode;
      const res = await supabaseServer
        .from("chats")
        .insert(insertPayload)
        .select()
        .single();
      chat = res.data;
      error = res.error;
    }

    if (error) throw error;

    return NextResponse.json({ chat });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to create chat" }, { status: 500 });
  }
}
