import assert from "node:assert/strict";
import { REQUEST_SCHEMA, compileRequest, compileBatch, samplePlanAt } from "../src/index.mjs";

const burst = {
  schema: REQUEST_SCHEMA,
  id: "test-burst",
  kind: "particle-burst",
  time: 0.25,
  duration: 0.5,
  seed: "same-seed",
  anchor: { event: "hit" },
  parameters: { count: 12, speed: 4, spread: 0.7 }
};

const a = compileRequest(burst);
const b = compileRequest(burst);
assert.equal(a.receipt.planSha256, b.receipt.planSha256);
assert.deepEqual(a.payload.particles, b.payload.particles);
assert.equal(a.payload.count, 12);

const burstSampleA = samplePlanAt(a, 0.5);
const burstSampleB = samplePlanAt(b, 0.5);
assert.deepEqual(burstSampleA, burstSampleB);
assert.ok(burstSampleA.activeCount > 0);
assert.ok(burstSampleA.particles.every(p => p.opacity >= 0 && p.opacity <= 1));

const emitter = compileRequest({
  schema: REQUEST_SCHEMA,
  id: "smoke-emitter",
  kind: "particle-emitter",
  duration: 2,
  seed: "smoke-seed",
  anchor: { entity: "wreck", socket: "engine" },
  parameters: { rate: 20, particleLifetime: 1.5, speed: 1.2, gravity: [0, 0.6, 0] },
  budget: { maxParticles: 25 }
});
assert.equal(emitter.payload.requestedCount, 40);
assert.equal(emitter.payload.count, 25);
assert.equal(emitter.payload.truncated, true);
const emitterSample = samplePlanAt(emitter, 0.75);
assert.ok(emitterSample.active);
assert.ok(emitterSample.activeCount > 0 && emitterSample.activeCount <= 25);

const lightning = compileRequest({
  schema: REQUEST_SCHEMA,
  id: "arc",
  kind: "procedural-lightning",
  anchor: { entity: "caster", socket: "hand" },
  parameters: { target: { entity: "enemy", socket: "chest" }, segments: 10 }
});
assert.equal(lightning.payload.points.length, 11);

const ordered = compileBatch([
  { schema: REQUEST_SCHEMA, id: "b", kind: "decal", time: 0.4, anchor: { event: "hit" } },
  { schema: REQUEST_SCHEMA, id: "a", kind: "distortion-pulse", time: 0.2, anchor: { event: "hit" } }
]);
assert.deepEqual(ordered.map(x => x.id), ["a", "b"]);
assert.equal(samplePlanAt(ordered[0], 0.28).active, true);
assert.ok(samplePlanAt(ordered[0], 0.28).intensity > 0);

assert.throws(() => compileRequest({ schema: REQUEST_SCHEMA, id: "bad", kind: "unknown", anchor: {} }));
assert.throws(() => compileRequest({ schema: REQUEST_SCHEMA, id: "beam", kind: "beam", anchor: {} }));
assert.throws(() => compileRequest({ ...burst, id: "bad-gravity", parameters: { ...burst.parameters, gravity: [0, 1] } }));

console.log("PASS visual-effect game runtime", a.receipt.planSha256);
