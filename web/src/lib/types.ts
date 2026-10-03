// Domain types mirroring the server's POST /ask body, plus shared UI types.

export interface Part {
  /** Stable across add, move and remove; the Ask request drops it. */
  id: string;
  kind: "text" | "image" | "pdf";
  text?: string;
  /** base64 (no data: prefix) when source=upload, else an http(s) URL. */
  image?: string;
  pdf?: string;
  /** Where media came from; drives the upload/URL toggle. */
  source?: "upload" | "url";
  /** Original filename for upload parts, display only. */
  fileName?: string;
  /** The image value of the other source, kept while the Part shows this one. */
  parked?: { image?: string; fileName?: string };
}

export interface Settings {
  /** "" keeps the server default. */
  provider: string;
  model: string;
  baseURL: string;
  apiKey: string;
  reasoningEffort: string;
  temperatureEnabled: boolean;
  temperature: string;
  maxTokensEnabled: boolean;
  maxTokens: string;
  timeout: string;
  /** jevjam only; "" keeps the server default. */
  maxScoreLevels: string;
}

export interface Draft {
  settings: Settings;
  system: string;
  parts: Part[];
  schema: string;
}

export interface RunRecord {
  at: number;
  status: number | null;
  latencyMs: number | null;
  model: string;
  /** The raw Draft that ran; restore puts it back as-is. */
  draft: Draft;
  response: unknown;
  responseText: string;
  error: string | null;
}

export const PROVIDERS = ["openai", "jevjam"] as const;

export const REASONING_EFFORTS = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

// Keep in sync with internal/server (maxBodyBytes) and internal/message.
export const MAX_BODY_BYTES = 30 << 20; // 30 MiB request body cap
export const MAX_IMAGE_BYTES = 20 << 20; // 20 MiB per image file

export const DEFAULT_SETTINGS: Settings = {
  provider: "",
  model: "",
  baseURL: "",
  apiKey: "",
  reasoningEffort: "",
  temperatureEnabled: false,
  temperature: "0.7",
  maxTokensEnabled: false,
  maxTokens: "",
  timeout: "",
  maxScoreLevels: "",
};

export const DEFAULT_SCHEMA = `{
  "type": "object",
  "properties": {
    "answer": { "type": "string" }
  },
  "required": ["answer"],
  "additionalProperties": false
}`;

export const EMPTY_DRAFT: Draft = {
  settings: { ...DEFAULT_SETTINGS },
  system: "",
  parts: [{ id: "initial-part", kind: "text", text: "" }],
  schema: DEFAULT_SCHEMA,
};