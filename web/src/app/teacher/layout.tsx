import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dumroo.ai · Teacher",
  description: "Dumroo.ai Teacher Portal and Analytics",
};

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
