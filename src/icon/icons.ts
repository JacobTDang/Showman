/**
 * Icon path table — a curated, hand-authored Lucide/Feather-style set on a 0–24 grid. Each icon is
 * an SVG path `d` (stroked by default; `fill: true` for solid glyphs). Vendored + frozen, so it's
 * deterministic. Stroked icons use round caps/joins for a consistent line-art look.
 */

export interface IconDef {
  d: string;
  /** Solid (filled) rather than stroked. */
  fill?: boolean;
}

export const ICONS: Readonly<Record<string, IconDef>> = {
  check: { d: "M5 12.5 L10 17.5 L19 6.5" },
  x: { d: "M6 6 L18 18 M6 18 L18 6" },
  plus: { d: "M12 5 L12 19 M5 12 L19 12" },
  minus: { d: "M5 12 L19 12" },
  "arrow-right": { d: "M4 12 L20 12 M14 6 L20 12 L14 18" },
  "arrow-left": { d: "M20 12 L4 12 M10 6 L4 12 L10 18" },
  "arrow-up": { d: "M12 20 L12 4 M6 10 L12 4 L18 10" },
  "arrow-down": { d: "M12 4 L12 20 M6 14 L12 20 L18 14" },
  "chevron-right": { d: "M9 5 L16 12 L9 19" },
  "chevron-down": { d: "M5 9 L12 16 L19 9" },
  circle: { d: "M21 12 A9 9 0 1 1 3 12 A9 9 0 1 1 21 12 Z" },
  square: { d: "M5 5 L19 5 L19 19 L5 19 Z" },
  triangle: { d: "M12 3 L21 20 L3 20 Z", fill: true },
  star: { d: "M12 2 L14.9 8.6 L22 9.3 L16.5 14.2 L18.2 21.5 L12 17.6 L5.8 21.5 L7.5 14.2 L2 9.3 L9.1 8.6 Z", fill: true },
  heart: {
    d: "M12 21 C12 21 3 15 3 8.5 C3 5.4 5.4 3 8.5 3 C10.3 3 12 4.5 12 4.5 C12 4.5 13.7 3 15.5 3 C18.6 3 21 5.4 21 8.5 C21 15 12 21 12 21 Z",
    fill: true,
  },
  home: { d: "M3 11 L12 3 L21 11 M5 9.5 L5 20 L19 20 L19 9.5" },
  play: { d: "M7 4 L20 12 L7 20 Z", fill: true },
  pause: { d: "M8 4 L8 20 M16 4 L16 20" },
  search: { d: "M16.5 10 A6.5 6.5 0 1 1 3.5 10 A6.5 6.5 0 1 1 16.5 10 M21 21 L16.5 16.5" },
  lock: { d: "M5 11 L19 11 L19 21 L5 21 Z M7 11 L7 8 C7 5.2 9.2 3 12 3 C14.8 3 17 5.2 17 8 L17 11" },
  zap: { d: "M13 2 L4 14 L11 14 L11 22 L20 10 L13 10 Z", fill: true },
  info: { d: "M21 12 A9 9 0 1 1 3 12 A9 9 0 1 1 21 12 Z M12 11 L12 16 M12 8 L12 8.01" },
  mail: { d: "M3 6 L21 6 L21 18 L3 18 Z M3 6 L12 13 L21 6" },
  file: { d: "M6 3 L14 3 L19 8 L19 21 L6 21 Z M14 3 L14 8 L19 8" },
  folder: { d: "M3 6 L9.5 6 L11.5 8 L21 8 L21 19 L3 19 Z" },
  bell: {
    d: "M6 16 L6 10 C6 6.7 8.7 4 12 4 C15.3 4 18 6.7 18 10 L18 16 L20 18 L4 18 Z M9.5 18 C9.5 19.4 10.6 20.5 12 20.5 C13.4 20.5 14.5 19.4 14.5 18",
  },
  database: {
    d: "M12 3 C16.4 3 20 4.6 20 6.5 C20 8.4 16.4 10 12 10 C7.6 10 4 8.4 4 6.5 C4 4.6 7.6 3 12 3 M4 6.5 L4 17.5 C4 19.4 7.6 21 12 21 C16.4 21 20 19.4 20 17.5 L20 6.5 M4 12 C4 13.9 7.6 15.5 12 15.5 C16.4 15.5 20 13.9 20 12",
  },
};

/** All available icon names. */
export function iconNames(): string[] {
  return Object.keys(ICONS);
}
