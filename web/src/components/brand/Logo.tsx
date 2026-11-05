"use client";

import React from "react";

export interface LogoProps {
  variant?: "full" | "compact";
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  inPill?: boolean;
  priority?: boolean;
}

const heightClasses = {
  sm: "h-6",
  md: "h-7 sm:h-8",
  lg: "h-9 sm:h-10",
  xl: "h-12 sm:h-14",
};

export function Logo({
  variant = "full",
  size = "md",
  className = "",
  inPill = false,
}: LogoProps) {
  const hClass = heightClasses[size] || "h-8";

  const img = (
    <img
      src="/dumroo-logo.png"
      alt="Dumroo.ai"
      className={`${hClass} w-auto object-contain block select-none`}
    />
  );

  if (inPill) {
    return (
      <div
        className={`inline-flex items-center justify-center bg-white rounded-xl px-3 py-1.5 shadow-sm border border-slate-200/80 shrink-0 ${className}`}
      >
        {img}
      </div>
    );
  }

  return <div className={`inline-flex items-center shrink-0 ${className}`}>{img}</div>;
}

export { Logo as Wordmark };
