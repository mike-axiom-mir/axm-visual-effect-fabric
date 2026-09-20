import assert from "node:assert/strict";
import {
  REQUEST_SCHEMA,
  compileRequest,
  digest
} from "../src/index.mjs";
import {
  ANIMATION_TIME_TRANSFORM_SCHEMA,
  RETIMED_VFX_REQUEST_SCHEMA,
  deriveRetimedVfxRequest,
  validateAnimationTimeTransform,
  validateRetimedVfxRequest
} from "../src/action-retime.mjs";
import {
  createTimingCurveSet,
  sampleTimingCurveSetAt
} from "../src/timing-curves.mjs";

function makeTransform() {
  const body = {
    schema: ANIMATION_TIME_TRANSFORM_SCHEMA,
    sourceClip: "arc-slash",
    sourceSha256: "source-clip-sha256",
    outputClip: "arc-slash-fast",
    outputSha256: "output-clip-sha256",
    sourceDuration: 0.9,
    outputDuration: 0.45,
    rate: 2,
    timeScale: 0.5
  };
  return {
    ...body,
    receipt: {
      sha256: digest(body),
      deterministic: true
    }
  };
}

function near(actual, expected, epsilon = 1e-12) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
}

const sourceRequest = {
  schema: REQUEST_SCHEMA,
  id: "arc-slash:slash-sparks",
  effectRef: "slash-sparks",
  kind: "particle-emitter",
  time: 0.29,
  duration: 0.6,
  anchor: { event: "weapon-contact" },
  parameters: {
    rate: 14,
    speed: 3.2,
    particleLifetime: 0.45
  },
  rendererBinding: "unbound"
};

const transform = makeTransform();
assert.equal(validateAnimationTimeTransform(transform), true);

const sourceSnapshot = structuredClone(sourceRequest);
const scaled = deriveRetimedVfxRequest(sourceRequest, transform, {
  id: "arc-slash-fast:slash-sparks",
  durationPolicy: "scale"
});
assert.equal(scaled.schema, RETIMED_VFX_REQUEST_SCHEMA);
near(scaled.request.time, 0.145);
near(scaled.request.duration, 0.3);
near(scaled.timing.sourceTime, 0.29);
near(scaled.timing.outputTime, 0.145);
near(scaled.timing.sourceDuration, 0.6);
near(scaled.timing.outputDuration, 0.3);
assert.equal(scaled.policy.duration, "scale");
assert.equal(scaled.authority.animationTimingOwner, false);
assert.equal(scaled.authority.gameplayTimingOwner, false);
assert.deepEqual(sourceRequest, sourceSnapshot);
assert.equal(validateRetimedVfxRequest(scaled, { sourceRequest }), true);

const scaledPlan = compileRequest(scaled.request);
near(scaledPlan.time, 0.145);
near(scaledPlan.duration, 0.3);
assert.equal(scaledPlan.receipt.planSha256, scaled.derivedPlanSha256);

const envelope = createTimingCurveSet(scaledPlan, {
  intensity: {
    interpolation: "linear",
    keys: [
      { t: 0, value: 0 },
      { t: 0.25, value: 1 },
      { t: 1, value: 0 }
    ]
  }
}, { id: "arc-slash-fast:slash-sparks:timing" });
const quarter = sampleTimingCurveSetAt(
  scaledPlan,
  envelope,
  scaledPlan.time + scaledPlan.duration * 0.25
);
near(quarter.progress, 0.25);
near(quarter.channels.intensity, 1);

const preserved = deriveRetimedVfxRequest(sourceRequest, transform, {
  id: "arc-slash-fast:slash-sparks-preserved",
  durationPolicy: "preserve"
});
near(preserved.request.time, 0.145);
near(preserved.request.duration, 0.6);
near(preserved.timing.outputDuration, 0.6);
assert.equal(validateRetimedVfxRequest(preserved, { sourceRequest }), true);

const scaledReplay = deriveRetimedVfxRequest(sourceRequest, transform, {
  id: "arc-slash-fast:slash-sparks",
  durationPolicy: "scale"
});
assert.deepEqual(scaledReplay, scaled);

const defaultDurationRequest = {
  schema: REQUEST_SCHEMA,
  id: "arc-slash:weapon-trail",
  kind: "trail",
  time: 0.2,
  anchor: { event: "weapon" },
  parameters: { width: 0.16, samples: 10 }
};
const defaultScaled = deriveRetimedVfxRequest(defaultDurationRequest, transform, {
  id: "arc-slash-fast:weapon-trail"
});
near(compileRequest(defaultDurationRequest).duration, 0.3);
near(defaultScaled.request.duration, 0.15);
near(defaultScaled.request.time, 0.1);
assert.equal(validateRetimedVfxRequest(defaultScaled, { sourceRequest: defaultDurationRequest }), true);

const tamperedTransform = structuredClone(transform);
tamperedTransform.outputDuration = 0.5;
assert.throws(
  () => validateAnimationTimeTransform(tamperedTransform),
  /duration mismatch|receipt mismatch/
);

const badRateTransform = makeTransform();
badRateTransform.timeScale = 0.4;
const badRateBody = {
  schema: badRateTransform.schema,
  sourceClip: badRateTransform.sourceClip,
  sourceSha256: badRateTransform.sourceSha256,
  outputClip: badRateTransform.outputClip,
  outputSha256: badRateTransform.outputSha256,
  sourceDuration: badRateTransform.sourceDuration,
  outputDuration: badRateTransform.outputDuration,
  rate: badRateTransform.rate,
  timeScale: badRateTransform.timeScale
};
badRateTransform.receipt.sha256 = digest(badRateBody);
assert.throws(() => validateAnimationTimeTransform(badRateTransform), /rate\/scale mismatch/);

assert.throws(
  () => deriveRetimedVfxRequest(sourceRequest, transform, {
    id: sourceRequest.id,
    durationPolicy: "scale"
  }),
  /must differ/
);
assert.throws(
  () => deriveRetimedVfxRequest(sourceRequest, transform, {
    id: "arc-slash-fast:bad-policy",
    durationPolicy: "guess"
  }),
  /durationPolicy/
);

const outsideActionRequest = {
  ...sourceRequest,
  id: "late-effect",
  time: 0.91
};
assert.throws(
  () => deriveRetimedVfxRequest(outsideActionRequest, transform, { id: "late-effect-fast" }),
  /exceeds animation transform source duration/
);

const tamperedArtifact = structuredClone(scaled);
tamperedArtifact.request.time = 0.16;
assert.throws(
  () => validateRetimedVfxRequest(tamperedArtifact, { sourceRequest }),
  /derived request hash mismatch|receipt mismatch|output time/
);

const modifiedSource = structuredClone(sourceRequest);
modifiedSource.parameters.rate = 15;
assert.throws(
  () => validateRetimedVfxRequest(scaled, { sourceRequest: modifiedSource }),
  /source request hash mismatch/
);

console.log("action retime vfx tests: ok");
