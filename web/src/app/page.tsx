"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch("/api/auth/session");
        if (res.ok) {
          const data = await res.json();
          if (data.user?.role === "teacher") {
            router.replace("/teacher");
            return;
          } else if (data.user) {
            router.replace("/student");
            return;
          }
        }
      } catch {}
      router.replace("/login");
    }
    checkAuth();
  }, [router]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500 text-sm">
      Loading Dumroo AI Tutor...
    </div>
  );
}
