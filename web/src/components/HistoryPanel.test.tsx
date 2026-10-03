import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HistoryPanel } from "@/components/HistoryPanel";
import { COPY_MESSAGES, copyResult } from "@/lib/copy";
import type { RunRecord } from "@/lib/types";

afterEach(() => vi.unstubAllGlobals());

const record = { at: 1, status: 200, latencyMs: 5, error: null, responseText: "{\"a\":1}" } as RunRecord;

describe("HistoryPanel copy", () => {
  it("renders Copy with a role=status region for each run", () => {
    const html = renderToStaticMarkup(<HistoryPanel history={[record]} onRestore={() => {}} onClear={() => {}} />);
    expect(html).toMatch(/<span role="status"[^>]*><\/span>/);
    expect(html).toContain("Copy");
  });

  it("shows the failure message when the clipboard is blocked", async () => {
    vi.stubGlobal("navigator", {});
    const result = await copyResult(record.responseText);
    expect(COPY_MESSAGES[result]).toMatch(/Select the text and press Ctrl\+C/);
  });
});
