import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, FileText, Image as ImageIcon, Plus, Trash2, Type } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { MAX_BODY_MB, dragHasFiles, pastedImage, readDroppedFile, readPartFile } from "@/lib/media";
import { focusAfterRemove, hasFile, movePart, newPart, removePart, restorePart, switchImageSource } from "@/lib/parts";
import { MAX_BODY_BYTES, type Part } from "@/lib/types";
import { cn } from "@/lib/utils";

/** How long Undo stays after removing a Part with a file. */
const UNDO_MS = 8000;

export function PartsEditor({
  parts,
  onPartsChange,
  bytes,
}: {
  parts: Part[];
  onPartsChange: (next: Part[]) => void;
  /** Size of the Ask request; null while it can't be built. */
  bytes: number | null;
}) {
  // File errors by Part id; UI-only, so they stay out of the Draft.
  const [fileErrors, setFileErrors] = useState<Record<string, string>>({});
  const setFileError = (id: string, message?: string) =>
    setFileErrors(({ [id]: _old, ...rest }) => (message ? { ...rest, [id]: message } : rest));

  // The Part just added; it takes focus until the next change.
  const [focusId, setFocusId] = useState<string>();
  const change = (next: Part[]) => {
    setFocusId(undefined);
    onPartsChange(next);
  };

  // Where focus goes after a remove or Undo: a Part id, or the add buttons when `id` is unset.
  const rootRef = useRef<HTMLDivElement>(null);
  const afterRemove = useRef<{ id?: string }>(undefined);
  useEffect(() => {
    if (!afterRemove.current) return;
    const { id } = afterRemove.current;
    afterRemove.current = undefined;
    const target = id
      ? rootRef.current?.querySelector(`[data-part-id="${id}"] [data-remove]`)
      : rootRef.current?.querySelector("[data-add-parts] button");
    (target as HTMLElement | null)?.focus();
  }, [parts]);

  // The last removed Part that held a file; Undo offers it back for a few seconds.
  const [removed, setRemoved] = useState<{ part: Part; index: number }>();
  const undoTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const dropUndo = () => {
    clearTimeout(undoTimer.current);
    setRemoved(undefined);
  };
  useEffect(() => () => clearTimeout(undoTimer.current), []);

  const setPart = (index: number, patch: Partial<Part>) => {
    const next = [...parts];
    next[index] = { ...next[index], ...patch };
    change(next);
  };

  const addPart = (kind: Part["kind"]) => {
    const part = newPart(kind);
    onPartsChange([...parts, part]);
    setFocusId(part.id);
  };

  return (
    <div ref={rootRef} className="flex flex-col gap-2">
      {parts.map((part, i) => (
        <PartEditor
          key={part.id}
          index={i}
          part={part}
          count={parts.length}
          error={fileErrors[part.id]}
          autoFocus={part.id === focusId}
          onError={(message) => setFileError(part.id, message)}
          onChange={(patch) => setPart(i, patch)}
          onRemove={() => {
            setFileError(part.id);
            change(removePart(parts, i));
            dropUndo();
            if (hasFile(part)) {
              setRemoved({ part, index: i });
              undoTimer.current = setTimeout(() => setRemoved(undefined), UNDO_MS);
            }
            afterRemove.current = { id: focusAfterRemove(parts, i) };
          }}
          onMove={(delta) => change(movePart(parts, i, delta))}
        />
      ))}

      {removed && (
        <UndoNotice
          label={`Removed ${removed.part.fileName ?? "file"}`}
          onUndo={() => {
            change(restorePart(parts, removed.part, removed.index));
            afterRemove.current = { id: removed.part.id };
            dropUndo();
          }}
        />
      )}

      {bytes !== null && <SizeMeter totalBytes={bytes} />}

      <div data-add-parts className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => addPart("text")}>
          <Type /> Text
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => addPart("image")}>
          <ImageIcon /> Image
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => addPart("pdf")}>
          <FileText /> PDF
        </Button>
      </div>
    </div>
  );
}

export function UndoNotice({ label, onUndo }: { label: string; onUndo: () => void }) {
  return (
    <div role="status" className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
      <span className="truncate">{label}</span>
      <Button type="button" variant="outline" size="sm" onClick={onUndo}>
        Undo
      </Button>
    </div>
  );
}

function SizeMeter({ totalBytes }: { totalBytes: number }) {
  // Keep in sync with internal/server maxBodyBytes (30 MiB).
  const pct = Math.min(100, (totalBytes / MAX_BODY_BYTES) * 100);
  const over = totalBytes > MAX_BODY_BYTES;
  return (
    <div className="flex flex-col gap-1">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full transition-all", pct > 85 || over ? "bg-destructive" : "bg-primary")}
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
      </div>
      <div className={cn("text-xs", over ? "text-destructive" : "text-muted-foreground")}>
        Ask request ≈ {(totalBytes / (1 << 20)).toFixed(1)} MB / {MAX_BODY_MB} MB cap
        {over ? " — over the cap; shrink or remove media" : ""}
      </div>
    </div>
  );
}

export function PartEditor({
  index,
  part,
  count,
  error,
  autoFocus,
  onError,
  onChange,
  onRemove,
  onMove,
}: {
  index: number;
  part: Part;
  count: number;
  /** File error to show under this Part. */
  error?: string;
  /** Focus the first field on mount. */
  autoFocus?: boolean;
  onError: (message?: string) => void;
  onChange: (patch: Partial<Part>) => void;
  onRemove: () => void;
  onMove: (delta: -1 | 1) => void;
}) {
  // A file dropped on an image or PDF Part, or an image pasted into an image Part, loads into it.
  const [over, setOver] = useState(false);
  const kind = part.kind === "image" || part.kind === "pdf" ? part.kind : undefined;
  const load = async (kind: "image" | "pdf", file: File) => {
    const result = await readDroppedFile(kind, file);
    if ("message" in result) return onError(result.message);
    onError();
    const loaded = kind === "image" ? { image: result.base64, fileName: file.name } : { pdf: result.base64, fileName: file.name };
    onChange(kind === "image" && part.source === "url" ? { ...switchImageSource(part, "upload"), ...loaded } : loaded);
  };
  const accepts = (e: React.DragEvent) => kind !== undefined && dragHasFiles(e.dataTransfer);
  return (
    <Card
      data-part-id={part.id}
      data-drop-over={over || undefined}
      className={cn(over && "ring-2 ring-primary")}
      onDragOver={(e) => {
        if (!accepts(e)) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(e) => {
        setOver(false);
        const file = e.dataTransfer.files[0];
        if (!kind || !file) return;
        e.preventDefault();
        void load(kind, file);
      }}
      onPaste={(e) => {
        const file = kind === "image" ? pastedImage(e.clipboardData) : undefined;
        if (!file) return;
        e.preventDefault();
        void load("image", file);
      }}
    >
      <CardHeader className="flex flex-row items-center justify-between gap-2 py-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Badge variant="outline">#{index + 1}</Badge>
          {part.kind === "text" && <Type className="h-4 w-4" />}
          {part.kind === "image" && <ImageIcon className="h-4 w-4" />}
          {part.kind === "pdf" && <FileText className="h-4 w-4" />}
          <span className="capitalize">{part.kind === "pdf" ? "PDF" : part.kind}</span>
        </CardTitle>
        <div className="flex items-center gap-1">
          <IconButton onClick={() => onMove(-1)} disabled={index === 0} label={`Move part ${index + 1} up`}>
            <ArrowUp />
          </IconButton>
          <IconButton onClick={() => onMove(1)} disabled={index === count - 1} label={`Move part ${index + 1} down`}>
            <ArrowDown />
          </IconButton>
          <IconButton onClick={onRemove} data-remove label={`Remove part ${index + 1}`}>
            <Trash2 />
          </IconButton>
        </div>
      </CardHeader>
      <CardContent>
        {part.kind === "text" && (
          <Textarea
            value={part.text ?? ""}
            onChange={(e) => onChange({ text: e.target.value })}
            placeholder="Text content…"
            className="min-h-[160px]"
            autoFocus={autoFocus}
          />
        )}
        {part.kind === "image" && <ImagePartEditor part={part} error={error} autoFocus={autoFocus} onError={onError} onChange={onChange} />}
        {part.kind === "pdf" && <PdfPartEditor part={part} error={error} autoFocus={autoFocus} onError={onError} onChange={onChange} />}
      </CardContent>
    </Card>
  );
}

function ImagePartEditor({
  part,
  error,
  autoFocus,
  onError,
  onChange,
}: {
  part: Part;
  error?: string;
  autoFocus?: boolean;
  onError: (message?: string) => void;
  onChange: (patch: Partial<Part>) => void;
}) {
  const source = part.source === "url" ? "url" : "upload";
  return (
    <Tabs
      value={source}
      onValueChange={(v) => {
        onError();
        onChange(switchImageSource(part, v as "upload" | "url"));
      }}
      className="flex flex-col gap-2"
    >
      <TabsList className="self-start" aria-label="Image source">
        <TabsTrigger value="upload">Upload</TabsTrigger>
        <TabsTrigger value="url">URL</TabsTrigger>
      </TabsList>
      <TabsContent value="url">
        <Input
          value={part.image ?? ""}
          onChange={(e) => onChange({ image: e.target.value })}
          placeholder="https://example.com/picture.png"
          spellCheck={false}
          autoFocus={autoFocus}
        />
      </TabsContent>
      <TabsContent value="upload" className="flex flex-col gap-2">
        <FileInput
          accept="image/*"
          enforceImageCap
          fileName={part.fileName}
          error={error}
          autoFocus={autoFocus}
          onError={onError}
          onFile={(b64, name) => onChange({ image: b64, fileName: name })}
        />
        {part.image && (
          <img
            src={`data:;base64,${part.image}`}
            alt="uploaded preview"
            className="max-h-32 w-auto rounded border"
          />
        )}
      </TabsContent>
    </Tabs>
  );
}

function PdfPartEditor({
  part,
  error,
  autoFocus,
  onError,
  onChange,
}: {
  part: Part;
  error?: string;
  autoFocus?: boolean;
  onError: (message?: string) => void;
  onChange: (patch: Partial<Part>) => void;
}) {
  return (
    <FileInput
      accept="application/pdf,.pdf"
      fileName={part.fileName}
      error={error}
      autoFocus={autoFocus}
      onError={onError}
      onFile={(pdf, name) => onChange({ pdf, fileName: name })}
    />
  );
}

function FileInput({
  accept,
  fileName,
  enforceImageCap,
  error,
  autoFocus,
  onError,
  onFile,
}: {
  accept: string;
  enforceImageCap?: boolean;
  fileName?: string;
  error?: string;
  autoFocus?: boolean;
  onError: (message?: string) => void;
  onFile: (base64: string, name: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-1">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const result = await readPartFile(file, enforceImageCap);
          if ("message" in result) onError(result.message);
          else {
            onError();
            onFile(result.base64, file.name);
          }
          e.target.value = "";
        }}
      />
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" autoFocus={autoFocus} onClick={() => inputRef.current?.click()}>
          <Plus /> Choose file
        </Button>
        {fileName && <span className="truncate text-xs text-muted-foreground">{fileName}</span>}
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
