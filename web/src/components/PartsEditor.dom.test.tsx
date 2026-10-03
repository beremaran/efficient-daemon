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
    mount([newPart("text"), newPart("text"), newPart("text")]);
    click("Text");
    const added = host.querySelectorAll("[data-part-id]")[3];
    expect(added.contains(document.activeElement)).toBe(true);
  });
});
