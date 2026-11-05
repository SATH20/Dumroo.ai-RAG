import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabaseServer } from "../../../../../lib/supabase";


export async function GET(req: NextRequest) {
  try {
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

    if (!user) {
      return NextResponse.json({ user: null, allowedSubjects: [] }, { status: 401 });
    }

    // Fetch profile
    let role = user.user_metadata?.role || "student";
    let fullName = user.user_metadata?.full_name || user.email || "";

    const { data: profile } = await supabaseServer
      .from("profiles")
      .select("role, full_name")
      .eq("id", user.id)
      .single();

    if (profile?.role) {
      role = profile.role;
      if (profile.full_name) fullName = profile.full_name;
    }

    // Fetch allowed subjects
    let allowedSubjects: Array<{ id: string; name: string }> = [];

    if (role === "teacher") {
      // Teachers have access to all subjects
      const { data: allSubj } = await supabaseServer.from("subjects").select("id, name").order("name");
      allowedSubjects = allSubj || [];
    } else {
      // Students: query groups and group_members
      const { data: members } = await supabaseServer
        .from("group_members")
        .select(`
          group_id,
          groups:group_id (
            subject_id,
            subjects:subject_id (
              id,
              name
            )
          )
        `)
        .eq("student_id", user.id);

      const subjectMap = new Map<string, string>();
      if (Array.isArray(members)) {
        for (const m of members as any[]) {
          const s = m.groups?.subjects;
          if (s?.id && s?.name) {
            subjectMap.set(s.id, s.name);
          }
        }
      }

      allowedSubjects = Array.from(subjectMap.entries()).map(([id, name]) => ({ id, name }));
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        fullName,
        role,
      },
      allowedSubjects,
      hasTavily: !!(process.env.TAVILY_API_KEY && process.env.TAVILY_API_KEY.trim()),
    });
  } catch (err: any) {
    console.error("Session API error:", err);
    return NextResponse.json({ error: err.message || "Failed to get session" }, { status: 500 });
  }
}
