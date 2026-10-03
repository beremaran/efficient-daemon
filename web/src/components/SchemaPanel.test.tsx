import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("json_typegen_wasm", () => ({ run: () => "{}" }));
import { SchemaPanel } from "@/components/SchemaPanel";

describe("SchemaPanel", () => {
  it("lets the editor pane grow with a 300 px floor", () => {
    const html = renderToStaticMarkup(
      <SchemaPanel schema="{}" onSchemaChange={() => {}} lint={null} linting={false} />,
    );
    expect(html).toMatch(/class="[^"]*\bflex-1\b[^"]*\bmin-h-\[300px\]/);
    expect(html).not.toContain("height:300px");
  });
});
