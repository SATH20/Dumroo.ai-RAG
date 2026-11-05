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

export async function GET(req: NextRequest) {
  try {
    const teacherUser = await verifyTeacher(req);
    if (!teacherUser) {
      return NextResponse.json({ error: "Forbidden: Teacher access required" }, { status: 403 });
    }

    // 1. Fetch all groups with their subject
    const { data: groups, error: grpErr } = await supabaseServer
      .from("groups")
      .select("id, name, subject_id, subjects:subject_id (id, name)")
      .order("name", { ascending: true });

    if (grpErr) throw grpErr;

    // 2. Fetch all group memberships
    const { data: memberships, error: memErr } = await supabaseServer
      .from("group_members")
      .select("group_id, student_id");

    if (memErr) throw memErr;

    // 3. Fetch all students
    const { data: students, error: studErr } = await supabaseServer
      .from("profiles")
      .select("id, full_name")
      .eq("role", "student")
      .order("full_name", { ascending: true });

    if (studErr) throw studErr;

    const studentMap = new Map<string, string>();
    (students || []).forEach((s) => studentMap.set(s.id, s.full_name || "Student"));

    // Map group members
    const groupMembersMap = new Map<string, Array<{ id: string; name: string }>>();
    for (const m of (memberships as any[]) || []) {
      const gId = m.group_id;
      const sId = m.student_id;
      if (gId && sId) {
        const list = groupMembersMap.get(gId) || [];
        list.push({ id: sId, name: studentMap.get(sId) || "Student" });
        groupMembersMap.set(gId, list);
      }
    }

    const formattedGroups = (groups || []).map((g: any) => ({
      id: g.id,
      name: g.name,
      subjectId: g.subject_id,
      subjectName: g.subjects?.name ? g.subjects.name.charAt(0).toUpperCase() + g.subjects.name.slice(1) : "General",
      members: groupMembersMap.get(g.id) || [],
      memberCount: (groupMembersMap.get(g.id) || []).length,
    }));

    return NextResponse.json({
      groups: formattedGroups,
      allStudents: (students || []).map((s) => ({
        id: s.id,
        name: s.full_name || "Student",
      })),
    });
  } catch (err: any) {
    console.error("Teacher groups API error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
