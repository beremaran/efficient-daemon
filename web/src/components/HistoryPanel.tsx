import { useRef } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/CopyButton";
import { promptPreview } from "@/lib/history";
import type { RunRecord } from "@/lib/types";

export function HistoryPanel({
  history,
  saveFailed = false,
  onRestore,
  onUndo,
  onClear,
}: {
  history: RunRecord[];
  saveFailed?: boolean;
  onRestore: (record: RunRecord) => void;
  /** Set only while a Restore can be undone. */
  onUndo?: () => void;
  onClear: () => void;
}) {
  // Undo unmounts when clicked, so focus moves to the run count instead of falling to the page.
  const count = useRef<HTMLSpanElement>(null);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center justify-between">
        <span ref={count} tabIndex={-1} className="text-sm text-muted-foreground outline-none">{history.length} run{history.length === 1 ? "" : "s"} (newest first)</span>
        <div className="flex items-center gap-1">
          {onUndo && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onUndo();
                count.current?.focus();
              }}
            >
              Undo restore
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClear} disabled={!history.length}>
            Clear
          </Button>
        </div>
      </div>
      {saveFailed && (
        <Alert variant="destructive">
          <AlertDescription>
            Browser storage is full or blocked, so this history was not saved. It stays until you close the tab.
          </AlertDescription>
        </Alert>
      )}
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
  const prompt = promptPreview(record.draft);
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
        <span className="truncate text-xs font-medium">{record.model}</span>
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
      {prompt && <p className="mt-2 truncate text-xs text-muted-foreground">{prompt}</p>}
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