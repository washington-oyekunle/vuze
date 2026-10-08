import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  tone = "neutral",
  ...props
}: React.ComponentProps<"span"> & { tone?: "neutral" | "good" | "warn" | "bad" | "accent" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        tone === "neutral" && "bg-secondary text-muted-foreground",
        tone === "good" && "bg-good/15 text-good",
        tone === "warn" && "bg-warn/15 text-warn",
        tone === "bad" && "bg-destructive/15 text-destructive",
        tone === "accent" && "bg-primary text-primary-foreground",
        className,
      )}
      {...props}
    />
  );
}
