import { createHash } from "node:crypto";

export const REQUEST_SCHEMA = "axm.game-vfx-request/v1";
export const PLAN_SCHEMA = "axm.game-vfx-plan/v1";
export const RECEIPT_SCHEMA = "axm.game-vfx-receipt/v1";
export const INTERRUPTION_SCHEMA = "axm.game-vfx-interruption/v1";

export const EFFECT_KINDS = Object.freeze([
  "particle-burst",
  "particle-emitter",
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

function finiteVector3(value, label) {
  if (!Array.isArray(value) || value.length !== 3) throw new Error(label + " must be a vec3");
  value.forEach((component, index) => finite(component, `${label}[${index}]`));
  return value;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function budgetFor(request) {
  const requested = request.budget?.maxParticles ?? 512;
  finite(requested, "request.budget.maxParticles");
  return { maxParticles: Math.round(clamp(requested, 1, 4096)) };
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
  if (request.parameters?.gravity != null) finiteVector3(request.parameters.gravity, "request.parameters.gravity");
  budgetFor(request);
  return true;
}

function familyDefaults(kind) {
  switch (kind) {
    case "particle-burst":
      return { lifetime: 0.55, count: 48, spread: 1, speed: 5.5, gravity: [0, -9.81, 0], fallbackScale: 0.5 };
    case "particle-emitter":
      return { lifetime: 1.2, rate: 24, spread: 0.7, speed: 1.6, gravity: [0, 0.8, 0], fallbackScale: 0.5 };
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

function particleDirection(rand, spread) {
  const az = rand() * Math.PI * 2;
  const y = (rand() * 2 - 1) * spread;
  const radial = Math.sqrt(Math.max(0, 1 - Math.min(1, y * y)));
  return [Math.cos(az) * radial, y, Math.sin(az) * radial];
}

function particleRecord(id, spawnTime, defaults, request, rand) {
  const spread = clamp(request.parameters?.spread ?? defaults.spread, 0, 4);
  const speed = Math.max(0, request.parameters?.speed ?? defaults.speed);
  const lifeBase = Math.max(0.001, request.parameters?.particleLifetime ?? defaults.lifetime);
  const direction = particleDirection(rand, spread);
  const magnitude = speed * (0.65 + rand() * 0.7);
  return {
    id,
    spawnTime,
    direction,
    speed: magnitude,
    life: lifeBase * (0.65 + rand() * 0.7)
  };
}

function buildParticleBurst(request, defaults, rand, budget) {
  const requestedCount = Math.max(1, Math.round(request.parameters?.count ?? defaults.count));
  const count = Math.min(requestedCount, budget.maxParticles);
  const particles = Array.from({ length: count }, (_, i) => particleRecord(i, 0, defaults, request, rand));
  return {
    requestedCount,
    count,
    truncated: count < requestedCount,
    gravity: structuredClone(request.parameters?.gravity ?? defaults.gravity),
    particles
  };
}

function buildParticleEmitter(request, defaults, rand, budget) {
  const rate = Math.max(0.01, request.parameters?.rate ?? defaults.rate);
  const emissionDuration = request.duration ?? 1;
  const requestedCount = Math.max(1, Math.ceil(rate * emissionDuration));
  const count = Math.min(requestedCount, budget.maxParticles);
  const spacing = 1 / rate;
  const particles = Array.from({ length: count }, (_, i) =>
    particleRecord(i, Math.min(emissionDuration, i * spacing), defaults, request, rand)
  );
  return {
    rate,
    emissionDuration,
    requestedCount,
    count,
    truncated: count < requestedCount,
    gravity: structuredClone(request.parameters?.gravity ?? defaults.gravity),
    particles
  };
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
  const budget = budgetFor(request);

  let payload;
  switch (request.kind) {
    case "particle-burst": payload = buildParticleBurst(request, defaults, rand, budget); break;
    case "particle-emitter": payload = buildParticleEmitter(request, defaults, rand, budget); break;
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
    budget,
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

function planBody(plan) {
  const { receipt, ...body } = plan;
  return body;
}

function verifiedPlanHash(plan) {
  if (plan?.schema !== PLAN_SCHEMA) throw new Error("unsupported plan schema");
  if (plan.receipt?.schema !== RECEIPT_SCHEMA) throw new Error("plan receipt required for interruption binding");
  const computed = digest(planBody(plan));
  if (plan.receipt.planSha256 !== computed) throw new Error("plan receipt digest mismatch");
  return computed;
}

function interruptionPolicy(kind) {
  switch (kind) {
    case "particle-burst":
    case "particle-emitter":
      return "stop-future-spawns-preserve-existing";
    case "trail":
    case "beam":
    case "distortion-pulse":
    case "procedural-lightning":
      return "stop-transient";
    case "decal":
      return "preserve-persistent";
    default:
      throw new Error("unsupported effect kind: " + kind);
  }
}

export function createInterruption(plan, absoluteTime, reason = "gameplay-interrupt") {
  finite(absoluteTime, "absoluteTime");
  const planSha256 = verifiedPlanHash(plan);
  if (absoluteTime < plan.time) throw new Error("interruption cannot precede plan start");
  if (typeof reason !== "string" || !reason.trim()) throw new Error("interruption reason required");

  const interruption = {
    schema: INTERRUPTION_SCHEMA,
    planId: plan.id,
    planSha256,
    absoluteTime,
    localTime: absoluteTime - plan.time,
    reason,
    policy: interruptionPolicy(plan.kind)
  };

  return {
    ...interruption,
    sha256: digest(interruption)
  };
}

export function validateInterruption(plan, interruption) {
  if (interruption?.schema !== INTERRUPTION_SCHEMA) throw new Error("unsupported interruption schema");
  const planSha256 = verifiedPlanHash(plan);
  if (interruption.planId !== plan.id) throw new Error("interruption plan id mismatch");
  if (interruption.planSha256 !== planSha256) throw new Error("interruption plan digest mismatch");
  finite(interruption.absoluteTime, "interruption.absoluteTime");
  finite(interruption.localTime, "interruption.localTime");
  if (interruption.absoluteTime < plan.time) throw new Error("interruption cannot precede plan start");
  if (interruption.localTime !== interruption.absoluteTime - plan.time) throw new Error("interruption local time mismatch");
  if (interruption.policy !== interruptionPolicy(plan.kind)) throw new Error("interruption policy mismatch");
  if (typeof interruption.reason !== "string" || !interruption.reason.trim()) throw new Error("interruption reason required");
  const { sha256, ...body } = interruption;
  if (sha256 !== digest(body)) throw new Error("interruption digest mismatch");
  return true;
}

function sampleParticle(particle, gravity, localTime) {
  const age = localTime - particle.spawnTime;
  if (age < 0 || age > particle.life) return null;
  const velocity = particle.direction.map(component => component * particle.speed);
  const position = velocity.map((component, index) => component * age + 0.5 * gravity[index] * age * age);
  return {
    id: particle.id,
    age,
    normalizedAge: particle.life === 0 ? 1 : age / particle.life,
    position,
    velocity: velocity.map((component, index) => component + gravity[index] * age),
    opacity: clamp(1 - age / particle.life, 0, 1)
  };
}

export function samplePlanAt(plan, absoluteTime, interruption = null) {
  if (plan?.schema !== PLAN_SCHEMA) throw new Error("unsupported plan schema");
  finite(absoluteTime, "absoluteTime");
  if (interruption) validateInterruption(plan, interruption);
  const localTime = absoluteTime - plan.time;
  const interrupted = Boolean(interruption && absoluteTime >= interruption.absoluteTime);

  if (plan.kind === "particle-burst" || plan.kind === "particle-emitter") {
    const gravity = finiteVector3(plan.payload.gravity, "plan.payload.gravity");
    const scheduledParticles = interruption
      ? plan.payload.particles.filter(particle => particle.spawnTime < interruption.localTime)
      : plan.payload.particles;
    const particles = scheduledParticles
      .map(particle => sampleParticle(particle, gravity, localTime))
      .filter(Boolean);
    const lastDeath = scheduledParticles.reduce((max, particle) => Math.max(max, particle.spawnTime + particle.life), -Infinity);
    return {
      planId: plan.id,
      kind: plan.kind,
      absoluteTime,
      localTime,
      active: localTime >= 0 && scheduledParticles.length > 0 && localTime <= lastDeath,
      activeCount: particles.length,
      particles,
      interrupted,
      interruptionPolicy: interruption?.policy ?? null
    };
  }

  const progress = clamp(localTime / plan.duration, 0, 1);
  const naturallyActive = localTime >= 0 && localTime <= plan.duration;
  const stoppedByInterruption = interruption?.policy === "stop-transient" && absoluteTime >= interruption.absoluteTime;
  const active = naturallyActive && !stoppedByInterruption;
  return {
    planId: plan.id,
    kind: plan.kind,
    absoluteTime,
    localTime,
    active,
    progress,
    intensity: plan.kind === "distortion-pulse" ? (active ? Math.sin(Math.PI * progress) : 0) : (active ? 1 : 0),
    interrupted,
    interruptionPolicy: interruption?.policy ?? null
  };
}

export function compileBatch(requests) {
  return requests.map(compileRequest).sort((a, b) =>
    a.time - b.time || a.id.localeCompare(b.id)
  );
}
