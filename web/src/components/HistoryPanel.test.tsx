import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HistoryPanel } from "@/components/HistoryPanel";
import { EMPTY_DRAFT, type RunRecord } from "@/lib/types";

const record: RunRecord = {
  at: 1,
  status: 200,
  latencyMs: 5,
  model: "gpt-test",
  draft: { ...EMPTY_DRAFT, parts: [{ kind: "text", text: "Summarise this page" }] },
  response: null,
  responseText: "",
  error: null,
};

describe("HistoryPanel", () => {
  it("shows the model and the start of the first text Part", () => {
    const html = renderToStaticMarkup(
      <HistoryPanel history={[record]} onRestore={() => {}} onClear={() => {}} />,
    );
    expect(html).toContain("gpt-test");
    expect(html).toContain("Summarise this page");
  });
});
