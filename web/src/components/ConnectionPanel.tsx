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
import type { ModelsState } from "@/lib/models";
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

// Radix Select rejects "" as an item value, so "no model" gets a stand-in.
const NO_MODEL = "__none__";

/** Picks one of the models the target server lists; there is no free text. */
function ModelField({
  value,
  onChange,
  state,
  noModelLabel,
  hasBaseURL,
}: {
  value: string;
  onChange: (v: string) => void;
  state: ModelsState;
  /** Label for leaving the model empty; "" when an empty model is not allowed. */
  noModelLabel: string;
  hasBaseURL: boolean;
}) {
  const id = useId();
  const listed = state.models.includes(value);
  const status = !hasBaseURL
    ? "Set a base URL to list models."
    : state.loading
      ? "Loading models…"
      : state.error
        ? `Could not list models: ${state.error}`
        : state.models.length === 0
          ? "The server lists no models."
          : "";
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Model</Label>
      <Select
        value={value || (noModelLabel ? NO_MODEL : "")}
        onValueChange={(v) => onChange(v === NO_MODEL ? "" : v)}
        disabled={!hasBaseURL || (state.loading && !value)}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="Select a model" />
        </SelectTrigger>
        <SelectContent>
          {noModelLabel && <SelectItem value={NO_MODEL}>{noModelLabel}</SelectItem>}
          {value && !listed && (
            <SelectItem value={value}>{state.loading || state.error ? value : `${value} (not on server)`}</SelectItem>
          )}
          {state.models.map((m) => (
            <SelectItem key={m} value={m}>
              {m}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {status && (
        <p className={state.error && hasBaseURL ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>{status}</p>
      )}
    </div>
  );
}

export function ConnectionPanel({
  settings,
  onChange,
  serverDefaults,
  models,
  hasBaseURL,
  keepKey,
  onKeepKeyChange,
}: {
  settings: Settings;
  onChange: (next: Settings) => void;
  serverDefaults: Partial<Settings>;
  models: ModelsState;
  /** Whether a base URL is set here or as a server default. */
  hasBaseURL: boolean;
  keepKey: boolean;
  onKeepKeyChange: (keep: boolean) => void;
}) {
  const keepId = useId();
  const patch = (p: Partial<Settings>) => onChange({ ...settings, ...p });
  const provider = settings.provider || serverDefaults.provider;
  const jevjam = provider === "jevjam";
  // The server's model belongs to its own provider.
  const defaultModel = provider === serverDefaults.provider ? (serverDefaults.model ?? "") : "";
  const noModelLabel = defaultModel ? `server default (${defaultModel})` : jevjam ? "let jevjam pick" : "";
  return (
    <div className="flex flex-col gap-3">
      <SelectField
        label="Provider"
        value={settings.provider}
        options={PROVIDERS}
        onChange={(provider) => patch({ provider, model: "", baseURL: "", apiKey: "" })}
        serverDefault={serverDefaults.provider ?? ""}
      />
      <ModelField
        value={settings.model}
        onChange={(model) => patch({ model })}
        state={models}
        noModelLabel={noModelLabel}
        hasBaseURL={hasBaseURL}
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
