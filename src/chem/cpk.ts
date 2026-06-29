/**
 * CPK colors — the conventional element coloring used in chemistry illustrations (Corey–Pauling–
 * Koltun). Returned as hex so atoms render with familiar, instantly-readable colors.
 */

import type { Color } from "../spec/types.js";

const CPK: Readonly<Record<string, Color>> = {
  H: "#f8fafc",
  C: "#2b2b2b",
  N: "#3050f8",
  O: "#ff2d2d",
  F: "#2ecc71",
  Cl: "#2ecc71",
  Br: "#a52a2a",
  I: "#7c3aed",
  S: "#f1c40f",
  P: "#e67e22",
  B: "#ffb5b5",
  Na: "#9b59b6",
  K: "#8e44ad",
  Mg: "#27ae60",
  Ca: "#3a8f3a",
  Fe: "#e0762d",
  Zn: "#7d80b0",
  He: "#22d3ee",
  Ne: "#22d3ee",
  Ar: "#22d3ee",
};

const DEFAULT_ELEMENT: Color = "#ff80c0"; // unknown element — a noticeable pink

/** The CPK color for an element symbol (case-sensitive: "Cl", "Na"), falling back to a default. */
export function cpkColor(element: string): Color {
  return CPK[element] ?? DEFAULT_ELEMENT;
}
