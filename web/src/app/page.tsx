"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/brand/Logo";

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
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center gap-5">
      <Logo variant="compact" size="lg" />
      <div className="w-6 h-6 border-2 border-[#1E4FF7] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
