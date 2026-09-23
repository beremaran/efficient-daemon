import { useMemo, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { StreamLanguage } from "@codemirror/language";
import { go } from "@codemirror/legacy-modes/mode/go";
import { javascript } from "@codemirror/legacy-modes/mode/javascript";
import { python } from "@codemirror/legacy-modes/mode/python";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { oneDark } from "@codemirror/theme-one-dark";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { elideBase64, generateSnippets } from "@/lib/codegen";
import { copyText } from "@/lib/store";
import type { Part, Settings } from "@/lib/types";

const LANGS = ["cli", "curl", "python", "javascript", "go"] as const;
type Lang = (typeof LANGS)[number];

const LANGUAGE_EXTENSIONS = {
  cli: StreamLanguage.define(shell),
  curl: StreamLanguage.define(shell),
  python: StreamLanguage.define(python),
  javascript: StreamLanguage.define(javascript),
  go: StreamLanguage.define(go),
};

function prettyLabel(lang: Lang): string {
  return { cli: "CLI", curl: "curl", python: "Python", javascript: "JavaScript", go: "Go" }[lang];
}

export function CodegenPanel({
  parts,
  system,
  schema,
  settings,
}: {
  parts: Part[];
  system: string;
  schema: string;
  settings: Settings;
}) {
  const [lang, setLang] = useState<Lang>("curl");
  const [copied, setCopied] = useState(false);

  const snippets = useMemo(() => {
    try {
      return generateSnippets(parts, system, schema, settings, window.location.origin);
    } catch {
      return [];
    }
  }, [parts, system, schema, settings]);

  const current = snippets.find((s) => s.label === prettyLabel(lang)) ?? snippets[0];
  const display = current ? elideBase64(current.code) : "Fix the response schema to generate code.";

  const copy = async () => {
    if (current && await copyText(current.code)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center gap-2">
        <Tabs value={lang} onValueChange={(v) => setLang(v as Lang)}>
          <TabsList>
            {LANGS.map((l) => (
              <TabsTrigger key={l} value={l}>
                {prettyLabel(l)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <span className="flex-1" />
        <Button variant="secondary" size="sm" onClick={copy} disabled={!current}>
          {copied ? "Copied!" : "Copy (full, untruncated)"}
        </Button>
      </div>
      <div className="text-xs text-muted-foreground">
        Long base64 is elided in the display only; copying always yields the complete snippet.
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-md border">
        <CodeMirror
          value={display}
          height="100%"
          maxHeight="100%"
          extensions={[LANGUAGE_EXTENSIONS[lang]]}
          theme={oneDark}
          editable={false}
          className="h-full min-h-0 text-xs"
          basicSetup={{ lineNumbers: true, foldGutter: false }}
        />
      </div>
    </div>
  );
}
