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
