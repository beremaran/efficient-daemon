import { describe, expect, it } from "vitest";
import { filesToPick, promptPreview, stripFileData } from "@/lib/history";
import { hasFile } from "@/lib/parts";
import { EMPTY_DRAFT, type Draft, type Part } from "@/lib/types";

const withParts = (parts: Part[]) => ({ ...EMPTY_DRAFT, parts });

describe("promptPreview", () => {
  it("uses the first text Part, skipping media and empty text", () => {
    const d = withParts([
      { id: "p", kind: "image", image: "http://x/a.png" },
      { id: "p", kind: "text", text: "  " },
      { id: "p", kind: "text", text: "Summarise\nthis   page" },
      { id: "p", kind: "text", text: "later" },
    ]);
    expect(promptPreview(d)).toBe("Summarise this page");
  });

  it("truncates long prompts", () => {
    const d = withParts([{ id: "p", kind: "text", text: "a".repeat(100) }]);
    expect(promptPreview(d, 10)).toBe("a".repeat(10) + "…");
  });

  it("is empty without text", () => {
    expect(promptPreview(withParts([{ id: "p", kind: "pdf", pdf: "x" }]))).toBe("");
  });
});

describe("history files", () => {
  const draft = withParts([
    { id: "p", kind: "text", text: "hi" },
    { id: "p", kind: "image", source: "upload", image: "QUJD", fileName: "a.png" },
    { id: "p", kind: "image", source: "url", image: "http://x/b.png" },
    { id: "p", kind: "pdf", pdf: "REVG", fileName: "c.pdf" },
  ]);

  it("saves file names without file data and restores a list of files to pick", () => {
    const saved = JSON.parse(JSON.stringify(stripFileData(draft))) as Draft;
    expect(saved.parts[1]).toEqual({ id: "p", kind: "image", source: "upload", image: "", fileName: "a.png" });
    expect(saved.parts[2]).toEqual(draft.parts[2]);
    expect(saved.parts[3]).toEqual({ id: "p", kind: "pdf", pdf: "", fileName: "c.pdf" });
    expect(filesToPick(saved)).toEqual(["a.png", "c.pdf"]);
  });

  it("drops an upload parked behind the URL tab", () => {
    const parked = withParts([
      { id: "p", kind: "image", source: "url", image: "http://x/b.png", parked: { image: "QUJD", fileName: "a.png" } },
    ]);
    const saved = JSON.parse(JSON.stringify(stripFileData(parked))) as Draft;
    expect(saved.parts[0]).toEqual({
      id: "p",
      kind: "image",
      source: "url",
      image: "http://x/b.png",
      parked: { image: "", fileName: "a.png" },
    });
    expect(JSON.stringify(saved)).not.toContain("QUJD");
  });

  it("restores a Part that holds no file", () => {
    const parked = withParts([
      { id: "p", kind: "image", source: "url", image: "http://x/b.png", parked: { image: "QUJD", fileName: "a.png" } },
    ]);
    expect(hasFile(parked.parts[0])).toBe(true);
    expect(hasFile(stripFileData(parked).parts[0])).toBe(false);
  });

  it("keeps a URL parked behind the upload tab", () => {
    const parked = withParts([
      { id: "p", kind: "image", source: "upload", image: "QUJD", fileName: "a.png", parked: { image: "http://x/b.png" } },
    ]);
    expect(stripFileData(parked).parts[0].parked).toEqual({ image: "http://x/b.png" });
  });

  it("keeps old history with file data loading without asking to pick files", () => {
    expect(filesToPick(draft)).toEqual([]);
  });
});
