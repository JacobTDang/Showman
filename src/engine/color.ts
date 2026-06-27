/**
 * Color parsing and formatting.
 *
 * Colors enter the engine as CSS-like strings. For interpolation we need them as
 * numeric RGBA, so this module parses the forms the engine controls. Static
 * (non-animated) colors can also be passed straight through to the canvas, which
 * understands the full CSS color space — but anything that gets *interpolated*
 * must parse here, and the validator rejects colors that don't.
 */

/** A color as numeric channels. r/g/b are 0..255 integers; a is 0..1. */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * A curated set of named colors: the CSS basics plus a few warm, child-friendly
 * tones. Kept small and explicit so interpolation between named colors is
 * well-defined and portable (we don't depend on the canvas's named-color table).
 */
const NAMED: Readonly<Record<string, Rgba>> = {
  transparent: { r: 0, g: 0, b: 0, a: 0 },
  black: { r: 0, g: 0, b: 0, a: 1 },
  white: { r: 255, g: 255, b: 255, a: 1 },
  red: { r: 255, g: 0, b: 0, a: 1 },
  green: { r: 0, g: 128, b: 0, a: 1 },
  blue: { r: 0, g: 0, b: 255, a: 1 },
  yellow: { r: 255, g: 255, b: 0, a: 1 },
  orange: { r: 255, g: 165, b: 0, a: 1 },
  purple: { r: 128, g: 0, b: 128, a: 1 },
  pink: { r: 255, g: 192, b: 203, a: 1 },
  brown: { r: 165, g: 42, b: 42, a: 1 },
  gray: { r: 128, g: 128, b: 128, a: 1 },
  grey: { r: 128, g: 128, b: 128, a: 1 },
  cream: { r: 253, g: 246, b: 227, a: 1 },
  skyblue: { r: 135, g: 206, b: 235, a: 1 },
  mint: { r: 152, g: 255, b: 152, a: 1 },
  coral: { r: 255, g: 127, b: 80, a: 1 },
  lavender: { r: 230, g: 230, b: 250, a: 1 },
};

function clampByte(n: number): number {
  if (n < 0) return 0;
  if (n > 255) return 255;
  return Math.round(n);
}

function clampUnit(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function hexNibble(s: string): number | null {
  const n = parseInt(s, 16);
  return Number.isNaN(n) ? null : n;
}

/** Parse a color string to RGBA, or return `null` if it is not a form we understand. */
export function parseColor(input: string): Rgba | null {
  if (typeof input !== "string") return null;
  const s = input.trim().toLowerCase();
  if (s.length === 0) return null;

  // Named
  const named = NAMED[s];
  if (named) return { ...named };

  // Hex
  if (s.startsWith("#")) {
    const hex = s.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      const r = hexNibble(hex[0]!);
      const g = hexNibble(hex[1]!);
      const b = hexNibble(hex[2]!);
      const a = hex.length === 4 ? hexNibble(hex[3]!) : 15;
      if (r === null || g === null || b === null || a === null) return null;
      return { r: r * 17, g: g * 17, b: b * 17, a: (a * 17) / 255 };
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) : 255;
      if ([r, g, b, a].some((v) => Number.isNaN(v))) return null;
      return { r, g, b, a: a / 255 };
    }
    return null;
  }

  // rgb()/rgba()
  const m = s.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const parts = m[1]!.split(",").map((p) => p.trim());
    if (parts.length !== 3 && parts.length !== 4) return null;
    const nums = parts.map((p) => Number(p));
    if (nums.slice(0, 3).some((n) => Number.isNaN(n))) return null;
    const a = parts.length === 4 ? Number(parts[3]) : 1;
    if (Number.isNaN(a)) return null;
    return {
      r: clampByte(nums[0]!),
      g: clampByte(nums[1]!),
      b: clampByte(nums[2]!),
      a: clampUnit(a),
    };
  }

  return null;
}

/** True if `input` is a color the engine can parse (and therefore interpolate). */
export function isParseableColor(input: string): boolean {
  return parseColor(input) !== null;
}

/** Format RGBA as a canvas-ready `rgba(r, g, b, a)` string. */
export function rgbaToString(c: Rgba): string {
  const r = clampByte(c.r);
  const g = clampByte(c.g);
  const b = clampByte(c.b);
  const a = clampUnit(c.a);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
