// @vitest-environment jsdom
import { useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PartsEditor } from "@/components/PartsEditor";
import { newPart } from "@/lib/parts";
import type { Part } from "@/lib/types";

// The read of a dropped file ends when the test says so.
let finishRead: (base64: string) => void;
let failRead: (message: string) => void;
vi.mock("@/lib/media", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/media")>()),
  readDroppedFile: () => new Promise((resolve) => {
      finishRead = (base64) => resolve({ base64 });
      failRead = (message) => resolve({ message });
    }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Harness({ initial }: { initial: Part[] }) {
  const [parts, setParts] = useState(initial);
  return <PartsEditor parts={parts} onPartsChange={setParts} bytes={null} />;
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.body.appendChild(document.createElement("div"));
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const mount = (parts: Part[]) => act(() => root.render(<Harness initial={parts} />));
const button = (name: string) => host.querySelector<HTMLElement>(`[aria-label="${name}"]`) ?? [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === name)!;
const click = (name: string) => act(() => button(name).click());
const removeButton = (id: string) => host.querySelector(`[data-part-id="${id}"] [data-remove]`);
const texts = () => [newPart("text"), newPart("text"), newPart("text")];

describe("focus after adding a Part", () => {
  it.each([
    ["Text", "TEXTAREA"],
    ["Image", "INPUT"],
    ["PDF", "BUTTON"],
  ])("moves focus to the first field of a new %s Part", (add, tag) => {
    mount([]);
    click(add);
    const editor = host.querySelector("[data-part-id]")!;
    expect(document.activeElement?.tagName).toBe(tag);
    expect(editor.contains(document.activeElement)).toBe(true);
  });

  it("moves focus to the Part just added, not an older one", () => {
    const parts = texts();
    mount(parts);
    click("Text");
    const added = host.querySelectorAll("[data-part-id]")[3];
    expect(added.contains(document.activeElement)).toBe(true);
  });
});

describe("focus after removing a Part", () => {
  it("goes to the next Part", () => {
    const parts = texts();
    mount(parts);
    click("Remove part 1");
    expect(document.activeElement).toBe(removeButton(parts[1].id));
  });

  it("goes to the previous Part when the last was removed", () => {
    const parts = texts();
    mount(parts);
    click("Remove part 3");
    expect(document.activeElement).toBe(removeButton(parts[1].id));
  });

  it("goes to the add buttons when no Parts remain", () => {
    mount([newPart("text")]);
    click("Remove part 1");
    expect(document.activeElement).toBe(host.querySelector("[data-add-parts] button"));
  });

  it("returns to the restored Part after Undo", () => {
    const file = { ...newPart("pdf"), pdf: "AAAA", fileName: "doc.pdf" };
    const parts = [newPart("text"), file, newPart("text")];
    mount(parts);
    click("Remove part 2");
    click("Undo");
    expect(host.querySelectorAll("[data-part-id]")).toHaveLength(3);
    expect(document.activeElement).toBe(removeButton(file.id));
  });
});

describe("a file dropped on a Part", () => {
  const drop = (id: string) => {
    const event = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", { value: { files: [new File(["x"], "cat.png")], types: ["Files"] } });
    act(() => void host.querySelector(`[data-part-id="${id}"]`)!.dispatchEvent(event));
  };

  it("does not bring back a Part removed during the read", async () => {
    const [image, other] = [newPart("image"), newPart("text")];
    mount([image, other]);
    drop(image.id);
    click("Remove part 2");
    await act(async () => finishRead("AAAA"));
    expect(host.querySelectorAll("[data-part-id]")).toHaveLength(1);
    expect(host.textContent).toContain("cat.png");
  });

  it("lands on the same Part after a move", async () => {
    const [image, other] = [newPart("image"), newPart("text")];
    mount([image, other]);
    drop(image.id);
    click("Move part 1 down");
    await act(async () => finishRead("AAAA"));
    const [first, second] = host.querySelectorAll("[data-part-id]");
    expect(first.getAttribute("data-part-id")).toBe(other.id);
    expect(second.textContent).toContain("cat.png");
  });

  it("shows a rejected file's error while the URL tab is open", async () => {
    const image = newPart("image");
    mount([image]);
    drop(image.id);
    await act(async () => failRead("too big"));
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("too big");
  });

  it("is dropped when its Part is removed during the read", async () => {
    const [image, other] = [newPart("image"), newPart("text")];
    mount([image, other]);
    drop(image.id);
    click("Remove part 1");
    await act(async () => finishRead("AAAA"));
    expect(host.querySelectorAll("[data-part-id]")).toHaveLength(1);
    expect(host.textContent).not.toContain("cat.png");
  });
});
