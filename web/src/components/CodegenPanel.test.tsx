import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CodegenPanel } from "@/components/CodegenPanel";
import { COPY_MESSAGES, copyResult } from "@/lib/copy";

afterEach(() => vi.unstubAllGlobals());

describe("CodegenPanel copy", () => {
  it("renders the shared copy button with a role=status region", () => {
    const html = renderToStaticMarkup(<CodegenPanel request={{ ok: false, error: "x" }} parts={[]} schema="" runKeys={[]} />);
    expect(html).toMatch(/<span role="status"[^>]*><\/span>/);
    expect(html).toContain("Copy full snippet");
    expect(html).not.toMatch(/elided/i);
  });

  it("shows the failure message when the clipboard is blocked", async () => {
    vi.stubGlobal("navigator", {});
    const result = await copyResult("curl ...");
    expect(COPY_MESSAGES[result]).toMatch(/Select the text and press Ctrl\+C/);
  });
});
