import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { supabaseServer } from "../../../../../lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    // Prepare response with cookie handling
    const res = NextResponse.json({ ok: true });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

    const ssrClient = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options);
          });
        },
      },
    });

    const { data: authData, error: authError } = await ssrClient.auth.signInWithPassword({
      email,
      password,
    });

    if (authError || !authData.user) {
      return NextResponse.json({ error: authError?.message || "Invalid credentials." }, { status: 401 });
    }

    const userId = authData.user.id;

    // Fetch user profile to verify role
    let role = authData.user.user_metadata?.role || "student";
    const { data: profile } = await supabaseServer
      .from("profiles")
      .select("role, full_name")
      .eq("id", userId)
      .single();

    if (profile?.role) {
      role = profile.role;
    }

    // Set cookie for quick role check in middleware
    res.cookies.set("dumroo-role", role, { path: "/", httpOnly: false, sameSite: "lax" });

    const redirectUrl = role === "teacher" ? "/teacher" : "/student";

    return NextResponse.json(
      {
        user: {
          id: userId,
          email: authData.user.email,
          fullName: profile?.full_name || authData.user.user_metadata?.full_name || email,
          role,
        },
        redirectUrl,
      },
      { headers: res.headers }
    );
  } catch (err: any) {
    console.error("Login API error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
