/**
 * M5.3 — Child-friendly theming.
 *
 * A theme is a small set of warm, high-contrast tokens (palette + fonts) chosen to
 * read well for young children. Authors pick a theme per lesson; templates and
 * motion presets resolve token names ("primary", "bg", …) to concrete values so a
 * whole lesson re-skins by swapping one theme.
 */

import type { Color } from "../spec/types.js";

export interface Palette {
  /** Page background. */
  bg: Color;
  /** Primary brand / heading color. */
  primary: Color;
  /** Secondary accent. */
  secondary: Color;
  /** Highlight / call-to-action. */
  accent: Color;
  /** Body text. */
  text: Color;
  /** Muted/subtitle text. */
  muted: Color;
  /** A rotating set used for counting items, characters, etc. */
  swatches: Color[];
}

export interface Theme {
  name: string;
  palette: Palette;
  /** Display font for headings (one of the pinned families). */
  headingFont: string;
  /** Body font. */
  bodyFont: string;
  headingWeight: number;
  bodyWeight: number;
}

export const THEMES: Record<string, Theme> = {
  sunshine: {
    name: "sunshine",
    palette: {
      bg: "#fff8e7",
      primary: "#ef6c35",
      secondary: "#1d6f72",
      accent: "#ffb703",
      text: "#3a2e1f",
      muted: "#9a8c79",
      swatches: ["#ef6c35", "#ffb703", "#2a9d8f", "#e63946", "#457b9d", "#8367c7"],
    },
    headingFont: "Fredoka",
    bodyFont: "Nunito",
    headingWeight: 700,
    bodyWeight: 500,
  },
  ocean: {
    name: "ocean",
    palette: {
      bg: "#eaf6fb",
      primary: "#0a6aa1",
      secondary: "#16a3a3",
      accent: "#ffd166",
      text: "#0d3b4f",
      muted: "#6c93a3",
      swatches: ["#118ab2", "#06d6a0", "#ffd166", "#ef476f", "#118ab2", "#7b2cbf"],
    },
    headingFont: "Fredoka",
    bodyFont: "Nunito",
    headingWeight: 700,
    bodyWeight: 500,
  },
  meadow: {
    name: "meadow",
    palette: {
      bg: "#f3faf0",
      primary: "#2f8f4e",
      secondary: "#b5651d",
      accent: "#f4a259",
      text: "#234d20",
      muted: "#86a585",
      swatches: ["#2f8f4e", "#8ac926", "#f4a259", "#e76f51", "#4d908e", "#bc4749"],
    },
    headingFont: "Fredoka",
    bodyFont: "Nunito",
    headingWeight: 700,
    bodyWeight: 500,
  },
  berry: {
    name: "berry",
    palette: {
      bg: "#fdeef5",
      primary: "#b5179e",
      secondary: "#7209b7",
      accent: "#ffafcc",
      text: "#4a1942",
      muted: "#b08baa",
      swatches: ["#b5179e", "#f72585", "#7209b7", "#ff8fab", "#4361ee", "#ffbe0b"],
    },
    headingFont: "Fredoka",
    bodyFont: "Nunito",
    headingWeight: 700,
    bodyWeight: 500,
  },
};

export const DEFAULT_THEME = "sunshine";

/** Look up a theme by name, falling back to the default. */
export function getTheme(name?: string): Theme {
  return THEMES[name ?? DEFAULT_THEME] ?? THEMES[DEFAULT_THEME]!;
}

/** Pick the i-th swatch (cycling) — handy for counting items and characters. */
export function swatch(theme: Theme, i: number): Color {
  const s = theme.palette.swatches;
  return s[((i % s.length) + s.length) % s.length]!;
}
