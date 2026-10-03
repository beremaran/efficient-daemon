import { describe, expect, it } from "vitest";

import { buttonVariants } from "@/components/ui/button";

// Tailwind spacing unit: 1 = 0.25rem = 4 px.
const px = (cls: string, prefix: string) => {
  const match = cls.split(" ").find((c) => c.startsWith(`${prefix}-`));
  return match ? Number(match.slice(prefix.length + 1)) * 4 : 0;
};

describe("button sizes", () => {
  const sizes = ["default", "sm", "lg", "icon"] as const;

  it.each(sizes)("%s is at least 24x24 px", (size) => {
    const cls = buttonVariants({ size });
    expect(Math.max(px(cls, "h"), px(cls, "min-h"))).toBeGreaterThanOrEqual(24);
    expect(Math.max(px(cls, "w"), px(cls, "min-w"))).toBeGreaterThanOrEqual(24);
  });
});
