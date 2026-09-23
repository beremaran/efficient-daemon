import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { oneDark } from "@codemirror/theme-one-dark";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { copyText } from "@/lib/store";

export interface RunState {
  running: boolean;
  cancelled?: boolean;
  status: number | null;
  latencyMs: number | null;
  responseText: string;
  error: string | null;
  requestPreview: string;
}

export function ResponsePanel({ state }: { state: RunState }) {
  const { running, cancelled, status, latencyMs, responseText, error, requestPreview } = state;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center gap-2 text-sm">
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
        <span className="flex-1" />
        {responseText && (
          <Button variant="ghost" size="sm" onClick={() => copyText(responseText)}>
            Copy response
          </Button>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Request failed</AlertTitle>
          <AlertDescription className="break-words font-mono text-xs">{error}</AlertDescription>
        </Alert>
      )}

      <Separator />

      <Tabs defaultValue="response" className="flex min-h-0 flex-1 flex-col gap-3">
        <TabsList className="self-end">
          <TabsTrigger value="response">Response</TabsTrigger>
          <TabsTrigger value="request">Request body</TabsTrigger>
        </TabsList>
        <TabsContent value="response" className="mt-0 flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-hidden rounded-md border">
            <CodeMirror
              value={responseText || "// run a request to see the response"}
              height="100%"
              extensions={[json()]}
              theme={oneDark}
              editable={false}
              className="h-full min-h-0"
            />
          </div>
        </TabsContent>
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
