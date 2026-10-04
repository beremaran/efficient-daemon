// POST /schema/lint client.

import { errorMessage } from "@/lib/utils";

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
      errors: [`lint failed: ${errorMessage(err)}`],
      warnings: [],
    };
  }
}

/** The result to show while a check runs: the last one, marked out of date. */
export function lintView(lint: LintResult | null, linting: boolean) {
  return { errors: lint?.errors ?? [], warnings: lint?.warnings ?? [], stale: !!lint && linting };
}

/** Run needs a finished check that passed; no result yet, or a check in progress, blocks it. */
export function lintAllowsRun(lint: LintResult | null, checking: boolean): boolean {
  return !!lint && !checking && lint.errors.length === 0;
}
