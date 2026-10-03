// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ResponsePanel, type RunState } from "@/components/ResponsePanel";

const { prettyJsonMock } = vi.hoisted(() => ({ prettyJsonMock: vi.fn() }));

vi.mock("@/lib/ask", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ask")>();
  return {
    ...actual,
    prettyJson: (text: string) => {
      prettyJsonMock(text);
      return actual.prettyJson(text);
    },
  };
});

vi.mock("@uiw/react-codemirror", () => ({
  default: ({ value }: { value: string }) => <pre data-testid="editor">{value}</pre>,
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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
    const html = renderToStaticMarkup(<ResponsePanel state={{ ...base, error: "boom" }} runKeys={[]} />);
    expect(html).toMatch(/<div role="alert"[^>]*>.*boom/);
  });

  it("keeps an empty role=alert element when there is no error", () => {
    const html = renderToStaticMarkup(<ResponsePanel state={base} runKeys={[]} />);
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
    const html = renderToStaticMarkup(<ResponsePanel state={state} runKeys={[]} />);
    expect(html).toMatch(new RegExp(`<div role="status"[^>]*>.*${text}`));
  });
});

describe("ResponsePanel running timer", () => {
  it("hides the ticking time from screen readers", () => {
    const html = renderToStaticMarkup(<ResponsePanel state={{ ...base, running: true }} runKeys={[]} />);
    expect(html).toMatch(/Running… <span aria-hidden="true">/);
  });
});

describe("ResponsePanel empty state", () => {
  it("shows the getting-started steps before the first run", () => {
    const html = renderToStaticMarkup(<ResponsePanel state={base} runKeys={[]} />);
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
    const html = renderToStaticMarkup(<ResponsePanel state={state} runKeys={[]} />);
    expect(html).not.toContain("Add a Part");
  });
});

describe("ResponsePanel download", () => {
  it("disables Download when there is no response", () => {
    const html = renderToStaticMarkup(<ResponsePanel state={base} runKeys={[]} />);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Download<\/button>/);
  });

  it("enables Download once there is a response", () => {
    const html = renderToStaticMarkup(<ResponsePanel state={{ ...base, status: 200, responseText: "{}" }} runKeys={[]} />);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Download<\/button>/);
    expect(html).toContain("Download</button>");
  });
});

describe("ResponsePanel streamed response", () => {
  it("shows raw text while running, then formats once after completion", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const running: RunState = { ...base, running: true, responseText: '{"a":1}' };
    const done: RunState = { ...running, running: false, status: 200 };

    prettyJsonMock.mockClear();
    act(() => root.render(<ResponsePanel state={running} runKeys={[]} />));
    expect(container.textContent).toContain('{"a":1}');
    expect(prettyJsonMock).not.toHaveBeenCalled();

    act(() => root.render(<ResponsePanel state={done} runKeys={[]} />));
    expect(container.textContent).toContain(`{
  "a": 1
}`);
    expect(prettyJsonMock).toHaveBeenCalledTimes(1);

    act(() => root.render(<ResponsePanel state={done} runKeys={[]} />));
    expect(prettyJsonMock).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
  });
});

describe("ResponsePanel terms", () => {
  it("names the request tab Ask request", () => {
    const html = renderToStaticMarkup(<ResponsePanel state={base} runKeys={[]} />);
    expect(html).toContain(">Ask request</button>");
    expect(html).not.toMatch(/request body|payload/i);
  });
});
