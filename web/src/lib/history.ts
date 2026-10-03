import type { Draft } from "@/lib/types";

/** The start of the first non-empty text Part, whitespace collapsed. */
export function promptPreview(draft: Draft, max = 80): string {
  const text = draft.parts.find((p) => p.kind === "text" && p.text?.trim())?.text ?? "";
  const flat = text.trim().replace(/\s+/g, " ");
  return flat.length > max ? flat.slice(0, max) + "…" : flat;
}
