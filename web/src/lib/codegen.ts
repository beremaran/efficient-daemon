// Snippet generation for the Codegen tab. Every target renders the same
// request: POST /ask on the daemon, schema inlined.
// Large base64 values are elided for display only; copied text is always full.

import type { Part, Settings } from "@/lib/types";

export interface Snippet {
  label: string;
  code: string;
}

/** Replaces very long base64 runs with a display-only placeholder. */
export function elideBase64(code: string): string {
  return code.replace(/[A-Za-z0-9+/]{1200,}={0,2}/g, (match) =>
    `<… ${match.length} chars of base64 …>`,
  );
}

/** Shell single-quote escaping: 'foo' → 'foo'\'' */
function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export function buildBody(
  parts: Part[],
  system: string,
  schema: string,
  settings: Settings,
): Record<string, unknown> {
  const s = settings;
  const jevjam = s.provider === "jevjam";
  const body: Record<string, unknown> = { schema: JSON.parse(schema) };
  if (s.provider) body.provider = s.provider;
  if (system.trim() && !jevjam) body.system = system;
  body.parts = parts.map((p) => {
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
    return body;
  }
  if (s.reasoningEffort.trim()) body["reasoning-effort"] = s.reasoningEffort.trim();
  if (s.temperatureEnabled && s.temperature.trim()) body.temperature = Number(s.temperature);
  if (s.maxTokensEnabled && s.maxTokens.trim()) body["max-tokens"] = Number(s.maxTokens);
  return body;
}

export function generateSnippets(
  parts: Part[],
  system: string,
  schema: string,
  settings: Settings,
  origin: string,
): Snippet[] {
  const body = buildBody(parts, system, schema, settings);
  const bodyJSON = JSON.stringify(body, null, 2);
  const s = settings;
  const jevjam = s.provider === "jevjam";

  // CLI: schema via heredoc, one prompt arg, --image flags. The ask CLI has no
  // PDF flag, so PDF parts are noted as API-only.
  const textParts = parts.filter((p) => p.kind === "text");
  const prompt = textParts.map((p) => p.text ?? "").join("\n\n");
  const imageFlags = parts
    .filter((p) => p.kind === "image")
    .map((p) =>
      p.source === "url"
        ? `  --image ${shellQuote(p.image ?? "")}`
        : `  --image ${shellQuote(`./${p.fileName ?? "image"}`)} # place the uploaded file at this path`,
    );
  const pdfNote = parts.some((p) => p.kind === "pdf")
    ? "# note: PDF parts are only supported over the HTTP API (see the curl tab)\n"
    : "";
  const cliFlags =
    (s.provider ? ` \\\n  --provider ${shellQuote(s.provider)}` : "") +
    (s.model.trim() ? ` \\\n  --model ${shellQuote(s.model.trim())}` : "") +
    (s.baseURL.trim() ? ` \\\n  --base-url ${shellQuote(s.baseURL.trim())}` : "") +
    (s.apiKey.trim() ? ` \\\n  --api-key ${shellQuote(s.apiKey.trim())}` : "") +
    (s.timeout.trim() ? ` \\\n  --timeout ${shellQuote(s.timeout.trim())}` : "") +
    (jevjam && s.maxScoreLevels.trim() ? ` \\\n  --max-score-levels ${Number(s.maxScoreLevels)}` : "") +
    (!jevjam && s.reasoningEffort.trim() ? ` \\\n  --reasoning-effort ${shellQuote(s.reasoningEffort.trim())}` : "") +
    (!jevjam && s.temperatureEnabled && s.temperature.trim()
      ? ` \\\n  --temperature ${Number(s.temperature)}`
      : "") +
    (!jevjam && s.maxTokensEnabled && s.maxTokens.trim() ? ` \\\n  --max-tokens ${Number(s.maxTokens)}` : "");

  const cli =
    `cat > schema.json <<'EOF'\n${schema.trim()}\nEOF\n\n` +
    pdfNote +
    `efficient-daemon ask${cliFlags} \\\n  --schema schema.json` +
    (prompt ? ` \\\n  ${shellQuote(prompt)}` : "") +
    imageFlags.map((f) => ` \\\n${f}`).join("");

  const curl =
    `curl -sS ${origin}/ask \\\n` +
    `  -H 'Content-Type: application/json' \\\n` +
    `  --data ${shellQuote(bodyJSON)}`;

  const python =
    `import json\nimport requests\n\n` +
    `body = json.loads(r"""\n${bodyJSON}\n""")\n\n` +
    `resp = requests.post("${origin}/ask", json=body, timeout=600)\n` +
    `resp.raise_for_status()\n` +
    `print(json.dumps(resp.json(), indent=2))`;

  const js =
    `const body = ${bodyJSON};\n\n` +
    `const resp = await fetch("${origin}/ask", {\n` +
    `  method: "POST",\n` +
    `  headers: { "Content-Type": "application/json" },\n` +
    `  body: JSON.stringify(body),\n` +
    `});\n` +
    `if (!resp.ok) throw new Error(\`HTTP \${resp.status}: \${await resp.text()}\`);\n` +
    `console.log(await resp.json());`;

  const goBody = bodyJSON.replaceAll("`", "` + \"`\" + `");
  const go =
    `package main\n\n` +
    `import (\n` +
    `\t"bytes"\n` +
    `\t"fmt"\n` +
    `\t"io"\n` +
    `\t"net/http"\n` +
    `)\n\n` +
    `func main() {\n` +
    `\tbody := []byte(\`${goBody}\`)\n` +
    `\tresp, err := http.Post("${origin}/ask", "application/json", bytes.NewReader(body))\n` +
    `\tif err != nil {\n` +
    `\t\tpanic(err)\n` +
    `\t}\n` +
    `\tdefer resp.Body.Close()\n` +
    `\traw, _ := io.ReadAll(resp.Body)\n` +
    `\tif resp.StatusCode != http.StatusOK {\n` +
    `\t\tpanic(fmt.Sprintf("HTTP %d: %s", resp.StatusCode, raw))\n` +
    `\t}\n` +
    `\tfmt.Println(string(raw))\n` +
    `}`;

  return [
    { label: "CLI", code: cli },
    { label: "curl", code: curl },
    { label: "Python", code: python },
    { label: "JavaScript", code: js },
    { label: "Go", code: go },
  ];
}