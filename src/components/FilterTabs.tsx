import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Primary filter pill row — the original gradient-fill pill language used by
 * Discover tabs, Search category tabs, and Library status filters. One
 * component replaces the four per-page variants.
 *
 * The row scrolls horizontally without a visible scrollbar (mobile).
 */
export interface FilterTabOption<T extends string = string> {
  value: T;
  label: string;
  icon?: LucideIcon;
}

export function FilterTabs<T extends string = string>({
  options,
  value,
  onChange,
  size = "md",
  className,
}: {
  options: FilterTabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div className={cn("flex gap-2 overflow-x-auto pb-1 scrollbar-none", className)} role="tablist">
      {options.map((opt) => {
        const isActive = value === opt.value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(opt.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border font-medium transition-all btn-press shrink-0",
              size === "md" ? "px-4 py-2 text-sm" : "px-4 py-1.5 text-sm",
              "border-[rgba(148,163,184,0.18)] bg-[#0b1220] text-foreground",
              isActive ? "border-[rgba(148,163,184,0.35)]" : "",
            )}
          >
            {Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Secondary toggle chip — compact tinted pill for type filters, genre
 * selection, and sort modes (the original library type-pill /
 * discover-sort language). Supports single or multi select.
 */
export function Chip({
  active,
  onClick,
  children,
  tone = "primary",
  className,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  /** primary = indigo tint (default), accent = violet tint */
  tone?: "primary" | "accent";
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3 py-1 text-[11px] uppercase tracking-wider font-medium transition-colors shrink-0",
        "border-[rgba(148,163,184,0.18)] bg-[#0b1220] text-foreground",
        active ? "border-[rgba(148,163,184,0.35)]" : "",
        className,
      )}
    >
      {children}
    </button>
  );
}
