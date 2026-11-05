import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dumroo.ai · Student",
  description: "Dumroo.ai Student Learning Portal",
};

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
