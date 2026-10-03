// Why Run is disabled: the first reason, or null when Run can go.

import { useEffect, useMemo, useRef, useState } from "react";
import { keymap, Prec, type Extension } from "@uiw/react-codemirror";
import type { RunState } from "@/components/ResponsePanel";
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

/** Closed Connection header text: model and provider. */
export const connectionSummary = (i: Pick<RunInput, "model"> & { provider: string }) =>
  [i.model || "not set", i.provider].filter(Boolean).join(" · ");

/** Closed System message header text: "set" when it holds text. */
export const systemSummary = (system: string) => (system.trim() ? "set" : "");

export function runBlocker(i: RunInput): string | null {
  if (!i.model && !i.jevjam) return "Add a model in Connection & sampling";
  if (!i.baseURL) return "Add a base URL in Connection & sampling";
  if (!i.parts.some(hasContent)) return "Add a Part to the user message";
  const empty = i.parts.findIndex((p) => !hasContent(p));
  if (empty >= 0) return `Fill or remove part ${empty + 1}`;
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

// Stop keeps what came back so far and records the time spent.
export const stoppedState = (prev: RunState, elapsedMs: number): RunState => ({
  ...prev,
  running: false,
  cancelled: true,
  latencyMs: elapsedMs,
});

export const stoppedLabel = (elapsedMs: number) => `Stopped after ${(elapsedMs / 1000).toFixed(1)} s`;

// Calls `onTick` with the ms elapsed every second; returns a function that stops it.
export function startElapsed(onTick: (elapsedMs: number) => void): () => void {
  const startedAt = Date.now();
  const id = setInterval(() => onTick(Date.now() - startedAt), 1000);
  return () => clearInterval(id);
}

export const elapsedLabel = (elapsedMs: number) => `${Math.floor(elapsedMs / 1000)} s`;

// On one-column layouts the Response panel sits below the request cards; bring it into view.
export const scrollToResponse = (el: Pick<HTMLElement, "scrollIntoView"> | null, wide: boolean) => {
  if (!wide) el?.scrollIntoView({ behavior: "smooth", block: "start" });
};

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

// Shows seconds since mount; render it only while a run is in progress.
export function useElapsed(): number {
  const [elapsedMs, setElapsedMs] = useState(0);
  useEffect(() => startElapsed(setElapsedMs), []);
  return elapsedMs;
}

/** Classes for the `summary` of a card you open and close; it shows a ring on keyboard focus. */
export const cardToggleClass =
  "cursor-pointer list-none rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden";
