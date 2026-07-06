/**
 * Explicit registration of every catalog tool. Registration order is greppable and
 * deterministic; tests register fresh registries, production uses the memoized default.
 */

import { BuilderRegistry } from "./registry.js";
import type { BuilderTool } from "./types.js";
import { numberLineTool } from "./math/numberLine.tool.js";
import { reactionTool } from "./chem/reaction.tool.js";
import { mathLessonTools } from "./math/lessons.tool.js";
import { cardTool } from "./items/card.tool.js";
import { functionGraphTool } from "./math/functionGraph.tool.js";
import { fractionCircleTool, fractionBarTool, angleTool, labeledShapeTool } from "./math/shapes.tool.js";
import {
  arrayGridTool,
  dotPatternTool,
  baseTenBlocksTool,
  areaGridTool,
  numberSentenceTool,
  barGraphTool,
  pictographTool,
  percentRingTool,
  numberLineFractionTool,
} from "./math/counting.tool.js";
import { balanceScaleTool, mathExprTool } from "./math/algebra.tool.js";
import { forceDiagramTool, inclinedPlaneTool, energyBarsTool } from "./physics/mechanics.tool.js";
import { pendulumTool, massSpringTool } from "./physics/oscillators.tool.js";
import { rayDiagramTool, bohrAtomTool, energyLevelsTool, emSpectrumTool } from "./physics/optics.tool.js";
import { projectileTool } from "./physics/projectile.tool.js";
import { circuitTool } from "./physics/circuit.tool.js";
import { moleculeTool } from "./chem/molecule.tool.js";
import {
  lewisStructureTool,
  phScaleTool,
  energyDiagramTool,
  periodicTableTool,
  vseprShapeTool,
  electronConfigTool,
} from "./chem/diagrams.tool.js";
import { titrationCurveTool, heatingCurveTool, phaseDiagramTool } from "./chem/curves.tool.js";
import { apparatusTool } from "./chem/apparatus.tool.js";
import { boxTool, tableTool, connectorTool, flowchartTool } from "./diagram/shapes.tool.js";
import { barChartTool, lineChartTool, areaChartTool, scatterChartTool } from "./chart/charts.tool.js";

/** Node-level tools beyond the original numberLine (Roadmap A1: the math wave). */
const MATH_NODE_TOOLS: BuilderTool[] = [
  functionGraphTool,
  fractionCircleTool,
  fractionBarTool,
  angleTool,
  labeledShapeTool,
  arrayGridTool,
  dotPatternTool,
  baseTenBlocksTool,
  areaGridTool,
  numberSentenceTool,
  barGraphTool,
  pictographTool,
  percentRingTool,
  numberLineFractionTool,
  balanceScaleTool,
  mathExprTool,
];

/** Physics node-level tools (Roadmap A2: the physics wave). */
const PHYSICS_NODE_TOOLS: BuilderTool[] = [
  forceDiagramTool,
  inclinedPlaneTool,
  energyBarsTool,
  pendulumTool,
  massSpringTool,
  rayDiagramTool,
  bohrAtomTool,
  energyLevelsTool,
  emSpectrumTool,
  projectileTool,
  circuitTool,
];

/** Chem node-level tools beyond reaction (Roadmap A3: the chem wave). */
const CHEM_NODE_TOOLS: BuilderTool[] = [
  moleculeTool,
  lewisStructureTool,
  phScaleTool,
  energyDiagramTool,
  periodicTableTool,
  vseprShapeTool,
  electronConfigTool,
  titrationCurveTool,
  heatingCurveTool,
  phaseDiagramTool,
  apparatusTool,
];

/** Diagram node-level tools (Roadmap A4: the diagram/chart wave). */
const DIAGRAM_NODE_TOOLS: BuilderTool[] = [boxTool, tableTool, connectorTool, flowchartTool];

/** Chart node-level tools (Roadmap A4: the diagram/chart wave). */
const CHART_NODE_TOOLS: BuilderTool[] = [barChartTool, lineChartTool, areaChartTool, scatterChartTool];

/** Build a fresh registry with all known tools registered. */
export function createDefaultRegistry(): BuilderRegistry {
  const registry = new BuilderRegistry();
  registry.register(numberLineTool);
  registry.register(reactionTool);
  registry.register(cardTool);
  for (const tool of mathLessonTools) registry.register(tool);
  for (const tool of MATH_NODE_TOOLS) registry.register(tool);
  for (const tool of PHYSICS_NODE_TOOLS) registry.register(tool);
  for (const tool of CHEM_NODE_TOOLS) registry.register(tool);
  for (const tool of DIAGRAM_NODE_TOOLS) registry.register(tool);
  for (const tool of CHART_NODE_TOOLS) registry.register(tool);
  return registry;
}

let cached: BuilderRegistry | undefined;

/** The process-wide default registry (built once). */
export function defaultRegistry(): BuilderRegistry {
  if (!cached) cached = createDefaultRegistry();
  return cached;
}
