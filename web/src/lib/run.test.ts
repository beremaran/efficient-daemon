import { EditorState, keymap } from "@uiw/react-codemirror";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AskRequest } from "@/lib/ask";
import type { LintResult } from "@/lib/lint";
import type { RunState } from "@/components/ResponsePanel";
import { cardToggleClass, connectionMissing, connectionSummary, elapsedLabel, isRunShortcut, runBlocker, runKeymap, runShortcutHint, scrollToResponse, startElapsed, stoppedLabel, stoppedState, systemSummary, type KeyInfo, type RunInput } from "@/lib/run";

const okRequest: AskRequest = { ok: true, body: {}, json: "{}", bytes: 2 };
const okLint: LintResult = { valid: true, errors: [], warnings: [] };

function input(over: Partial<RunInput> = {}): RunInput {
  return {
    model: "gpt",
    baseURL: "http://llm",
    jevjam: false,
    parts: [{ id: "p", kind: "text", text: "hi" }],
    request: okRequest,
    lint: okLint,
    checking: false,
    lintErrors: 0,
    ...over,
  };
}

describe("runBlocker", () => {
  it("is null when Run can go", () => {
    expect(runBlocker(input())).toBeNull();
  });

  it("asks for a model", () => {
    expect(runBlocker(input({ model: "" }))).toBe("Add a model in Connection & sampling");
  });

  it("needs no model for jevjam", () => {
    expect(runBlocker(input({ model: "", jevjam: true }))).toBeNull();
  });

  it("asks for a base URL", () => {
    expect(runBlocker(input({ baseURL: "" }))).toBe("Add a base URL in Connection & sampling");
  });

  it("asks for a Part", () => {
    expect(runBlocker(input({ parts: [] }))).toBe("Add a Part to the user message");
  });

  it("treats blank Parts as missing", () => {
    expect(runBlocker(input({ parts: [{ id: "p", kind: "text", text: "  " }, { id: "p", kind: "image", image: "" }] }))).toBe(
      "Add a Part to the user message",
    );
  });

  it("names the first empty Part when others have content", () => {
    const parts: RunInput["parts"] = [
      { id: "a", kind: "text", text: "hi" },
      { id: "b", kind: "pdf", pdf: "", fileName: "a.pdf" },
    ];
    expect(runBlocker(input({ parts }))).toBe("Fill or remove part 2");
  });

  it("counts schema issues", () => {
    const lint = { ...okLint, errors: ["a", "b"] };
    expect(runBlocker(input({ lint, lintErrors: 2 }))).toBe("2 schema issues — fix before running");
    expect(runBlocker(input({ lint, lintErrors: 1 }))).toBe("1 schema issue — fix before running");
  });

  it("reports an Ask request that failed to build", () => {
    expect(runBlocker(input({ request: { ok: false, error: "bad" } }))).toBe("Fix the response schema");
  });

  it("reports a check in progress", () => {
    expect(runBlocker(input({ checking: true }))).toBe("Checking the schema…");
  });

  it("reports a missing check result", () => {
    expect(runBlocker(input({ lint: null }))).toBe("Checking the schema…");
  });

  it("gives the first reason when several apply", () => {
    expect(runBlocker(input({ model: "", baseURL: "", parts: [] }))).toBe("Add a model in Connection & sampling");
  });
});

describe("connectionMissing", () => {
  it("is true when the model or base URL is missing", () => {
    expect(connectionMissing({ model: "", baseURL: "http://llm", jevjam: false })).toBe(true);
    expect(connectionMissing({ model: "gpt", baseURL: "", jevjam: false })).toBe(true);
  });

  it("is false when both are set", () => {
    expect(connectionMissing({ model: "gpt", baseURL: "http://llm", jevjam: false })).toBe(false);
  });

  it("does not need a model for jevjam", () => {
    expect(connectionMissing({ model: "", baseURL: "http://llm", jevjam: true })).toBe(false);
  });
});

describe("connectionSummary", () => {
  it("shows the model and provider", () => {
    expect(connectionSummary({ model: "gpt", provider: "openai" })).toBe("gpt · openai");
  });

  it("shows not set when the model is missing", () => {
    expect(connectionSummary({ model: "", provider: "openai" })).toBe("not set · openai");
  });

  it("omits an empty provider", () => {
    expect(connectionSummary({ model: "gpt", provider: "" })).toBe("gpt");
  });
});

describe("systemSummary", () => {
  it("says set when the system message has text", () => {
    expect(systemSummary("Be brief")).toBe("set");
  });

  it("is empty when the system message is empty or blank", () => {
    expect(systemSummary("")).toBe("");
    expect(systemSummary("  \n")).toBe("");
  });
});

describe("isRunShortcut", () => {
  const key = (over: Partial<KeyInfo> = {}): KeyInfo => ({
    key: "Enter",
    ctrlKey: true,
    metaKey: false,
    target: { tagName: "BODY" },
    ...over,
  });

  it("runs on Ctrl+Enter or Cmd+Enter when Run is enabled", () => {
    expect(isRunShortcut(key(), true)).toBe(true);
    expect(isRunShortcut(key({ ctrlKey: false, metaKey: true }), true)).toBe(true);
  });

  it("does nothing when Run is disabled", () => {
    expect(isRunShortcut(key(), false)).toBe(false);
  });

  it("ignores Enter without a modifier and other keys", () => {
    expect(isRunShortcut(key({ ctrlKey: false }), true)).toBe(false);
    expect(isRunShortcut(key({ key: "a" }), true)).toBe(false);
  });

  it("ignores keys pressed inside an editor", () => {
    expect(isRunShortcut(key({ target: { tagName: "TEXTAREA" } }), true)).toBe(false);
    expect(isRunShortcut(key({ target: { tagName: "DIV", isContentEditable: true } }), true)).toBe(false);
  });
});

describe("scrollToResponse", () => {
  it("scrolls the Response panel into view on narrow screens", () => {
    const el = { scrollIntoView: vi.fn() };
    scrollToResponse(el, false);
    expect(el.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });

  it("does not scroll on wide screens", () => {
    const el = { scrollIntoView: vi.fn() };
    scrollToResponse(el, true);
    expect(el.scrollIntoView).not.toHaveBeenCalled();
  });

  it("accepts a missing element", () => {
    expect(() => scrollToResponse(null, false)).not.toThrow();
  });
});

describe("runShortcutHint", () => {
  it("fits the platform", () => {
    expect(runShortcutHint(true)).toBe("⌘↵");
    expect(runShortcutHint(false)).toBe("Ctrl+Enter");
  });
});

describe("runKeymap", () => {
  it("runs on Mod-Enter before a default binding", () => {
    let runs = 0;
    const state = EditorState.create({
      extensions: [keymap.of([{ key: "Mod-Enter", run: () => false }]), runKeymap(() => void runs++)],
    });
    const binding = state.facet(keymap).flat().find((b) => b.key === "Mod-Enter");
    expect(binding?.run?.({} as never)).toBe(true);
    expect(runs).toBe(1);
  });
});

describe("stoppedState", () => {
  it("keeps the response so far and records the time", () => {
    const running: RunState = {
      running: true,
      status: null,
      latencyMs: null,
      responseText: '{"partial":',
      answers: null,
      error: null,
      requestPreview: "{}",
    };
    expect(stoppedState(running, 2500)).toEqual({ ...running, running: false, cancelled: true, latencyMs: 2500 });
  });

  it("labels the time in seconds", () => {
    expect(stoppedLabel(2500)).toBe("Stopped after 2.5 s");
  });
});

describe("startElapsed", () => {
  afterEach(() => vi.useRealTimers());

  it("reports elapsed time each second until stopped", () => {
    vi.useFakeTimers();
    const ticks: number[] = [];
    const stop = startElapsed((ms) => ticks.push(ms));
    vi.advanceTimersByTime(3000);
    expect(ticks).toEqual([1000, 2000, 3000]);
    stop();
    vi.advanceTimersByTime(5000);
    expect(ticks).toHaveLength(3);
  });

  it("labels whole seconds", () => {
    expect(elapsedLabel(0)).toBe("0 s");
    expect(elapsedLabel(3999)).toBe("3 s");
  });
});

describe("cardToggleClass", () => {
  it("shows a ring on keyboard focus", () => {
    expect(cardToggleClass.split(" ")).toEqual(expect.arrayContaining(["focus-visible:ring-2", "focus-visible:ring-ring"]));
  });
});
