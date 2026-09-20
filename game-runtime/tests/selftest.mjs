import assert from "node:assert/strict";
import { REQUEST_SCHEMA, compileRequest, compileBatch } from "../src/index.mjs";

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

assert.throws(() => compileRequest({ schema: REQUEST_SCHEMA, id: "bad", kind: "unknown", anchor: {} }));
assert.throws(() => compileRequest({ schema: REQUEST_SCHEMA, id: "beam", kind: "beam", anchor: {} }));

console.log("PASS visual-effect game runtime", a.receipt.planSha256);
