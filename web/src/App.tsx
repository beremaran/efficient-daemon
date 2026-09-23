import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Play, Square } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ConnectionPanel } from "@/components/ConnectionPanel";
import { PartsEditor } from "@/components/PartsEditor";
import { SchemaPanel } from "@/components/SchemaPanel";
import { ResponsePanel, type RunState } from "@/components/ResponsePanel";
import { CodegenPanel } from "@/components/CodegenPanel";
import { HistoryPanel } from "@/components/HistoryPanel";
import { buildBody } from "@/lib/codegen";
import { lintSchema, type LintResult } from "@/lib/lint";
import { useDebounced, useDraft, useHistory } from "@/lib/store";
import type { Part, RunRecord, Settings } from "@/lib/types";

const IDLE_STATE: RunState = {
  running: false,
  status: null,
  latencyMs: null,
  responseText: "",
  error: null,
  requestPreview: "",
};

export default function App() {
  const [draft, setDraft] = useDraft();
  const { history, push, clear } = useHistory();
  const [serverDefaults, setServerDefaults] = useState<Partial<Settings>>({});
  const [lintResult, setLintResult] = useState<LintResult | null>(null);
  const [linting, setLinting] = useState(false);
  const [run, setRun] = useState<RunState>(IDLE_STATE);
  const abortController = useRef<AbortController | null>(null);

  const debouncedSchema = useDebounced(draft.schema, 300);

  // Server defaults for ghost text; no api-key by design.
  useEffect(() => {
    fetch("/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) => {
        if (!cfg) return;
        setServerDefaults({
          model: cfg.model ?? "",
          baseURL: cfg["base-url"] ?? "",
          reasoningEffort: cfg["reasoning-effort"] ?? "",
          timeout: prettyDuration(cfg.timeout ?? ""),
        });
      })
      .catch(() => {});
  }, []);

  const runLint = useCallback(async (schema: string) => {
    setLinting(true);
    const result = await lintSchema(schema);
    setLintResult(result);
    setLinting(false);
  }, []);

  useEffect(() => {
    void runLint(debouncedSchema);
  }, [debouncedSchema, runLint]);

  const requestPreview = useMemo(() => {
    try {
      return JSON.stringify(buildBody(draft.parts, draft.system, draft.schema, draft.settings), null, 2);
    } catch {
      return "{}";
    }
  }, [draft]);

  const lintErrors = lintResult && !linting ? lintResult.errors : [];
  const canRun =
    !run.running &&
    draft.parts.length > 0 &&
    lintErrors.length === 0 &&
    !!draft.schema.trim() &&
    !!draft.parts.some((p) =>
      p.kind === "text" ? (p.text ?? "").trim() : (p.image ?? p.pdf ?? "").trim(),
    );

  const runRequest = async () => {
    let body: unknown;
    try {
      body = buildBody(draft.parts, draft.system, draft.schema, draft.settings);
    } catch (err) {
      setRun({ ...IDLE_STATE, error: `schema is not valid JSON: ${err instanceof Error ? err.message : err}` });
      return;
    }
    const startedAt = Date.now();
    const controller = new AbortController();
    abortController.current = controller;
    setRun({ ...IDLE_STATE, running: true, requestPreview });
    try {
      const res = await fetch("/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const latencyHeader = res.headers.get("X-Latency-Ms");
      const latencyMs = latencyHeader ? Number(latencyHeader) : null;
      const text = await res.text();
      const state: RunState = {
        running: false,
        status: res.status,
        latencyMs,
        responseText: text,
        error: res.ok ? null : text,
        requestPreview: requestPreview,
      };
      setRun(state);
      push({
        at: startedAt,
        status: res.status,
        latencyMs,
        model: draft.settings.model || String(serverDefaults.model ?? "") || "server default",
        request: body,
        response: safeParse(text),
        responseText: text,
        error: res.ok ? null : text,
      });
    } catch (err) {
      if (controller.signal.aborted) {
        setRun({ ...IDLE_STATE, cancelled: true, requestPreview });
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      setRun({
        running: false,
        status: null,
        latencyMs: null,
        responseText: "",
        error: message,
        requestPreview: requestPreview,
      });
      push({
        at: startedAt,
        status: null,
        latencyMs: null,
        model: draft.settings.model || "server default",
        request: body,
        response: null,
        responseText: "",
        error: message,
      });
    } finally {
      if (abortController.current === controller) abortController.current = null;
    }
  };

  const restore = (record: RunRecord) => {
    const req = record.request as Record<string, unknown>;
    const settings: Settings = {
      ...draft.settings,
      model: (req.model as string) ?? "",
      baseURL: (req["base-url"] as string) ?? "",
      apiKey: (req["api-key"] as string) ?? "",
      reasoningEffort: (req["reasoning-effort"] as string) ?? "",
      temperatureEnabled: req.temperature !== undefined,
      temperature: req.temperature !== undefined ? String(req.temperature) : draft.settings.temperature,
      maxTokensEnabled: req["max-tokens"] !== undefined,
      maxTokens: req["max-tokens"] !== undefined ? String(req["max-tokens"]) : draft.settings.maxTokens,
      timeout: (req.timeout as string) ?? "",
    };
    setDraft({
      settings,
      system: (req.system as string) ?? "",
      parts: normalizeParts(req.parts),
      schema: JSON.stringify(req.schema, null, 2),
    });
  };

  return (
    <div className="flex h-screen flex-col bg-muted/30">
      <Header
        canRun={canRun}
        running={run.running}
        lintIssues={lintIssuesCount(lintResult, linting)}
        onRun={runRequest}
        onStop={() => abortController.current?.abort()}
      />
      <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4 lg:flex-row lg:overflow-hidden">
        <section className="flex w-full shrink-0 flex-col gap-4 lg:w-[460px] lg:overflow-auto lg:pr-1">
          <Card>
            <details className="group">
              <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                <CardHeader className="flex-row items-center justify-between pb-4">
                  <CardTitle className="text-sm">Connection & sampling</CardTitle>
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
                </CardHeader>
              </summary>
              <CardContent>
                <ConnectionPanel
                  settings={draft.settings}
                  serverDefaults={serverDefaults}
                  onChange={(settings: Settings) => setDraft({ ...draft, settings })}
                />
              </CardContent>
            </details>
          </Card>

          <Card>
            <details className="group">
              <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                <CardHeader className="flex-row items-center justify-between pb-4">
                  <CardTitle className="text-sm">System message</CardTitle>
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
                </CardHeader>
              </summary>
              <CardContent>
                <Textarea
                  value={draft.system}
                  onChange={(e) => setDraft({ ...draft, system: e.target.value })}
                  placeholder="Optional system message…"
                  className="min-h-[60px]"
                />
              </CardContent>
            </details>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">User message parts</CardTitle>
            </CardHeader>
            <CardContent>
              <PartsEditor
                system={draft.system}
                parts={draft.parts}
                onPartsChange={(parts) => setDraft({ ...draft, parts })}
                schemaText={draft.schema}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Response schema</CardTitle>
            </CardHeader>
            <CardContent>
              <SchemaPanel
                schema={draft.schema}
                onSchemaChange={(schema) => setDraft({ ...draft, schema })}
                lint={lintResult}
                linting={linting}
              />
            </CardContent>
          </Card>
        </section>

        <section className="flex min-w-0 flex-1 flex-col lg:min-h-0">
          <Tabs defaultValue="response" className="flex min-h-0 flex-1 flex-col gap-3">
            <TabsList className="self-start">
              <TabsTrigger value="response">Response</TabsTrigger>
              <TabsTrigger value="codegen">Codegen</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
            <Card className="flex min-h-0 flex-1 flex-col">
              <CardContent className="flex min-h-0 flex-1 flex-col pt-4">
                <TabsContent value="response" className="flex min-h-0 flex-1 flex-col">
                  <ResponsePanel state={run} />
                </TabsContent>
                <TabsContent value="codegen" className="flex flex-col">
                  <CodegenPanel
                    parts={draft.parts}
                    system={draft.system}
                    schema={draft.schema}
                    settings={draft.settings}
                  />
                </TabsContent>
                <TabsContent value="history">
                  <HistoryPanel history={history} onRestore={restore} onClear={clear} />
                </TabsContent>
              </CardContent>
            </Card>
          </Tabs>
        </section>
      </main>
    </div>
  );
}

function Header({
  canRun,
  running,
  lintIssues,
  onRun,
  onStop,
}: {
  canRun: boolean;
  running: boolean;
  lintIssues: number;
  onRun: () => void;
  onStop: () => void;
}) {
  return (
    <header className="flex items-center gap-3 border-b bg-background px-4 py-2">
      <span className="font-semibold">efficient-daemon</span>
      <Badge variant="outline">workbench</Badge>
      <span className="flex-1" />
      {lintIssues > 0 && (
        <span className="text-xs text-destructive">
          {lintIssues} schema issue{lintIssues > 1 ? "s" : ""} — fix before running
        </span>
      )}
      {running ? (
        <Button variant="destructive" onClick={onStop}>
          <Square fill="currentColor" /> Stop
        </Button>
      ) : (
        <Button onClick={onRun} disabled={!canRun}>
          <Play /> Run
        </Button>
      )}
    </header>
  );
}

function lintIssuesCount(lint: LintResult | null, linting: boolean): number {
  if (!lint || linting) return 0;
  return lint.errors.length;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function normalizeParts(raw: unknown): Part[] {
  if (!Array.isArray(raw)) return [{ kind: "text", text: "" }];
  const parts: Part[] = raw.map((p) => {
    const part = p as Record<string, unknown>;
    if (part.pdf !== undefined) return { kind: "pdf", pdf: String(part.pdf) };
    if (part.image !== undefined) {
      const isURL = /^https?:\/\//.test(String(part.image));
      return {
        kind: "image",
        source: isURL ? "url" : "upload",
        image: String(part.image),
      };
    }
    return { kind: "text", text: String(part.text ?? "") };
  });
  return parts.length ? parts : [{ kind: "text", text: "" }];
}

function prettyDuration(d: string): string {
  // Go durations come as "5m0s"; show them as-is (they re-parse verbatim).
  return d;
}
