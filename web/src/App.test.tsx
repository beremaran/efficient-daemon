// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "@/App";
import { EMPTY_DRAFT, type Draft, type RunRecord } from "@/lib/types";

// When set, the deferred Draft never catches up, as when a render is still pending.
const defer = vi.hoisted(() => ({ frozen: false }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useDeferredValue: <T,>(value: T) => {
      const [first] = actual.useState(value);
      return defer.frozen ? first : value;
    },
  };
});

// Its wasm schema generator does not load under vitest, and these tests do not edit the schema.
vi.mock("@/components/SchemaPanel", () => ({ SchemaPanel: () => null }));

// CodeMirror needs layout that jsdom lacks, and these tests do not edit in it.
vi.mock("@uiw/react-codemirror", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@uiw/react-codemirror")>()),
  default: () => null,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const jevjam: Draft = {
  ...EMPTY_DRAFT,
  settings: { ...EMPTY_DRAFT.settings, provider: "jevjam", baseURL: "http://llm" },
  parts: [{ id: "p", kind: "text", text: "old" }],
};

let host: HTMLDivElement;
let root: Root;
let lintCalls: ((ok: boolean) => void)[];
let asked: string[];

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("efficient-daemon.draft.v1", JSON.stringify(jevjam));
  defer.frozen = false;
  lintCalls = [];
  asked = [];
  window.matchMedia = (() => ({ matches: true })) as unknown as typeof window.matchMedia;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/schema/lint") {
        await new Promise<boolean>((resolve) => lintCalls.push(resolve));
        return Response.json({ valid: true, errors: [], warnings: [] });
      }
      if (url === "/ask") {
        asked.push(String(init?.body));
        return Response.json({ result: {}, answers: {} });
      }
      return new Response("{}");
    }),
  );
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const mount = () => act(async () => root.render(<App />));
const field = (selector: string) => host.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
const type = (el: HTMLInputElement | HTMLTextAreaElement, value: string) =>
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")!.set!;
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
const button = (name: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.includes(name));
const settle = (ms: number) => act(() => new Promise((resolve) => setTimeout(resolve, ms)));
const finishLint = (i: number) => act(async () => lintCalls[i](true));

describe("Run", () => {
  it("sends the latest text, not the deferred Draft", async () => {
    defer.frozen = true;
    await mount();
    await finishLint(0);
    type(field("textarea"), "old and new");
    expect(button("Run")!.disabled).toBe(false);
    await act(async () => button("Run")!.click());
    expect(JSON.parse(asked[0]).parts).toEqual([{ text: "old and new" }]);
  });
});

describe("schema check", () => {
  it("blocks Run while the deferred Draft lags a lint input edit", async () => {
    defer.frozen = true;
    await mount();
    await finishLint(0);
    expect(button("Run")!.disabled).toBe(false);
    type(field("input[type=number]"), "4");
    expect(button("Run")!.disabled).toBe(true);
  });

  it("ignores a lint reply that lands after a newer one", async () => {
    await mount();
    type(field("input[type=number]"), "4");
    await settle(350);
    expect(lintCalls).toHaveLength(2);
    await finishLint(1);
    await finishLint(0);
    expect(button("Run")!.disabled).toBe(false);
  });
});

describe("Undo restore", () => {
  const record = { at: 1, status: 200, latencyMs: 1, model: "m", draft: EMPTY_DRAFT, response: {}, responseText: "{}", error: null } as RunRecord;

  it("goes away after an edit", async () => {
    localStorage.setItem("efficient-daemon.history.v2", JSON.stringify([record]));
    await mount();
    await act(async () => button("History")!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 })));
    await act(async () => button("Restore")!.click());
    expect(button("Undo restore")).toBeDefined();
    type(field("textarea"), "typed after the restore");
    expect(button("Undo restore")).toBeUndefined();
  });

  it("keeps focus on the History panel after Undo", async () => {
    localStorage.setItem("efficient-daemon.history.v2", JSON.stringify([record]));
    await mount();
    await act(async () => button("History")!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 })));
    await act(async () => button("Restore")!.click());
    await act(async () => button("Undo restore")!.click());
    expect(button("Undo restore")).toBeUndefined();
    expect(document.activeElement).not.toBe(document.body);
    expect(field("textarea").value).toBe("old");
  });
});
