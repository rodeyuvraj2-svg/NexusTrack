import type { LucideIcon } from "lucide-react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Inline error panel matching the original glass empty-state panels:
 * icon, message, optional detail line, optional retry action.
 */
export function ErrorPanel({
  icon: Icon = AlertCircle,
  title,
  detail,
  action,
  tone = "muted",
  className,
}: {
  icon?: LucideIcon;
  title: string;
  detail?: string | null;
  action?: React.ReactNode;
  /** muted = neutral unavailable state, destructive = hard failure */
  tone?: "muted" | "destructive";
  className?: string;
}) {
  return (
    <div className={cn("glass rounded-2xl p-12 text-center animate-fade-in", className)}>
      <Icon
        className={cn(
          "mx-auto mb-3 h-8 w-8",
          tone === "destructive" ? "text-destructive" : "text-muted-foreground",
        )}
      />
      <p
        className={cn(
          "text-sm",
          tone === "destructive" ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {title}
      </p>
      {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
