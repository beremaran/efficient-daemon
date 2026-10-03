import { useCallback, useEffect, useState } from "react";
import {
  EMPTY_DRAFT,
  type Draft,
  type RunRecord,
  type Settings,
} from "@/lib/types";

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

export function loadDraft(): Draft {
  const apiKey = savedApiKey() ?? "";
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return structuredClone(EMPTY_DRAFT);
    const parsed = JSON.parse(raw) as Partial<Draft>;
    if (parsed.settings?.apiKey) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(withoutApiKey({ ...parsed, settings: parsed.settings })));
    }
    return {
      settings: { ...EMPTY_DRAFT.settings, ...parsed.settings, apiKey },
      system: parsed.system ?? "",
      parts: parsed.parts?.length ? parsed.parts : [{ kind: "text", text: "" }],
      schema: parsed.schema ?? EMPTY_DRAFT.schema,
    };
  } catch {
    return structuredClone(EMPTY_DRAFT);
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
  try {
    // v1 records held the request body, not the Draft; drop them.
    localStorage.removeItem("efficient-daemon.history.v1");
    const raw = localStorage.getItem(HISTORY_KEY);
    // Older records kept the API key with the Draft; drop it.
    return raw ? (JSON.parse(raw) as RunRecord[]).map(withoutKey) : [];
  } catch {
    return [];
  }
}

export function useHistory() {
  const [history, setHistory] = useState<RunRecord[]>(loadHistory);

  const push = useCallback((record: RunRecord) => {
    setHistory((prev) => {
      const next = [withoutKey(record), ...prev].slice(0, MAX_HISTORY);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      } catch {
        // Drop history persistence rather than crashing on quota.
        try {
          localStorage.removeItem(HISTORY_KEY);
        } catch {
          // ignore
        }
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setHistory([]);
    try {
      localStorage.removeItem(HISTORY_KEY);
    } catch {
      // ignore
    }
  }, []);

  return { history, push, clear };
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