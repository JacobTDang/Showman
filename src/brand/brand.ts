/**
 * White-label brand kits. A small kit (name + brand color, plus optional overrides) expands into a
 * full {@link Theme} — deriving a readable palette with the color helpers — so every builder (charts,
 * diagrams, lessons, …) renders in the org's identity. Register a kit and pass `theme: kit.name`, or
 * use the ready-made title card / lower third / watermark. Pure + deterministic.
 */

import type { SceneSpec, Node, GroupNode, Color } from "../spec/types.js";
import type { Theme } from "../theme/themes.js";
import { THEMES } from "../theme/themes.js";
import { SPEC_VERSION } from "../spec/schema.js";
import { mix, lighten, darken, withAlpha, readableOn, contrastRatio, relativeLuminance } from "../engine/color.js";
import { isRegisteredFamily } from "../engine/fonts.js";

/** Pinned families only validate; an unregistered brand typeface falls back so scenes stay valid. */
function pinnedFont(family: string | undefined, fallback: string): string {
  return family !== undefined && isRegisteredFamily(family) ? family : fallback;
}

export interface BrandLogo {
  /** Image asset key (registered via registerImage / prepareImages). */
  key: string;
  /** Natural pixel dimensions, used to preserve aspect ratio. */
  width: number;
  height: number;
}

export interface BrandKit {
  /** Used as the theme name — pass `theme: kit.name` to builders after registerBrand(). */
  name: string;
  /** The one required color — the brand's primary. The rest is derived if not given. */
  primary: Color;
  secondary?: Color;
  accent?: Color;
  bg?: Color;
  text?: Color;
  muted?: Color;
  swatches?: Color[];
  /** Heading/body/mono families. Must be one of the pinned REGISTERED_FONT_FAMILIES — an unregistered
   * brand typeface falls back to the default so scenes stay valid (register the family first to use it). */
  headingFont?: string;
  bodyFont?: string;
  monoFont?: string;
  mode?: "light" | "dark";
  /** Optional logo image; falls back to a wordmark of `name`. */
  logo?: BrandLogo;
}

/** Expand a kit into a full Theme, deriving any unspecified palette entries for legibility. */
export function brandTheme(kit: BrandKit): Theme {
  const mode = kit.mode ?? "light";
  const bg = kit.bg ?? (mode === "dark" ? "#0f172a" : "#ffffff");
  const text = kit.text ?? readableOn(bg, "#0f172a", "#f8fafc");
  const primary = kit.primary;
  const lum = relativeLuminance(primary);
  // Shift toward black/white, but flip the direction at the extremes so a pure-black or pure-white
  // primary still yields a *distinct* sibling (darken("#000") would collapse back onto primary).
  const secondary = kit.secondary ?? (lum < 0.15 ? lighten(primary, 0.22) : darken(primary, 0.18));
  const accent = kit.accent ?? (lum > 0.85 ? darken(primary, 0.2) : lighten(primary, 0.12));
  const muted = kit.muted ?? mix(text, bg, 0.45);
  const swatches = kit.swatches ?? [primary, accent, secondary, "#16a34a", "#dc2626", "#7c3aed"];
  return {
    name: kit.name,
    palette: { bg, primary, secondary, accent, text, muted, swatches },
    headingFont: pinnedFont(kit.headingFont, "Inter"),
    bodyFont: pinnedFont(kit.bodyFont, "Inter"),
    headingWeight: 700,
    bodyWeight: 500,
    mode,
    ...(kit.monoFont !== undefined ? { monoFont: pinnedFont(kit.monoFont, "JetBrains Mono") } : {}),
  };
}

/** Names of the built-in themes, captured at load — registerBrand must not clobber these. */
const BUILTIN_THEMES = new Set(Object.keys(THEMES));

/** Register a kit's theme into the global THEMES map so `getTheme(kit.name)` / `theme: kit.name` work.
 * Throws if the name collides with a built-in theme (which would silently re-skin unrelated scenes). */
export function registerBrand(kit: BrandKit): Theme {
  if (BUILTIN_THEMES.has(kit.name)) {
    throw new Error(`registerBrand: "${kit.name}" collides with a built-in theme — choose a unique brand name.`);
  }
  const theme = brandTheme(kit);
  THEMES[kit.name] = theme;
  return theme;
}

export type Corner = "bottom-right" | "bottom-left" | "top-right" | "top-left";

export interface WatermarkOptions {
  id?: string;
  /** Frame size to anchor against. */
  width: number;
  height: number;
  position?: Corner;
  margin?: number;
  opacity?: number;
  /** Target height in px (logo) or font size (wordmark). Default 28. */
  size?: number;
  color?: Color;
}

/** A corner logo (if the kit has one) or wordmark, at reduced opacity. */
export function watermark(kit: BrandKit, opts: WatermarkOptions): Node {
  const id = opts.id ?? "watermark";
  const margin = opts.margin ?? 24;
  const size = opts.size ?? 28;
  const opacity = opts.opacity ?? 0.65;
  const right = opts.position?.includes("right") ?? true;
  const bottom = opts.position?.includes("bottom") ?? true;
  if (kit.logo) {
    const h = size;
    const w = (kit.logo.width / kit.logo.height) * h;
    return {
      id,
      type: "image",
      x: right ? opts.width - margin - w : margin,
      y: bottom ? opts.height - margin - h : margin,
      width: w,
      height: h,
      src: kit.logo.key,
      opacity,
    };
  }
  return {
    id,
    type: "text",
    x: right ? opts.width - margin : margin,
    y: bottom ? opts.height - margin : margin,
    text: kit.name,
    fontFamily: kit.headingFont ?? "Inter",
    fontWeight: 700,
    fontSize: size,
    fill: opts.color ?? kit.primary,
    align: right ? "right" : "left",
    baseline: bottom ? "bottom" : "top",
    opacity,
  };
}

export interface TitleCardOptions {
  title: string;
  subtitle?: string;
  width?: number;
  height?: number;
  /** Seconds. Default 3. */
  duration?: number;
}

/** A ready-to-render branded intro scene: background, wordmark, title, accent rule, subtitle. */
export function titleCard(kit: BrandKit, opts: TitleCardOptions): SceneSpec {
  const theme = brandTheme(kit);
  const p = theme.palette;
  const W = opts.width ?? 1280;
  const H = opts.height ?? 720;
  const cx = W / 2;
  const titleSize = Math.round(H * 0.085);
  const titleY = Math.round(H * 0.46);
  const ruleY = titleY + Math.round(titleSize * 0.5) + 22; // clear of the title's descenders
  // Keep the brand primary for the title only when it's legible on the background; else fall back.
  const titleFill = contrastRatio(p.primary, p.bg) >= 4.5 ? p.primary : readableOn(p.bg, p.text, "#f8fafc");
  const nodes: Node[] = [
    {
      id: "tc-mark",
      type: "text",
      x: cx,
      y: Math.round(H * 0.2),
      text: kit.name.toUpperCase(),
      fontFamily: theme.headingFont,
      fontWeight: 700,
      fontSize: Math.round(H * 0.03),
      fill: withAlpha(p.muted, 0.9),
      align: "center",
      baseline: "middle",
      letterSpacing: 3,
    },
    {
      id: "tc-title",
      type: "text",
      x: cx,
      y: titleY,
      text: opts.title,
      fontFamily: theme.headingFont,
      fontWeight: theme.headingWeight,
      fontSize: titleSize,
      fill: titleFill,
      align: "center",
      baseline: "middle",
    },
    { id: "tc-rule", type: "rect", x: cx - 60, y: ruleY, width: 120, height: 5, radius: 2.5, fill: p.accent },
  ];
  if (opts.subtitle !== undefined && opts.subtitle.trim() !== "") {
    nodes.push({
      id: "tc-sub",
      type: "text",
      x: cx,
      y: ruleY + 34,
      text: opts.subtitle,
      fontFamily: theme.bodyFont,
      fontWeight: theme.bodyWeight,
      fontSize: Math.round(H * 0.038),
      fill: p.muted,
      align: "center",
      baseline: "middle",
    });
  }
  return { specVersion: SPEC_VERSION, width: W, height: H, fps: 30, duration: opts.duration ?? 3, seed: 1, background: p.bg, nodes };
}

export interface LowerThirdOptions {
  id?: string;
  title: string;
  subtitle?: string;
  x?: number;
  y: number;
  width?: number;
}

/** A branded name/title bar (broadcast lower-third): an accent edge, a primary card, title + subtitle. */
export function lowerThird(kit: BrandKit, opts: LowerThirdOptions): GroupNode {
  const id = opts.id ?? "lt";
  const theme = brandTheme(kit);
  const p = theme.palette;
  const x = opts.x ?? 60;
  const w = opts.width ?? 460;
  const h = opts.subtitle ? 76 : 52;
  const onPrimary = readableOn(p.primary, "#0f172a", "#f8fafc");
  const children: Node[] = [
    { id: `${id}-edge`, type: "rect", x, y: opts.y, width: 7, height: h, fill: p.accent },
    { id: `${id}-card`, type: "rect", x: x + 7, y: opts.y, width: w - 7, height: h, fill: p.primary, radius: 4 },
    {
      id: `${id}-title`,
      type: "text",
      x: x + 26,
      y: opts.y + (opts.subtitle ? 26 : h / 2),
      text: opts.title,
      fontFamily: theme.headingFont,
      fontWeight: theme.headingWeight,
      fontSize: 24,
      fill: onPrimary,
      align: "left",
      baseline: "middle",
    },
  ];
  if (opts.subtitle !== undefined && opts.subtitle.trim() !== "") {
    children.push({
      id: `${id}-sub`,
      type: "text",
      x: x + 26,
      y: opts.y + 52,
      text: opts.subtitle,
      fontFamily: theme.bodyFont,
      fontWeight: theme.bodyWeight,
      fontSize: 16,
      fill: withAlpha(onPrimary, 0.85),
      align: "left",
      baseline: "middle",
    });
  }
  return { id, type: "group", x: 0, y: 0, children };
}
