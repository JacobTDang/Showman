/**
 * Color parsing and formatting.
 *
 * The engine OWNS its color space: every color (static, animated, or background) is
 * parsed here to numeric RGBA and then handed to the canvas as an explicit
 * `rgba(...)` string. We never pass an author's raw color string to the canvas,
 * because the canvas silently ignores names it doesn't recognize (retaining the
 * previous fill) — a silent, order-dependent rendering bug. Owning the parse also
 * makes interpolation well-defined and portable.
 *
 * Supported forms: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()/rgba()`,
 * `hsl()/hsla()`, and the named colors in the table below. Anything else is
 * unparseable and rejected by the validator — use hex if you need a color we
 * don't name.
 */

/** A color as numeric channels. r/g/b are 0..255 integers; a is 0..1. */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * Named colors: the CSS basic + common extended set, plus a few warm,
 * child-friendly aliases (`cream`, `mint`). Because the engine resolves these
 * itself, custom names render correctly and interpolate predictably — we do not
 * depend on the canvas's named-color table. Null-prototype so lookups can't hit
 * `Object.prototype` members (`constructor`, `toString`, …).
 */
const NAMED: Readonly<Record<string, Rgba>> = Object.assign(Object.create(null), {
  transparent: { r: 0, g: 0, b: 0, a: 0 },
  black: { r: 0, g: 0, b: 0, a: 1 },
  white: { r: 255, g: 255, b: 255, a: 1 },
  red: { r: 255, g: 0, b: 0, a: 1 },
  green: { r: 0, g: 128, b: 0, a: 1 },
  blue: { r: 0, g: 0, b: 255, a: 1 },
  yellow: { r: 255, g: 255, b: 0, a: 1 },
  cyan: { r: 0, g: 255, b: 255, a: 1 },
  aqua: { r: 0, g: 255, b: 255, a: 1 },
  magenta: { r: 255, g: 0, b: 255, a: 1 },
  fuchsia: { r: 255, g: 0, b: 255, a: 1 },
  orange: { r: 255, g: 165, b: 0, a: 1 },
  purple: { r: 128, g: 0, b: 128, a: 1 },
  pink: { r: 255, g: 192, b: 203, a: 1 },
  brown: { r: 165, g: 42, b: 42, a: 1 },
  gray: { r: 128, g: 128, b: 128, a: 1 },
  grey: { r: 128, g: 128, b: 128, a: 1 },
  silver: { r: 192, g: 192, b: 192, a: 1 },
  maroon: { r: 128, g: 0, b: 0, a: 1 },
  olive: { r: 128, g: 128, b: 0, a: 1 },
  lime: { r: 0, g: 255, b: 0, a: 1 },
  teal: { r: 0, g: 128, b: 128, a: 1 },
  navy: { r: 0, g: 0, b: 128, a: 1 },
  gold: { r: 255, g: 215, b: 0, a: 1 },
  indigo: { r: 75, g: 0, b: 130, a: 1 },
  violet: { r: 238, g: 130, b: 238, a: 1 },
  turquoise: { r: 64, g: 224, b: 208, a: 1 },
  salmon: { r: 250, g: 128, b: 114, a: 1 },
  coral: { r: 255, g: 127, b: 80, a: 1 },
  tomato: { r: 255, g: 99, b: 71, a: 1 },
  khaki: { r: 240, g: 230, b: 140, a: 1 },
  tan: { r: 210, g: 180, b: 140, a: 1 },
  beige: { r: 245, g: 245, b: 220, a: 1 },
  ivory: { r: 255, g: 255, b: 240, a: 1 },
  crimson: { r: 220, g: 20, b: 60, a: 1 },
  skyblue: { r: 135, g: 206, b: 235, a: 1 },
  lightblue: { r: 173, g: 216, b: 230, a: 1 },
  lightgreen: { r: 144, g: 238, b: 144, a: 1 },
  palegreen: { r: 152, g: 251, b: 152, a: 1 },
  lightyellow: { r: 255, g: 255, b: 224, a: 1 },
  steelblue: { r: 70, g: 130, b: 180, a: 1 },
  wheat: { r: 245, g: 222, b: 179, a: 1 },
  plum: { r: 221, g: 160, b: 221, a: 1 },
  orchid: { r: 218, g: 112, b: 214, a: 1 },
  lavender: { r: 230, g: 230, b: 250, a: 1 },
  // child-friendly aliases (not CSS names; the engine owns them)
  cream: { r: 253, g: 246, b: 227, a: 1 },
  mint: { r: 152, g: 255, b: 152, a: 1 },
});

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

const HEX_RE = /^[0-9a-f]+$/;

function hueToRgb(p: number, q: number, t: number): number {
  let tt = t % 1;
  if (tt < 0) tt += 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const hh = (((h % 360) + 360) % 360) / 360;
  const ss = clampUnit(s / 100);
  const ll = clampUnit(l / 100);
  if (ss === 0) {
    const v = Math.round(ll * 255);
    return { r: v, g: v, b: v };
  }
  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
  const p = 2 * ll - q;
  return {
    r: Math.round(hueToRgb(p, q, hh + 1 / 3) * 255),
    g: Math.round(hueToRgb(p, q, hh) * 255),
    b: Math.round(hueToRgb(p, q, hh - 1 / 3) * 255),
  };
}

/** Parse a comma-separated component list, returning numbers or null if any component is empty/invalid. */
function parseComponents(body: string, allowPercent: boolean): number[] | null {
  const parts = body.split(",").map((p) => p.trim());
  const out: number[] = [];
  for (const p of parts) {
    if (p.length === 0) return null;
    const isPercent = p.endsWith("%");
    const numStr = isPercent ? p.slice(0, -1) : p;
    if (numStr.length === 0) return null;
    const n = Number(numStr);
    if (Number.isNaN(n)) return null;
    if (isPercent && !allowPercent) return null;
    out.push(n);
  }
  return out;
}

/** Parse a color string to RGBA, or return `null` if it is not a form we understand. */
export function parseColor(input: string): Rgba | null {
  if (typeof input !== "string") return null;
  const s = input.trim().toLowerCase();
  if (s.length === 0) return null;

  // Named (own-property only; NAMED is null-prototype so this is safe regardless).
  if (Object.prototype.hasOwnProperty.call(NAMED, s)) return { ...NAMED[s]! };

  // Hex
  if (s.startsWith("#")) {
    const hex = s.slice(1);
    if (!HEX_RE.test(hex)) return null;
    if (hex.length === 3 || hex.length === 4) {
      const r = parseInt(hex[0]!, 16);
      const g = parseInt(hex[1]!, 16);
      const b = parseInt(hex[2]!, 16);
      const a = hex.length === 4 ? parseInt(hex[3]!, 16) : 15;
      return { r: r * 17, g: g * 17, b: b * 17, a: (a * 17) / 255 };
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) : 255;
      return { r, g, b, a: a / 255 };
    }
    return null;
  }

  // rgb()/rgba()
  const rgbMatch = s.match(/^rgba?\(([^)]+)\)$/);
  if (rgbMatch) {
    const nums = parseComponents(rgbMatch[1]!, false);
    if (!nums || (nums.length !== 3 && nums.length !== 4)) return null;
    const a = nums.length === 4 ? nums[3]! : 1;
    return { r: clampByte(nums[0]!), g: clampByte(nums[1]!), b: clampByte(nums[2]!), a: clampUnit(a) };
  }

  // hsl()/hsla() — parsed positionally: hue is a plain number (no %), s/l may carry %, and a
  // trailing % on alpha means value/100 (so "hsla(.., 50%)" is 0.5, not opaque).
  const hslMatch = s.match(/^hsla?\(([^)]+)\)$/);
  if (hslMatch) {
    const parts = hslMatch[1]!.split(",").map((p) => p.trim());
    if (parts.length !== 3 && parts.length !== 4) return null;
    const num = (p: string): number | null => {
      const body = p.endsWith("%") ? p.slice(0, -1) : p;
      if (body.length === 0) return null;
      const n = Number(body);
      return Number.isNaN(n) ? null : n;
    };
    if (parts[0]!.endsWith("%")) return null; // hue is not a percentage
    const h = num(parts[0]!);
    const sNum = num(parts[1]!);
    const lNum = num(parts[2]!);
    if (h === null || sNum === null || lNum === null) return null;
    const { r, g, b } = hslToRgb(h, sNum, lNum);
    let a = 1;
    if (parts.length === 4) {
      const av = num(parts[3]!);
      if (av === null) return null;
      a = parts[3]!.endsWith("%") ? av / 100 : av;
    }
    return { r, g, b, a: clampUnit(a) };
  }

  return null;
}

/** True if `input` is a color the engine can parse (and therefore interpolate and render). */
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

/**
 * Normalize any supported color string into a canvas-safe `rgba(...)` string.
 * Falls back to the raw input only if parsing fails (which validated specs avoid).
 * This is the gate that prevents the canvas from ever seeing a name it would
 * silently ignore.
 */
export function normalizeColor(input: string): string {
  const c = parseColor(input);
  return c ? rgbaToString(c) : input;
}

// ---------------------------------------------------------------------------
// Color math — deterministic transforms over parsed RGBA, for themes, brand
// kits, elevation tints, and accessibility checks. All pure; hex in, hex/number
// out. Unparseable input falls back gracefully (returns the input or a safe
// default) so these never throw on author data.
// ---------------------------------------------------------------------------

function toHex2(n: number): string {
  return clampByte(n).toString(16).padStart(2, "0");
}

/** Format RGBA as `#rrggbb` (or `#rrggbbaa` when not fully opaque). */
export function rgbaToHex(c: Rgba): string {
  const base = `#${toHex2(c.r)}${toHex2(c.g)}${toHex2(c.b)}`;
  return c.a >= 1 ? base : `${base}${toHex2(Math.round(clampUnit(c.a) * 255))}`;
}

/** RGB → HSL (h 0..360, s/l 0..100). */
export function rgbToHsl(c: Rgba): { h: number; s: number; l: number } {
  const r = c.r / 255;
  const g = c.g / 255;
  const b = c.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s: s * 100, l: l * 100 };
}

/** Mix two colors in RGB by `t` (0 = a, 1 = b). */
export function mix(a: string, b: string, t: number): string {
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca || !cb) return a;
  const k = clampUnit(t);
  return rgbaToHex({
    r: ca.r + (cb.r - ca.r) * k,
    g: ca.g + (cb.g - ca.g) * k,
    b: ca.b + (cb.b - ca.b) * k,
    a: ca.a + (cb.a - ca.a) * k,
  });
}

/** Lighten toward white by `amount` (0..1), preserving the source alpha. */
export function lighten(color: string, amount: number): string {
  const c = parseColor(color);
  if (!c) return color;
  const k = clampUnit(amount);
  return rgbaToHex({ r: c.r + (255 - c.r) * k, g: c.g + (255 - c.g) * k, b: c.b + (255 - c.b) * k, a: c.a });
}

/** Darken toward black by `amount` (0..1), preserving the source alpha. */
export function darken(color: string, amount: number): string {
  const c = parseColor(color);
  if (!c) return color;
  const k = clampUnit(amount);
  return rgbaToHex({ r: c.r * (1 - k), g: c.g * (1 - k), b: c.b * (1 - k), a: c.a });
}

/** Return `color` with its alpha set to `alpha` (0..1). */
export function withAlpha(color: string, alpha: number): string {
  const c = parseColor(color);
  if (!c) return color;
  return rgbaToHex({ ...c, a: clampUnit(alpha) });
}

/** WCAG relative luminance (0..1) of a color (alpha ignored). */
export function relativeLuminance(color: string): number {
  const c = parseColor(color) ?? { r: 0, g: 0, b: 0, a: 1 };
  const ch = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
}

/** WCAG contrast ratio (1..21) between two colors. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** Pick the foreground (black or white, or the provided pair) with the better contrast on `bg`. */
export function readableOn(bg: string, dark = "#000000", light = "#ffffff"): string {
  return contrastRatio(bg, dark) >= contrastRatio(bg, light) ? dark : light;
}
