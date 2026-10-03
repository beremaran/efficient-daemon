import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PartEditor } from "@/components/PartsEditor";
import { IconButton } from "@/components/ui/icon-button";
import { TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { newPart } from "@/lib/parts";

/** Every element of a type in an element tree. */
const find = (node: ReactNode, type: unknown): ReactElement<any>[] => {
  if (Array.isArray(node)) return node.flatMap((n) => find(n, type));
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [...(node.type === type ? [node] : []), ...find(node.props.children, type)];
};

describe("IconButton", () => {
  const tree = IconButton({ label: "Remove part 2", children: "x" });
  const [trigger] = find(tree, TooltipTrigger);
  const [content] = find(tree, TooltipContent);

  it("shows its accessible name as tooltip text", () => {
    expect(content.props.children).toBe("Remove part 2");
    expect(trigger.props.children.props["aria-label"]).toBe("Remove part 2");
  });

  it("triggers on the button itself, so keyboard focus opens it", () => {
    expect(trigger.props.asChild).toBe(true);
  });
});

describe("Part buttons", () => {
  it("name every icon button", () => {
    const html = renderToStaticMarkup(
      <PartEditor
        index={1}
        part={newPart("text")}
        count={3}
        onError={() => {}}
        onChange={() => {}}
        onRemove={() => {}}
        onMove={() => {}}
      />,
    );
    for (const name of ["Move part 2 up", "Move part 2 down", "Remove part 2"]) {
      expect(html).toContain(`aria-label="${name}"`);
    }
  });
});
