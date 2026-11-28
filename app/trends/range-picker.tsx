import Switch from "@/components/ui/switch";
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
    <Switch
      label="Time range"
      options={ranges.map((range) => ({ key: range.key, label: range.label, href: `${basePath}?range=${range.key}` }))}
      value={current}
    />
  );
}
