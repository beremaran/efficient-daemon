import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ConnectionPanel } from "@/components/ConnectionPanel";
import { DEFAULT_SETTINGS } from "@/lib/types";

describe("ConnectionPanel selects", () => {
  it("links the Provider and Reasoning effort labels to their triggers", () => {
    const html = renderToStaticMarkup(
      <ConnectionPanel settings={DEFAULT_SETTINGS} onChange={() => {}} serverDefaults={{}} keepKey={false} onKeepKeyChange={() => {}} />,
    );
    for (const name of ["Provider", "Reasoning effort"]) {
      const htmlFor = new RegExp(`<label[^>]*for="([^"]*)"[^>]*>${name}</label>`).exec(html)?.[1];
      expect(htmlFor).toBeTruthy();
      expect(html).toMatch(new RegExp(`<button[^>]*role="combobox"[^>]*id="${htmlFor}"|<button[^>]*id="${htmlFor}"[^>]*role="combobox"`));
    }
  });
});

describe("ConnectionPanel key storage", () => {
  const render = (keepKey: boolean) =>
    renderToStaticMarkup(
      <ConnectionPanel settings={DEFAULT_SETTINGS} onChange={() => {}} serverDefaults={{}} keepKey={keepKey} onKeepKeyChange={() => {}} />,
    );

  it("defaults to Don't save and says the key stays in memory", () => {
    const html = render(false);
    expect(html).toContain("Don&#x27;t save");
    expect(html).toContain("a reload clears it");
  });

  it("shows Keep for this tab and says where the key lives", () => {
    const html = render(true);
    expect(html).toContain("Keep for this tab");
    expect(html).toContain("session storage");
  });
});

describe("ConnectionPanel API key", () => {
  it("hides the key and turns autocomplete off", () => {
    const html = renderToStaticMarkup(
      <ConnectionPanel settings={DEFAULT_SETTINGS} onChange={() => {}} serverDefaults={{}} keepKey={false} onKeepKeyChange={() => {}} />,
    );
    const id = /<label[^>]*for="([^"]*)"[^>]*>API key<\/label>/.exec(html)?.[1];
    expect(id).toBeTruthy();
    const input = new RegExp(`<input[^>]*id="${id}"[^>]*>`).exec(html)?.[0];
    expect(input).toContain('type="password"');
    expect(input).toContain('autoComplete="off"');
  });
});
