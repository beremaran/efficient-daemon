import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PartEditor } from "@/components/PartsEditor";
import { checkImageFile, readPartFile } from "@/lib/media";
import { newPart } from "@/lib/parts";
import { MAX_IMAGE_BYTES } from "@/lib/types";

const render = (error?: string, index = 0) =>
  renderToStaticMarkup(
    <PartEditor
      index={index}
      part={{ ...newPart("image"), source: "upload" }}
      count={2}
      error={error}
      onError={() => {}}
      onChange={() => {}}
      onRemove={() => {}}
      onMove={() => {}}
    />,
  );

describe("file size error", () => {
  const big = { name: "big.png", size: MAX_IMAGE_BYTES + 1 } as File;

  it("names the limit", () => {
    expect(checkImageFile(big).message).toContain(`${MAX_IMAGE_BYTES / (1 << 20)} MB`);
  });

  it("shows under the Part that got the file, as an alert", () => {
    const message = checkImageFile(big).message as string;
    expect(render(message)).toContain(`role="alert"`);
    expect(render(message)).toContain("big.png");
  });

  it("shows nothing on a Part without an error", () => {
    expect(render()).not.toContain(`role="alert"`);
  });

  it("shows only on the Part that has the error", () => {
    const message = checkImageFile(big).message as string;
    expect(render(message, 1)).toContain(message);
    expect(render(undefined, 0)).not.toContain(message);
  });
});

describe("file read error", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("comes back as a message, not a throw", async () => {
    vi.stubGlobal(
      "FileReader",
      class {
        error = new Error("denied");
        onerror?: () => void;
        readAsDataURL() {
          this.onerror?.();
        }
      },
    );
    const result = await readPartFile({ name: "gone.pdf", size: 1 } as File);
    expect(result).toEqual({ message: "Could not read gone.pdf" });
  });

  it("shows under the Part, as an alert", () => {
    const html = render("Could not read gone.pdf");
    expect(html).toContain(`role="alert"`);
    expect(html).toContain("Could not read gone.pdf");
  });
});
