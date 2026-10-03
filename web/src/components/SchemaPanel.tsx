import { useMemo, useState } from "react";
import CodeMirror, { type Extension } from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorHint } from "@/components/editor";
import { editorProps } from "@/lib/editor";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LintStatus } from "@/components/LintStatus";
import { Textarea } from "@/components/ui/textarea";
import { lintView, type LintResult } from "@/lib/lint";

// json_typegen_wasm: the same engine transform.tools uses for
// JSON → JSON Schema, so output matches that site.
import { run as jsonTypegenRun } from "json_typegen_wasm";

function generateSchema(sample: string): string {
  const schema = JSON.parse(jsonTypegenRun("Root", sample, JSON.stringify({ output_mode: "json_schema" })));
  const closeObjects = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) return value.forEach(closeObjects);
    const node = value as Record<string, unknown>;
    if (node.type === "object" || node.properties) node.additionalProperties = false;
    Object.values(node).forEach(closeObjects);
  };
  closeObjects(schema);
  return JSON.stringify(schema, null, 2);
}

export function SchemaPanel({
  schema,
  onSchemaChange,
  lint,
  linting,
  runKeys,
}: {
  schema: string;
  onSchemaChange: (next: string) => void;
  lint: LintResult | null;
  linting: boolean;
  runKeys: Extension;
}) {
  const [mode, setMode] = useState<"edit" | "generate">("edit");
  const [sample, setSample] = useState("");
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const { stale } = lintView(lint, linting);

  const canGenerate = useMemo(() => {
    if (!sample.trim()) return false;
    try {
      JSON.parse(sample);
      return true;
    } catch {
      return false;
    }
  }, [sample]);

  const doGenerate = () => {
    setGenerateError(null);
    try {
      setPreview(generateSchema(sample));
    } catch (err) {
      setPreview(null);
      setGenerateError(err instanceof Error ? err.message : String(err));
    }
  };

  const useGenerated = () => {
    if (preview) {
      onSchemaChange(preview);
      setMode("edit");
    }
  };

  return (
    <Tabs value={mode} onValueChange={(v) => setMode(v as "edit" | "generate")} className="flex flex-1 flex-col">
      <div className="flex items-center justify-between gap-2">
        <TabsList variant="line">
          <TabsTrigger value="edit">Edit</TabsTrigger>
          <TabsTrigger value="generate">Generate from JSON</TabsTrigger>
        </TabsList>
        <LintStatus lint={lint} linting={linting} />
      </div>

      <TabsContent value="edit" className="mt-2 min-h-[300px]">
        <div className="h-full overflow-hidden rounded-md border">
          <CodeMirror
            value={schema}
            height="100%"
            minHeight="300px"
            extensions={[json(), runKeys]}
            theme={oneDark}
            basicSetup={{ foldGutter: true }}
            {...editorProps(false)}
            onChange={(value) => onSchemaChange(value)}
          />
        </div>
        <EditorHint />
      </TabsContent>

      <TabsContent value="generate" className="mt-2 flex flex-col gap-2 min-h-0">
        <div className="text-xs text-muted-foreground">
          Paste your ideal JSON; a schema describing it is generated locally. Then "Use this schema" to put it in the editor.
        </div>
        <Textarea
          value={sample}
          onChange={(e) => setSample(e.target.value)}
          placeholder={`{\n  "name": "Ada",\n  "year": 1843,\n  "tags": ["math", "computing"]\n}`}
          className="font-mono min-h-[140px]"
          spellCheck={false}
        />
        <div className="flex gap-2">
          <Button size="sm" onClick={doGenerate} disabled={!canGenerate}>
            Generate
          </Button>
          <Button size="sm" variant="secondary" onClick={useGenerated} disabled={!preview}>
            Use this schema
          </Button>
          {preview && (
            <span className="self-center text-xs text-muted-foreground">
              preview below — nothing is applied until you click "Use this schema"
            </span>
          )}
        </div>
        {generateError && (
          <Alert variant="destructive">
            <AlertTitle>Generation failed</AlertTitle>
            <AlertDescription>{generateError}</AlertDescription>
          </Alert>
        )}
        {preview && (
          <div className="min-h-[160px] overflow-hidden rounded-md border">
            <CodeMirror
              value={preview}
              height="160px"
              extensions={[json(), runKeys]}
              theme={oneDark}
              {...editorProps(true)}
            />
          </div>
        )}
      </TabsContent>

      {lint && (lint.errors.length > 0 || lint.warnings.length > 0) && (
        <div aria-busy={stale} className="mt-2 flex flex-col gap-2">
          {lint.errors.map((e, i) => (
            <Alert key={`e${i}`} variant="destructive">
              <AlertTitle>Schema error</AlertTitle>
              <AlertDescription className="font-mono text-xs">{e}</AlertDescription>
            </Alert>
          ))}
          {lint.warnings.map((w, i) => (
            <Alert key={`w${i}`} className="border-warning/50 bg-warning/10 text-warning-foreground">
              <AlertTitle>Strict-output warning</AlertTitle>
              <AlertDescription className="font-mono text-xs">{w}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}
    </Tabs>
  );
}
