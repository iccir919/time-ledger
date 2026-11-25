import Link from "next/link";
import type { RangeKey, TrendRange } from "@/lib/trends";

// The range choices, as links (?range=4w). Only ranges with enough history are offered,
// so a new user sees just "All time · 3 days".
export default function RangePicker({
  ranges,
  current,
  basePath,
}: {
  ranges: TrendRange[];
  current: RangeKey;
  basePath: string;
}) {
  return (
    <nav aria-label="Time range" className="flex flex-wrap rounded-full bg-stone-100 p-1">
      {ranges.map((range) => (
        <Link
          key={range.key}
          href={`${basePath}?range=${range.key}`}
          aria-current={range.key === current ? "page" : undefined}
          className={`rounded-full px-3 py-1 text-sm transition-colors ${
            range.key === current ? "bg-white font-medium text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-800"
          }`}
        >
          {range.label}
        </Link>
      ))}
    </nav>
  );
}