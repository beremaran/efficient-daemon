import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, FileText, Image as ImageIcon, Plus, Trash2, Type } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { checkImageFile, fileToBase64, MAX_BODY_MB } from "@/lib/media";
import { movePart, newPart, removePart } from "@/lib/parts";
import { MAX_BODY_BYTES, type Part } from "@/lib/types";
import { cn } from "@/lib/utils";

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

  const setPart = (index: number, patch: Partial<Part>) => {
    const next = [...parts];
    next[index] = { ...next[index], ...patch };
    onPartsChange(next);
  };

  const addPart = (kind: Part["kind"]) => onPartsChange([...parts, newPart(kind)]);

  return (
    <div className="flex flex-col gap-2">
      {parts.map((part, i) => (
        <PartEditor
          key={part.id}
          index={i}
          part={part}
          count={parts.length}
          error={fileErrors[part.id]}
          onError={(message) => setFileError(part.id, message)}
          onChange={(patch) => setPart(i, patch)}
          onRemove={() => {
            setFileError(part.id);
            onPartsChange(removePart(parts, i));
          }}
          onMove={(delta) => onPartsChange(movePart(parts, i, delta))}
        />
      ))}

      {bytes !== null && <PayloadMeter totalBytes={bytes} />}

      <div className="flex items-center gap-2">
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

function PayloadMeter({ totalBytes }: { totalBytes: number }) {
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
        payload ≈ {(totalBytes / (1 << 20)).toFixed(1)} MB / {MAX_BODY_MB} MB body cap
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
  onError: (message?: string) => void;
  onChange: (patch: Partial<Part>) => void;
  onRemove: () => void;
  onMove: (delta: -1 | 1) => void;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 py-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Badge variant="outline">#{index + 1}</Badge>
          {part.kind === "text" && <Type className="h-4 w-4" />}
          {part.kind === "image" && <ImageIcon className="h-4 w-4" />}
          {part.kind === "pdf" && <FileText className="h-4 w-4" />}
          <span className="capitalize">{part.kind === "pdf" ? "PDF" : part.kind}</span>
        </CardTitle>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => onMove(-1)} disabled={index === 0} aria-label="move up">
            <ArrowUp />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onMove(1)} disabled={index === count - 1} aria-label="move down">
            <ArrowDown />
          </Button>
          <Button variant="ghost" size="icon" onClick={onRemove} aria-label="remove part">
            <Trash2 />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {part.kind === "text" && (
          <Textarea
            value={part.text ?? ""}
            onChange={(e) => onChange({ text: e.target.value })}
            placeholder="Text content…"
            className="min-h-[160px]"
          />
        )}
        {part.kind === "image" && <ImagePartEditor part={part} error={error} onError={onError} onChange={onChange} />}
        {part.kind === "pdf" && <PdfPartEditor part={part} error={error} onError={onError} onChange={onChange} />}
      </CardContent>
    </Card>
  );
}

function ImagePartEditor({
  part,
  error,
  onError,
  onChange,
}: {
  part: Part;
  error?: string;
  onError: (message?: string) => void;
  onChange: (patch: Partial<Part>) => void;
}) {
  const urlMode = part.source === "url";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <Label className="text-xs text-muted-foreground">Upload</Label>
        <Switch
          checked={urlMode}
          onCheckedChange={(v) => {
            onError();
            onChange({ source: v ? "url" : "upload", image: "", fileName: undefined });
          }}
          aria-label="toggle image URL mode"
        />
        <Label className="text-xs text-muted-foreground">http(s) URL</Label>
      </div>
      {urlMode ? (
        <Input
          value={part.image ?? ""}
          onChange={(e) => onChange({ image: e.target.value })}
          placeholder="https://example.com/picture.png"
          spellCheck={false}
        />
      ) : (
        <FileInput
          accept="image/*"
          enforceImageCap
          fileName={part.fileName}
          error={error}
          onError={onError}
          onFile={(b64, name) => onChange({ image: b64, fileName: name })}
        />
      )}
      {part.image && !urlMode && (
        <img
          src={`data:;base64,${part.image}`}
          alt="uploaded preview"
          className="max-h-32 w-auto rounded border"
        />
      )}
    </div>
  );
}

function PdfPartEditor({
  part,
  error,
  onError,
  onChange,
}: {
  part: Part;
  error?: string;
  onError: (message?: string) => void;
  onChange: (patch: Partial<Part>) => void;
}) {
  return (
    <FileInput
      accept="application/pdf,.pdf"
      fileName={part.fileName}
      error={error}
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
  onError,
  onFile,
}: {
  accept: string;
  enforceImageCap?: boolean;
  fileName?: string;
  error?: string;
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
          const guard = enforceImageCap ? checkImageFile(file) : { ok: true };
          if (!guard.ok) {
            onError(guard.message);
            e.target.value = "";
            return;
          }
          const b64 = await fileToBase64(file);
          onError();
          onFile(b64, file.name);
          e.target.value = "";
        }}
      />
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
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
