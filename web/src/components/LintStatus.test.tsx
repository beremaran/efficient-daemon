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
});
