import { copyText } from "@/lib/store";

export type CopyResult = "copied" | "failed";

export const COPY_MESSAGES: Record<CopyResult, string> = {
  copied: "Copied",
  failed: "Clipboard blocked (plain HTTP?). Select the text and press Ctrl+C.",
};

export const copyResult = async (text: string): Promise<CopyResult> => ((await copyText(text)) ? "copied" : "failed");
