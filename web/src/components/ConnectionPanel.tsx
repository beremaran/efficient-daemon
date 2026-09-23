import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OptionalNumberField, TextField } from "@/components/fields";
import { REASONING_EFFORTS, type Settings } from "@/lib/types";

export interface ServerDefaults {
  model: string;
  baseURL: string;
  reasoningEffort: string;
  timeout: string;
}

function SelectField({
  label,
  value,
  options,
  onChange,
  serverDefault,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
  serverDefault: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={serverDefault ? `server default (${serverDefault})` : "server default"} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function ConnectionPanel({
  settings,
  onChange,
  serverDefaults,
}: {
  settings: Settings;
  onChange: (next: Settings) => void;
  serverDefaults: Partial<Settings>;
}) {
  const patch = (p: Partial<Settings>) => onChange({ ...settings, ...p });
  return (
    <div className="flex flex-col gap-3">
      <TextField
        label="Model"
        value={settings.model}
        onChange={(model) => patch({ model })}
        placeholder={serverDefaults.model || "required"}
      />
      <TextField
        label="Base URL"
        value={settings.baseURL}
        onChange={(baseURL) => patch({ baseURL })}
        placeholder={serverDefaults.baseURL || "required"}
      />
      <p className="text-xs text-muted-foreground">
        Model and base URL are required here or as server defaults.
      </p>
      <TextField
        label="API key"
        value={settings.apiKey}
        onChange={(apiKey) => patch({ apiKey })}
        placeholder="optional; may be supplied by the server"
      />
      <TextField
        label="Timeout"
        value={settings.timeout}
        onChange={(timeout) => patch({ timeout })}
        placeholder={serverDefaults.timeout ? `server default (${serverDefaults.timeout})` : "server default"}
      />
      <SelectField
        label="Reasoning effort"
        value={settings.reasoningEffort}
        options={REASONING_EFFORTS}
        onChange={(reasoningEffort) => patch({ reasoningEffort })}
        serverDefault={serverDefaults.reasoningEffort ?? ""}
      />
      <OptionalNumberField
        label="Temperature"
        enabled={settings.temperatureEnabled}
        onEnabledChange={(temperatureEnabled) => patch({ temperatureEnabled })}
        value={settings.temperature}
        onValueChange={(temperature) => patch({ temperature })}
        min={0}
        max={2}
      />
      <OptionalNumberField
        label="Max tokens"
        enabled={settings.maxTokensEnabled}
        onEnabledChange={(maxTokensEnabled) => patch({ maxTokensEnabled })}
        value={settings.maxTokens}
        onValueChange={(maxTokens) => patch({ maxTokens })}
        step={1}
      />
    </div>
  );
}

// Re-exported so panels importing Input/Label stay single-sourced.
export { Input, Label };
