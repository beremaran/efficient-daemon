import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResponsePanel, type RunState } from "@/components/ResponsePanel";

const render = (variant?: "pill" | "line") =>
  renderToStaticMarkup(
    <Tabs defaultValue="a">
      <TabsList variant={variant}>
        <TabsTrigger value="a">A</TabsTrigger>
      </TabsList>
    </Tabs>,
  );

describe("TabsList variant", () => {
  it("defaults to the pill style", () => {
    const html = render();
    expect(html).toContain('data-variant="pill"');
    expect(html).toContain("bg-muted");
  });

  it("renders the line style without the pill background", () => {
    const html = render("line");
    expect(html).toContain('data-variant="line"');
    expect(html).not.toContain("bg-muted");
  });
});

describe("nested tab sets", () => {
  it("uses the line style inside the Response panel", () => {
    const state: RunState = {
      running: false,
      status: null,
      latencyMs: null,
      responseText: "",
      answers: null,
      error: null,
      requestPreview: "{}",
    };
    expect(renderToStaticMarkup(<ResponsePanel state={state} runKeys={[]} />)).toContain('data-variant="line"');
  });
});
