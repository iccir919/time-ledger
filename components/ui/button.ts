// The app's button looks, as class names, so they work on <button>, <Link> and form buttons
// alike: buttonClasses("primary"), buttonClasses("danger", "sm").

type Variant = "primary" | "secondary" | "danger";
type Size = "sm" | "md";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-white hover:bg-accent-hover",
  secondary: "border border-stone-200 bg-white text-stone-700 hover:bg-stone-50",
  danger: "border border-red-200 bg-white text-red-700 hover:bg-red-50",
};

const sizes: Record<Size, string> = {
  sm: "px-3 py-1 text-xs",
  md: "px-4 py-2 text-sm",
};

export function buttonClasses(variant: Variant = "secondary", size: Size = "md") {
  return `inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-default disabled:opacity-50 ${variants[variant]} ${sizes[size]}`;
}
