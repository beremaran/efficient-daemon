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
import { buildAskRequest, lintBody } from "@/lib/ask";
import { lintSchema, type LintResult } from "@/lib/lint";
import { withPartIds } from "@/lib/parts";
import { useDebounced, useDraft, useHistory } from "@/lib/store";
import type { RunRecord, Settings } from "@/lib/types";

const IDLE_STATE: RunState = {
  running: false,
  status: null,
  latencyMs: null,
  responseText: "",
  answers: null,
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

  const effectiveSettings = useMemo(() => {
    const provider = draft.settings.provider || String(serverDefaults.provider ?? "");
    // The server's model and base URL belong to its own provider (see resolve).
    const own = provider === serverDefaults.provider;
    return {
      ...draft.settings,
      provider,
      model: draft.settings.model.trim() || (own ? String(serverDefaults.model ?? "").trim() : ""),
      baseURL: draft.settings.baseURL.trim() || (own ? String(serverDefaults.baseURL ?? "").trim() : ""),
      maxScoreLevels: draft.settings.maxScoreLevels.trim() || String(serverDefaults.maxScoreLevels ?? ""),
    };
  }, [draft.settings, serverDefaults]);
  const request = useMemo(
    () => buildAskRequest({ ...draft, settings: effectiveSettings }),
    [draft, effectiveSettings],
  );
  // Lint re-runs only when the schema, provider or max score levels change.
  const [lintJSON, lintError] = useDebounced<[string | null, string | null]>(
    request.ok ? [JSON.stringify(lintBody(request.body)), null] : [null, request.error],
    300,
  );

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
          provider: cfg.provider ?? "",
          maxScoreLevels: String(cfg["max-score-levels"] ?? ""),
        });
      })
      .catch(() => {});
  }, []);

  const runLint = useCallback(async (body: string) => {
    setLinting(true);
    const result = await lintSchema(body);
    setLintResult(result);
    setLinting(false);
  }, []);

  useEffect(() => {
    if (lintJSON !== null) void runLint(lintJSON);
  }, [lintJSON, runLint]);
  const lint: LintResult | null =
    lintError !== null ? { valid: false, errors: [lintError], warnings: [] } : lintResult;

  const requestPreview = request.ok ? request.json : "{}";

  const lintErrors = lint && !linting ? lint.errors : [];
  const model = effectiveSettings.model.trim();
  const baseURL = effectiveSettings.baseURL.trim();
  const jevjam = effectiveSettings.provider === "jevjam";
  const canRun =
    !run.running &&
    (!!model || jevjam) &&
    !!baseURL &&
    draft.parts.length > 0 &&
    lintErrors.length === 0 &&
    request.ok &&
    !!draft.parts.some((p) =>
      p.kind === "text" ? (p.text ?? "").trim() : (p.image ?? p.pdf ?? "").trim(),
    );

  const runRequest = async () => {
    if (!request.ok) {
      setRun({ ...IDLE_STATE, error: request.error });
      return;
    }
    const { body } = request;
    const startedAt = Date.now();
    const controller = new AbortController();
    abortController.current = controller;
    setRun({ ...IDLE_STATE, running: true, requestPreview });
    try {
      const res = await fetch("/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // jevjam's raw answers come wrapped with the result in the body.
        body: JSON.stringify(jevjam ? { ...body, answers: true } : body),
        signal: controller.signal,
      });
      const latencyHeader = res.headers.get("X-Latency-Ms");
      const latencyMs = latencyHeader ? Number(latencyHeader) : null;
      let text = await res.text();
      let answers: string | null = null;
      if (jevjam && res.ok) {
        const wrapped = safeParse(text) as { result?: unknown; answers?: unknown };
        text = JSON.stringify(wrapped.result, null, 2);
        answers = JSON.stringify(wrapped.answers);
      }
      const state: RunState = {
        running: false,
        status: res.status,
        latencyMs,
        responseText: text,
        answers,
        error: res.ok ? null : text,
        requestPreview: requestPreview,
      };
      setRun(state);
      push({
        at: startedAt,
        status: res.status,
        latencyMs,
        model: model || "server default",
        draft,
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
        answers: null,
        error: message,
        requestPreview: requestPreview,
      });
      push({
        at: startedAt,
        status: null,
        latencyMs: null,
        model: model || "server default",
        draft,
        response: null,
        responseText: "",
        error: message,
      });
    } finally {
      if (abortController.current === controller) abortController.current = null;
    }
  };

  const restore = (record: RunRecord) => setDraft({ ...record.draft, parts: withPartIds(record.draft.parts) });

  return (
    <div className="flex h-screen flex-col bg-muted/30">
      <Header
        canRun={canRun}
        running={run.running}
        lintIssues={lintIssuesCount(lint, linting)}
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

          {!jevjam && (
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
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">User message parts</CardTitle>
            </CardHeader>
            <CardContent>
              <PartsEditor
                parts={draft.parts}
                onPartsChange={(parts) => setDraft({ ...draft, parts })}
                bytes={request.ok ? request.bytes : null}
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
                lint={lint}
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
                  <CodegenPanel request={request} parts={draft.parts} schema={draft.schema} />
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

function prettyDuration(d: string): string {
  // Go durations come as "5m0s"; show them as-is (they re-parse verbatim).
  return d;
}
