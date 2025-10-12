"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/utils/cn";

type PaneToggleProps = {
  icon: LucideIcon;
  pressed: boolean;
  onClick: () => void;
  ariaLabel: string;
};

export function PaneToggle({ icon: Icon, pressed, onClick, ariaLabel }: PaneToggleProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={pressed}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-white/5 text-white/70 transition-colors",
        pressed ? "bg-[#2b2d42]/80 text-white" : "hover:bg-white/10"
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
