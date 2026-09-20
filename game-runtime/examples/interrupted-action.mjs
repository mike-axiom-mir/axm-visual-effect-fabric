import {
  REQUEST_SCHEMA,
  compileRequest,
  createInterruption,
  samplePlanAt
} from "../src/index.mjs";

const chargeSmoke = compileRequest({
  schema: REQUEST_SCHEMA,
  id: "charged-attack-smoke",
  kind: "particle-emitter",
  duration: 1.2,
  seed: "charged-attack-smoke-v1",
  anchor: { entity: "player", socket: "weapon" },
  parameters: {
    rate: 18,
    particleLifetime: 0.8,
    speed: 1.1,
    gravity: [0, 0.45, 0]
  }
});

// Ability Fabric owns whether this cancel is legal. VFX only consumes the supplied time.
const interruption = createInterruption(chargeSmoke, 0.45, "ability-cancel");
const samples = [0.3, 0.45, 0.7, 1.4].map(time => samplePlanAt(chargeSmoke, time, interruption));

console.log(JSON.stringify({
  planId: chargeSmoke.id,
  interruption,
  samples: samples.map(sample => ({
    time: sample.absoluteTime,
    interrupted: sample.interrupted,
    active: sample.active,
    activeCount: sample.activeCount,
    particleIds: sample.particles.map(particle => particle.id)
  }))
}, null, 2));
