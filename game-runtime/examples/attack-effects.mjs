import { REQUEST_SCHEMA, compileBatch } from "../src/index.mjs";

const requests = [
  {
    schema: REQUEST_SCHEMA,
    id: "dash-trail-001",
    effectRef: "dash-trail",
    kind: "trail",
    time: 0.18,
    duration: 0.28,
    seed: "dash-strike",
    anchor: { entity: "player", socket: "weapon-tip" },
    parameters: { width: 0.16, samples: 16 }
  },
  {
    schema: REQUEST_SCHEMA,
    id: "impact-sparks-001",
    effectRef: "impact-sparks",
    kind: "particle-burst",
    time: 0.22,
    duration: 0.5,
    seed: "dash-strike-impact",
    anchor: { event: "blade-hit" },
    parameters: { count: 64, speed: 7, spread: 0.8 }
  },
  {
    schema: REQUEST_SCHEMA,
    id: "impact-distortion-001",
    effectRef: "impact-distortion",
    kind: "distortion-pulse",
    time: 0.22,
    duration: 0.16,
    anchor: { event: "blade-hit" },
    parameters: { radius: 0.75, strength: 0.32 }
  },
  {
    schema: REQUEST_SCHEMA,
    id: "impact-mark-001",
    effectRef: "impact-mark",
    kind: "decal",
    time: 0.22,
    duration: 6,
    anchor: { event: "blade-hit" },
    parameters: { size: 0.45, material: "slash-mark" }
  }
];

console.log(JSON.stringify(compileBatch(requests), null, 2));
