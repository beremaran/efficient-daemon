// The models the target server lists, fetched through the daemon's POST /models.

import { useEffect, useState } from "react";

import { useDebounced } from "@/lib/store";
import type { Settings } from "@/lib/types";
import { errorMessage } from "@/lib/utils";

export interface ModelsState {
  models: string[];
  loading: boolean;
  error: string;
}

/** The POST /models body for these settings; the server fills in what is empty. */
export function modelsRequest(s: Settings): string {
  const body: Record<string, string> = {};
  if (s.provider) body.provider = s.provider;
  if (s.baseURL.trim()) body["base-url"] = s.baseURL.trim();
  if (s.apiKey.trim()) body["api-key"] = s.apiKey.trim();
  return JSON.stringify(body);
}

async function fetchModels(body: string, signal: AbortSignal): Promise<{ models: string[]; error: string }> {
  try {
    const res = await fetch("/models", { method: "POST", headers: { "Content-Type": "application/json" }, body, signal });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { models: [], error: json.error ?? `HTTP ${res.status}` };
    return { models: json.models ?? [], error: "" };
  } catch (err) {
    return { models: [], error: errorMessage(err) };
  }
}

/** Lists the models for a `modelsRequest` body; null skips the request (no base URL yet). */
export function useModels(body: string | null): ModelsState {
  const settled = useDebounced(body, 400);
  const [result, setResult] = useState<{ body: string; models: string[]; error: string } | null>(null);
  useEffect(() => {
    if (settled === null) return;
    const controller = new AbortController();
    void fetchModels(settled, controller.signal).then((r) => {
      if (!controller.signal.aborted) setResult({ body: settled, ...r });
    });
    return () => controller.abort();
  }, [settled]);
  // A reply for other settings (another server) must not show.
  const current = result?.body === body ? result : null;
  return { models: current?.models ?? [], loading: body !== null && !current, error: current?.error ?? "" };
}
