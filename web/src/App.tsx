import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Play, Square } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ConnectionPanel } from "@/components/ConnectionPanel";
import { PartsEditor } from "@/components/PartsEditor";
import { SchemaPanel } from "@/components/SchemaPanel";
import { SCHEMA_CARD_ID, SchemaIssuesLink } from "@/components/SchemaIssuesLink";
import { ResponsePanel, type RunState } from "@/components/ResponsePanel";
import { CodegenPanel } from "@/components/CodegenPanel";
import { HistoryPanel } from "@/components/HistoryPanel";
import { askFromDraft, lintBody, resolveSettings, snapshotDraftForHistory } from "@/lib/ask";
import { modelsRequest, useModels } from "@/lib/models";
import { lintSchema, lintView, type LintResult } from "@/lib/lint";
import { cardToggleClass, connectionMissing, connectionSummary, isRunShortcut, runBlocker, runShortcutHint, scrollToResponse, stoppedState, systemSummary, useRunKeys } from "@/lib/run";
import { newPartId } from "@/lib/parts";
import { useDebounced, useDraft, useHistory } from "@/lib/store";
import { errorMessage } from "@/lib/utils";
import type { Draft, RunRecord, Settings } from "@/lib/types";

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
  const [draft, setDraft, keepKey, setKeepKey] = useDraft();
  const { history, saveFailed, push, clear } = useHistory();
  // The Draft that the last Restore replaced, and the Draft it put in place.
  const [undo, setUndo] = useState<{ before: Draft; restored: Draft } | null>(null);
  const [serverDefaults, setServerDefaults] = useState<Partial<Settings>>({});
  const [lintResult, setLintResult] = useState<LintResult | null>(null);
  const [linting, setLinting] = useState(false);
  const [lintedBody, setLintedBody] = useState<string | null>(null);
  const [run, setRun] = useState<RunState>(IDLE_STATE);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [connectionDecided, setConnectionDecided] = useState(false);
  const abortController = useRef<AbortController | null>(null);
  const responseSection = useRef<HTMLElement>(null);

  const effectiveSettings = useMemo(
    () => resolveSettings(draft.settings, serverDefaults),
    [draft.settings, serverDefaults],
  );
  // Typing in a big Part must not wait on the Ask request, codegen and size
  // rebuilt from it, so those follow a deferred Draft. Run builds from the live one.
  const deferredDraft = useDeferredValue(draft);
  const request = useMemo(
    () => askFromDraft(deferredDraft, serverDefaults),
    [deferredDraft, serverDefaults],
  );
  // Lint re-runs only when the schema, provider or max score levels change.
  const lintInput = request.ok ? JSON.stringify(lintBody(request.body)) : null;
  const lintErrorInput = request.ok ? null : request.error;
  const lintValues = useMemo<[string | null, string | null]>(
    () => [lintInput, lintErrorInput],
    [lintInput, lintErrorInput],
  );
  const [lintJSON, lintError] = useDebounced<[string | null, string | null]>(
    lintValues,
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
          temperature: cfg.temperature == null ? "" : String(cfg.temperature),
          temperatureEnabled: cfg.temperature != null,
          maxTokens: cfg["max-tokens"] == null ? "" : String(cfg["max-tokens"]),
          maxTokensEnabled: cfg["max-tokens"] != null,
          maxScoreLevels: String(cfg["max-score-levels"] ?? ""),
        });
      })
      .catch(() => {})
      .finally(() => setConfigLoaded(true));
  }, []);

  // Only the newest lint reply counts; an older one landing late must not replace it.
  const lintSeq = useRef(0);
  const runLint = useCallback(async (body: string) => {
    const seq = ++lintSeq.current;
    setLinting(true);
    const result = await lintSchema(body);
    if (seq !== lintSeq.current) return;
    setLintResult(result);
    setLintedBody(body);
    setLinting(false);
  }, []);

  useEffect(() => {
    if (lintJSON !== null) void runLint(lintJSON);
  }, [lintJSON, runLint]);
  const lint: LintResult | null =
    lintError !== null ? { valid: false, errors: [lintError], warnings: [] } : lintResult;

  // A check is pending from the edit until its result lands, including the debounce wait
  // and the wait for the deferred Draft to catch up with a lint input edit.
  const { settings: live } = draft;
  const lintEdited =
    draft.schema !== deferredDraft.schema ||
    live.provider !== deferredDraft.settings.provider ||
    live.maxScoreLevels !== deferredDraft.settings.maxScoreLevels;
  const checking = linting || lintEdited || (lintInput !== null && lintInput !== lintedBody);
  const lintErrors = lintView(lint, checking).errors;
  const model = effectiveSettings.model.trim();
  const baseURL = effectiveSettings.baseURL.trim();
  const jevjam = effectiveSettings.provider === "jevjam";
  const models = useModels(baseURL ? modelsRequest(draft.settings) : null);
  const blocker = runBlocker({
    model,
    baseURL,
    jevjam,
    parts: draft.parts,
    request,
    lint,
    checking,
    lintErrors: lintErrors.length,
  });
  const canRun = !run.running && blocker === null;

  // Once the server defaults are known, open the Connection card if it needs input.
  // Only that first look decides; later edits must not move the card.
  if (configLoaded && !connectionDecided) {
    setConnectionDecided(true);
    setConnectionOpen(connectionMissing({ model, baseURL, jevjam }));
  }

  const runRequest = async () => {
    const latest = askFromDraft(draft, serverDefaults);
    if (!latest.ok) {
      setRun({ ...IDLE_STATE, error: latest.error });
      return;
    }
    const { body } = latest;
    // History resolves server defaults now so Restore keeps the request's
    // effective settings even if the daemon configuration changes later.
    const historyDraft = snapshotDraftForHistory(draft, body, serverDefaults);
    const historyModel = historyDraft.settings.model.trim() || "server default";
    const requestPreview = latest.json;
    const startedAt = Date.now();
    const controller = new AbortController();
    abortController.current = controller;
    setRun({ ...IDLE_STATE, running: true, startedAt, requestPreview });
    // 1024px is Tailwind's lg, where the layout turns two-column.
    scrollToResponse(responseSection.current, window.matchMedia("(min-width: 1024px)").matches);
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
      // Read in chunks so Stop keeps what has arrived.
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let text = "";
      for (;;) {
        const chunk = await reader?.read();
        if (!chunk || chunk.done) break;
        text += decoder.decode(chunk.value, { stream: true });
        const partial = text;
        setRun((r) => ({ ...r, responseText: partial }));
      }
      text += decoder.decode();
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
        requestPreview,
      };
      setRun(state);
      push({
        at: startedAt,
        status: res.status,
        latencyMs,
        model: historyModel,
        draft: historyDraft,
        response: safeParse(text),
        responseText: text,
        error: res.ok ? null : text,
      });
    } catch (err) {
      if (controller.signal.aborted) {
        setRun((r) => stoppedState(r, Date.now() - startedAt));
        return;
      }
      const message = errorMessage(err);
      setRun({
        running: false,
        status: null,
        latencyMs: null,
        responseText: "",
        answers: null,
        error: message,
        requestPreview,
      });
      push({
        at: startedAt,
        status: null,
        latencyMs: null,
        model: historyModel,
        draft: historyDraft,
        response: null,
        responseText: "",
        error: message,
      });
    } finally {
      if (abortController.current === controller) abortController.current = null;
    }
  };

  // Re-bound each render so the handler sees the latest Draft.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isRunShortcut(e, canRun)) return;
      e.preventDefault();
      void runRequest();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const runKeys = useRunKeys(() => {
    if (canRun) void runRequest();
  });

  const restore = (record: RunRecord) => {
    const restored = {
      ...record.draft,
      // New ids, so a file read still running for a current Part cannot land on a restored one.
      parts: record.draft.parts.map((p) => ({ ...p, id: newPartId() })),
      // Send the key only to the connection it was typed for.
      settings: {
        ...record.draft.settings,
        apiKey:
          record.draft.settings.provider === effectiveSettings.provider &&
          record.draft.settings.baseURL === effectiveSettings.baseURL
            ? draft.settings.apiKey
            : "",
      },
    };
    setUndo({ before: draft, restored });
    setDraft(restored);
  };
  const undoRestore = () => {
    if (!undo) return;
    setDraft(undo.before);
    setUndo(null);
  };

  return (
    <div className="flex h-screen flex-col bg-muted/30">
      <Header
        canRun={canRun}
        running={run.running}
        blocker={blocker}
        lintIssues={lintErrors.length}
        onRun={runRequest}
        onStop={() => abortController.current?.abort()}
      />
      <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4 lg:flex-row lg:overflow-hidden">
        <section className="flex w-full shrink-0 flex-col gap-4 lg:w-[460px] lg:overflow-auto lg:pr-1">
          <Card>
            <details
              className="group"
              open={connectionOpen}
              onToggle={(e) => setConnectionOpen(e.currentTarget.open)}
            >
              <summary className={cardToggleClass}>
                <CardHeader className="flex-row items-center justify-between pb-4">
                  <CardTitle className="text-sm">Connection & sampling</CardTitle>
                  <span className="ml-auto truncate text-xs text-muted-foreground group-open:hidden">
                    {connectionSummary({ model, provider: effectiveSettings.provider })}
                  </span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
                </CardHeader>
              </summary>
              <CardContent>
                <ConnectionPanel
                  settings={draft.settings}
                  serverDefaults={serverDefaults}
                  models={models}
                  hasBaseURL={!!baseURL}
                  keepKey={keepKey}
                  onKeepKeyChange={setKeepKey}
                  onChange={(settings: Settings) => setDraft({ ...draft, settings })}
                />
              </CardContent>
            </details>
          </Card>

          {!jevjam && (
            <Card>
              <details className="group">
                <summary className={cardToggleClass}>
                  <CardHeader className="flex-row items-center justify-between pb-4">
                    <CardTitle className="text-sm">System message</CardTitle>
                    <span className="ml-auto text-xs text-muted-foreground group-open:hidden">{systemSummary(draft.system)}</span>
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
              <CardTitle className="text-sm">Message parts</CardTitle>
            </CardHeader>
            <CardContent>
              <PartsEditor
                parts={draft.parts}
                onPartsChange={(parts) => setDraft({ ...draft, parts })}
                bytes={request.ok ? request.bytes : null}
              />
            </CardContent>
          </Card>

          <Card id={SCHEMA_CARD_ID} tabIndex={-1} className="flex flex-1 flex-col outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Response schema</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col">
              <SchemaPanel
                schema={draft.schema}
                onSchemaChange={(schema) => setDraft({ ...draft, schema })}
                lint={lint}
                linting={checking}
                runKeys={runKeys}
              />
            </CardContent>
          </Card>
        </section>

        <section ref={responseSection} className="flex min-w-0 flex-1 flex-col lg:min-h-0">
          <Tabs defaultValue="response" className="flex min-h-0 flex-1 flex-col gap-3">
            <TabsList className="self-start">
              <TabsTrigger value="response">Response</TabsTrigger>
              <TabsTrigger value="codegen">Codegen</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
            <Card className="flex min-h-0 flex-1 flex-col">
              <CardContent className="flex min-h-0 flex-1 flex-col pt-4">
                <TabsContent value="response" className="flex min-h-0 flex-1 flex-col">
                  <ResponsePanel state={run} runKeys={runKeys} />
                </TabsContent>
                <TabsContent value="codegen" className="flex flex-col">
                  <CodegenPanel request={request} parts={deferredDraft.parts} schema={deferredDraft.schema} runKeys={runKeys} />
                </TabsContent>
                <TabsContent value="history">
                  <HistoryPanel
                    history={history}
                    saveFailed={saveFailed}
                    onRestore={restore}
                    // Any edit after the Restore makes Undo drop that edit, so it goes away.
                    onUndo={undo && draft === undo.restored ? undoRestore : undefined}
                    onClear={clear}
                  />
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
  blocker,
  lintIssues,
  onRun,
  onStop,
}: {
  canRun: boolean;
  running: boolean;
  blocker: string | null;
  lintIssues: number;
  onRun: () => void;
  onStop: () => void;
}) {
  return (
    <header className="flex items-center gap-3 border-b bg-background px-4 py-2">
      <span className="font-semibold">efficient-daemon</span>
      <Badge variant="outline">workbench</Badge>
      <span className="flex-1" />
      {blocker && !running && (
        <span id="run-blocker" className="text-xs text-muted-foreground">
          {blocker}
        </span>
      )}
      {lintIssues > 0 && <SchemaIssuesLink count={lintIssues} />}
      {running ? (
        <Button variant="destructive" onClick={onStop}>
          <Square fill="currentColor" /> Stop
        </Button>
      ) : (
        <Button onClick={onRun} disabled={!canRun} aria-describedby={blocker ? "run-blocker" : undefined}>
          <Play /> Run
          <kbd className="text-xs font-normal opacity-70">
            {runShortcutHint(/Mac|iPhone|iPad/.test(navigator.platform))}
          </kbd>
        </Button>
      )}
    </header>
  );
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
