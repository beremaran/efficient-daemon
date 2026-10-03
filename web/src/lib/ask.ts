// The Ask request: the POST /ask body built from a Draft. Run, codegen, lint
// and the payload meter all read from one build, so they cannot drift.

import type { Draft, Part } from "@/lib/types";

export type AskBody = Record<string, unknown>;

export type AskRequest =
  | { ok: true; body: AskBody; json: string; bytes: number }
  | { ok: false; error: string };

/** Builds the Ask request from a Draft whose settings already hold server defaults. */
export function buildAskRequest(draft: Draft): AskRequest {
  if (!draft.schema.trim()) return { ok: false, error: "schema is required" };
  let schema: unknown;
  try {
    schema = JSON.parse(draft.schema);
  } catch (err) {
    return { ok: false, error: `schema is not valid JSON: ${err instanceof Error ? err.message : String(err)}` };
  }
  const s = draft.settings;
  const jevjam = s.provider === "jevjam";
  const body: AskBody = { schema };
  if (s.provider) body.provider = s.provider;
  if (draft.system.trim() && !jevjam) body.system = draft.system;
  body.parts = draft.parts.map((p) => {
    if (p.kind === "text") return { text: p.text ?? "" };
    if (p.kind === "image") return { image: p.image ?? "" };
    return { pdf: p.pdf ?? "" };
  });
  if (s.model.trim()) body.model = s.model.trim();
  if (s.baseURL.trim()) body["base-url"] = s.baseURL.trim();
  if (s.apiKey.trim()) body["api-key"] = s.apiKey.trim();
  if (s.timeout.trim()) body.timeout = s.timeout.trim();
  if (jevjam) {
    if (s.maxScoreLevels.trim()) body["max-score-levels"] = Number(s.maxScoreLevels);
  } else {
    if (s.reasoningEffort.trim()) body["reasoning-effort"] = s.reasoningEffort.trim();
    if (s.temperatureEnabled && s.temperature.trim()) body.temperature = Number(s.temperature);
    if (s.maxTokensEnabled && s.maxTokens.trim()) body["max-tokens"] = Number(s.maxTokens);
  }
  const json = JSON.stringify(body, null, 2);
  return { ok: true, body, json, bytes: new Blob([json]).size };
}

/** The POST /schema/lint body: the Ask request fields that change lint results. */
export function lintBody(body: AskBody): AskBody {
  return { schema: body.schema, provider: body.provider, "max-score-levels": body["max-score-levels"] };
}

/** Shell single-quote escaping: 'foo' → 'foo'\'' */
export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/**
 * `efficient-daemon ask` arguments for the Ask request. CLI flags share the
 * body's key names; parts come from the Draft, which knows upload file names.
 * The CLI has no PDF flag, so PDF parts are left out.
 */
export function cliArgs(body: AskBody, parts: Part[]): string[] {
  const flags = Object.entries(body)
    .filter(([key]) => key !== "schema" && key !== "parts")
    .map(([key, value]) => `--${key} ${typeof value === "number" ? value : shellQuote(String(value))}`);
  const prompt = parts
    .filter((p) => p.kind === "text")
    .map((p) => p.text ?? "")
    .join("\n\n");
  const images = parts
    .filter((p) => p.kind === "image")
    .map((p) => `--image ${shellQuote(p.source === "url" ? (p.image ?? "") : `./${p.fileName ?? "image"}`)}`);
  return [...flags, "--schema schema.json", ...(prompt ? [shellQuote(prompt)] : []), ...images];
}
