/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appCss = readFileSync(new URL("../index.css", import.meta.url), "utf8");
const palette = readFileSync(new URL("../../node_modules/tailwindcss/theme.css", import.meta.url), "utf8");

type Rgb = [number, number, number];

// OKLCH to gamma-encoded sRGB (Ottosson), clipped to the gamut.
function oklch(css: string): Rgb {
  const [l, c, h] = css.match(/oklch\(([^)]+)\)/)![1].split(/\s+/).map((v) => parseFloat(v) / (v.endsWith("%") ? 100 : 1));
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const [x, y, z] = [l + 0.3963377774 * a + 0.2158037573 * b, l - 0.1055613458 * a - 0.0638541728 * b, l - 0.0894841775 * a - 1.291485548 * b].map((v) => v ** 3);
  return [
    4.0767416621 * x - 3.3077115913 * y + 0.2309699292 * z,
    -1.2684380046 * x + 2.6097574011 * y - 0.3413193965 * z,
    -0.0041960863 * x - 0.7034186147 * y + 1.707614701 * z,
  ].map((v) => {
    const c = Math.min(1, Math.max(0, v));
    return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  }) as Rgb;
}

const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const luminance = ([r, g, b]: Rgb) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const blend = (fg: Rgb, bg: Rgb, alpha: number) => fg.map((v, i) => v * alpha + bg[i] * (1 - alpha)) as Rgb;
const ratio = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const token = (name: string) => oklch(appCss.match(new RegExp(`--${name}:\\s*(oklch\\([^)]+\\))`))![1]);
const tw = (name: string) => oklch(palette.match(new RegExp(`--color-${name}:\\s*(oklch\\([^)]+\\))`))![1]);

// Surfaces text sits on: cards and the page root (bg-muted/30 over white).
const card = token("card");
const root = blend(token("muted"), token("background"), 0.3);
const surfaces = { card, root, muted: token("muted") };

describe("WCAG 2.2 contrast (4.5:1)", () => {
  it.each(Object.entries(surfaces))("muted text passes on %s", (_, bg) => {
    expect(ratio(token("muted-foreground"), bg)).toBeGreaterThanOrEqual(4.5);
  });

  const badges = {
    success: [tw("emerald-700"), tw("emerald-50")],
    running: [tw("blue-700"), tw("blue-50")],
    destructive: [token("destructive"), blend(token("destructive"), card, 0.1)],
    "destructive on root": [token("destructive"), blend(token("destructive"), root, 0.1)],
    warning: [token("warning-foreground"), blend(token("warning"), card, 0.1)],
    "destructive button": [token("destructive-foreground"), token("destructive")],
  } as Record<string, [Rgb, Rgb]>;

  it.each(Object.entries(badges))("%s badge text passes", (_, [fg, bg]) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
});
