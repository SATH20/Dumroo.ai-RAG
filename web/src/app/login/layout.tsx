import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dumroo.ai · Sign in",
  description: "Sign in to Dumroo.ai - AI Ecosystem for Education",
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
