import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HistoryPanel } from "@/components/HistoryPanel";
import { COPY_MESSAGES, copyResult } from "@/lib/copy";
import { saveHistory } from "@/lib/store";
import { EMPTY_DRAFT, type RunRecord } from "@/lib/types";

afterEach(() => vi.unstubAllGlobals());

const record: RunRecord = {
  at: 1,
  status: 200,
  latencyMs: 5,
  model: "gpt-test",
  draft: { ...EMPTY_DRAFT, parts: [{ id: "p", kind: "text", text: "Summarise this page" }] },
  response: null,
  responseText: "",
  error: null,
};

describe("HistoryPanel copy", () => {
  const withResponse = { ...record, responseText: '{"a":1}' };

  it("renders Copy with a role=status region for each run", () => {
    const html = renderToStaticMarkup(<HistoryPanel history={[withResponse]} onRestore={() => {}} onClear={() => {}} />);
    expect(html).toMatch(/<span role="status"[^>]*><\/span>/);
    expect(html).toContain("Copy");
  });

  it("shows the failure message when the clipboard is blocked", async () => {
    vi.stubGlobal("navigator", {});
    const result = await copyResult(withResponse.responseText);
    expect(COPY_MESSAGES[result]).toMatch(/Select the text and press Ctrl\+C/);
  });
});

describe("HistoryPanel", () => {
  it("shows the model and the start of the first text Part", () => {
    const html = renderToStaticMarkup(
      <HistoryPanel history={[record]} onRestore={() => {}} onClear={() => {}} />,
    );
    expect(html).toContain("gpt-test");
    expect(html).toContain("Summarise this page");
  });

  it("warns when saving failed", () => {
    const html = renderToStaticMarkup(
      <HistoryPanel history={[record]} saveFailed onRestore={() => {}} onClear={() => {}} />,
    );
    expect(html).toContain("was not saved");
  });
});

describe("HistoryPanel undo", () => {
  const render = (onUndo?: () => void) =>
    HistoryPanel({ history: [record], onRestore: () => {}, onUndo, onClear: () => {} });

  it("hides Undo until a Restore can be undone", () => {
    expect(renderToStaticMarkup(render())).not.toContain("Undo restore");
  });

  it("shows Undo and calls onUndo when clicked", () => {
    const onUndo = vi.fn();
    expect(renderToStaticMarkup(render(onUndo))).toContain("Undo restore");
    const button = findByText(render(onUndo), "Undo restore");
    button?.props.onClick();
    expect(onUndo).toHaveBeenCalledOnce();
  });
});

function findByText(node: ReactNode, text: string): ReactElement<{ onClick: () => void }> | null {
  if (!isValidElement<{ children?: ReactNode; onClick: () => void }>(node)) return null;
  if (node.props.children === text) return node;
  for (const child of Children.toArray(node.props.children)) {
    const found = findByText(child, text);
    if (found) return found;
  }
  return null;
}

describe("saveHistory", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reports a failed save and leaves stored history alone", () => {
    const data = new Map([["efficient-daemon.history.v2", "old"]]);
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
      removeItem: (k: string) => data.delete(k),
    });
    expect(saveHistory([record])).toBe(false);
    expect(data.get("efficient-daemon.history.v2")).toBe("old");
  });

  it("reports a good save", () => {
    const data = new Map<string, string>();
    vi.stubGlobal("localStorage", { setItem: (k: string, v: string) => data.set(k, v) });
    expect(saveHistory([record])).toBe(true);
    expect(data.size).toBe(1);
  });
});
