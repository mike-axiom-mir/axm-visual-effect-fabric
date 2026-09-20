import { createHash } from "node:crypto";

export const REQUEST_SCHEMA = "axm.game-vfx-request/v1";
export const PLAN_SCHEMA = "axm.game-vfx-plan/v1";
export const RECEIPT_SCHEMA = "axm.game-vfx-receipt/v1";

export const EFFECT_KINDS = Object.freeze([
  "particle-burst",
  "trail",
  "beam",
  "decal",
  "distortion-pulse",
  "procedural-lightning"
]);

function stable(value) {
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  if (value && typeof value === "object") {
    return "{" + Object.keys(value).sort().map(k => JSON.stringify(k) + ":" + stable(value[k])).join(",") + "}";
  }
  return JSON.stringify(value);
}

export function digest(value) {
  return createHash("sha256").update(stable(value)).digest("hex");
}

function finite(value, label) {
  if (!Number.isFinite(value)) throw new Error(label + " must be finite");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function seeded(seedText) {
  let x = 2166136261;
  for (const ch of String(seedText)) {
    x ^= ch.charCodeAt(0);
    x = Math.imul(x, 16777619);
  }
  x >>>= 0;
  return () => {
    x += 0x6D2B79F5;
    let t = x;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function validateRequest(request) {
  if (request?.schema !== REQUEST_SCHEMA) throw new Error("unsupported request schema");
  if (!request.id) throw new Error("request.id required");
  if (!EFFECT_KINDS.includes(request.kind)) throw new Error("unsupported effect kind: " + request.kind);
  finite(request.time ?? 0, "request.time");
  if ((request.time ?? 0) < 0) throw new Error("request.time cannot be negative");
  const duration = request.duration ?? 0.25;
  finite(duration, "request.duration");
  if (duration <= 0) throw new Error("request.duration must be > 0");
  if (!request.anchor) throw new Error("request.anchor required");
  return true;
}

function familyDefaults(kind) {
  switch (kind) {
    case "particle-burst":
      return { lifetime: 0.55, count: 48, spread: 1, speed: 5.5, fallbackScale: 0.5 };
    case "trail":
      return { lifetime: 0.3, width: 0.12, samples: 12, fallbackScale: 0.6 };
    case "beam":
      return { lifetime: 0.18, width: 0.08, segments: 8, fallbackScale: 0.7 };
    case "decal":
      return { lifetime: 8, size: 0.7, projectionDepth: 0.2, fallbackScale: 1 };
    case "distortion-pulse":
      return { lifetime: 0.22, radius: 0.9, strength: 0.45, fallbackScale: 0.5 };
    case "procedural-lightning":
      return { lifetime: 0.16, branches: 4, segments: 18, jitter: 0.22, fallbackScale: 0.5 };
  }
}

function buildParticleBurst(request, defaults, rand) {
  const count = Math.max(1, Math.round(request.parameters?.count ?? defaults.count));
  const spread = clamp(request.parameters?.spread ?? defaults.spread, 0, 4);
  const speed = Math.max(0, request.parameters?.speed ?? defaults.speed);
  const particles = Array.from({ length: count }, (_, i) => {
    const az = rand() * Math.PI * 2;
    const z = (rand() * 2 - 1) * spread;
    const radial = Math.sqrt(Math.max(0, 1 - Math.min(1, z * z)));
    const magnitude = speed * (0.65 + rand() * 0.7);
    return {
      id: i,
      direction: [Math.cos(az) * radial, z, Math.sin(az) * radial],
      speed: magnitude,
      life: defaults.lifetime * (0.65 + rand() * 0.7)
    };
  });
  return { count, particles };
}

function buildTrail(request, defaults) {
  return {
    width: request.parameters?.width ?? defaults.width,
    samples: Math.max(2, Math.round(request.parameters?.samples ?? defaults.samples)),
    sourceAnchor: request.anchor,
    endAnchor: request.parameters?.endAnchor ?? null
  };
}

function buildBeam(request, defaults) {
  if (!request.parameters?.target) throw new Error("beam target required");
  return {
    width: request.parameters?.width ?? defaults.width,
    segments: Math.max(1, Math.round(request.parameters?.segments ?? defaults.segments)),
    sourceAnchor: request.anchor,
    target: request.parameters.target
  };
}

function buildDecal(request, defaults) {
  return {
    size: request.parameters?.size ?? defaults.size,
    projectionDepth: request.parameters?.projectionDepth ?? defaults.projectionDepth,
    material: request.parameters?.material ?? "impact-mark"
  };
}

function buildDistortion(request, defaults) {
  return {
    radius: request.parameters?.radius ?? defaults.radius,
    strength: clamp(request.parameters?.strength ?? defaults.strength, 0, 2)
  };
}

function buildLightning(request, defaults, rand) {
  if (!request.parameters?.target) throw new Error("lightning target required");
  const segments = Math.max(2, Math.round(request.parameters?.segments ?? defaults.segments));
  const jitter = Math.max(0, request.parameters?.jitter ?? defaults.jitter);
  const points = Array.from({ length: segments + 1 }, (_, i) => {
    const t = i / segments;
    if (i === 0 || i === segments) return { t, offset: [0, 0, 0] };
    return { t, offset: [(rand() * 2 - 1) * jitter, (rand() * 2 - 1) * jitter, (rand() * 2 - 1) * jitter] };
  });
  return {
    sourceAnchor: request.anchor,
    target: request.parameters.target,
    branches: Math.max(0, Math.round(request.parameters?.branches ?? defaults.branches)),
    points
  };
}

export function compileRequest(request) {
  validateRequest(request);
  const defaults = familyDefaults(request.kind);
  const seed = request.seed ?? request.id;
  const rand = seeded(seed);

  let payload;
  switch (request.kind) {
    case "particle-burst": payload = buildParticleBurst(request, defaults, rand); break;
    case "trail": payload = buildTrail(request, defaults); break;
    case "beam": payload = buildBeam(request, defaults); break;
    case "decal": payload = buildDecal(request, defaults); break;
    case "distortion-pulse": payload = buildDistortion(request, defaults); break;
    case "procedural-lightning": payload = buildLightning(request, defaults, rand); break;
  }

  const plan = {
    schema: PLAN_SCHEMA,
    id: request.id,
    effectRef: request.effectRef ?? null,
    kind: request.kind,
    time: request.time ?? 0,
    duration: request.duration ?? defaults.lifetime,
    anchor: structuredClone(request.anchor),
    payload,
    fallback: {
      scale: defaults.fallbackScale,
      policy: "preserve-timing-and-semantic-role"
    },
    rendererBinding: request.rendererBinding ?? "unbound"
  };

  return {
    ...plan,
    receipt: {
      schema: RECEIPT_SCHEMA,
      requestSha256: digest(request),
      planSha256: digest(plan),
      deterministic: true
    }
  };
}

export function compileBatch(requests) {
  return requests.map(compileRequest).sort((a, b) =>
    a.time - b.time || a.id.localeCompare(b.id)
  );
}
