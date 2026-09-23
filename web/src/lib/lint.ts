// POST /schema/lint client.

export interface LintResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export async function lintSchema(schema: string): Promise<LintResult> {
  if (!schema.trim()) return { valid: false, errors: ["schema is required"], warnings: [] };
  try {
    const res = await fetch("/schema/lint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schema: schema }),
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