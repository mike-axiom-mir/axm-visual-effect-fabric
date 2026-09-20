import { REQUEST_SCHEMA, compileRequest, samplePlanAt } from "../src/index.mjs";

const smoke = compileRequest({
  schema: REQUEST_SCHEMA,
  id: "engine-smoke-001",
  effectRef: "damaged-engine-smoke",
  kind: "particle-emitter",
  time: 0,
  duration: 3,
  seed: "wreck-42-engine-smoke",
  anchor: { entity: "wreck-42", socket: "engine" },
  parameters: {
    rate: 18,
    particleLifetime: 1.8,
    speed: 1.1,
    spread: 0.5,
    gravity: [0, 0.7, 0]
  },
  budget: { maxParticles: 64 }
});

console.log(JSON.stringify({
  plan: smoke,
  sampleAtOneSecond: samplePlanAt(smoke, 1)
}, null, 2));
