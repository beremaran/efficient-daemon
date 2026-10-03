import { useEffect, useRef, useState, type ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { COPY_MESSAGES, copyResult, type CopyResult } from "@/lib/copy";

export function CopyButton({
  text,
  children,
  ...props
}: { text: string } & Omit<ComponentProps<typeof Button>, "onClick">) {
  const [result, setResult] = useState<CopyResult | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    setResult(await copyResult(text));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setResult(null), 4000);
  };

  return (
    <>
      {/* Stays mounted so screen readers announce the result. */}
      <span role="status" className={result === "failed" ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
        {result && COPY_MESSAGES[result]}
      </span>
      <Button {...props} onClick={copy}>
        {children}
      </Button>
    </>
  );
}
