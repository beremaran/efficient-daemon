import { describe, expect, it } from "vitest";
import { lintView, type LintResult } from "@/lib/lint";

const result: LintResult = { valid: false, errors: ["bad"], warnings: ["loose"] };

describe("lintView", () => {
  it("keeps the last result, marked out of date, while a check runs", () => {
    expect(lintView(result, true)).toEqual({ errors: ["bad"], warnings: ["loose"], stale: true });
  });

  it("is current once the check ends", () => {
    expect(lintView(result, false).stale).toBe(false);
  });

  it("has nothing to mark before the first result", () => {
    expect(lintView(null, true)).toEqual({ errors: [], warnings: [], stale: false });
  });
});
