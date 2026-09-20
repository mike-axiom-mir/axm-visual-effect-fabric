import assert from "node:assert/strict";
import { REQUEST_SCHEMA, compileRequest } from "../src/index.mjs";
import { RENDER_PLAN_SCHEMA, adaptPlanForRenderer } from "../src/renderer-adapter.mjs";

const mobileProfile = {
  id: "mobile-low",
  supportedKinds: ["particle-emitter", "trail", "beam", "decal", "procedural-lightning"],
  limits: {
    maxParticles: 6,
    maxTrailSamples: 5,
    maxBeamSegments: 4,
    maxLightningSegments: 6,
    maxLightningBranches: 2
  }
};

const emitter = compileRequest({
  schema: REQUEST_SCHEMA,
  id: "engine-smoke",
  kind: "particle-emitter",
  time: 0.2,
  duration: 2,
  seed: "renderer-adapter-test",
  anchor: { entity: "car-1", socket: "engine" },
  parameters: { rate: 10, particleLifetime: 1.4, speed: 1.1 }
});
const emitterBefore = structuredClone(emitter);
const adaptedEmitterA = adaptPlanForRenderer(emitter, mobileProfile);
const adaptedEmitterB = adaptPlanForRenderer(emitter, mobileProfile);
assert.equal(adaptedEmitterA.schema, RENDER_PLAN_SCHEMA);
assert.deepEqual(adaptedEmitterA, adaptedEmitterB);
assert.deepEqual(emitter, emitterBefore, "renderer adaptation must not rewrite canonical plan");
assert.equal(adaptedEmitterA.renderable, true);
assert.equal(adaptedEmitterA.payload.count, 6);
assert.equal(adaptedEmitterA.payload.particles.length, 6);
assert.equal(adaptedEmitterA.payload.truncated, true);
assert.equal(adaptedEmitterA.payload.particles[0].id, emitter.payload.particles[0].id);
assert.equal(adaptedEmitterA.payload.particles.at(-1).id, emitter.payload.particles.at(-1).id);
assert.equal(adaptedEmitterA.time, emitter.time);
assert.equal(adaptedEmitterA.duration, emitter.duration);
assert.equal(adaptedEmitterA.adaptation.timingPreserved, true);
assert.deepEqual(adaptedEmitterA.adaptation.reasons, [{ type: "particle-budget", from: 20, to: 6 }]);

const trail = compileRequest({
  schema: REQUEST_SCHEMA,
  id: "sword-trail",
  kind: "trail",
  duration: 0.45,
  anchor: { entity: "fighter", socket: "blade-base" },
  parameters: { samples: 18, width: 0.09, endAnchor: { entity: "fighter", socket: "blade-tip" } }
});
const adaptedTrail = adaptPlanForRenderer(trail, mobileProfile);
assert.equal(adaptedTrail.payload.samples, 5);
assert.deepEqual(adaptedTrail.adaptation.reasons, [{ type: "trail-sample-budget", from: 18, to: 5 }]);

const beam = compileRequest({
  schema: REQUEST_SCHEMA,
  id: "beam",
  kind: "beam",
  duration: 0.5,
  anchor: { entity: "caster", socket: "hand" },
  parameters: { target: { entity: "enemy", socket: "chest" }, segments: 12 }
});
const adaptedBeam = adaptPlanForRenderer(beam, mobileProfile);
assert.equal(adaptedBeam.payload.segments, 4);
assert.deepEqual(adaptedBeam.adaptation.reasons, [{ type: "beam-segment-budget", from: 12, to: 4 }]);

const lightning = compileRequest({
  schema: REQUEST_SCHEMA,
  id: "chain-lightning",
  kind: "procedural-lightning",
  duration: 0.2,
  seed: "lightning-render-profile",
  anchor: { entity: "caster", socket: "hand" },
  parameters: { target: { entity: "enemy", socket: "chest" }, segments: 16, branches: 5 }
});
const adaptedLightning = adaptPlanForRenderer(lightning, mobileProfile);
assert.equal(adaptedLightning.payload.branches, 2);
assert.equal(adaptedLightning.payload.points.length, 7);
assert.deepEqual(adaptedLightning.payload.points[0], lightning.payload.points[0]);
assert.deepEqual(adaptedLightning.payload.points.at(-1), lightning.payload.points.at(-1));
assert.deepEqual(adaptedLightning.adaptation.reasons, [
  { type: "lightning-branch-budget", from: 5, to: 2 },
  { type: "lightning-segment-budget", from: 16, to: 6 }
]);

const distortion = compileRequest({
  schema: REQUEST_SCHEMA,
  id: "impact-distortion",
  kind: "distortion-pulse",
  time: 0.4,
  duration: 0.15,
  anchor: { event: "hit" }
});
const suppressedDistortion = adaptPlanForRenderer(distortion, mobileProfile);
assert.equal(suppressedDistortion.renderable, false);
assert.equal(suppressedDistortion.payload, null);
assert.equal(suppressedDistortion.time, distortion.time);
assert.equal(suppressedDistortion.duration, distortion.duration);
assert.deepEqual(suppressedDistortion.adaptation.reasons, [{ type: "unsupported-kind", kind: "distortion-pulse" }]);

const decal = compileRequest({
  schema: REQUEST_SCHEMA,
  id: "impact-mark",
  kind: "decal",
  time: 0.4,
  duration: 4,
  anchor: { event: "hit" },
  parameters: { size: 0.6 }
});
const unchangedDecal = adaptPlanForRenderer(decal, mobileProfile);
assert.equal(unchangedDecal.renderable, true);
assert.equal(unchangedDecal.adaptation.degraded, false);
assert.deepEqual(unchangedDecal.payload, decal.payload);

const tampered = structuredClone(emitter);
tampered.payload.rate = 999;
assert.throws(() => adaptPlanForRenderer(tampered, mobileProfile), /plan receipt digest mismatch/);
assert.throws(() => adaptPlanForRenderer(emitter, { id: "bad", limits: { maxParticles: 0 } }), /positive integer/);
assert.throws(() => adaptPlanForRenderer(emitter, { id: "bad", supportedKinds: [""] }), /non-empty strings/);
assert.throws(() => adaptPlanForRenderer(emitter, null), /renderer profile must be an object/);

console.log("PASS renderer fallback adapter", adaptedEmitterA.receipt.sha256, adaptedLightning.receipt.sha256);
