import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Chrome, Firefox and Safari word a failed fetch differently.
const NETWORK_FAILURE = /failed to fetch|networkerror|load failed/i;

/** The text to show for a caught error; a failed fetch gets a plain message. */
export function errorMessage(err: unknown): string {
  if (err instanceof TypeError && NETWORK_FAILURE.test(err.message)) return "Cannot reach the workbench server";
  return err instanceof Error ? err.message : String(err);
}
