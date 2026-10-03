import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("json_typegen_wasm", () => ({ run: () => "{}" }));
import { SchemaPanel } from "@/components/SchemaPanel";
import source from "@/components/SchemaPanel.tsx?raw";

describe("SchemaPanel", () => {
  it("lets the editor pane grow with a 300 px floor", () => {
    const html = renderToStaticMarkup(
      <SchemaPanel schema="{}" onSchemaChange={() => {}} lint={null} linting={false} runKeys={[]} />,
    );
    expect(html).toMatch(/class="[^"]*\bflex-1\b[^"]*\bmin-h-\[300px\]/);
    expect(html).not.toContain("height:300px");
  });

  it("marks a stale lint result without fading it below 4.5:1 contrast", () => {
    const html = renderToStaticMarkup(
      <SchemaPanel
        schema="{}"
        onSchemaChange={() => {}}
        lint={{ valid: false, errors: ["bad"], warnings: [] }}
        linting
        runKeys={[]}
      />,
    );
    expect(html).toContain("bad");
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toMatch(/[\s"]opacity-/);
  });

  it("does not name transform.tools in the Generate tab text", () => {
    const visible = source.replace(/^\s*\/\/.*$/gm, "");
    expect(visible).not.toMatch(/transform\.tools/i);
  });
});
