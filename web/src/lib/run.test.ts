import { describe, expect, it } from "vitest";
import type { AskRequest } from "@/lib/ask";
import type { LintResult } from "@/lib/lint";
import { runBlocker, type RunInput } from "@/lib/run";

const okRequest: AskRequest = { ok: true, body: {}, json: "{}", bytes: 2 };
const okLint: LintResult = { valid: true, errors: [], warnings: [] };

function input(over: Partial<RunInput> = {}): RunInput {
  return {
    model: "gpt",
    baseURL: "http://llm",
    jevjam: false,
    parts: [{ kind: "text", text: "hi" }],
    request: okRequest,
    lint: okLint,
    checking: false,
    lintErrors: 0,
    ...over,
  };
}

describe("runBlocker", () => {
  it("is null when Run can go", () => {
    expect(runBlocker(input())).toBeNull();
  });

  it("asks for a model", () => {
    expect(runBlocker(input({ model: "" }))).toBe("Add a model in Connection & sampling");
  });

  it("needs no model for jevjam", () => {
    expect(runBlocker(input({ model: "", jevjam: true }))).toBeNull();
  });

  it("asks for a base URL", () => {
    expect(runBlocker(input({ baseURL: "" }))).toBe("Add a base URL in Connection & sampling");
  });

  it("asks for a Part", () => {
    expect(runBlocker(input({ parts: [] }))).toBe("Add a Part to the user message");
  });

  it("treats blank Parts as missing", () => {
    expect(runBlocker(input({ parts: [{ kind: "text", text: "  " }, { kind: "image", image: "" }] }))).toBe(
      "Add a Part to the user message",
    );
  });

  it("counts schema issues", () => {
    const lint = { ...okLint, errors: ["a", "b"] };
    expect(runBlocker(input({ lint, lintErrors: 2 }))).toBe("2 schema issues — fix before running");
    expect(runBlocker(input({ lint, lintErrors: 1 }))).toBe("1 schema issue — fix before running");
  });

  it("reports an Ask request that failed to build", () => {
    expect(runBlocker(input({ request: { ok: false, error: "bad" } }))).toBe("Fix the response schema");
  });

  it("reports a check in progress", () => {
    expect(runBlocker(input({ checking: true }))).toBe("Checking the schema…");
  });

  it("reports a missing check result", () => {
    expect(runBlocker(input({ lint: null }))).toBe("Checking the schema…");
  });

  it("gives the first reason when several apply", () => {
    expect(runBlocker(input({ model: "", baseURL: "", parts: [] }))).toBe("Add a model in Connection & sampling");
  });
});
