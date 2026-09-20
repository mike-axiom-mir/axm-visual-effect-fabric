import { PLAN_SCHEMA, RECEIPT_SCHEMA, digest } from "./index.mjs";

export const RENDER_PLAN_SCHEMA = "axm.game-vfx-render-plan/v1";

function nonEmptyString(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(label + " must be a non-empty string");
}

function positiveIntegerOrNull(value, label) {
  if (value == null) return null;
  if (!Number.isInteger(value) || value < 1) throw new Error(label + " must be a positive integer when present");
  return value;
}

function verifiedPlanHash(plan) {
  if (plan?.schema !== PLAN_SCHEMA) throw new Error("unsupported plan schema");
  if (plan.receipt?.schema !== RECEIPT_SCHEMA) throw new Error("plan receipt required for renderer adaptation");
  const { receipt, ...body } = plan;
  const computed = digest(body);
  if (receipt.planSha256 !== computed) throw new Error("plan receipt digest mismatch");
  return computed;
}

function normalizedProfile(profile) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    throw new Error("renderer profile must be an object");
  }
  nonEmptyString(profile.id, "profile.id");
  const supportedKinds = profile.supportedKinds == null
    ? null
    : (() => {
        if (!Array.isArray(profile.supportedKinds) || profile.supportedKinds.some(kind => typeof kind !== "string" || !kind.trim())) {
          throw new Error("profile.supportedKinds must be an array of non-empty strings when present");
        }
        return [...new Set(profile.supportedKinds)];
      })();
  const limits = profile.limits ?? {};
  if (!limits || typeof limits !== "object" || Array.isArray(limits)) {
    throw new Error("profile.limits must be an object when present");
  }
  return {
    id: profile.id,
    supportedKinds,
    limits: {
      maxParticles: positiveIntegerOrNull(limits.maxParticles, "profile.limits.maxParticles"),
      maxTrailSamples: positiveIntegerOrNull(limits.maxTrailSamples, "profile.limits.maxTrailSamples"),
      maxBeamSegments: positiveIntegerOrNull(limits.maxBeamSegments, "profile.limits.maxBeamSegments"),
      maxLightningSegments: positiveIntegerOrNull(limits.maxLightningSegments, "profile.limits.maxLightningSegments"),
      maxLightningBranches: positiveIntegerOrNull(limits.maxLightningBranches, "profile.limits.maxLightningBranches")
    }
  };
}

function evenlySelect(items, limit) {
  if (limit == null || items.length <= limit) return structuredClone(items);
  if (limit === 1) return [structuredClone(items[0])];
  return Array.from({ length: limit }, (_, i) => {
    const index = Math.floor(i * (items.length - 1) / (limit - 1));
    return structuredClone(items[index]);
  });
}

function adaptPayload(plan, profile, reasons) {
  const payload = structuredClone(plan.payload);
  const { limits } = profile;

  switch (plan.kind) {
    case "particle-burst":
    case "particle-emitter": {
      const limit = limits.maxParticles;
      if (limit != null && Array.isArray(payload.particles) && payload.particles.length > limit) {
        payload.particles = evenlySelect(payload.particles, limit);
        payload.count = payload.particles.length;
        payload.truncated = true;
        reasons.push({ type: "particle-budget", from: plan.payload.particles.length, to: payload.particles.length });
      }
      return payload;
    }
    case "trail": {
      const limit = limits.maxTrailSamples;
      if (limit != null && Number.isFinite(payload.samples) && payload.samples > limit) {
        reasons.push({ type: "trail-sample-budget", from: payload.samples, to: limit });
        payload.samples = limit;
      }
      return payload;
    }
    case "beam": {
      const limit = limits.maxBeamSegments;
      if (limit != null && Number.isFinite(payload.segments) && payload.segments > limit) {
        reasons.push({ type: "beam-segment-budget", from: payload.segments, to: limit });
        payload.segments = limit;
      }
      return payload;
    }
    case "procedural-lightning": {
      const branchLimit = limits.maxLightningBranches;
      if (branchLimit != null && Number.isFinite(payload.branches) && payload.branches > branchLimit) {
        reasons.push({ type: "lightning-branch-budget", from: payload.branches, to: branchLimit });
        payload.branches = branchLimit;
      }
      const segmentLimit = limits.maxLightningSegments;
      if (segmentLimit != null && Array.isArray(payload.points)) {
        const sourceSegments = Math.max(0, payload.points.length - 1);
        if (sourceSegments > segmentLimit) {
          payload.points = evenlySelect(payload.points, segmentLimit + 1);
          reasons.push({ type: "lightning-segment-budget", from: sourceSegments, to: payload.points.length - 1 });
        }
      }
      return payload;
    }
    default:
      return payload;
  }
}

export function adaptPlanForRenderer(plan, profileInput) {
  const sourcePlanSha256 = verifiedPlanHash(plan);
  const profile = normalizedProfile(profileInput);
  const supported = profile.supportedKinds == null || profile.supportedKinds.includes(plan.kind);
  const reasons = [];

  let renderable = true;
  let payload = null;
  if (!supported) {
    renderable = false;
    reasons.push({ type: "unsupported-kind", kind: plan.kind });
  } else {
    payload = adaptPayload(plan, profile, reasons);
  }

  const body = {
    schema: RENDER_PLAN_SCHEMA,
    profileId: profile.id,
    sourcePlanId: plan.id,
    sourcePlanSha256,
    kind: plan.kind,
    time: plan.time,
    duration: plan.duration,
    anchor: structuredClone(plan.anchor),
    sourceEvidence: structuredClone(plan.sourceEvidence ?? null),
    renderable,
    payload,
    adaptation: {
      degraded: reasons.length > 0,
      reasons,
      timingPreserved: true,
      semanticPolicy: plan.fallback?.policy ?? null,
      sourceRendererBinding: plan.rendererBinding ?? "unbound"
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
