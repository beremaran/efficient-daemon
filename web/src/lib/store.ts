import { useCallback, useEffect, useRef, useState } from "react";
import { withPartIds } from "@/lib/parts";
import {
  EMPTY_DRAFT,
  type Draft,
  type RunRecord,
  type Settings,
} from "@/lib/types";
import { stripFileData } from "@/lib/history";

const DRAFT_KEY = "efficient-daemon.draft.v1";
const HISTORY_KEY = "efficient-daemon.history.v2";
// A stored value, even "", means "Keep for this tab"; no value means "Don't save".
const API_KEY_KEY = "efficient-daemon.api-key";
const MAX_HISTORY = 20;

/** Copy of a Draft that is safe to write to localStorage. */
export function withoutApiKey<T extends { settings: Settings }>(draft: T): T {
  return { ...draft, settings: { ...draft.settings, apiKey: "" } };
}

function savedApiKey(): string | null {
  try {
    return sessionStorage.getItem(API_KEY_KEY);
  } catch {
    return null;
  }
}

export function loadKeepKey(): boolean {
  return savedApiKey() !== null;
}

const withApiKey = (draft: Draft, apiKey: string): Draft => ({
  ...structuredClone(draft),
  settings: { ...draft.settings, apiKey },
});

export function loadDraft(): Draft {
  const apiKey = savedApiKey() ?? "";
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return withApiKey(EMPTY_DRAFT, apiKey);
    const parsed = JSON.parse(raw) as Partial<Draft>;
    if (parsed.settings?.apiKey) {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(withoutApiKey({ ...parsed, settings: parsed.settings })));
      } catch {
        // Best effort: keep the parsed Draft even if the cleanup write fails.
      }
    }
    return {
      settings: { ...EMPTY_DRAFT.settings, ...parsed.settings, apiKey },
      system: parsed.system ?? "",
      parts: withPartIds(parsed.parts?.length ? parsed.parts : EMPTY_DRAFT.parts),
      schema: parsed.schema ?? EMPTY_DRAFT.schema,
    };
  } catch {
    return withApiKey(EMPTY_DRAFT, apiKey);
  }
}

export function useDraft() {
  const [draft, setDraft] = useState<Draft>(loadDraft);
  const [keepKey, setKeepKey] = useState(loadKeepKey);
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(withoutApiKey(draft)));
    } catch {
      // Quota errors (e.g. huge base64 parts) must not break the UI.
    }
  }, [draft]);
  useEffect(() => {
    try {
      if (keepKey) sessionStorage.setItem(API_KEY_KEY, draft.settings.apiKey);
      else sessionStorage.removeItem(API_KEY_KEY);
    } catch {
      // Without sessionStorage the key stays in memory.
    }
  }, [keepKey, draft.settings.apiKey]);
  return [draft, setDraft, keepKey, setKeepKey] as const;
}

const withoutKey = (r: RunRecord): RunRecord => ({ ...r, draft: withoutApiKey(r.draft) });

export function loadHistory(): RunRecord[] {
  // Removing the legacy key is cleanup only; a read-only store can still have
  // readable v2 history, so keep this separate from the history read.
  try {
    localStorage.removeItem("efficient-daemon.history.v1");
  } catch {
    // ignore
  }

  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    // Older records kept the API key with the Draft; drop it, in storage too.
    const records = (JSON.parse(raw) as RunRecord[]).map(withoutKey);
    if (JSON.stringify(records) !== raw) {
      // The in-memory sanitized records remain useful when localStorage is
      // readable but refuses the migration write.
      saveHistory(records);
    }
    return records;
  } catch {
    return [];
  }
}

/** Saves history to browser storage. On failure it leaves the stored history as it was. */
export function saveHistory(history: RunRecord[]): boolean {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    return true;
  } catch {
    return false;
  }
}

export function useHistory() {
  const [history, setHistory] = useState<RunRecord[]>(loadHistory);
  const [saveFailed, setSaveFailed] = useState(false);
  // Runs finish late, so push reads the latest history from a ref, not a stale closure.
  const latest = useRef(history);

  const push = useCallback((record: RunRecord) => {
    const next = [withoutKey({ ...record, draft: stripFileData(record.draft) }), ...latest.current].slice(0, MAX_HISTORY);
    latest.current = next;
    setHistory(next);
    setSaveFailed(!saveHistory(next));
  }, []);

  const clear = useCallback(() => {
    latest.current = [];
    setHistory([]);
    setSaveFailed(false);
    try {
      localStorage.removeItem(HISTORY_KEY);
    } catch {
      // ignore
    }
  }, []);

  return { history, saveFailed, push, clear };
}

/** Debounces schema linting so typing doesn't hammer the server. */
export function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
