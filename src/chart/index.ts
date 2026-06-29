/**
 * Chart suite — a shared scaffold (axes, gridlines, legend, formatted ticks) plus bar / line / area /
 * scatter / candlestick chart types. One module for finance, the sciences, and data. Pure builders
 * over existing primitives, so the renderer stays deterministic.
 *
 * Each builder's `id` defaults to a fixed string ("bar", "line", …) and prefixes its child ids —
 * pass distinct ids when composing several charts into one scene so the ids don't collide.
 */

export * from "./format.js";
export * from "./palette.js";
export * from "./scaffold.js";
export * from "./barChart.js";
export * from "./lineChart.js";
export * from "./areaChart.js";
export * from "./scatterChart.js";
export * from "./candlestick.js";
