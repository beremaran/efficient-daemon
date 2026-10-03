import { useRef } from "react";
import { ArrowDown, ArrowUp, FileText, Image as ImageIcon, Plus, Trash2, Type } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { checkImageFile, fileToBase64, MAX_BODY_MB } from "@/lib/media";
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
  const setPart = (index: number, patch: Partial<Part>) => {
    const next = [...parts];
    next[index] = { ...next[index], ...patch };
    onPartsChange(next);
  };

  const addPart = (kind: Part["kind"]) => {
    if (kind === "text") onPartsChange([...parts, { kind: "text", text: "" }]);
    else if (kind === "image") onPartsChange([...parts, { kind: "image", source: "url", image: "" }]);
    else onPartsChange([...parts, { kind: "pdf", pdf: "" }]);
  };

  const removePart = (index: number) => onPartsChange(parts.filter((_, i) => i !== index));

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= parts.length) return;
    const next = [...parts];
    [next[index], next[target]] = [next[target], next[index]];
    onPartsChange(next);
  };

  return (
    <div className="flex flex-col gap-2">
      {parts.map((part, i) => (
        <PartEditor
          key={i}
          index={i}
          part={part}
          count={parts.length}
          onChange={(patch) => setPart(i, patch)}
          onRemove={() => removePart(i)}
          onMove={(delta) => move(i, delta)}
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

function PartEditor({
  index,
  part,
  count,
  onChange,
  onRemove,
  onMove,
}: {
  index: number;
  part: Part;
  count: number;
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
        {part.kind === "image" && <ImagePartEditor part={part} onChange={onChange} />}
        {part.kind === "pdf" && <PdfPartEditor part={part} onChange={onChange} />}
      </CardContent>
    </Card>
  );
}

function ImagePartEditor({
  part,
  onChange,
}: {
  part: Part;
  onChange: (patch: Partial<Part>) => void;
}) {
  const urlMode = part.source === "url";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <Label className="text-xs text-muted-foreground">Upload</Label>
        <Switch
          checked={urlMode}
          onCheckedChange={(v) => onChange({ source: v ? "url" : "upload", image: "", fileName: undefined })}
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

function PdfPartEditor({ part, onChange }: { part: Part; onChange: (patch: Partial<Part>) => void }) {
  return (
    <FileInput
      accept="application/pdf,.pdf"
      fileName={part.fileName}
      onFile={(pdf, name) => onChange({ pdf, fileName: name })}
    />
  );
}

function FileInput({
  accept,
  fileName,
  enforceImageCap,
  onFile,
}: {
  accept: string;
  enforceImageCap?: boolean;
  fileName?: string;
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
            alert(guard.message);
            e.target.value = "";
            return;
          }
          const b64 = await fileToBase64(file);
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
    </div>
  );
}
