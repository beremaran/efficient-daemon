// @vitest-environment jsdom
import { useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PartsEditor } from "@/components/PartsEditor";
import { newPart } from "@/lib/parts";
import type { Part } from "@/lib/types";

// The read of a file ends when the test says so; finishRead and failRead end the latest one.
type Read = { finish: (base64: string) => void; fail: (message: string) => void };
let reads: Read[] = [];
let finishRead: Read["finish"];
let failRead: Read["fail"];
vi.mock("@/lib/media", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/media")>()),
  readDroppedFile: () => pendingRead(),
  readPartFile: () => pendingRead(),
}));
function pendingRead() {
  return new Promise((resolve) => {
    finishRead = (base64) => resolve({ base64 });
    failRead = (message) => resolve({ message });
    reads.push({ finish: finishRead, fail: failRead });
  });
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Harness({ initial }: { initial: Part[] }) {
  const [parts, setParts] = useState(initial);
  return <PartsEditor parts={parts} onPartsChange={setParts} bytes={null} />;
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  reads = [];
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

const drop = (id: string, name = "cat.png") => {
  const event = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: { files: [new File(["x"], name)], types: ["Files"] } });
  act(() => void host.querySelector(`[data-part-id="${id}"]`)!.dispatchEvent(event));
};
const pick = (name: string) => {
  const input = host.querySelector<HTMLInputElement>("input[type=file]")!;
  Object.defineProperty(input, "files", { value: [new File(["x"], name)], configurable: true });
  act(() => void input.dispatchEvent(new Event("change", { bubbles: true })));
};

describe("a file dropped on a Part", () => {

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

describe("a file picked for an image Part", () => {
  it("goes to Upload, not over the URL, when the tab changed during the read", async () => {
    const image = { ...newPart("image"), source: "upload" as const };
    mount([image]);
    pick("cat.png");
    const tab = (name: string) => [...host.querySelectorAll<HTMLElement>('[role="tab"]')].find((t) => t.textContent === name)!;
    act(() => void tab("URL").dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 })));
    await act(async () => finishRead("AAAA"));
    expect(tab("Upload").getAttribute("aria-selected")).toBe("true");
    expect(host.textContent).toContain("cat.png");
  });
});

describe("picked and dropped files on one Part", () => {
  it.each([
    ["image", "picked", "dropped"],
    ["image", "dropped", "picked"],
    ["pdf", "picked", "dropped"],
    ["pdf", "dropped", "picked"],
  ] as const)("keep the newer file on a %s Part, %s then %s, when the older read ends last", async (kind, first, second) => {
    const part = kind === "image" ? { ...newPart("image"), source: "upload" as const } : newPart("pdf");
    mount([part]);
    const ext = kind === "image" ? "png" : "pdf";
    const add = (how: string, name: string) => (how === "picked" ? pick(name) : drop(part.id, name));
    add(first, `old.${ext}`);
    add(second, `new.${ext}`);
    await act(async () => reads[1].finish("BBBB"));
    await act(async () => reads[0].finish("AAAA"));
    expect(host.textContent).toContain(`new.${ext}`);
    expect(host.textContent).not.toContain(`old.${ext}`);
  });

  it("ignores an older read's error once a newer read has finished", async () => {
    const part = newPart("pdf");
    mount([part]);
    pick("old.pdf");
    drop(part.id, "new.pdf");
    await act(async () => reads[1].finish("BBBB"));
    await act(async () => reads[0].fail("old read failed"));
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });
});
