"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export type SwitchOption<T extends string> = {
  key: T;
  label: string;
  icon?: ReactNode;
  // An option can be a link (it changes the page) instead of a button
  href?: string;
};

type SwitchProps<T extends string> = {
  options: SwitchOption<T>[];
  value: T;
  // For button options; link options navigate instead
  onChange?: (key: T) => void;
  label: string;
  // "sm" inside cards, "md" in page headers
  size?: "sm" | "md";
  // Phones show just the icons (screen readers still get the words)
  iconsOnPhones?: boolean;
};

// The app's one switch: a few options on a soft gray track, the chosen one raised in white.
// Used for Calendar | Grid, Week | Month, Done | Done + planned, and the like.
export default function Switch<T extends string>({
  options,
  value,
  onChange,
  label,
  size = "md",
  iconsOnPhones = false,
}: SwitchProps<T>) {
  const sizing = size === "sm" ? "gap-1 px-2.5 py-0.5 text-xs" : "gap-1.5 px-3 py-1 text-sm";

  return (
    <div role="radiogroup" aria-label={label} className="inline-flex max-w-full overflow-x-auto rounded-full bg-stone-100 p-0.5">
      {options.map((option) => {
        const chosen = option.key === value;
        const className = `flex items-center justify-center whitespace-nowrap rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 ${sizing} ${
          chosen ? "bg-white font-medium text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-800"
        }`;
        const content = (
          <>
            {option.icon}
            {iconsOnPhones && option.icon ? <span className="sr-only sm:not-sr-only">{option.label}</span> : option.label}
          </>
        );
        return option.href ? (
          <Link key={option.key} href={option.href} role="radio" aria-checked={chosen} className={className}>
            {content}
          </Link>
        ) : (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={chosen}
            onClick={() => onChange?.(option.key)}
            className={className}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}
