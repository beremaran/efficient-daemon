import { describe, expect, it } from "vitest";
import { errorMessage } from "@/lib/utils";

describe("errorMessage", () => {
  it.each(["Failed to fetch", "NetworkError when attempting to fetch resource.", "Load failed"])(
    "maps the network failure %j to a plain message",
    (text) => {
      expect(errorMessage(new TypeError(text))).toBe("Cannot reach the workbench server");
    },
  );

  it("keeps the text of other errors", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage(new TypeError("Cannot read properties of null"))).toBe("Cannot read properties of null");
    expect(errorMessage("odd")).toBe("odd");
  });
});
