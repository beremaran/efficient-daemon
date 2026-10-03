// @vitest-environment jsdom
import { useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PartsEditor } from "@/components/PartsEditor";
import { newPart } from "@/lib/parts";
import type { Part } from "@/lib/types";

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
