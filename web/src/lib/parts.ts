// Part list operations. Each Part carries an id that survives add, move and
// remove, so the list can key on it.

import type { Part } from "@/lib/types";

// randomUUID exists only in secure contexts, not on a LAN IP over plain HTTP.
export const newPartId = () =>
  crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export function newPart(kind: Part["kind"]): Part {
  const id = newPartId();
  if (kind === "text") return { id, kind, text: "" };
  if (kind === "image") return { id, kind, source: "url", image: "" };
  return { id, kind, pdf: "" };
}

/** Gives every Part without an id one, e.g. a Draft saved before ids existed. */
export const withPartIds = (parts: Part[]): Part[] =>
  parts.map((p) => (p.id ? p : { ...p, id: newPartId() }));

export const removePart = (parts: Part[], index: number): Part[] => parts.filter((_, i) => i !== index);

/** True when the Part holds an uploaded file, shown or parked. */
export const hasFile = (part: Part): boolean =>
  part.kind === "pdf"
    ? !!part.pdf
    : part.kind === "image" && (part.source === "upload" ? !!part.image : !!part.parked?.image);

/** Switches an image Part to `source`, swapping in the value it left there last time. */
export const switchImageSource = (part: Part, source: "upload" | "url"): Partial<Part> => ({
  source,
  image: part.parked?.image ?? "",
  fileName: part.parked?.fileName,
  parked: { image: part.image, fileName: part.fileName },
});

/** Puts a removed Part back at `index`, or at the end if the list shrank. */
export const restorePart = (parts: Part[], part: Part, index: number): Part[] =>
  [...parts.slice(0, index), part, ...parts.slice(index)];

/** Id of the Part that takes focus after removing the one at `index`: the next, else the previous. */
export const focusAfterRemove = (parts: Part[], index: number): string | undefined =>
  (parts[index + 1] ?? parts[index - 1])?.id;

export function movePart(parts: Part[], index: number, delta: -1 | 1): Part[] {
  const target = index + delta;
  if (target < 0 || target >= parts.length) return parts;
  const next = [...parts];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
