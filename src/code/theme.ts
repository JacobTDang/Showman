/**
 * Code color themes — a token-type → color palette plus editor surface colors. A dark, Material-ish
 * default reads as a real editor.
 */

import type { Color } from "../spec/types.js";
import type { TokenType } from "./tokenize.js";

export interface CodeTheme {
  bg: Color;
  chrome: Color;
  gutter: Color;
  lineHighlight: Color;
  token: Record<TokenType, Color>;
}

export const CODE_DARK: CodeTheme = {
  bg: "#0f172a",
  chrome: "#1e293b",
  gutter: "#475569",
  lineHighlight: "rgba(56,189,248,0.14)",
  token: {
    keyword: "#c792ea",
    string: "#c3e88d",
    comment: "#64748b",
    number: "#f78c6c",
    function: "#82aaff",
    operator: "#89ddff",
    punctuation: "#94a3b8",
    plain: "#e2e8f0",
  },
};

export const CODE_LIGHT: CodeTheme = {
  bg: "#ffffff",
  chrome: "#f1f5f9",
  gutter: "#94a3b8",
  lineHighlight: "rgba(37,99,235,0.10)",
  token: {
    keyword: "#7c3aed",
    string: "#0f766e",
    comment: "#94a3b8",
    number: "#b45309",
    function: "#2563eb",
    operator: "#0891b2",
    punctuation: "#64748b",
    plain: "#1e293b",
  },
};
