import type { ReactNode } from "react";

// The app's card: white, a light border, rounded, with padding that tightens on phones
export default function Card({
  children,
  className = "",
  as: Tag = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div";
}) {
  return <Tag className={`rounded-xl border border-stone-200 bg-white p-4 sm:p-5 ${className}`}>{children}</Tag>;
}
