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

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    // Verify chat ownership
    const { data: chat, error: chatErr } = await supabaseServer
      .from("chats")
      .select("id, title, summary")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (chatErr || !chat) {
      return NextResponse.json({ error: "Chat not found or access denied" }, { status: 404 });
    }

    const { data: messages, error: msgErr } = await supabaseServer
      .from("messages")
      .select("id, role, content, sources, images, page_images, sections, meta, created_at")
      .eq("chat_id", id)
      .order("created_at", { ascending: true });

    if (msgErr) throw msgErr;

    return NextResponse.json({
      chat,
      messages: (messages || []).map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        sources: m.sources || [],
        images: m.images || [],
        pageImages: m.page_images || [],
        sections: m.sections || [],
        webSources: m.meta?.webSources || [],
        refusal: m.meta?.status === "refused",
        cutoff: m.meta?.status === "cutoff",
        createdAt: m.created_at,
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch messages" }, { status: 500 });
  }
}
