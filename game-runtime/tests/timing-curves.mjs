import assert from "node:assert/strict";
import {
  REQUEST_SCHEMA,
  compileRequest,
  createInterruption
} from "../src/index.mjs";
import {
  TIMING_CURVE_SET_SCHEMA,
  TIMING_CURVE_SAMPLE_SCHEMA,
  createTimingCurveSet,
  validateTimingCurveSet,
  sampleTimingCurveSetAt,
  samplePlanWithTiming
} from "../src/timing-curves.mjs";

const slash = compileRequest({
  schema: REQUEST_SCHEMA,
  id: "arc-slash-trail",
  kind: "trail",
  time: 0.2,
  duration: 0.8,
  anchor: { entity: "player", socket: "blade-tip" },
  parameters: { width: 0.18, samples: 18 }
});

const authoredCurves = {
  emissive: {
    interpolation: "linear",
    keys: [
      { t: 0, value: 0.2 },
      { t: 0.25, value: 1.6 },
      { t: 1, value: 0 }
    ]
  },
  intensity: {
    interpolation: "smoothstep",
    keys: [
      { t: 0, value: 0 },
      { t: 0.25, value: 1 },
      { t: 0.75, value: 1 },
      { t: 1, value: 0 }
    ]
  },
  widthScale: {
    interpolation: "step",
    keys: [
      { t: 0, value: 0.5 },
      { t: 0.5, value: 1 },
      { t: 1, value: 0.25 }
    ]
  }
};

const timingA = createTimingCurveSet(slash, authoredCurves, { id: "arc-slash-trail:attack-envelope" });
const timingB = createTimingCurveSet(slash, authoredCurves, { id: "arc-slash-trail:attack-envelope" });
assert.equal(timingA.schema, TIMING_CURVE_SET_SCHEMA);
assert.deepEqual(timingA, timingB, "same plan and authored curves must replay identically");
assert.equal(validateTimingCurveSet(slash, timingA), true);
assert.deepEqual(Object.keys(timingA.channels), ["emissive", "intensity", "widthScale"]);

const beforeStart = sampleTimingCurveSetAt(slash, timingA, 0.1);
assert.equal(beforeStart.schema, TIMING_CURVE_SAMPLE_SCHEMA);
assert.equal(beforeStart.withinWindow, false);
assert.equal(beforeStart.progress, 0);
assert.equal(beforeStart.channels.intensity, 0);
assert.equal(beforeStart.channels.widthScale, 0.5);

const quarter = sampleTimingCurveSetAt(slash, timingA, 0.4);
assert.equal(quarter.progress, 0.25);
assert.equal(quarter.channels.intensity, 1);
assert.equal(quarter.channels.emissive, 1.6);
assert.equal(quarter.channels.widthScale, 0.5, "step interpolation holds left value until next key");

const halfway = sampleTimingCurveSetAt(slash, timingA, 0.6);
assert.equal(halfway.progress, 0.5);
assert.equal(halfway.channels.intensity, 1);
assert.equal(halfway.channels.widthScale, 1, "exact step key resolves to authored right-hand value");
assert.ok(Math.abs(halfway.channels.emissive - (1.6 + (0 - 1.6) * (0.25 / 0.75))) < 1e-12);

const late = sampleTimingCurveSetAt(slash, timingA, 0.9);
assert.ok(late.channels.intensity > 0 && late.channels.intensity < 1);
assert.equal(late.channels.widthScale, 1);

const end = sampleTimingCurveSetAt(slash, timingA, 1.0);
assert.equal(end.progress, 1);
assert.equal(end.channels.intensity, 0);
assert.equal(end.channels.emissive, 0);
assert.equal(end.channels.widthScale, 0.25);

const combined = samplePlanWithTiming(slash, timingA, 0.4);
assert.equal(combined.active, true);
assert.equal(combined.timing.curveSetSha256, timingA.receipt.sha256);
assert.equal(combined.timing.channels.intensity, 1);

const interrupted = createInterruption(slash, 0.55, "ability-cancel");
const combinedAfterCancel = samplePlanWithTiming(slash, timingA, 0.6, interrupted);
assert.equal(combinedAfterCancel.active, false, "existing VFX interruption semantics remain authoritative");
assert.equal(combinedAfterCancel.interrupted, true);
assert.equal(combinedAfterCancel.timing.progress, 0.5, "timing sampling remains explicit even when runtime activity is stopped");

const tamperedCurveSet = structuredClone(timingA);
tamperedCurveSet.channels.intensity.keys[1].value = 9;
assert.throws(() => validateTimingCurveSet(slash, tamperedCurveSet), /receipt mismatch/);

const tamperedPlan = structuredClone(slash);
tamperedPlan.duration = 99;
assert.throws(() => createTimingCurveSet(tamperedPlan, authoredCurves), /plan receipt digest mismatch/);

assert.throws(() => createTimingCurveSet(slash, {}), /at least one channel/);
assert.throws(() => createTimingCurveSet(slash, {
  bad: { interpolation: "bezier", keys: [{ t: 0, value: 0 }] }
}), /unsupported interpolation/);
assert.throws(() => createTimingCurveSet(slash, {
  bad: { keys: [{ t: 0.5, value: 0 }, { t: 0.5, value: 1 }] }
}), /strictly increasing/);
assert.throws(() => createTimingCurveSet(slash, {
  bad: { keys: [{ t: -0.1, value: 0 }] }
}), /within \[0, 1\]/);
assert.throws(() => createTimingCurveSet(slash, {
  bad: { keys: [{ t: 0.5, value: Number.NaN }] }
}), /must be finite/);

console.log("PASS VFX timing curves", timingA.receipt.sha256);
