import { describe, expect, it } from "vitest";
import { filesToPick, promptPreview, stripFileData } from "@/lib/history";
import { EMPTY_DRAFT, type Draft, type Part } from "@/lib/types";

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

describe("history files", () => {
  const draft = withParts([
    { kind: "text", text: "hi" },
    { kind: "image", source: "upload", image: "QUJD", fileName: "a.png" },
    { kind: "image", source: "url", image: "http://x/b.png" },
    { kind: "pdf", pdf: "REVG", fileName: "c.pdf" },
  ]);

  it("saves file names without file data and restores a list of files to pick", () => {
    const saved = JSON.parse(JSON.stringify(stripFileData(draft))) as Draft;
    expect(saved.parts[1]).toEqual({ kind: "image", source: "upload", image: "", fileName: "a.png" });
    expect(saved.parts[2]).toEqual(draft.parts[2]);
    expect(saved.parts[3]).toEqual({ kind: "pdf", pdf: "", fileName: "c.pdf" });
    expect(filesToPick(saved)).toEqual(["a.png", "c.pdf"]);
  });

  it("keeps old history with file data loading without asking to pick files", () => {
    expect(filesToPick(draft)).toEqual([]);
  });
});
