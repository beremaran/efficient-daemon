import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadText } from "@/lib/download";

afterEach(() => vi.unstubAllGlobals());

describe("downloadText", () => {
  it("clicks a link that downloads the text under the file name", async () => {
    const link = { href: "", download: "", click: vi.fn() };
    const createObjectURL = vi.fn((blob: Blob) => (blob.type === "application/json" ? "blob:x" : ""));
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("document", { createElement: vi.fn(() => link) });
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });

    downloadText('{"a":1}', "response.json");

    expect(await (createObjectURL.mock.calls[0][0] as Blob).text()).toBe('{"a":1}');
    expect(link).toMatchObject({ href: "blob:x", download: "response.json" });
    expect(link.click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:x");
  });
});
