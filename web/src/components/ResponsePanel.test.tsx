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
