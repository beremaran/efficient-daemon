// Why Run is disabled: the first reason, or null when Run can go.

import { useEffect, useMemo, useRef } from "react";
import { keymap, Prec, type Extension } from "@uiw/react-codemirror";
import type { AskRequest } from "@/lib/ask";
import { lintAllowsRun, type LintResult } from "@/lib/lint";
import type { Part } from "@/lib/types";

export interface RunInput {
  model: string;
  baseURL: string;
  jevjam: boolean;
  parts: Part[];
  request: AskRequest;
  lint: LintResult | null;
  checking: boolean;
  lintErrors: number;
}

const hasContent = (p: Part) => !!(p.kind === "text" ? (p.text ?? "") : (p.image ?? p.pdf ?? "")).trim();

// Model (unless jevjam) or base URL is missing.
export const connectionMissing = (i: Pick<RunInput, "model" | "baseURL" | "jevjam">) =>
  (!i.model && !i.jevjam) || !i.baseURL;

export function runBlocker(i: RunInput): string | null {
  if (!i.model && !i.jevjam) return "Add a model in Connection & sampling";
  if (!i.baseURL) return "Add a base URL in Connection & sampling";
  if (!i.parts.some(hasContent)) return "Add a Part to the user message";
  if (!i.request.ok || i.lintErrors > 0) {
    const n = i.lintErrors;
    return n > 0 ? `${n} schema issue${n > 1 ? "s" : ""} — fix before running` : "Fix the response schema";
  }
  if (!lintAllowsRun(i.lint, i.checking)) return "Checking the schema…";
  return null;
}

export interface KeyInfo {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  target: EventTarget | { tagName?: string; isContentEditable?: boolean } | null;
}

// Ctrl/Cmd+Enter outside the editors, while Run is enabled.
export function isRunShortcut(e: KeyInfo, canRun: boolean) {
  const target = e.target as { tagName?: string; isContentEditable?: boolean } | null;
  return (
    canRun &&
    e.key === "Enter" &&
    (e.ctrlKey || e.metaKey) &&
    !target?.isContentEditable &&
    !["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "")
  );
}

export const runShortcutHint = (mac: boolean) => (mac ? "⌘↵" : "Ctrl+Enter");

// Beats the default Mod-Enter (insert blank line), so the shortcut runs from inside editors too.
export const runKeymap = (run: () => void): Extension =>
  Prec.highest(keymap.of([{ key: "Mod-Enter", run: () => (run(), true) }]));

// One stable extension that calls the latest `run`, so editors never reconfigure.
export function useRunKeys(run: () => void): Extension {
  const latest = useRef(run);
  useEffect(() => {
    latest.current = run;
  });
  // oxlint-disable-next-line react/refs -- read on a key press, not during render
  return useMemo(() => runKeymap(() => latest.current()), []);
}
