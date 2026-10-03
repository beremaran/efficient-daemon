import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PartEditor } from "@/components/PartsEditor";
import { checkImageFile } from "@/lib/media";
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
