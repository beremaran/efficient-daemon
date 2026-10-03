import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { oneDark } from "@codemirror/theme-one-dark";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/CopyButton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { prettyJson } from "@/lib/ask";
import { useState } from "react";

export interface RunState {
  running: boolean;
  cancelled?: boolean;
  status: number | null;
  latencyMs: number | null;
  responseText: string;
  /** Raw jevjam answers, as JSON text. */
  answers: string | null;
  error: string | null;
  requestPreview: string;
}

export function ResponsePanel({ state }: { state: RunState }) {
  const { running, cancelled, status, latencyMs, responseText, answers, error, requestPreview } = state;
  const [tab, setTab] = useState("response");
  const shown = prettyJson(responseText);
  const noRunYet = !running && !cancelled && status === null && !responseText && !error;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center gap-2 text-sm">
        {/* Stays mounted so screen readers announce the badge text. */}
        <div role="status" className="flex items-center gap-2">
          {running ? (
            <Badge className="border-blue-500/30 bg-blue-50 text-blue-700">Running…</Badge>
          ) : cancelled ? (
            <Badge variant="outline">Stopped</Badge>
          ) : status !== null ? (
            <>
              <Badge
                className={
                  status >= 200 && status < 300
                    ? "border-emerald-600/30 bg-emerald-50 text-emerald-700"
                    : "border-destructive/30 bg-destructive/10 text-destructive"
                }
              >
                HTTP {status}
              </Badge>
              {latencyMs !== null && <span className="text-xs text-muted-foreground">{latencyMs} ms</span>}
            </>
          ) : (
            <span className="text-muted-foreground">No run yet.</span>
          )}
        </div>
        <span className="flex-1" />
        {responseText && (
          <CopyButton text={shown} variant="ghost" size="sm">
            Copy response
          </CopyButton>
        )}
      </div>

      {/* Stays mounted so screen readers announce text changes. */}
      <div role="alert" className="empty:-mb-3">
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Request failed</AlertTitle>
            <AlertDescription className="break-words font-mono text-xs">{error}</AlertDescription>
          </Alert>
        )}
      </div>

      <Separator />

      <Tabs value={tab === "answers" && !answers ? "response" : tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col gap-3">
        <TabsList className="self-end">
          <TabsTrigger value="response">Response</TabsTrigger>
          {answers && <TabsTrigger value="answers">Answers</TabsTrigger>}
          <TabsTrigger value="request">Request body</TabsTrigger>
        </TabsList>
        <TabsContent value="response" className="mt-0 flex min-h-0 flex-1 flex-col">
          {noRunYet ? (
            <ol className="list-inside list-decimal rounded-md border p-4 text-sm text-muted-foreground">
              <li>Add a Part: text, an image, or a PDF.</li>
              <li>Check the schema.</li>
              <li>Click Run.</li>
            </ol>
          ) : (
            <div className="min-h-0 flex-1 overflow-hidden rounded-md border">
              <CodeMirror
                value={shown}
                height="100%"
                extensions={[json()]}
                theme={oneDark}
                editable={false}
                className="h-full min-h-0"
              />
            </div>
          )}
        </TabsContent>
        {answers && (
          <TabsContent value="answers" className="mt-0 min-h-0 flex-1 overflow-auto">
            <AnswersView answers={answers} />
          </TabsContent>
        )}
        <TabsContent value="request" className="mt-0 flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-hidden rounded-md border">
            <CodeMirror
              value={requestPreview}
              height="100%"
              extensions={[json()]}
              theme={oneDark}
              editable={false}
              className="h-full min-h-0"
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface JevjamAnswer {
  type: "choice" | "score" | "noul";
  noul?: number;
  probabilities?: Record<string, number>;
  legend?: Record<string, string>;
  confidence?: number;
}

function AnswersView({ answers }: { answers: string }) {
  let parsed: Record<string, JevjamAnswer>;
  try {
    parsed = JSON.parse(answers) as Record<string, JevjamAnswer>;
  } catch {
    return <pre className="font-mono text-xs">{answers}</pre>;
  }
  return (
    <div className="flex flex-col gap-3">
      {Object.entries(parsed).map(([name, answer]) => (
        <div key={name} className="rounded-md border p-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="font-mono font-medium">{name}</span>
            <Badge variant="outline">{answer.type}</Badge>
            <span className="flex-1" />
            {answer.confidence !== undefined && (
              <span className="text-xs text-muted-foreground">confidence {percent(answer.confidence)}</span>
            )}
          </div>
          {answer.type === "noul" ? (
            <ProbabilityBar label="true" value={answer.noul ?? 0} />
          ) : (
            Object.entries(answer.probabilities ?? {}).map(([key, value]) => (
              <ProbabilityBar key={key} label={answer.legend?.[key] ?? key} value={value} />
            ))
          )}
        </div>
      ))}
    </div>
  );
}

function ProbabilityBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="mt-1.5 flex items-center gap-2 text-xs">
      <span className="w-32 truncate font-mono" title={label}>
        {label}
      </span>
      <div className="h-2 flex-1 rounded bg-muted">
        <div className="h-2 rounded bg-primary" style={{ width: percent(value) }} />
      </div>
      <span className="w-12 text-right tabular-nums">{percent(value)}</span>
    </div>
  );
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
