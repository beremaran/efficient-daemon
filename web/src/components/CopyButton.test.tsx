import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopyButton } from "@/components/CopyButton";
import { COPY_MESSAGES, copyResult } from "@/lib/copy";

afterEach(() => vi.unstubAllGlobals());

describe("copyResult", () => {
  it("reports copied when the clipboard accepts the text", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await expect(copyResult("hi")).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith("hi");
  });

  it("reports failed when the clipboard rejects", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    await expect(copyResult("hi")).resolves.toBe("failed");
  });

  it("reports failed when the clipboard is missing (plain HTTP)", async () => {
    vi.stubGlobal("navigator", {});
    await expect(copyResult("hi")).resolves.toBe("failed");
  });
});

describe("CopyButton", () => {
  it("renders the button next to an empty role=status region", () => {
    const html = renderToStaticMarkup(<CopyButton text="x">Copy response</CopyButton>);
    expect(html).toMatch(/<span role="status"[^>]*><\/span>/);
    expect(html).toContain("Copy response");
  });

  it("tells the user to select the text and press Ctrl+C on failure", () => {
    expect(COPY_MESSAGES.failed).toMatch(/Select the text and press Ctrl\+C/);
    expect(COPY_MESSAGES.copied).toBe("Copied");
  });
});
