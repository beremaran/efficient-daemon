import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OptionalNumberField, TextField } from "@/components/fields";

const linkOf = (html: string) => ({
  htmlFor: /<label[^>]*for="([^"]*)"/.exec(html)?.[1],
  id: /<input[^>]*id="([^"]*)"/.exec(html)?.[1],
});

describe("field ids", () => {
  it("links a text field label to its input", () => {
    const { htmlFor, id } = linkOf(renderToStaticMarkup(<TextField label="API key" value="" onChange={() => {}} />));
    expect(id).toBeTruthy();
    expect(htmlFor).toBe(id);
    expect(id).not.toMatch(/\s/);
  });

  it("links a number field label to its input", () => {
    const { htmlFor, id } = linkOf(
      renderToStaticMarkup(
        <OptionalNumberField label="Max tokens" enabled onEnabledChange={() => {}} value="" onValueChange={() => {}} />,
      ),
    );
    expect(id).toBeTruthy();
    expect(htmlFor).toBe(id);
    expect(id).not.toMatch(/\s/);
  });

  it("gives same-label fields distinct ids", () => {
    const html = renderToStaticMarkup(
      <>
        <TextField label="Model" value="" onChange={() => {}} />
        <TextField label="Model" value="" onChange={() => {}} />
      </>,
    );
    const ids = [...html.matchAll(/<input[^>]*id="([^"]*)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(2);
  });
});
