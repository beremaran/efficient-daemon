import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ConnectionPanel } from "@/components/ConnectionPanel";
import { DEFAULT_SETTINGS } from "@/lib/types";

describe("ConnectionPanel selects", () => {
  it("links the Provider and Reasoning effort labels to their triggers", () => {
    const html = renderToStaticMarkup(
      <ConnectionPanel settings={DEFAULT_SETTINGS} onChange={() => {}} serverDefaults={{}} />,
    );
    for (const name of ["Provider", "Reasoning effort"]) {
      const htmlFor = new RegExp(`<label[^>]*for="([^"]*)"[^>]*>${name}</label>`).exec(html)?.[1];
      expect(htmlFor).toBeTruthy();
      expect(html).toMatch(new RegExp(`<button[^>]*role="combobox"[^>]*id="${htmlFor}"|<button[^>]*id="${htmlFor}"[^>]*role="combobox"`));
    }
  });
});
