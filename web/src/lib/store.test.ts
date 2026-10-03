import { beforeEach, describe, expect, it, vi } from "vitest";

import { loadDraft, loadHistory, loadKeepKey, withoutApiKey } from "@/lib/store";
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
});
