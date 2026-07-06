import { z } from "zod";
import { coordinatePlane } from "../../math/builders.js";
import { projectile } from "../../physics/motion.js";
import type { BuilderTool } from "../types.js";

/**
 * physics.projectile — a macro like math.functionGraph: builds an internal coordinate
 * plane sized to fit the trajectory, then plots the projectile's parabolic path + a
 * moving marker onto it. The plane is not exposed in the catalog, only the combined node.
 */
const Params = z.object({
  speed: z.number().positive().max(200).describe("launch speed, data units/sec"),
  angle: z.number().min(1).max(89).describe("launch angle in degrees from the ground"),
  gravity: z.number().positive().max(50).default(9.8),
  showTrajectory: z.boolean().default(true),
  showMarker: z.boolean().default(true),
  width: z.number().positive().max(1200).default(420),
  height: z.number().positive().max(1200).default(280),
  theme: z.string().optional(),
});
type ProjectileParams = z.infer<typeof Params>;

export const projectileTool: BuilderTool<ProjectileParams> = {
  name: "physics.projectile",
  domain: "physics",
  level: "node",
  description: "a projectile's parabolic trajectory with a physically-paced moving marker",
  keywords: ["projectile", "trajectory", "parabola", "launch", "gravity", "range", "arc", "ball", "cannon"],
  params: Params,
  example: { speed: 20, angle: 45, gravity: 9.8, showTrajectory: true, showMarker: true, width: 420, height: 280 },
  build(p) {
    const g = p.gravity;
    const rad = (p.angle * Math.PI) / 180;
    const vx = p.speed * Math.cos(rad);
    const vy = p.speed * Math.sin(rad);
    const tFlight = (2 * vy) / g;
    const xMax = Math.max(1, vx * tFlight) * 1.1;
    const yMax = Math.max(1, (vy * vy) / (2 * g)) * 1.3;

    const plane = coordinatePlane({
      width: p.width,
      height: p.height,
      xMin: 0,
      xMax,
      yMin: 0,
      yMax,
      showGrid: true,
      ...(p.theme ? { theme: p.theme } : {}),
    });
    const traj = projectile(plane, {
      speed: p.speed,
      angle: p.angle,
      g,
      showTrajectory: p.showTrajectory,
      showMarker: p.showMarker,
    });

    return {
      node: { id: "projectile-graph", type: "group", x: 0, y: 0, children: [plane.node, traj] },
      bbox: { w: p.width, h: p.height },
    };
  },
};
