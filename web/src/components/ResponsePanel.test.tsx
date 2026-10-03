import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ResponsePanel, type RunState } from "@/components/ResponsePanel";

const base: RunState = {
  running: false,
  status: null,
  latencyMs: null,
  responseText: "",
  answers: null,
  error: null,
  requestPreview: "{}",
};

describe("ResponsePanel error alert", () => {
  it("shows the error inside role=alert", () => {
    const html = renderToStaticMarkup(<ResponsePanel state={{ ...base, error: "boom" }} />);
    expect(html).toMatch(/<div role="alert"[^>]*>.*boom/);
  });

  it("keeps an empty role=alert element when there is no error", () => {
    const html = renderToStaticMarkup(<ResponsePanel state={base} />);
    expect(html).toMatch(/<div role="alert"[^>]*><\/div>/);
  });
});

describe("ResponsePanel run badge", () => {
  it.each([
    ["idle", base, "No run yet."],
    ["running", { ...base, running: true }, "Running…"],
    ["done", { ...base, status: 200 }, "HTTP 200"],
    ["failed", { ...base, status: 500 }, "HTTP 500"],
  ])("puts the %s badge inside role=status", (_, state, text) => {
    const html = renderToStaticMarkup(<ResponsePanel state={state} />);
    expect(html).toMatch(new RegExp(`<div role="status"[^>]*>.*${text}`));
  });
});
