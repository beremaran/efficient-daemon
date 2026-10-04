import { describe, expect, it } from "vitest";

import { modelsRequest } from "@/lib/models";
import { DEFAULT_SETTINGS } from "@/lib/types";

describe("modelsRequest", () => {
  it("sends only the connection fields that are set", () => {
    expect(modelsRequest(DEFAULT_SETTINGS)).toBe("{}");
    expect(modelsRequest({ ...DEFAULT_SETTINGS, provider: "jevjam", baseURL: " http://x ", apiKey: "k", model: "m" })).toBe(
      '{"provider":"jevjam","base-url":"http://x","api-key":"k"}',
    );
  });
});
