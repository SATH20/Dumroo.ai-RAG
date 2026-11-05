"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BookOpen,
  BookmarkCheck,
  BarChart3,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  Loader2,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { SUBJECT_THEMES } from "@/lib/subjectTheme";

const DEMO_ACCOUNTS = [
  {
    label: "Teacher",
    email: "teacher@dumroo-demo.test",
    desc: "All subjects & dashboard",
    chipClass: "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100",
  },
  {
    label: "Student · Physics+Maths",
    email: "student1@dumroo-demo.test",
    desc: "Physics & Mathematics",
    chipClass: "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100",
  },
  {
    label: "Student · Chem+Bio",
    email: "student2@dumroo-demo.test",
    desc: "Chemistry & Biology",
    chipClass: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100",
  },
  {
    label: "Student · History",
    email: "student3@dumroo-demo.test",
    desc: "History only",
    chipClass: "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100",
  },
  {
    label: "Student · All subjects",
    email: "student4@dumroo-demo.test",
    desc: "All 5 enrolled subjects",
    chipClass: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100",
  },
];

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get("redirect");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Dumroo.ai · Sign in";
  }, []);

  const handleQuickFill = (accEmail: string) => {
    setEmail(accEmail);
    setPassword("Demo@12345");
    setError(null);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please provide both email and password.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Login failed. Please check credentials.");
      }

      const target =
        redirectPath ||
        data.redirectUrl ||
        (data.user?.role === "teacher" ? "/teacher" : "/student");
      router.push(target);
      router.refresh();
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred during login.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen w-full flex flex-col lg:flex-row bg-[#F7F8FC]">
      {/* LEFT SECTION (55% on desktop): Hero & Features */}
      <div className="relative w-full lg:w-[55%] flex flex-col justify-between p-8 sm:p-12 lg:p-16 overflow-hidden bg-[#0B1530] text-white">
        {/* Subtle dot grid overlay */}
        <div className="absolute inset-0 dot-grid opacity-10 pointer-events-none" />

        {/* Brand Glow Blob */}
        <div
          className="absolute -top-32 -left-32 w-96 h-96 rounded-full blur-3xl opacity-30 pointer-events-none"
          style={{
            background: "linear-gradient(135deg, #1E4FF7 0%, #6A5CFF 60%, #F5A623 100%)",
          }}
        />
        <div
          className="absolute -bottom-24 -right-24 w-80 h-80 rounded-full blur-3xl opacity-20 pointer-events-none"
          style={{ background: "#F5A623" }}
        />

        {/* Top Brand Logo */}
        <div className="relative z-10 mb-12 lg:mb-0">
          <Logo variant="full" size="lg" inPill />
        </div>

        {/* Center Content */}
        <div className="relative z-10 max-w-xl my-auto py-6 sm:py-8">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-xs font-semibold text-white/90 mb-4 sm:mb-6 backdrop-blur-sm">
            <Sparkles className="w-3.5 h-3.5 text-[#F5A623]" />
            <span>AI-Powered Curriculum Intelligence</span>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-[3.25rem] font-heading font-extrabold text-white leading-[1.15] mb-4 sm:mb-6 tracking-tight">
            Your NCERT textbooks,{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#60A5FA] via-[#A78BFA] to-[#FBBF24]">
              answered.
            </span>
          </h1>

          <p className="text-sm sm:text-base lg:text-lg text-slate-300 leading-relaxed mb-6 sm:mb-8 max-w-lg">
            Ask anything across Physics, Chemistry, Biology, Maths and History, with page-accurate citations and textbook figures.
          </p>

          {/* 3 Feature Rows - full on desktop, compact on mobile */}
          <div className="space-y-3.5 mb-6 sm:mb-8 hidden sm:block">
            <div className="flex items-start gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-400/20 flex items-center justify-center shrink-0 mt-0.5 text-[#60A5FA]">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-white">Answers only from your textbooks</h4>
                <p className="text-xs text-slate-400">Strictly grounded in NCERT syllabus with zero off-book hallucinations</p>
              </div>
            </div>

            <div className="flex items-start gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-400/20 flex items-center justify-center shrink-0 mt-0.5 text-[#FBBF24]">
                <BookmarkCheck className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-white">Exact chapter and page citations</h4>
                <p className="text-xs text-slate-400">Every formula and explanation links directly to textbook page scans</p>
              </div>
            </div>

            <div className="flex items-start gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-400/20 flex items-center justify-center shrink-0 mt-0.5 text-[#C084FC]">
                <BarChart3 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-white">Teacher insights dashboard</h4>
                <p className="text-xs text-slate-400">Real-time student progress, syllabus gap analysis, and web search toggle</p>
              </div>
            </div>
          </div>

          {/* 5 Subject Pills */}
          <div>
            <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-2.5">
              Covered Subjects
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#1E4FF7]/20 border border-[#1E4FF7]/40 text-[#93C5FD]">
                Physics
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#7C3AED]/20 border border-[#7C3AED]/40 text-[#DDD6FE]">
                Chemistry
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#16A34A]/20 border border-[#16A34A]/40 text-[#BBF7D0]">
                Biology
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#F5A623]/20 border border-[#F5A623]/40 text-[#FDE68A]">
                Maths
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#E11D48]/20 border border-[#E11D48]/40 text-[#FECDD3]">
                History
              </span>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="relative z-10 text-xs text-slate-400 pt-6 border-t border-white/10 hidden sm:block">
          Class 11 CBSE NCERT Curriculum · Fully Aligned RAG Pipeline
        </div>
      </div>

      {/* RIGHT SECTION (45% on desktop): Auth Form */}
      <div className="w-full lg:w-[45%] flex items-center justify-center p-6 sm:p-10 lg:p-12">
        <div className="w-full max-w-md space-y-6">
          {/* Card */}
          <div className="bg-white rounded-2xl border border-[#E6E8F0] card-shadow p-8 sm:p-10">
            {/* Mobile Logo on top of sign-in card */}
            <div className="lg:hidden mb-6 flex justify-center">
              <Logo variant="full" size="lg" />
            </div>

            <div className="mb-8">
              <h2 className="text-2xl font-heading font-bold text-[#0F172A] tracking-tight">
                Welcome back
              </h2>
              <p className="text-sm text-[#64748B] mt-1.5">
                Sign in to your account to continue your learning.
              </p>
            </div>

            {error && (
              <div className="mb-6 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-2.5 animate-fadeIn">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4.5">
              <div>
                <label className="block text-xs font-semibold text-[#0F172A] uppercase tracking-wider mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@dumroo-demo.test"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#E6E8F0] bg-white text-sm text-[#0F172A] placeholder-[#94A3B8] transition-all hover:border-[#CBD5E1]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#0F172A] uppercase tracking-wider mb-2">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-[#E6E8F0] bg-white text-sm text-[#0F172A] placeholder-[#94A3B8] transition-all hover:border-[#CBD5E1]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#0F172A] transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full btn-brand-pill py-3 px-5 text-sm flex items-center justify-center gap-2 shadow-sm disabled:opacity-60 cursor-pointer"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Signing in…</span>
                    </>
                  ) : (
                    <>
                      <span>Sign in</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Demo Accounts Quick-Fill Card */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-[#E6E8F0] card-shadow p-6">
            <div className="flex items-center justify-between mb-3.5">
              <span className="text-xs font-heading font-bold text-[#0F172A] uppercase tracking-wider">
                Try a Demo Account
              </span>
              <span className="text-[11px] font-mono text-[#64748B] bg-slate-100 px-2 py-0.5 rounded-md">
                Demo@12345
              </span>
            </div>
            <p className="text-xs text-[#64748B] mb-3.5">
              Click any role to auto-fill credentials for testing:
            </p>
            <div className="flex flex-wrap gap-2">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => handleQuickFill(acc.email)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all cursor-pointer ${acc.chipClass}`}
                >
                  {acc.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex flex-col items-center justify-center bg-[#F8FAFC] gap-5">
          <Logo variant="full" size="lg" />
          <div className="w-6 h-6 border-2 border-[#1E4FF7] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
