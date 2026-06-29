/**
 * Interaction demo — render a short lesson video + its interactions.json into out/demo/
 * and drop the player beside them, so the interactive player can be opened in a browser.
 * Run: npm run interaction-demo  ->  serve out/demo and open showman-player.html
 */

import { mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { encodeSceneToFile } from "../src/encode/encodeVideo.js";
import { getTheme } from "../src/index.js";
import type { Node, SceneSpec } from "../src/index.js";
import { interactionTrack, mcq, pausePrompt, trueFalse } from "../src/interaction/builders.js";
import { toInteractionsJson } from "../src/interaction/index.js";

const t = getTheme("ocean");
const apple = "#e63946";
const centers = [220, 360, 500];
const nodes: Node[] = [
  {
    id: "title",
    type: "text",
    x: 360,
    y: 50,
    text: "Counting Apples",
    fontSize: 40,
    fontWeight: 800,
    fill: t.palette.primary,
    align: "center",
    baseline: "middle",
  },
];
centers.forEach((cx, i) => {
  const start = 0.6 + i * 0.7;
  nodes.push({
    id: `apple${i}`,
    type: "ellipse",
    x: cx - 35,
    y: 150,
    width: 70,
    height: 70,
    fill: apple,
    anchor: { x: 35, y: 35 },
    tracks: [
      {
        property: "opacity",
        keyframes: [
          { t: start, value: 0 },
          { t: start + 0.4, value: 1, easing: "easeOutQuad" },
        ],
      },
      {
        property: "scale",
        keyframes: [
          { t: start, value: 0.4 },
          { t: start + 0.5, value: 1, easing: "easeOutBack" },
        ],
      },
    ],
  });
});

const scene: SceneSpec = {
  specVersion: 1,
  width: 720,
  height: 300,
  fps: 30,
  duration: 6,
  background: t.palette.bg,
  nodes,
  narration: {
    segments: [
      { t: 0.2, text: "Let's count the apples together!" },
      { t: 3.2, text: "How many apples did we count?" },
    ],
  },
  interactions: interactionTrack(
    pausePrompt({ id: "predict", t: 2.6, prompt: "How many apples do you see so far? Make a prediction!" }),
    mcq({
      id: "count",
      t: 4.2,
      prompt: "How many apples are there in total?",
      choices: ["2", "3", "4"],
      answer: 1,
      feedback: ["Count again — there's one more!", "", "That's one too many."],
      explanation: "There are 3 apples.",
    }),
    trueFalse({ id: "more", t: 5.4, prompt: "True or false: 3 is more than 2.", answer: true, explanation: "Yes — 3 comes after 2." }),
  ),
};

const dir = join("out", "demo");
mkdirSync(dir, { recursive: true });
await encodeSceneToFile(scene, { outPath: join(dir, "lesson.mp4"), crf: 20, preset: "veryfast" });
writeFileSync(join(dir, "lesson.interactions.json"), toInteractionsJson(scene.interactions!));
copyFileSync(join("player", "showman-player.html"), join(dir, "showman-player.html"));
console.log("wrote out/demo/{lesson.mp4, lesson.interactions.json, showman-player.html}");
