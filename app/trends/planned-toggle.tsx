"use client";

import { useShowPlanned } from "./use-show-planned";

// Done | Done + planned, next to the range picker
export default function PlannedToggle() {
  const { showPlanned, setShowPlanned } = useShowPlanned();
  const options = [
    { value: false, label: "Done" },
    { value: true, label: "Done + planned" },
  ];

  return (
    <div role="radiogroup" aria-label="What to show" className="flex rounded-full bg-stone-100 p-1">
      {options.map((option) => (
        <button
          key={option.label}
          type="button"
          role="radio"
          aria-checked={showPlanned === option.value}
          onClick={() => setShowPlanned(option.value)}
          className={`rounded-full px-3 py-1 text-sm transition-colors ${
            showPlanned === option.value
              ? "bg-white font-medium text-stone-900 shadow-sm"
              : "text-stone-500 hover:text-stone-800"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}