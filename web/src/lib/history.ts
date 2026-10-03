import type { Draft, Part } from "@/lib/types";

/** The start of the first non-empty text Part, whitespace collapsed. */
export function promptPreview(draft: Draft, max = 80): string {
  const text = draft.parts.find((p) => p.kind === "text" && p.text?.trim())?.text ?? "";
  const flat = text.trim().replace(/\s+/g, " ");
  return flat.length > max ? flat.slice(0, max) + "…" : flat;
}

const isUpload = (p: Part) => p.kind === "pdf" || (p.kind === "image" && p.source !== "url");

/** A copy of the Draft without file data; upload Parts keep their file names. */
export function stripFileData(draft: Draft): Draft {
  return {
    ...draft,
    parts: draft.parts.map((p) => (isUpload(p) ? { ...p, [p.kind]: "" } : p)),
  };
}

/** File names of upload Parts that have no data, so the user must pick them again. */
export function filesToPick(draft: Draft): string[] {
  return draft.parts.flatMap((p) => (isUpload(p) && p.fileName && !(p.kind === "image" ? p.image : p.pdf) ? [p.fileName] : []));
}
