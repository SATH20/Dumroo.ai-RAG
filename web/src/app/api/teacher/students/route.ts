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
    const { fullName, email, password, groupIds } = body;

    // 1. Validation
    if (!fullName || typeof fullName !== "string" || !fullName.trim()) {
      return NextResponse.json({ error: "Student full name is required." }, { status: 400 });
    }

    if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
    }

    if (!password || typeof password !== "string" || password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters long." },
        { status: 400 }
      );
    }

    const cleanName = fullName.trim();
    const cleanEmail = email.trim().toLowerCase();

    // 2. Create Auth User via Service Role Admin API
    const { data: userData, error: userError } = await supabaseServer.auth.admin.createUser({
      email: cleanEmail,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: cleanName,
        role: "student",
      },
    });

    if (userError || !userData?.user) {
      const msg = userError?.message || "Failed to create auth user.";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const newUserId = userData.user.id;

    // 3. Upsert into public.profiles
    const { error: profileError } = await supabaseServer.from("profiles").upsert(
      {
        id: newUserId,
        full_name: cleanName,
        role: "student",
        created_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    if (profileError) {
      console.error("Profile creation error:", profileError);
      return NextResponse.json({ error: `User created, but profile update failed: ${profileError.message}` }, { status: 500 });
    }

    // 4. Enroll in selected groups
    if (Array.isArray(groupIds) && groupIds.length > 0) {
      const membershipRows = groupIds.map((gId: string) => ({
        group_id: gId,
        student_id: newUserId,
        created_at: new Date().toISOString(),
      }));

      const { error: memError } = await supabaseServer
        .from("group_members")
        .upsert(membershipRows, { onConflict: "group_id,student_id" });

      if (memError) {
        console.warn("Group enrollment warning:", memError);
      }
    }

    return NextResponse.json({
      success: true,
      student: {
        id: newUserId,
        name: cleanName,
        email: cleanEmail,
      },
    });
  } catch (err: any) {
    console.error("Create student API error:", err);
    return NextResponse.json({ error: err.message || "Failed to create student" }, { status: 500 });
  }
}
