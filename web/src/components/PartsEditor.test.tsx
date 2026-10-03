import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PartEditor, PartsEditor, UndoNotice } from "@/components/PartsEditor";
import { checkImageFile, readPartFile } from "@/lib/media";
import { newPart } from "@/lib/parts";
import { MAX_IMAGE_BYTES, type Part } from "@/lib/types";

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

describe("focus after adding", () => {
  const renderPart = (part: Part, autoFocus?: boolean) =>
    renderToStaticMarkup(
      <PartEditor
        index={0}
        part={part}
        count={1}
        autoFocus={autoFocus}
        onError={() => {}}
        onChange={() => {}}
        onRemove={() => {}}
        onMove={() => {}}
      />,
    );

  it.each([
    ["text", "textarea"],
    ["image", "input"],
    ["pdf", "button"],
  ] as const)("puts focus on the first field of a new %s Part", (kind, tag) => {
    const html = renderPart(newPart(kind), true);
    expect(html.match(/autofocus/gi)).toHaveLength(1);
    expect(html.match(/<(\w+)[^>]*autofocus/i)?.[1]).toBe(tag);
  });

  it("puts focus on the file button of an image Part in upload mode", () => {
    expect(renderPart({ ...newPart("image"), source: "upload" }, true).match(/autofocus/gi)).toHaveLength(1);
  });

  it("leaves focus alone by default", () => {
    for (const kind of ["text", "image", "pdf"] as const) {
      expect(renderPart(newPart(kind))).not.toMatch(/autofocus/i);
    }
  });
});

describe("focus after remove", () => {
  it("marks each Part and the add buttons as focus targets", () => {
    const parts = [newPart("text"), newPart("pdf")];
    const html = renderToStaticMarkup(<PartsEditor parts={parts} bytes={null} onPartsChange={() => {}} />);
    for (const { id } of parts) expect(html).toContain(`data-part-id="${id}"`);
    expect(html).toContain("data-add-parts");
    expect(html.match(/data-remove/g)).toHaveLength(2);
  });
});

describe("button names", () => {
  it("name the Part and the action", () => {
    const parts = [newPart("text"), newPart("pdf")];
    const html = renderToStaticMarkup(<PartsEditor parts={parts} bytes={null} onPartsChange={() => {}} />);
    for (const name of ["Move part 1 up", "Move part 1 down", "Remove part 1", "Move part 2 up", "Move part 2 down", "Remove part 2"])
      expect(html).toContain(`aria-label="${name}"`);
  });
});

describe("undo notice", () => {
  it("names the file and offers Undo as a status", () => {
    const html = renderToStaticMarkup(<UndoNotice label="Removed doc.pdf" onUndo={() => {}} />);
    expect(html).toContain(`role="status"`);
    expect(html).toContain("Removed doc.pdf");
    expect(html).toContain("Undo");
  });

  it("shows nothing before a removal", () => {
    const parts = [{ ...newPart("pdf"), pdf: "AAAA", fileName: "doc.pdf" }];
    const html = renderToStaticMarkup(<PartsEditor parts={parts} bytes={null} onPartsChange={() => {}} />);
    expect(html).not.toContain("Undo");
  });
});
