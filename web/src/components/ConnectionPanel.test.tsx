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

describe("ConnectionPanel number fields", () => {
  const render = (patch: Partial<typeof DEFAULT_SETTINGS>) =>
    renderToStaticMarkup(
      <ConnectionPanel
        settings={{ ...DEFAULT_SETTINGS, ...patch }}
        onChange={() => {}}
        serverDefaults={{}}
        keepKey={false}
        onKeepKeyChange={() => {}}
      />,
    );

  // The input for a label must be invalid and point at a message in the page.
  const expectInvalid = (html: string, label: string, message: string) => {
    const id = new RegExp(`<label[^>]*for="([^"]*)"[^>]*>${label}</label>`).exec(html)?.[1];
    const input = new RegExp(`<input[^>]*id="${id}"[^>]*>`).exec(html)?.[0];
    expect(input).toContain('aria-invalid="true"');
    expect(input).toContain(`aria-describedby="${id}-error"`);
    expect(html).toMatch(new RegExp(`<p id="${id}-error"[^>]*>${message}</p>`));
  };

  it("marks a Temperature outside 0 to 2", () => {
    expectInvalid(render({ temperatureEnabled: true, temperature: "3" }), "Temperature", "Enter a number from 0 to 2.");
  });

  it("marks a Max tokens that is not a whole number of 1 or more", () => {
    for (const maxTokens of ["0", "1.5"]) {
      expectInvalid(render({ maxTokensEnabled: true, maxTokens }), "Max tokens", "Enter a whole number of 1 or more.");
    }
  });

  it("marks Max score levels outside 2 to 64", () => {
    const html = render({ provider: "jevjam", maxScoreLevels: "100" });
    expectInvalid(html, "Max score levels", "Enter a whole number from 2 to 64.");
  });

  it("leaves good, empty and unsent values alone", () => {
    const html = render({ temperatureEnabled: true, temperature: "0.7", maxTokensEnabled: false, maxTokens: "0" });
    expect(html).not.toContain("aria-invalid");
    expect(html).not.toContain("-error");
  });
});
