import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LintStatus } from "@/components/LintStatus";

const render = (lint: Parameters<typeof LintStatus>[0]["lint"], linting = false) =>
  renderToStaticMarkup(<LintStatus lint={lint} linting={linting} />);

describe("LintStatus", () => {
  it("keeps the status region when there is nothing to report", () => {
    expect(render(null)).toContain('role="status"');
  });

  it("announces checking", () => {
    const html = render(null, true);
    expect(html).toContain('role="status"');
    expect(html).toContain("checking…");
  });

  it("announces schema OK", () => {
    expect(render({ valid: true, errors: [], warnings: [] })).toContain("schema OK");
  });

  it("includes issue counts in the status text", () => {
    const html = render({ valid: false, errors: ["a", "b"], warnings: ["w"] });
    expect(html).toContain('role="status"');
    expect(html).toContain("2 errors");
    expect(html).toContain("1 warning");
  });

  describe("while a check runs", () => {
    it("keeps the last result and marks it out of date", () => {
      const html = render({ valid: false, errors: ["a", "b"], warnings: ["w"] }, true);
      expect(html).toContain("out of date, checking…");
      expect(html).toContain("2 errors");
      expect(html).toContain("1 warning");
      expect(render({ valid: true, errors: [], warnings: [] }, true)).toContain("schema OK");
    });

    it("does not fade the text below 4.5:1 contrast", () => {
      expect(render({ valid: true, errors: [], warnings: [] }, true)).not.toContain("opacity-");
    });

    it("says only checking when there is no last result", () => {
      expect(render(null, true)).not.toContain("out of date");
    });
  });
});
