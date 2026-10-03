import { describe, expect, it } from "vitest";
import { focusAfterRemove, hasFile, movePart, newPart, removePart, restorePart, withPartIds } from "@/lib/parts";
import { loadDraft } from "@/lib/store";

const texts = (parts: { text?: string }[]) => parts.map((p) => p.text);

describe("part ids", () => {
  const parts = [
    { ...newPart("text"), text: "a" },
    { ...newPart("text"), text: "b" },
    { ...newPart("text"), text: "c" },
  ];

  it("gives each new Part its own id", () => {
    expect(new Set(parts.map((p) => p.id)).size).toBe(3);
  });

  it("keeps text with its Part after a move", () => {
    const moved = movePart(parts, 0, 1);
    expect(texts(moved)).toEqual(["b", "a", "c"]);
    expect(moved.map((p) => p.id)).toEqual([parts[1].id, parts[0].id, parts[2].id]);
  });

  it("ignores a move past either end", () => {
    expect(movePart(parts, 0, -1)).toBe(parts);
    expect(movePart(parts, 2, 1)).toBe(parts);
  });

  it("keeps text with its Part after a remove", () => {
    const rest = removePart(parts, 1);
    expect(texts(rest)).toEqual(["a", "c"]);
    expect(rest.map((p) => p.id)).toEqual([parts[0].id, parts[2].id]);
  });

  it("adds ids to Parts that lack one and keeps existing ids", () => {
    const old = [{ kind: "text", text: "x" }, { id: "keep", kind: "text", text: "y" }] as never[];
    const [a, b] = withPartIds(old);
    expect(a.id).toBeTruthy();
    expect(b.id).toBe("keep");
  });
});

describe("loadDraft", () => {
  it("loads a Draft saved without Part ids and gives each Part an id", () => {
    const saved = { system: "s", parts: [{ kind: "text", text: "a" }, { kind: "pdf", pdf: "QUJD" }] };
    const store = { getItem: () => JSON.stringify(saved) };
    globalThis.localStorage = store as unknown as Storage;
    const { parts } = loadDraft();
    expect(texts(parts)).toEqual(["a", undefined]);
    expect(parts.every((p) => p.id)).toBe(true);
    expect(parts[0].id).not.toBe(parts[1].id);
  });
});

describe("focusAfterRemove", () => {
  const parts = [newPart("text"), newPart("image"), newPart("pdf")];

  it("picks the next Part", () => {
    expect(focusAfterRemove(parts, 0)).toBe(parts[1].id);
    expect(focusAfterRemove(parts, 1)).toBe(parts[2].id);
  });

  it("picks the previous Part when the last one goes", () => {
    expect(focusAfterRemove(parts, 2)).toBe(parts[1].id);
  });

  it("picks nothing when no Parts remain", () => {
    expect(focusAfterRemove(parts.slice(0, 1), 0)).toBeUndefined();
  });
});

describe("undo remove", () => {
  const a = { ...newPart("text"), text: "a" };
  const file = { ...newPart("pdf"), pdf: "AAAA", fileName: "doc.pdf" };
  const c = { ...newPart("text"), text: "c" };

  it("offers undo only for a Part with an uploaded file", () => {
    expect(hasFile(file)).toBe(true);
    expect(hasFile({ ...newPart("image"), source: "upload", image: "AAAA" })).toBe(true);
    expect(hasFile({ ...newPart("image"), source: "url", image: "https://x/y.png" })).toBe(false);
    expect(hasFile(newPart("pdf"))).toBe(false);
    expect(hasFile(a)).toBe(false);
  });

  it("puts the Part back in the same place with its file", () => {
    const parts = [a, file, c];
    const after = removePart(parts, 1);
    expect(restorePart(after, file, 1)).toEqual(parts);
  });

  it("puts the Part at the end when the list shrank", () => {
    expect(restorePart([a], file, 5)).toEqual([a, file]);
  });
});
