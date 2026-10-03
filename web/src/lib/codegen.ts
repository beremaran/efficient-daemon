// Snippet generation for the Codegen tab. Every target renders the same
// Ask request: POST /ask on the daemon, schema inlined.
// Large base64 values are elided for display only; copied text is always full.

import { cliArgs, shellQuote, type AskBody } from "@/lib/ask";
import type { Part } from "@/lib/types";

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

export function generateSnippets(
  request: { body: AskBody; json: string },
  parts: Part[],
  schema: string,
  origin: string,
): Snippet[] {
  const bodyJSON = request.json;

  // CLI: schema via heredoc, then the Ask request's flags and parts.
  const notes =
    (parts.some((p) => p.kind === "pdf")
      ? "# note: PDF parts are only supported over the HTTP API (see the curl tab)\n"
      : "") +
    (parts.some((p) => p.kind === "image" && p.source !== "url")
      ? "# note: place uploaded images at the ./ paths below\n"
      : "");
  const cli =
    `cat > schema.json <<'EOF'\n${schema.trim()}\nEOF\n\n` +
    notes +
    `efficient-daemon ask` +
    cliArgs(request.body, parts).map((arg) => ` \\\n  ${arg}`).join("");

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