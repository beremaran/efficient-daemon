import { describe, expect, it } from "vitest";
import { promptPreview } from "@/lib/history";
import { EMPTY_DRAFT, type Part } from "@/lib/types";

const withParts = (parts: Part[]) => ({ ...EMPTY_DRAFT, parts });

describe("promptPreview", () => {
  it("uses the first text Part, skipping media and empty text", () => {
    const d = withParts([
      { kind: "image", image: "http://x/a.png" },
      { kind: "text", text: "  " },
      { kind: "text", text: "Summarise\nthis   page" },
      { kind: "text", text: "later" },
    ]);
    expect(promptPreview(d)).toBe("Summarise this page");
  });

  it("truncates long prompts", () => {
    const d = withParts([{ kind: "text", text: "a".repeat(100) }]);
    expect(promptPreview(d, 10)).toBe("a".repeat(10) + "…");
  });

  it("is empty without text", () => {
    expect(promptPreview(withParts([{ kind: "pdf", pdf: "x" }]))).toBe("");
  });
});
