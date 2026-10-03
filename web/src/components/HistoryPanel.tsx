import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/CopyButton";
import type { RunRecord } from "@/lib/types";

export function HistoryPanel({
  history,
  onRestore,
  onClear,
}: {
  history: RunRecord[];
  onRestore: (record: RunRecord) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{history.length} run{history.length === 1 ? "" : "s"} (newest first)</span>
        <Button variant="ghost" size="sm" onClick={onClear} disabled={!history.length}>
          Clear
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto pr-1">
        {history.length === 0 && <span className="text-sm text-muted-foreground">Nothing yet.</span>}
        {history.map((record) => (
          <HistoryRow key={record.at} record={record} onRestore={onRestore} />
        ))}
      </div>
    </div>
  );
}

function HistoryRow({ record, onRestore }: { record: RunRecord; onRestore: (r: RunRecord) => void }) {
  const ok = record.error === null && record.status !== null && record.status < 300;
  return (
    <div className="rounded-md border p-2 text-sm">
      <div className="flex items-center gap-2">
        <Badge
          className={
            ok
              ? "border-emerald-600/30 bg-emerald-50 text-emerald-700"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          }
        >
          {record.status ?? "—"}
        </Badge>
        <span className="text-xs text-muted-foreground">{new Date(record.at).toLocaleTimeString()}</span>
        {record.latencyMs !== null && <span className="text-xs text-muted-foreground">{record.latencyMs} ms</span>}
        <span className="flex-1" />
        <CopyButton text={record.responseText} variant="ghost" size="sm">
          Copy
        </CopyButton>
        <Button variant="outline" size="sm" onClick={() => onRestore(record)}>
          Restore
        </Button>
      </div>
      {record.error && (
        <Alert variant="destructive" className="mt-2">
          <AlertDescription className="break-words font-mono text-xs">{record.error}</AlertDescription>
        </Alert>
      )}
      {!record.error && (
        <pre className="mt-2 max-h-24 overflow-hidden whitespace-pre-wrap font-mono text-xs text-muted-foreground">
          {truncate(record.responseText, 400)}
        </pre>
      )}
    </div>
  );
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + `… (${text.length} chars)` : text;
}