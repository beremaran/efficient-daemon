import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Switch } from "@/components/ui/switch";

describe("Switch", () => {
  it("is at least 24x24 px", () => {
    const cls = renderToStaticMarkup(<Switch aria-label="x" />).match(/<button[^>]*class="([^"]*)"/)?.[1] ?? "";
    const px = (prefix: string) => Number(cls.split(" ").find((c) => c.startsWith(`${prefix}-`))?.slice(prefix.length + 1)) * 4;
    expect(px("h")).toBeGreaterThanOrEqual(24);
    expect(px("w")).toBeGreaterThanOrEqual(24);
  });
});
