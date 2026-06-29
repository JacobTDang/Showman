/**
 * Tick / value formatting for charts — deterministic (no `toLocaleString`, which is locale- and
 * platform-dependent). Numbers get thousands separators; currency/percent/compact variants serve
 * finance and the sciences.
 */

export type TickFormat = "number" | "currency" | "percent" | "compact";

function round(v: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}

/** Group the integer part with commas (deterministic; ignores locale). */
function withThousands(v: number): string {
  const neg = v < 0;
  const s = round(Math.abs(v)).toString();
  const [int, frac] = s.split(".");
  const grouped = (int ?? "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}${grouped}${frac ? `.${frac}` : ""}`;
}

/** A compact magnitude: 1_234 → "1.2K", 3_400_000 → "3.4M", 1.2e9 → "1.2B". */
function compact(v: number): string {
  const neg = v < 0;
  const a = Math.abs(v);
  const units: [number, string][] = [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [base, suffix] of units) {
    if (a >= base) {
      const n = round(a / base, 1);
      return `${neg ? "-" : ""}${n}${suffix}`;
    }
  }
  return `${neg ? "-" : ""}${round(a)}`;
}

/** Format a value for an axis tick or a data label. `percent` appends "%" to the value as-is. */
export function formatTick(v: number, fmt: TickFormat = "number"): string {
  if (!Number.isFinite(v)) return "";
  switch (fmt) {
    case "currency":
      return `$${withThousands(v)}`;
    case "percent":
      return `${withThousands(v)}%`;
    case "compact":
      return compact(v);
    case "number":
    default:
      return withThousands(v);
  }
}

/** A "nice" axis maximum at or above `v` (1/2/5 × 10^n), so ticks land on round numbers. */
export function niceCeil(v: number): number {
  if (v <= 0) return v === 0 ? 1 : 0;
  const exp = Math.floor(Math.log10(v));
  const base = 10 ** exp;
  const frac = v / base;
  const nice = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
  return nice * base;
}

/** Round a positive range to a "nice" 1/2/5 × 10^n number (Heckbert). */
function niceNum(range: number, round: boolean): number {
  if (range <= 0) return 1;
  const exp = Math.floor(Math.log10(range));
  const f = range / 10 ** exp;
  const nf = round ? (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) : f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nf * 10 ** exp;
}

/**
 * Round axis ticks: given a data [min, max] and a target tick count, return a nice min/max/step and
 * the round tick values (e.g. 0/20/40/60/80 instead of 0/13.6/27.2/…). The single biggest chart
 * readability upgrade. Falls back to a sane [0..1]-ish axis for degenerate / flat / non-finite input.
 */
export function niceTicks(min: number, max: number, count = 5): { min: number; max: number; step: number; values: number[] } {
  const n = Math.max(2, count);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    const top = Number.isFinite(max) && max > 0 ? niceCeil(max) : 1;
    const lo = Math.min(0, Number.isFinite(min) ? min : 0);
    const step = (top - lo) / n || 1;
    return { min: lo, max: top, step, values: Array.from({ length: n + 1 }, (_, i) => lo + step * i) };
  }
  const range = niceNum(max - min, false);
  const step = niceNum(range / (n - 1), true);
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const values: number[] = [];
  for (let v = niceMin, i = 0; v <= niceMax + step * 0.5 && i < 1000; v += step, i++) {
    values.push(Number(v.toFixed(10))); // trim fp drift (0.30000000004 → 0.3)
  }
  return { min: niceMin, max: niceMax, step, values };
}
