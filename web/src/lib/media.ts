// File → base64 helpers and the client-side payload guards agreed in design:
// 20 MiB per image, base64-inflated total measured against the 30 MiB body cap.

import {
  BASE64_INFLATION,
  MAX_BODY_BYTES,
  MAX_IMAGE_BYTES,
  type Part,
} from "@/lib/types";

/** Reads a File as base64 (without the data: prefix). */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

/** Serialized size of one media value once inside the JSON body. */
function partBytes(part: Part): number {
  let media = "";
  if (part.kind === "image") media = part.image ?? "";
  if (part.kind === "pdf") media = part.pdf ?? "";
  if (part.source === "url") return new Blob([media]).size;
  return new Blob([media]).size * BASE64_INFLATION;
}

/** Approximate POST /ask body size for the current draft. */
export function estimateBodyBytes(parts: Part[], schema: string, system: string): number {
  let total = 500; // envelope, settings fields, headroom
  for (const part of parts) {
    if (part.kind === "text") total += new Blob([part.text ?? ""]).size + 40;
    else total += partBytes(part) + 80;
  }
  total += new Blob([system]).size;
  total += new Blob([schema]).size;
  return total;
}

export interface PartGuardResult {
  ok: boolean;
  message?: string;
}

/** Client-side mirror of the server's per-image guard. PDFs are size-capped only by the body budget. */
export function checkImageFile(file: File): PartGuardResult {
  if (file.size > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      message: `${file.name} is ${(file.size / (1 << 20)).toFixed(1)} MB; the maximum image size is ${MAX_IMAGE_BYTES / (1 << 20)} MB`,
    };
  }
  return { ok: true };
}

export const MAX_BODY_MB = Math.floor(MAX_BODY_BYTES / (1 << 20));