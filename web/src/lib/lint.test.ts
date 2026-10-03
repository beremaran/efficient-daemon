import { describe, expect, it } from "vitest";
import { lintAllowsRun, lintView, type LintResult } from "@/lib/lint";

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

describe("lintAllowsRun", () => {
  const ok: LintResult = { valid: true, errors: [], warnings: ["loose"] };

  it("blocks Run while a check runs, even after a passing result", () => {
    expect(lintAllowsRun(ok, true)).toBe(false);
  });

  it("allows Run once the finished check passes", () => {
    expect(lintAllowsRun(ok, false)).toBe(true);
  });

  it("blocks Run when the finished check fails", () => {
    expect(lintAllowsRun(result, false)).toBe(false);
  });

  it("blocks Run before the first check ends", () => {
    expect(lintAllowsRun(null, false)).toBe(false);
  });
});
