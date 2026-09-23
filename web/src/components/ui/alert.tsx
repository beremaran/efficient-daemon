import * as React from "react";

import { cn } from "@/lib/utils";

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & { variant?: "default" | "destructive" }) {
  return (
    <div
      className={cn(
        "relative w-full rounded-lg border px-4 py-3 text-sm",
        variant === "destructive" && "border-destructive/50 bg-destructive/10 text-destructive",
        className,
      )}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mb-1 font-medium", className)} {...props} />;
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("text-sm break-words", className)} {...props} />;
}

export { Alert, AlertTitle, AlertDescription };