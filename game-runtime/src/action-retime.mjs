import {
  REQUEST_SCHEMA,
  compileRequest,
  digest,
  validateRequest
} from "./index.mjs";

export const ANIMATION_TIME_TRANSFORM_SCHEMA = "axm.animation-time-transform/v1";
export const RETIMED_VFX_REQUEST_SCHEMA = "axm.game-vfx-retimed-request/v1";
export const DURATION_POLICIES = Object.freeze(["scale", "preserve"]);

const NUMERIC_EPSILON = Number.EPSILON * 32;

function finite(value, label) {
  if (!Number.isFinite(value)) throw new Error(label + " must be finite");
}

function nonEmptyString(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(label + " must be a non-empty string");
}

function closeEnough(actual, expected) {
  const scale = Math.max(1, Math.abs(actual), Math.abs(expected));
  return Math.abs(actual - expected) <= NUMERIC_EPSILON * scale;
}

function animationTransformBody(transform) {
  return {
    schema: transform.schema,
    sourceClip: transform.sourceClip,
    sourceSha256: transform.sourceSha256,
    outputClip: transform.outputClip,
    outputSha256: transform.outputSha256,
    sourceDuration: transform.sourceDuration,
    outputDuration: transform.outputDuration,
    rate: transform.rate,
    timeScale: transform.timeScale
  };
}

export function validateAnimationTimeTransform(transform) {
  if (!transform || typeof transform !== "object" || Array.isArray(transform)) {
    throw new Error("animation time transform required");
  }
  if (transform.schema !== ANIMATION_TIME_TRANSFORM_SCHEMA) {
    throw new Error("unsupported animation time transform schema");
  }

  nonEmptyString(transform.sourceClip, "animation transform sourceClip");
  nonEmptyString(transform.sourceSha256, "animation transform sourceSha256");
  nonEmptyString(transform.outputClip, "animation transform outputClip");
  nonEmptyString(transform.outputSha256, "animation transform outputSha256");
  finite(transform.sourceDuration, "animation transform sourceDuration");
  finite(transform.outputDuration, "animation transform outputDuration");
  finite(transform.rate, "animation transform rate");
  finite(transform.timeScale, "animation transform timeScale");

  if (transform.sourceDuration <= 0 || transform.outputDuration <= 0) {
    throw new Error("animation transform durations must be > 0");
  }
  if (transform.rate <= 0 || transform.timeScale <= 0) {
    throw new Error("animation transform rate and timeScale must be > 0");
  }
  if (!closeEnough(transform.timeScale, 1 / transform.rate)) {
    throw new Error("animation transform rate/scale mismatch");
  }
  if (!closeEnough(transform.outputDuration, transform.sourceDuration * transform.timeScale)) {
    throw new Error("animation transform duration mismatch");
  }
  if (!transform.receipt || typeof transform.receipt.sha256 !== "string") {
    throw new Error("animation transform receipt required");
  }
  if (digest(animationTransformBody(transform)) !== transform.receipt.sha256) {
    throw new Error("animation transform receipt mismatch");
  }
  return true;
}

function expectedDuration(sourceDuration, transform, durationPolicy) {
  return durationPolicy === "scale"
    ? sourceDuration * transform.timeScale
    : sourceDuration;
}

export function deriveRetimedVfxRequest(request, animationTransform, {
  id,
  durationPolicy = "scale"
} = {}) {
  validateRequest(request);
  validateAnimationTimeTransform(animationTransform);
  nonEmptyString(id, "derived request id");
  if (id === request.id) throw new Error("derived request id must differ from source request id");
  if (!DURATION_POLICIES.includes(durationPolicy)) {
    throw new Error("durationPolicy must be scale or preserve");
  }

  const sourceTime = request.time ?? 0;
  if (sourceTime > animationTransform.sourceDuration && !closeEnough(sourceTime, animationTransform.sourceDuration)) {
    throw new Error("source request time exceeds animation transform source duration");
  }

  const sourcePlan = compileRequest(request);
  const derived = structuredClone(request);
  derived.schema = REQUEST_SCHEMA;
  derived.id = id;
  derived.time = sourceTime * animationTransform.timeScale;
  derived.duration = expectedDuration(sourcePlan.duration, animationTransform, durationPolicy);
  validateRequest(derived);

  const derivedPlan = compileRequest(derived);
  const body = {
    schema: RETIMED_VFX_REQUEST_SCHEMA,
    sourceRequestId: request.id,
    sourceRequestSha256: digest(request),
    sourcePlanSha256: sourcePlan.receipt.planSha256,
    derivedRequestId: derived.id,
    derivedRequestSha256: digest(derived),
    derivedPlanSha256: derivedPlan.receipt.planSha256,
    animationTransform: structuredClone(animationTransform),
    policy: {
      onset: "scale-with-action",
      duration: durationPolicy
    },
    timing: {
      sourceTime,
      outputTime: derived.time,
      sourceDuration: sourcePlan.duration,
      outputDuration: derivedPlan.duration
    },
    request: derived,
    authority: {
      consumesExternalAnimationTimingEvidence: true,
      animationTimingOwner: false,
      gameplayTimingOwner: false,
      mutatesSourceRequest: false,
      provesVisualQuality: false
    }
  };

  return {
    ...body,
    receipt: {
      sha256: digest(body),
      deterministic: true,
      sourceRequestBound: true,
      animationTransformBound: true,
      derivedRequestBound: true
    }
  };
}

export function validateRetimedVfxRequest(artifact, { sourceRequest = null } = {}) {
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
    throw new Error("retimed VFX request artifact required");
  }
  if (artifact.schema !== RETIMED_VFX_REQUEST_SCHEMA) {
    throw new Error("unsupported retimed VFX request schema");
  }
  validateAnimationTimeTransform(artifact.animationTransform);
  validateRequest(artifact.request);
  nonEmptyString(artifact.sourceRequestId, "sourceRequestId");
  nonEmptyString(artifact.sourceRequestSha256, "sourceRequestSha256");
  nonEmptyString(artifact.sourcePlanSha256, "sourcePlanSha256");
  nonEmptyString(artifact.derivedRequestId, "derivedRequestId");
  nonEmptyString(artifact.derivedRequestSha256, "derivedRequestSha256");
  nonEmptyString(artifact.derivedPlanSha256, "derivedPlanSha256");

  if (!DURATION_POLICIES.includes(artifact.policy?.duration)) {
    throw new Error("retimed VFX duration policy invalid");
  }
  if (artifact.policy?.onset !== "scale-with-action") {
    throw new Error("retimed VFX onset policy invalid");
  }
  if (artifact.derivedRequestId !== artifact.request.id) {
    throw new Error("derived request id mismatch");
  }
  if (artifact.derivedRequestSha256 !== digest(artifact.request)) {
    throw new Error("derived request hash mismatch");
  }

  const derivedPlan = compileRequest(artifact.request);
  if (artifact.derivedPlanSha256 !== derivedPlan.receipt.planSha256) {
    throw new Error("derived plan hash mismatch");
  }

  finite(artifact.timing?.sourceTime, "timing.sourceTime");
  finite(artifact.timing?.outputTime, "timing.outputTime");
  finite(artifact.timing?.sourceDuration, "timing.sourceDuration");
  finite(artifact.timing?.outputDuration, "timing.outputDuration");
  if (artifact.timing.sourceTime < 0) throw new Error("timing.sourceTime cannot be negative");
  if (artifact.timing.sourceDuration <= 0 || artifact.timing.outputDuration <= 0) {
    throw new Error("retimed VFX timing durations must be > 0");
  }
  if (!closeEnough(
    artifact.timing.outputTime,
    artifact.timing.sourceTime * artifact.animationTransform.timeScale
  )) {
    throw new Error("retimed VFX output time mismatch");
  }
  if (!closeEnough(artifact.request.time ?? 0, artifact.timing.outputTime)) {
    throw new Error("derived request time does not match timing receipt");
  }
  const expectedOutputDuration = expectedDuration(
    artifact.timing.sourceDuration,
    artifact.animationTransform,
    artifact.policy.duration
  );
  if (!closeEnough(artifact.timing.outputDuration, expectedOutputDuration)) {
    throw new Error("retimed VFX output duration mismatch");
  }
  if (!closeEnough(derivedPlan.duration, artifact.timing.outputDuration)) {
    throw new Error("derived plan duration does not match timing receipt");
  }

  if (!artifact.receipt || typeof artifact.receipt.sha256 !== "string") {
    throw new Error("retimed VFX receipt required");
  }
  const { receipt, ...body } = artifact;
  if (digest(body) !== receipt.sha256) throw new Error("retimed VFX receipt mismatch");

  if (sourceRequest != null) {
    validateRequest(sourceRequest);
    if (sourceRequest.id !== artifact.sourceRequestId) throw new Error("source request id mismatch");
    if (digest(sourceRequest) !== artifact.sourceRequestSha256) throw new Error("source request hash mismatch");
    const sourcePlan = compileRequest(sourceRequest);
    if (sourcePlan.receipt.planSha256 !== artifact.sourcePlanSha256) {
      throw new Error("source plan hash mismatch");
    }
    if (!closeEnough(sourceRequest.time ?? 0, artifact.timing.sourceTime)) {
      throw new Error("source request time mismatch");
    }
    if (!closeEnough(sourcePlan.duration, artifact.timing.sourceDuration)) {
      throw new Error("source plan duration mismatch");
    }
  }

  return true;
}
