import { useCallback, useEffect, useRef, useState } from "react";
import { withPartIds } from "@/lib/parts";
import {
  EMPTY_DRAFT,
  type Draft,
  type Part,
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

const HISTORY_V1_KEY = "efficient-daemon.history.v1";

type V1Record = Omit<RunRecord, "draft"> & { request?: Record<string, unknown> };

/** Turns a v1 record, which kept the Ask request body, into a Draft-backed record. */
function fromV1({ request: body = {}, ...rest }: V1Record): RunRecord {
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : "");
  const num = (k: string) => (body[k] == null ? "" : String(body[k]));
  const parts = ((body.parts as Record<string, string>[] | undefined) ?? []).map((p): Part =>
    "image" in p
      ? { id: "", kind: "image", image: p.image, source: /^https?:/.test(p.image) ? "url" : "upload" }
      : "pdf" in p
        ? { id: "", kind: "pdf", pdf: p.pdf }
        : { id: "", kind: "text", text: p.text ?? "" },
  );
  return {
    ...rest,
    draft: stripFileData({
      settings: {
        ...EMPTY_DRAFT.settings,
        provider: str("provider"),
        model: str("model"),
        baseURL: str("base-url"),
        reasoningEffort: str("reasoning-effort"),
        temperatureEnabled: body.temperature != null,
        temperature: num("temperature"),
        maxTokensEnabled: body["max-tokens"] != null,
        maxTokens: num("max-tokens"),
        timeout: str("timeout"),
        maxScoreLevels: num("max-score-levels"),
      },
      system: str("system"),
      parts: withPartIds(parts),
      schema: JSON.stringify(body.schema ?? "", null, 2),
    }),
  };
}

export function loadHistory(): RunRecord[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    // Older records kept the API key with the Draft; drop it, in storage too.
    const records = (raw ? (JSON.parse(raw) as RunRecord[]) : []).map(withoutKey);
    let migrated = false;
    try {
      const v1 = localStorage.getItem(HISTORY_V1_KEY);
      if (v1) {
        records.push(...(JSON.parse(v1) as V1Record[]).map(fromV1));
        records.sort((a, b) => b.at - a.at);
        records.length = Math.min(records.length, MAX_HISTORY);
        migrated = true;
      }
    } catch {
      // A bad v1 value stays where it is; v2 history still loads.
    }
    // The in-memory records remain useful when storage refuses the write.
    if ((migrated || JSON.stringify(records) !== raw) && saveHistory(records) && migrated) {
      try {
        localStorage.removeItem(HISTORY_V1_KEY);
      } catch {
        // ignore
      }
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
