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
      />
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type ?? "text"}
        value={value}
        placeholder={placeholder ?? "server default"}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
      />
    </div>
  );
}