import assert from "node:assert/strict";
import {
  REQUEST_SCHEMA,
  INTERRUPTION_SCHEMA,
  compileRequest,
  compileBatch,
  createInterruption,
  validateInterruption,
  samplePlanAt
} from "../src/index.mjs";

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

const emitterInterruptionA = createInterruption(emitter, 0.55, "ability-cancel");
const emitterInterruptionB = createInterruption(emitter, 0.55, "ability-cancel");
assert.equal(emitterInterruptionA.schema, INTERRUPTION_SCHEMA);
assert.deepEqual(emitterInterruptionA, emitterInterruptionB);
assert.equal(validateInterruption(emitter, emitterInterruptionA), true);
const interruptedEmitterSample = samplePlanAt(emitter, 0.75, emitterInterruptionA);
const allowedParticleIds = new Set(
  emitter.payload.particles
    .filter(particle => particle.spawnTime < emitterInterruptionA.localTime)
    .map(particle => particle.id)
);
assert.ok(interruptedEmitterSample.interrupted);
assert.equal(interruptedEmitterSample.interruptionPolicy, "stop-future-spawns-preserve-existing");
assert.ok(interruptedEmitterSample.activeCount < emitterSample.activeCount);
assert.ok(interruptedEmitterSample.particles.every(particle => allowedParticleIds.has(particle.id)));
assert.ok(samplePlanAt(emitter, 1.0, emitterInterruptionA).activeCount > 0, "spawned particles may finish naturally after interruption");

const immediateEmitterStop = createInterruption(emitter, emitter.time, "cancel-before-first-emission");
const immediateEmitterSample = samplePlanAt(emitter, emitter.time, immediateEmitterStop);
assert.equal(immediateEmitterSample.active, false);
assert.equal(immediateEmitterSample.activeCount, 0);

const lightning = compileRequest({
  schema: REQUEST_SCHEMA,
  id: "arc",
  kind: "procedural-lightning",
  anchor: { entity: "caster", socket: "hand" },
  parameters: { target: { entity: "enemy", socket: "chest" }, segments: 10 }
});
assert.equal(lightning.payload.points.length, 11);

const beam = compileRequest({
  schema: REQUEST_SCHEMA,
  id: "charge-beam",
  kind: "beam",
  time: 0.1,
  duration: 1,
  anchor: { entity: "caster", socket: "hand" },
  parameters: { target: { entity: "enemy", socket: "chest" } }
});
const beamInterruption = createInterruption(beam, 0.4, "ability-cancel");
assert.equal(samplePlanAt(beam, 0.39, beamInterruption).active, true);
assert.equal(samplePlanAt(beam, 0.4, beamInterruption).active, false);
assert.equal(samplePlanAt(beam, 0.8, beamInterruption).intensity, 0);

const decal = compileRequest({
  schema: REQUEST_SCHEMA,
  id: "impact-decal",
  kind: "decal",
  time: 0.1,
  duration: 2,
  anchor: { event: "confirmed-hit" }
});
const decalInterruption = createInterruption(decal, 0.4, "ability-cancel");
const decalAfterCancel = samplePlanAt(decal, 1, decalInterruption);
assert.equal(decalAfterCancel.active, true);
assert.equal(decalAfterCancel.interruptionPolicy, "preserve-persistent");

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
assert.throws(() => createInterruption(emitter, -0.1, "ability-cancel"));
assert.throws(() => createInterruption(emitter, 0.5, ""));
assert.throws(() => createInterruption({ ...emitter, payload: { ...emitter.payload, rate: 99 } }, 0.5, "tampered-plan"));
assert.throws(() => samplePlanAt(emitter, 0.75, { ...emitterInterruptionA, reason: "tampered" }));

console.log("PASS visual-effect game runtime", a.receipt.planSha256, emitterInterruptionA.sha256);
