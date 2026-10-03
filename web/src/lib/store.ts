import { useCallback, useEffect, useState } from "react";
import {
  EMPTY_DRAFT,
  type Draft,
  type RunRecord,
} from "@/lib/types";

const DRAFT_KEY = "efficient-daemon.draft.v1";
const HISTORY_KEY = "efficient-daemon.history.v2";
const MAX_HISTORY = 20;

export function loadDraft(): Draft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return structuredClone(EMPTY_DRAFT);
    const parsed = JSON.parse(raw) as Partial<Draft>;
    return {
      settings: { ...EMPTY_DRAFT.settings, ...parsed.settings },
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
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // Quota errors (e.g. huge base64 parts) must not break the UI.
    }
  }, [draft]);
  return [draft, setDraft] as const;
}

export function loadHistory(): RunRecord[] {
  try {
    // v1 records held the request body, not the Draft; drop them.
    localStorage.removeItem("efficient-daemon.history.v1");
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as RunRecord[]) : [];
  } catch {
    return [];
  }
}

export function useHistory() {
  const [history, setHistory] = useState<RunRecord[]>(loadHistory);

  const push = useCallback((record: RunRecord) => {
    setHistory((prev) => {
      const next = [record, ...prev].slice(0, MAX_HISTORY);
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