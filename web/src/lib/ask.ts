// The Ask request: the POST /ask body built from a Draft. Run, codegen, lint
// and the payload meter all read from one build, so they cannot drift.

import type { Draft, Part, Settings } from "@/lib/types";

export type AskBody = Record<string, unknown>;

export type AskRequest =
  | { ok: true; body: AskBody; json: string; bytes: number }
  | { ok: false; error: string };

/** Fills empty settings from the server's defaults. */
export function resolveSettings(settings: Settings, serverDefaults: Partial<Settings>): Settings {
  const provider = settings.provider || String(serverDefaults.provider ?? "");
  // The server's model and base URL belong to its own provider.
  const own = provider === serverDefaults.provider;
  return {
    ...settings,
    provider,
    model: settings.model.trim() || (own ? String(serverDefaults.model ?? "").trim() : ""),
    baseURL: settings.baseURL.trim() || (own ? String(serverDefaults.baseURL ?? "").trim() : ""),
    maxScoreLevels: settings.maxScoreLevels.trim() || String(serverDefaults.maxScoreLevels ?? ""),
  };
}

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

/** Builds the Ask request from a Draft, filling settings from server defaults. */
export function askFromDraft(draft: Draft, serverDefaults: Partial<Settings>): AskRequest {
  return buildAskRequest({ ...draft, settings: resolveSettings(draft.settings, serverDefaults) });
}

/** Copies the Draft for history with the settings that resolved for this run. */
export function snapshotDraftForHistory(
  draft: Draft,
  body: AskBody,
  serverDefaults: Partial<Settings>,
): Draft {
  const resolved = resolveSettings(draft.settings, serverDefaults);
  const jevjam = String(body.provider ?? resolved.provider) === "jevjam";
  const serverTemperature = serverDefaults.temperatureEnabled ?? Boolean(serverDefaults.temperature?.trim());
  const serverMaxTokens = serverDefaults.maxTokensEnabled ?? Boolean(serverDefaults.maxTokens?.trim());

  return {
    ...draft,
    settings: {
      ...resolved,
      provider: String(body.provider ?? resolved.provider),
      model: String(body.model ?? resolved.model),
      baseURL: String(body["base-url"] ?? resolved.baseURL),
      apiKey: "",
      // Preserve the hidden provider-specific controls as they were in the
      // Draft; they did not participate in a jevjam run (or vice versa).
      reasoningEffort: jevjam
        ? draft.settings.reasoningEffort
        : String(body["reasoning-effort"] ?? serverDefaults.reasoningEffort ?? draft.settings.reasoningEffort),
      temperatureEnabled: jevjam
        ? draft.settings.temperatureEnabled
        : body.temperature !== undefined || serverTemperature || draft.settings.temperatureEnabled,
      temperature: String(
        jevjam
          ? draft.settings.temperature
          : body.temperature ?? (serverTemperature ? serverDefaults.temperature : undefined) ?? draft.settings.temperature,
      ),
      maxTokensEnabled: jevjam
        ? draft.settings.maxTokensEnabled
        : body["max-tokens"] !== undefined || serverMaxTokens || draft.settings.maxTokensEnabled,
      maxTokens: String(
        jevjam
          ? draft.settings.maxTokens
          : body["max-tokens"] ?? (serverMaxTokens ? serverDefaults.maxTokens : undefined) ?? draft.settings.maxTokens,
      ),
      timeout: String(body.timeout ?? serverDefaults.timeout ?? draft.settings.timeout),
      maxScoreLevels: jevjam
        ? String(body["max-score-levels"] ?? serverDefaults.maxScoreLevels ?? draft.settings.maxScoreLevels)
        : draft.settings.maxScoreLevels,
    },
  };
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

// A string, a punctuation mark, or a bare token (number, true, false, null).
const JSON_TOKEN = /"(?:[^"\\]|\\.)*"|[{}[\],:]|[^\s{}[\],:"]+/g;

/** Indents valid JSON without changing any token, so big numbers keep their digits; returns any other text unchanged. */
export function prettyJson(text: string): string {
  try {
    JSON.parse(text);
  } catch {
    return text;
  }
  let out = "";
  let depth = 0;
  let prev = " ";
  const pad = () => "\n" + "  ".repeat(depth);
  for (const [t] of text.matchAll(JSON_TOKEN)) {
    if (t === "}" || t === "]") {
      depth--;
      out += ("{[".includes(prev) ? "" : pad()) + t;
    } else {
      if ("{[".includes(prev) && t !== ",") out += pad();
      if (t === "{" || t === "[") depth++;
      out += t === "," ? ",\n" + "  ".repeat(depth) : t === ":" ? ": " : t;
    }
    prev = t;
  }
  return out;
}
