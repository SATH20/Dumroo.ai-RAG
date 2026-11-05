import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Inter } from "next/font/google";
import "./globals.css";
import "katex/dist/katex.min.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-heading",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://dumroo.ai"),
  title: {
    default: "Dumroo.ai · NCERT Textbook Tutor",
    template: "%s",
  },
  applicationName: "Dumroo.ai, AI Ecosystem for Education",
  description: "Accurate, citation-backed NCERT learning for high school students and teachers.",
  openGraph: {
    title: "Dumroo.ai, AI Ecosystem for Education",
    siteName: "Dumroo.ai, AI Ecosystem for Education",
    description: "Accurate, citation-backed NCERT learning for high school students and teachers.",
  },
  icons: {
    icon: [
      { url: "/icon.png", type: "image/png" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/icon.png",
    apple: "/icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${plusJakarta.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans bg-[#F7F8FC] text-[#334155]">
        {children}
      </body>
    </html>
  );
}
