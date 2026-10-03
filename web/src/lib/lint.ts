// POST /schema/lint client.

export interface LintResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/** Lints a JSON lint body (see lintBody in @/lib/ask). */
export async function lintSchema(body: string): Promise<LintResult> {
  try {
    const res = await fetch("/schema/lint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (!res.ok) {
      // The endpoint itself failed; treat as a lint error so Run stays blocked.
      const detail = await res.text();
      return { valid: false, errors: [`lint failed: ${res.status} ${detail}`], warnings: [] };
    }
    return (await res.json()) as LintResult;
  } catch (err) {
    return {
      valid: false,
      errors: [`lint failed: ${err instanceof Error ? err.message : String(err)}`],
      warnings: [],
    };
  }
}

/** The result to show while a check runs: the last one, marked out of date. */
export function lintView(lint: LintResult | null, linting: boolean) {
  return { errors: lint?.errors ?? [], warnings: lint?.warnings ?? [], stale: !!lint && linting };
}
