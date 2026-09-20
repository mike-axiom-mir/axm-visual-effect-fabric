import {
  PLAN_SCHEMA,
  RECEIPT_SCHEMA,
  digest,
  samplePlanAt,
  validateInterruption
} from "./index.mjs";

export const TIMING_CURVE_SET_SCHEMA = "axm.game-vfx-timing-curve-set/v1";
export const TIMING_CURVE_SAMPLE_SCHEMA = "axm.game-vfx-timing-curve-sample/v1";

export const TIMING_INTERPOLATIONS = Object.freeze([
  "linear",
  "step",
  "smoothstep"
]);

const KEY_EPSILON = 1e-12;

function finite(value, label) {
  if (!Number.isFinite(value)) throw new Error(label + " must be finite");
}

function nonEmptyString(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(label + " must be a non-empty string");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function planBody(plan) {
  const { receipt, ...body } = plan;
  return body;
}

function verifiedPlanHash(plan) {
  if (plan?.schema !== PLAN_SCHEMA) throw new Error("unsupported plan schema");
  if (plan.receipt?.schema !== RECEIPT_SCHEMA) throw new Error("plan receipt required for timing curve binding");
  const computed = digest(planBody(plan));
  if (plan.receipt.planSha256 !== computed) throw new Error("plan receipt digest mismatch");
  finite(plan.time, "plan.time");
  finite(plan.duration, "plan.duration");
  if (plan.duration <= 0) throw new Error("plan.duration must be > 0");
  return computed;
}

function normalizeCurve(channel, curve) {
  nonEmptyString(channel, "curve channel");
  if (!curve || typeof curve !== "object" || Array.isArray(curve)) {
    throw new Error(`curve ${channel} must be an object`);
  }
  const interpolation = curve.interpolation ?? "linear";
  if (!TIMING_INTERPOLATIONS.includes(interpolation)) {
    throw new Error(`curve ${channel} has unsupported interpolation: ${interpolation}`);
  }
  if (!Array.isArray(curve.keys) || curve.keys.length === 0) {
    throw new Error(`curve ${channel} requires at least one key`);
  }

  const keys = curve.keys.map((key, index) => {
    if (!key || typeof key !== "object" || Array.isArray(key)) {
      throw new Error(`curve ${channel} key ${index} must be an object`);
    }
    finite(key.t, `curve ${channel} key ${index}.t`);
    finite(key.value, `curve ${channel} key ${index}.value`);
    if (key.t < 0 || key.t > 1) {
      throw new Error(`curve ${channel} key ${index}.t must be within [0, 1]`);
    }
    return { t: key.t, value: key.value };
  });

  for (let index = 1; index < keys.length; index += 1) {
    if (keys[index].t <= keys[index - 1].t) {
      throw new Error(`curve ${channel} keys must use strictly increasing t values`);
    }
  }

  return { interpolation, keys };
}

function normalizedChannels(curves) {
  if (!curves || typeof curves !== "object" || Array.isArray(curves)) {
    throw new Error("curves must be an object keyed by channel name");
  }
  const names = Object.keys(curves).sort();
  if (names.length === 0) throw new Error("curves must define at least one channel");
  return Object.fromEntries(names.map(name => [name, normalizeCurve(name, curves[name])]));
}

export function createTimingCurveSet(plan, curves, { id = null } = {}) {
  const planSha256 = verifiedPlanHash(plan);
  const curveSetId = id ?? `${plan.id}:timing-curves`;
  nonEmptyString(curveSetId, "id");
  const channels = normalizedChannels(curves);
  const body = {
    schema: TIMING_CURVE_SET_SCHEMA,
    id: curveSetId,
    planId: plan.id,
    planSha256,
    duration: plan.duration,
    channels,
    authority: {
      mutatesCanonicalPlan: false,
      decidesGameplayTiming: false,
      provesVisualQuality: false
    }
  };
  return {
    ...body,
    receipt: {
      sha256: digest(body),
      deterministic: true
    }
  };
}

export function validateTimingCurveSet(plan, curveSet) {
  if (curveSet?.schema !== TIMING_CURVE_SET_SCHEMA) throw new Error("unsupported timing curve set schema");
  const planSha256 = verifiedPlanHash(plan);
  if (curveSet.planId !== plan.id) throw new Error("timing curve plan id mismatch");
  if (curveSet.planSha256 !== planSha256) throw new Error("timing curve plan digest mismatch");
  if (curveSet.duration !== plan.duration) throw new Error("timing curve duration mismatch");
  normalizedChannels(curveSet.channels);
  if (!curveSet.receipt || typeof curveSet.receipt.sha256 !== "string") {
    throw new Error("timing curve receipt required");
  }
  const { receipt, ...body } = curveSet;
  if (receipt.sha256 !== digest(body)) throw new Error("timing curve receipt mismatch");
  return true;
}

function interpolateCurve(curve, progress) {
  const keys = curve.keys;
  if (progress <= keys[0].t + KEY_EPSILON) return keys[0].value;
  const last = keys[keys.length - 1];
  if (progress >= last.t - KEY_EPSILON) return last.value;

  for (let index = 1; index < keys.length; index += 1) {
    const right = keys[index];
    if (progress > right.t + KEY_EPSILON) continue;
    const left = keys[index - 1];
    if (Math.abs(progress - right.t) <= KEY_EPSILON) return right.value;
    if (curve.interpolation === "step") return left.value;
    const raw = (progress - left.t) / (right.t - left.t);
    const alpha = curve.interpolation === "smoothstep"
      ? raw * raw * (3 - 2 * raw)
      : raw;
    return left.value + (right.value - left.value) * alpha;
  }

  return last.value;
}

export function sampleTimingCurveSetAt(plan, curveSet, absoluteTime) {
  validateTimingCurveSet(plan, curveSet);
  finite(absoluteTime, "absoluteTime");
  const localTime = absoluteTime - plan.time;
  const progress = clamp(localTime / plan.duration, 0, 1);
  const channels = Object.fromEntries(
    Object.entries(curveSet.channels).map(([name, curve]) => [name, interpolateCurve(curve, progress)])
  );
  return {
    schema: TIMING_CURVE_SAMPLE_SCHEMA,
    curveSetId: curveSet.id,
    curveSetSha256: curveSet.receipt.sha256,
    planId: plan.id,
    planSha256: curveSet.planSha256,
    absoluteTime,
    localTime,
    progress,
    withinWindow: localTime >= 0 && localTime <= plan.duration,
    channels
  };
}

export function samplePlanWithTiming(plan, curveSet, absoluteTime, interruption = null) {
  if (interruption) validateInterruption(plan, interruption);
  const runtime = samplePlanAt(plan, absoluteTime, interruption);
  const timing = sampleTimingCurveSetAt(plan, curveSet, absoluteTime);
  return {
    ...runtime,
    timing
  };
}
