"use client";

import Switch from "@/components/switch";
import { useShowPlanned } from "./use-show-planned";

// Done | Done + planned, next to the range picker
export default function PlannedToggle() {
  const { showPlanned, setShowPlanned } = useShowPlanned();
  return (
    <Switch
      label="What to show"
      options={[
        { key: "done", label: "Done" },
        { key: "planned", label: "Done + planned" },
      ]}
      value={showPlanned ? "planned" : "done"}
      onChange={(key) => setShowPlanned(key === "planned")}
    />
  );
}
