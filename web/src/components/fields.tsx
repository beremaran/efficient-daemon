// Shared small inputs used across the form panels.

import { useId } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export function Field({
  label,
  htmlFor,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

// Props that mark an input invalid and tie its message to it.
const invalidProps = (error: string | undefined, id: string) =>
  error ? { "aria-invalid": true, "aria-describedby": `${id}-error` } : {};

function FieldError({ error, id }: { error?: string; id: string }) {
  return error ? (
    <p id={`${id}-error`} className="text-xs text-destructive">
      {error}
    </p>
  ) : null;
}

export function OptionalNumberField({
  label,
  enabled,
  onEnabledChange,
  value,
  onValueChange,
  placeholder,
  min,
  max,
  step,
  error,
}: {
  label: string;
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  value: string;
  onValueChange: (v: string) => void;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  error?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        <Switch checked={enabled} onCheckedChange={onEnabledChange} aria-label={`send ${label}`} />
      </div>
      <Input
        id={id}
        type="number"
        value={value}
        placeholder={placeholder ?? "server default"}
        disabled={!enabled}
        min={min}
        max={max}
        step={step ?? 0.1}
        onChange={(e) => onValueChange(e.target.value)}
        {...invalidProps(enabled ? error : undefined, id)}
      />
      <FieldError error={enabled ? error : undefined} id={id} />
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  autoComplete,
  className,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  autoComplete?: string;
  className?: string;
  error?: string;
}) {
  const id = useId();
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type ?? "text"}
        autoComplete={autoComplete}
        value={value}
        placeholder={placeholder ?? "server default"}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        {...invalidProps(error, id)}
      />
      <FieldError error={error} id={id} />
    </div>
  );
}