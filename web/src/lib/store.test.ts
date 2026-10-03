import { beforeEach, describe, expect, it, vi } from "vitest";

import { addToHistory, clearHistory, loadDraft, loadHistory, loadKeepKey, withoutApiKey } from "@/lib/store";
import { EMPTY_DRAFT, type RunRecord } from "@/lib/types";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

const DRAFT_KEY = "efficient-daemon.draft.v1";
const API_KEY_KEY = "efficient-daemon.api-key";
const withKey = { ...EMPTY_DRAFT, settings: { ...EMPTY_DRAFT.settings, model: "m", apiKey: "sk-secret" } };

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
  vi.stubGlobal("sessionStorage", memoryStorage());
});

describe("API key migration", () => {
  it("keeps the saved Draft when the cleanup write fails", () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(withKey));
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => (k === DRAFT_KEY ? JSON.stringify(withKey) : null),
      setItem: () => {
        throw new Error("read-only");
      },
    });
    expect(loadDraft().settings.model).toBe("m");
  });
});

describe("API key storage", () => {
  it("Don't save: no tab key, so the key is empty after a reload", () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(withoutApiKey(withKey)));
    expect(loadKeepKey()).toBe(false);
    expect(loadDraft().settings.apiKey).toBe("");
    expect(loadDraft().settings.model).toBe("m");
  });

  it("Keep for this tab: restores the key from sessionStorage", () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(withoutApiKey(withKey)));
    sessionStorage.setItem(API_KEY_KEY, "sk-tab");
    expect(loadKeepKey()).toBe(true);
    expect(loadDraft().settings.apiKey).toBe("sk-tab");
  });

  it("keeps the choice even when the key is empty", () => {
    sessionStorage.setItem(API_KEY_KEY, "");
    expect(loadKeepKey()).toBe(true);
  });

  it("Keep for this tab: restores the key when there is no saved draft", () => {
    sessionStorage.setItem(API_KEY_KEY, "sk-tab");
    expect(loadDraft().settings.apiKey).toBe("sk-tab");
  });

  it("Keep for this tab: restores the key when the saved draft does not parse", () => {
    localStorage.setItem(DRAFT_KEY, "{not json");
    sessionStorage.setItem(API_KEY_KEY, "sk-tab");
    expect(loadDraft().settings.apiKey).toBe("sk-tab");
  });

  it("does not change the shared empty draft", () => {
    sessionStorage.setItem(API_KEY_KEY, "sk-tab");
    loadDraft();
    expect(EMPTY_DRAFT.settings.apiKey).toBe("");
  });

  it("removes a key already in localStorage on load", () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(withKey));
    expect(loadDraft().settings.apiKey).toBe("");
    const stored = localStorage.getItem(DRAFT_KEY) ?? "";
    expect(stored).not.toContain("sk-secret");
    expect(JSON.parse(stored).settings.model).toBe("m");
  });

  it("strips the key from saved history", () => {
    const record = { at: 1, draft: withKey } as RunRecord;
    localStorage.setItem("efficient-daemon.history.v2", JSON.stringify([record]));
    expect(loadHistory()[0].draft.settings.apiKey).toBe("");
  });

  it("removes the key from stored history on load", () => {
    const record = { at: 1, draft: withKey } as RunRecord;
    localStorage.setItem("efficient-daemon.history.v2", JSON.stringify([record]));
    loadHistory();
    expect(localStorage.getItem("efficient-daemon.history.v2")).not.toContain("sk-secret");
  });

  it("loads v2 history when removing the legacy key fails", () => {
    const record = { at: 1, draft: withoutApiKey(withKey) } as RunRecord;
    const raw = JSON.stringify([record]);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => (key === "efficient-daemon.history.v2" ? raw : null),
      removeItem: () => {
        throw new Error("read-only");
      },
      setItem: vi.fn(),
    });

    expect(loadHistory()).toMatchObject([{ at: 1, draft: { settings: { model: "m", apiKey: "" } } }]);
  });

  it("returns sanitized history when its migration write fails", () => {
    const record = { at: 1, draft: withKey } as RunRecord;
    const raw = JSON.stringify([record]);
    const setItem = vi.fn(() => {
      throw new Error("read-only");
    });
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => (key === "efficient-daemon.history.v2" ? raw : null),
      removeItem: vi.fn(),
      setItem,
    });

    expect(loadHistory()).toMatchObject([{ at: 1, draft: { settings: { model: "m", apiKey: "" } } }]);
    expect(setItem).toHaveBeenCalledOnce();
  });
});

describe("history v1 migration", () => {
  it("converts v1 records to Drafts and removes the v1 key", () => {
    const v1 = {
      at: 1,
      status: 200,
      latencyMs: 5,
      model: "m",
      request: { schema: { type: "object" }, model: "m", "api-key": "sk-x", temperature: 0.5, parts: [{ text: "hi" }, { pdf: "AAA" }] },
      response: null,
      responseText: "{}",
      error: null,
    };
    localStorage.setItem("efficient-daemon.history.v1", JSON.stringify([v1]));
    const [rec] = loadHistory();
    expect(rec.draft.settings).toMatchObject({ model: "m", apiKey: "", temperatureEnabled: true, temperature: "0.5" });
    expect(rec.draft.parts.map((p) => p.kind)).toEqual(["text", "pdf"]);
    expect(rec.draft.parts[1].pdf).toBe("");
    expect(localStorage.getItem("efficient-daemon.history.v1")).toBeNull();
    expect(loadHistory()).toHaveLength(1);
  });
});

// A v1 history whose migration cannot be written: v2 writes fail until `allow` is called.
function failedV1Migration() {
  const storage = memoryStorage();
  let writable = false;
  const v1 = { at: 1, status: 200, latencyMs: 5, model: "m", request: { model: "m", parts: [] }, response: null, responseText: "{}", error: null };
  storage.setItem("efficient-daemon.history.v1", JSON.stringify([v1]));
  vi.stubGlobal("localStorage", {
    ...storage,
    setItem: (k: string, v: string) => {
      if (!writable) throw new Error("quota");
      storage.setItem(k, v);
    },
  });
  return { storage, allow: () => void (writable = true) };
}

describe("addToHistory", () => {
  it("drops v1 once the saved list holds its records, so a reload does not migrate them twice", () => {
    const { storage, allow } = failedV1Migration();
    const loaded = loadHistory();
    expect(loaded).toHaveLength(1);
    allow();
    const { next, saved } = addToHistory(loaded, { ...loaded[0], at: 2 });
    expect(saved).toBe(true);
    expect(next).toHaveLength(2);
    expect(storage.getItem("efficient-daemon.history.v1")).toBeNull();
    expect(loadHistory().map((r) => r.at)).toEqual([2, 1]);
  });

  it("keeps v1 when the save fails", () => {
    const { storage } = failedV1Migration();
    const loaded = loadHistory();
    expect(addToHistory(loaded, { ...loaded[0], at: 2 }).saved).toBe(false);
    expect(storage.getItem("efficient-daemon.history.v1")).not.toBeNull();
  });
});

describe("clearHistory", () => {
  it("removes v1 history kept after a failed migration, so it does not come back", () => {
    const { storage } = failedV1Migration();
    expect(loadHistory()).toHaveLength(1);
    expect(storage.getItem("efficient-daemon.history.v1")).not.toBeNull();
    clearHistory();
    expect(loadHistory()).toEqual([]);
  });
});
