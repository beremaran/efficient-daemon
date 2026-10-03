import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { focusSchemaCard, SCHEMA_CARD_ID, SchemaIssuesLink } from "@/components/SchemaIssuesLink";

describe("SchemaIssuesLink", () => {
  it("is a button that names the count and the target", () => {
    const html = renderToStaticMarkup(<SchemaIssuesLink count={2} />);
    expect(html).toContain("<button");
    expect(html).toContain("2 schema issues");
    expect(html).toContain("go to schema");
  });

  it("is at least 24x24 px", () => {
    expect(renderToStaticMarkup(<SchemaIssuesLink count={2} />)).toMatch(/min-h-6[^"]*min-w-6|min-w-6[^"]*min-h-6/);
  });

  it("uses the singular for one issue", () => {
    expect(renderToStaticMarkup(<SchemaIssuesLink count={1} />)).toContain("1 schema issue ");
  });
});

describe("focusSchemaCard", () => {
  it("moves focus to the schema card", () => {
    const card = { focus: vi.fn(), scrollIntoView: vi.fn() };
    const getElementById = vi.fn(() => card as unknown as HTMLElement);
    focusSchemaCard({ getElementById });
    expect(getElementById).toHaveBeenCalledWith(SCHEMA_CARD_ID);
    expect(card.focus).toHaveBeenCalled();
  });

  it("does nothing when the card is missing", () => {
    expect(() => focusSchemaCard({ getElementById: () => null })).not.toThrow();
  });
});
