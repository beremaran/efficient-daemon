import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PartsEditor } from "@/components/PartsEditor";

describe("PartsEditor size meter", () => {
  it("calls the size the Ask request", () => {
    const html = renderToStaticMarkup(<PartsEditor parts={[]} onPartsChange={() => {}} bytes={1 << 20} />);
    expect(html).toContain("Ask request ≈ 1.0 MB / 30 MB cap");
    expect(html).not.toMatch(/request body|payload/i);
  });
});
