import { describe, expect, it } from "vitest";
import { askFromDraft, buildAskRequest, cliArgs, lintBody, prettyJson } from "@/lib/ask";
import { DEFAULT_SETTINGS, EMPTY_DRAFT, type Draft, type Settings } from "@/lib/types";

function draft(settings: Partial<Settings> = {}, rest: Partial<Draft> = {}): Draft {
  return {
    ...EMPTY_DRAFT,
    system: "be brief",
    parts: [{ id: "p1", kind: "text", text: "hi" }],
    ...rest,
    settings: {
      ...DEFAULT_SETTINGS,
      model: "gpt",
      baseURL: "http://llm",
      reasoningEffort: "low",
      temperatureEnabled: true,
      temperature: "0.2",
      maxTokensEnabled: true,
      maxTokens: "100",
      maxScoreLevels: "8",
      ...settings,
    },
  };
}

function body(d: Draft) {
  const request = buildAskRequest(d);
  if (!request.ok) throw new Error(request.error);
  return request.body;
}

describe("buildAskRequest", () => {
  it("sends system and sampling fields for openai", () => {
    expect(body(draft({ provider: "openai" }))).toEqual({
      schema: JSON.parse(EMPTY_DRAFT.schema),
      provider: "openai",
      system: "be brief",
      parts: [{ text: "hi" }],
      model: "gpt",
      "base-url": "http://llm",
      "reasoning-effort": "low",
      temperature: 0.2,
      "max-tokens": 100,
    });
  });

  it("drops system and sampling fields for jevjam", () => {
    expect(body(draft({ provider: "jevjam" }))).toEqual({
      schema: JSON.parse(EMPTY_DRAFT.schema),
      provider: "jevjam",
      parts: [{ text: "hi" }],
      model: "gpt",
      "base-url": "http://llm",
      "max-score-levels": 8,
    });
  });

  it("measures the serialized body without inflating base64 again", () => {
    const image = "QUJD".repeat(1000);
    const request = buildAskRequest(
      draft({}, { parts: [{ id: "p2", kind: "text", text: "héllo" }, { id: "p3", kind: "image", source: "upload", image }] }),
    );
    if (!request.ok) throw new Error(request.error);
    expect(request.bytes).toBe(new TextEncoder().encode(request.json).length);
    expect(request.bytes).toBeLessThan(image.length + 1000);
  });

  it("leaves Part ids out of the Ask request", () => {
    expect(JSON.stringify(body(draft()).parts)).not.toContain("id");
  });

  it("returns an error for a blank or invalid schema", () => {
    expect(buildAskRequest(draft({}, { schema: " " }))).toEqual({ ok: false, error: "schema is required" });
    const invalid = buildAskRequest(draft({}, { schema: "{" }));
    expect(invalid.ok).toBe(false);
    expect(!invalid.ok && invalid.error).toMatch(/^schema is not valid JSON/);
  });
});

describe("cliArgs", () => {
  it("turns every body field into a flag, including --system", () => {
    const d = draft(
      { provider: "openai" },
      {
        parts: [
          { id: "p4", kind: "text", text: "it's" },
          { id: "p5", kind: "image", source: "upload", image: "QUJD", fileName: "cat.png" },
          { id: "p6", kind: "image", source: "url", image: "https://x/y.png" },
        ],
      },
    );
    expect(cliArgs(body(d), d.parts)).toEqual([
      "--provider 'openai'",
      "--system 'be brief'",
      "--model 'gpt'",
      "--base-url 'http://llm'",
      "--reasoning-effort 'low'",
      "--temperature 0.2",
      "--max-tokens 100",
      "--schema schema.json",
      `'it'\\''s'`,
      "--image './cat.png'",
      "--image 'https://x/y.png'",
    ]);
  });
});

describe("lintBody", () => {
  it("keeps only the fields that change lint results", () => {
    expect(lintBody(body(draft({ provider: "jevjam" })))).toEqual({
      schema: JSON.parse(EMPTY_DRAFT.schema),
      provider: "jevjam",
      "max-score-levels": 8,
    });
  });
});

describe("askFromDraft", () => {
  it("builds from the draft it gets, so Run sends the latest text", () => {
    const stale = draft({}, { parts: [{ id: "p", kind: "text", text: "old" }] });
    const latest = draft({}, { parts: [{ id: "p", kind: "text", text: "old and new" }] });
    expect(body(stale).parts).toEqual([{ text: "old" }]);
    const request = askFromDraft(latest, {});
    expect(request.ok && request.body.parts).toEqual([{ text: "old and new" }]);
  });

  it("fills empty settings from server defaults", () => {
    const request = askFromDraft(draft({ model: "", provider: "" }), { provider: "openai", model: "srv" });
    expect(request.ok && request.body.model).toBe("srv");
  });
});

describe("prettyJson", () => {
  it("indents valid JSON", () => {
    expect(prettyJson('{"a":[1,2]}')).toBe('{\n  "a": [\n    1,\n    2\n  ]\n}');
  });

  it("returns invalid JSON unchanged", () => {
    expect(prettyJson('{"a":')).toBe('{"a":');
    expect(prettyJson("plain text")).toBe("plain text");
  });
});
