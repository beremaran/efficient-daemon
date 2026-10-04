import { getDefaultExtensions } from "@uiw/react-codemirror";
import { EditorState } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EditorHint } from "@/components/editor";
import { editorProps } from "@/lib/editor";

const bindsTab = (readOnly: boolean) => {
  const state = EditorState.create({ extensions: getDefaultExtensions(editorProps(readOnly)) });
  return state.facet(keymap).flat().some((binding) => binding.key === "Tab");
};

describe("editor Tab handling", () => {
  it("lets Tab leave a read-only editor", () => {
    expect(bindsTab(true)).toBe(false);
  });

  it("keeps Tab for indenting in an editable editor", () => {
    expect(bindsTab(false)).toBe(true);
  });

  it("shows how to leave an editable editor", () => {
    expect(renderToStaticMarkup(<EditorHint />)).toContain("Press Esc, then Tab, to leave the editor.");
  });
});
