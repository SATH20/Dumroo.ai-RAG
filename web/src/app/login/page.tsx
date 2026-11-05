"use client";

import React, { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BookOpen, Sparkles, Lock, Mail, ArrowRight, UserCheck, ShieldCheck } from "lucide-react";

const DEMO_ACCOUNTS = [
  {
    role: "Teacher",
    email: "teacher@dumroo-demo.test",
    label: "Prof. Sharma",
    badge: "All Subjects",
    badgeColor: "bg-purple-100 text-purple-700 border-purple-200",
  },
  {
    role: "Student 1",
    email: "student1@dumroo-demo.test",
    label: "Physics & Maths",
    badge: "Physics, Maths",
    badgeColor: "bg-blue-100 text-blue-700 border-blue-200",
  },
  {
    role: "Student 2",
    email: "student2@dumroo-demo.test",
    label: "Chemistry & Biology",
    badge: "Chem, Bio",
    badgeColor: "bg-emerald-100 text-emerald-700 border-emerald-200",
  },
  {
    role: "Student 3",
    email: "student3@dumroo-demo.test",
    label: "History Only",
    badge: "History",
    badgeColor: "bg-amber-100 text-amber-700 border-amber-200",
  },
  {
    role: "Student 4",
    email: "student4@dumroo-demo.test",
    label: "All 5 Subjects",
    badge: "All 5 Subjects",
    badgeColor: "bg-indigo-100 text-indigo-700 border-indigo-200",
  },
  {
    role: "Student 5",
    email: "student5@dumroo-demo.test",
    label: "Maths Only",
    badge: "Maths",
    badgeColor: "bg-rose-100 text-rose-700 border-rose-200",
  },
];

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get("redirect");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      const target = redirectPath || data.redirectUrl || (data.user?.role === "teacher" ? "/teacher" : "/student");
      router.push(target);
      router.refresh();
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred during login.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-200">
            <BookOpen className="w-6 h-6" />
          </div>
          <span className="text-2xl font-bold tracking-tight text-slate-900">
            Dumroo<span className="text-blue-600">.ai</span>
          </span>
        </div>
        <h2 className="mt-4 text-center text-xl font-bold tracking-tight text-slate-900">
          Sign in to your learning dashboard
        </h2>
        <p className="mt-1 text-center text-sm text-slate-600">
          Access your NCERT curriculum textbooks and personalized tutor
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-sm border border-slate-200 rounded-2xl sm:px-10">
          {error && (
            <div className="mb-5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-start gap-2">
              <span className="font-semibold text-rose-800">Error:</span> {error}
            </div>
          )}

          <form className="space-y-4" onSubmit={handleLogin}>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Mail className="h-4 w-4" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. student1@dumroo-demo.test"
                  className="block w-full pl-9 pr-3 py-2.5 text-sm border border-slate-300 rounded-xl bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Demo password"
                  className="block w-full pl-9 pr-3 py-2.5 text-sm border border-slate-300 rounded-xl bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center items-center gap-2 py-2.5 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {loading ? (
                <span>Signing in...</span>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Demo Accounts Panel */}
          <div className="mt-8 pt-6 border-t border-slate-100">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-blue-600" />
                Demo Accounts (Click to Fill)
              </span>
              <span className="text-[11px] text-slate-400 font-mono">Password: Demo@12345</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => handleQuickFill(acc.email)}
                  className="text-left p-2.5 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 transition-all group cursor-pointer"
                >
                  <div className="text-xs font-semibold text-slate-800 group-hover:text-blue-700">
                    {acc.role}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">{acc.label}</div>
                  <span
                    className={`inline-block mt-1 text-[10px] font-medium px-1.5 py-0.5 rounded border ${acc.badgeColor}`}
                  >
                    {acc.badge}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center text-sm text-slate-500">
          Loading login portal...
        </div>
      }
    >
      <LoginForm />
    </React.Suspense>
  );
}
