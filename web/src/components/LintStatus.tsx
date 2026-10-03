import { Badge } from "@/components/ui/badge";
import type { LintResult } from "@/lib/lint";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// Always in the page, so screen readers announce text changes inside it.
// While a check runs, the last result stays and the text marks it out of date.
// The text, not a fade, marks it: a faded badge would drop below 4.5:1 contrast.
export function LintStatus({ lint, linting }: { lint: LintResult | null; linting: boolean }) {
  const ok = lint && lint.valid && lint.warnings.length === 0;
  return (
    <div role="status" className="flex items-center gap-1 text-xs text-muted-foreground">
      {linting && <span>{lint ? "out of date, checking…" : "checking…"}</span>}
      {lint && ok && (
        <Badge className="border-emerald-600/30 bg-emerald-50 text-emerald-700">schema OK</Badge>
      )}
      {lint && !lint.valid && (
        <Badge className="border-destructive/30 bg-destructive/10 text-destructive">
          invalid: {plural(lint.errors.length, "error")}
        </Badge>
      )}
      {lint && lint.warnings.length > 0 && (
        <Badge className="border-warning/40 bg-warning/10 text-warning-foreground">
          {plural(lint.warnings.length, "warning")}
        </Badge>
      )}
    </div>
  );
}
