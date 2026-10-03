// File → base64 helpers and the client-side payload guards agreed in design:
// 20 MiB per image; the Ask request's size is measured against the 30 MiB body cap.

import { MAX_BODY_BYTES, MAX_IMAGE_BYTES } from "@/lib/types";

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

/** Reads a picked file for a Part; a size or read failure comes back as a message, not a throw. */
export async function readPartFile(
  file: File,
  enforceImageCap?: boolean,
): Promise<{ base64: string } | { message: string }> {
  const guard = enforceImageCap ? checkImageFile(file) : { ok: true, message: undefined };
  if (!guard.ok) return { message: guard.message as string };
  try {
    return { base64: await fileToBase64(file) };
  } catch {
    return { message: `Could not read ${file.name}` };
  }
}

export const MAX_BODY_MB = Math.floor(MAX_BODY_BYTES / (1 << 20));