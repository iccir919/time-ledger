"use client";

import { useState } from "react";
import { categoryColors } from "@/lib/colors";

type ColorPickerProps = {
  name: string;
  defaultColor: string;
};

// A color dot that opens a palette. The chosen color is sent with the form.
export default function ColorPicker({ name, defaultColor }: ColorPickerProps) {
  const [color, setColor] = useState(defaultColor);
  const [open, setOpen] = useState(false);

  return (
    <div className="relative shrink-0">
      <input type="hidden" name={name} value={color} />

      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label="Choose a color"
        className="flex size-6 items-center justify-center rounded-full hover:bg-stone-100"
      >
        <span className="size-3 rounded-full" style={{ backgroundColor: color }} />
      </button>

      {open && (
        <div className="absolute left-0 top-8 z-10 grid w-max grid-cols-5 gap-2 rounded-lg border border-stone-200 bg-white p-3 shadow-sm">
          {categoryColors.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                setColor(option);
                setOpen(false);
              }}
              aria-label={`Use color ${option}`}
              className={`size-6 rounded-full transition-transform hover:scale-110 ${
                option === color ? "ring-2 ring-stone-900 ring-offset-2" : ""
              }`}
              style={{ backgroundColor: option }}
            />
          ))}
        </div>
      )}
    </div>
  );
}