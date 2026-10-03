import { useId } from "react";

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
import { PROVIDERS, REASONING_EFFORTS, type Settings } from "@/lib/types";
import { maxScoreLevelsError, maxTokensError, temperatureError } from "@/lib/validate";

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
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
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
  keepKey,
  onKeepKeyChange,
}: {
  settings: Settings;
  onChange: (next: Settings) => void;
  serverDefaults: Partial<Settings>;
  keepKey: boolean;
  onKeepKeyChange: (keep: boolean) => void;
}) {
  const keepId = useId();
  const patch = (p: Partial<Settings>) => onChange({ ...settings, ...p });
  const jevjam = (settings.provider || serverDefaults.provider) === "jevjam";
  return (
    <div className="flex flex-col gap-3">
      <SelectField
        label="Provider"
        value={settings.provider}
        options={PROVIDERS}
        onChange={(provider) => patch({ provider, model: "", baseURL: "", apiKey: "" })}
        serverDefault={serverDefaults.provider ?? ""}
      />
      <TextField
        label="Model"
        value={settings.model}
        onChange={(model) => patch({ model })}
        placeholder={serverDefaults.model || (jevjam ? "optional; jevjam routes by default" : "required")}
      />
      <TextField
        label="Base URL"
        value={settings.baseURL}
        onChange={(baseURL) => patch({ baseURL })}
        placeholder={serverDefaults.baseURL || "required"}
      />
      <p className="text-xs text-muted-foreground">
        {jevjam
          ? "Base URL is required here or as a server default."
          : "Model and base URL are required here or as server defaults."}
      </p>
      <div className="flex items-end gap-2">
        <TextField
          className="min-w-0 flex-1"
          label="API key"
          value={settings.apiKey}
          onChange={(apiKey) => patch({ apiKey })}
          placeholder="optional; may be supplied by the server"
          type="password"
          autoComplete="off"
        />
        <div className="flex w-40 shrink-0 flex-col gap-1.5">
          <Label htmlFor={keepId}>Key storage</Label>
          <Select value={keepKey ? "tab" : "memory"} onValueChange={(v) => onKeepKeyChange(v === "tab")}>
            <SelectTrigger id={keepId} className="w-full">
              <SelectValue>{keepKey ? "Keep for this tab" : "Don't save"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="memory">Don't save</SelectItem>
              <SelectItem value="tab">Keep for this tab</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {keepKey
          ? "The key stays in this tab's session storage until you close the tab."
          : "The key stays in memory only; a reload clears it."}
      </p>
      <TextField
        label="Timeout"
        value={settings.timeout}
        onChange={(timeout) => patch({ timeout })}
        placeholder={serverDefaults.timeout ? `server default (${serverDefaults.timeout})` : "server default"}
      />
      {jevjam ? (
        <TextField
          label="Max score levels"
          value={settings.maxScoreLevels}
          onChange={(maxScoreLevels) => patch({ maxScoreLevels })}
          placeholder={serverDefaults.maxScoreLevels ? `server default (${serverDefaults.maxScoreLevels})` : "server default"}
          type="number"
          error={maxScoreLevelsError(settings.maxScoreLevels)}
        />
      ) : (
        <>
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
            error={temperatureError(settings.temperature)}
          />
          <OptionalNumberField
            label="Max tokens"
            enabled={settings.maxTokensEnabled}
            onEnabledChange={(maxTokensEnabled) => patch({ maxTokensEnabled })}
            value={settings.maxTokens}
            onValueChange={(maxTokens) => patch({ maxTokens })}
            step={1}
            error={maxTokensError(settings.maxTokens)}
          />
        </>
      )}
    </div>
  );
}

// Re-exported so panels importing Input/Label stay single-sourced.
export { Input, Label };
