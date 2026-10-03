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

describe("ResponsePanel empty state", () => {
  it("shows the getting-started steps before the first run", () => {
    const html = renderToStaticMarkup(<ResponsePanel state={base} />);
    expect(html).toContain("Add a Part");
    expect(html).toContain("Check the schema");
    expect(html).toContain("Click Run");
  });

  it.each([
    ["running", { ...base, running: true }],
    ["stopped", { ...base, cancelled: true }],
    ["done", { ...base, status: 200, responseText: "{}" }],
    ["failed", { ...base, error: "boom" }],
  ])("hides the steps once a run is %s", (_, state) => {
    const html = renderToStaticMarkup(<ResponsePanel state={state} />);
    expect(html).not.toContain("Add a Part");
  });
});

describe("ResponsePanel download", () => {
  it("disables Download when there is no response", () => {
    const html = renderToStaticMarkup(<ResponsePanel state={base} />);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Download<\/button>/);
  });

  it("enables Download once there is a response", () => {
    const html = renderToStaticMarkup(<ResponsePanel state={{ ...base, status: 200, responseText: "{}" }} />);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Download<\/button>/);
    expect(html).toContain("Download</button>");
  });
});
