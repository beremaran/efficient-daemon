// Part list operations. Each Part carries an id that survives add, move and
// remove, so the list can key on it.

import type { Part } from "@/lib/types";

export const newPartId = () => crypto.randomUUID();

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

export function movePart(parts: Part[], index: number, delta: -1 | 1): Part[] {
  const target = index + delta;
  if (target < 0 || target >= parts.length) return parts;
  const next = [...parts];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
