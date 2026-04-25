import * as React from "react";
import { cn } from "@/lib/utils/cn";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: "neutral" | "success" | "warning" | "destructive" | "info";
}

const TONES: Record<NonNullable<BadgeProps["tone"]>, string> = {
  neutral: "bg-[var(--color-surface)] text-[var(--color-foreground)]",
  success: "bg-green-100 text-green-900",
  warning: "bg-amber-100 text-amber-900",
  destructive: "bg-red-100 text-red-900",
  info: "bg-blue-100 text-blue-900",
};

export function Badge({ tone = "neutral", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}
