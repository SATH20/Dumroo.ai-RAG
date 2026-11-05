import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabaseServer } from "@/lib/supabase";

async function verifyTeacher(req: NextRequest) {
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

  let user = null;
  const { data } = await ssrClient.auth.getUser();
  user = data?.user || null;

  if (!user) {
    const authHeader = req.headers.get("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.slice(7).trim();
      const { data: tokenData } = await supabaseServer.auth.getUser(token);
      user = tokenData?.user || null;
    }
  }

  if (!user) return null;

  const { data: profile } = await supabaseServer
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "teacher" && user.user_metadata?.role !== "teacher") {
    return null;
  }

  return user;
}

export async function POST(req: NextRequest) {
  try {
    const teacherUser = await verifyTeacher(req);
    if (!teacherUser) {
      return NextResponse.json({ error: "Forbidden: Teacher access required" }, { status: 403 });
    }

    const body = await req.json();
    const { groupId, studentId } = body;

    if (!groupId || !studentId) {
      return NextResponse.json({ error: "groupId and studentId are required" }, { status: 400 });
    }

    const { error } = await supabaseServer.from("group_members").upsert(
      {
        group_id: groupId,
        student_id: studentId,
        created_at: new Date().toISOString(),
      },
      { onConflict: "group_id,student_id" }
    );

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Add group member error:", err);
    return NextResponse.json({ error: err.message || "Failed to add member" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const teacherUser = await verifyTeacher(req);
    if (!teacherUser) {
      return NextResponse.json({ error: "Forbidden: Teacher access required" }, { status: 403 });
    }

    const body = await req.json();
    const { groupId, studentId } = body;

    if (!groupId || !studentId) {
      return NextResponse.json({ error: "groupId and studentId are required" }, { status: 400 });
    }

    const { error } = await supabaseServer
      .from("group_members")
      .delete()
      .eq("group_id", groupId)
      .eq("student_id", studentId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Remove group member error:", err);
    return NextResponse.json({ error: err.message || "Failed to remove member" }, { status: 500 });
  }
}
