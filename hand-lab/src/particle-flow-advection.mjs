import { deepClone, hashValue } from './hand-runtime.mjs';
import {
  normalizeFlowFieldRequestHand,
  sampleFlowFieldSource,
} from './field-flow-operators.mjs';

const round6 = (value) => Number(Number(value).toFixed(6));
const clamp01 = (value) => Math.max(0, Math.min(1, Number(value)));

function hand(id, execute, description) {
  return Object.freeze({
    schema: 'axm.hand/v0.1',
    id,
    version: '0.1.0',
    deterministic: true,
    callerNeutral: true,
    network: 'forbidden',
    description,
    execute,
  });
}

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be finite`);
  return number;
}

function bounded(value, min, max, label) {
  const number = finite(value, label);
  if (number < min || number > max) throw new Error(`${label} must be within [${min},${max}]`);
  return number;
}

function boundedInteger(value, min, max, label) {
  const number = finite(value, label);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(`${label} must be an integer within [${min},${max}]`);
  }
  return number;
}

function validateParticleSource(particles) {
  if (!Array.isArray(particles) || particles.length === 0) {
    throw new Error('particle flow advection requires a non-empty particles array');
  }
  const ids = new Set();
  for (const [particleIndex, particle] of particles.entries()) {
    if (!particle || typeof particle !== 'object') {
      throw new Error(`particles[${particleIndex}] must be an object`);
    }
    const id = String(particle.id ?? '').trim();
    if (!id) throw new Error(`particles[${particleIndex}].id must be non-empty`);
    if (ids.has(id)) throw new Error(`duplicate particle id: ${id}`);
    ids.add(id);
    bounded(particle.x, 0, 1, `particle ${id}.x`);
    bounded(particle.y, 0, 1, `particle ${id}.y`);
  }
  return { particleCount: particles.length };
}

function normalizeFlowInput(fieldRequest, flowRequest) {
  if (!fieldRequest || typeof fieldRequest !== 'object') {
    throw new Error('particle flow advection requires fieldRequest state');
  }
  if (!flowRequest || typeof flowRequest !== 'object') {
    throw new Error('particle flow advection requires flowRequest state');
  }
  const normalized = normalizeFlowFieldRequestHand.execute({
    schema: 'axm.effect-work-state/v0.1',
    fieldRequest: deepClone(fieldRequest),
    flowRequest: deepClone(flowRequest),
    vectorFields: {},
  }, {});
  return {
    fieldSource: normalized.state.fieldSource,
    fieldSourceHash: normalized.state.fieldSourceHash,
    flowSource: normalized.state.flowSource,
    flowSourceHash: normalized.state.flowSourceHash,
  };
}

function validateAdvectionLineage(particles, fieldSource, flowSource, advectionSource) {
  if (!advectionSource || advectionSource.schema !== 'axm.particle-flow-advection-source/v0.1') {
    throw new Error('particle flow advection requires normalized advection source');
  }
  const liveParticleHash = hashValue(particles);
  const liveFieldHash = hashValue(fieldSource);
  const liveFlowHash = hashValue(flowSource);
  if (liveParticleHash !== advectionSource.particleSource.sourceHash) {
    throw new Error('particle flow source particle hash mismatch');
  }
  if (liveFieldHash !== flowSource.scalarSource.sourceHash) {
    throw new Error('particle flow scalar source hash mismatch');
  }
  if (liveFieldHash !== advectionSource.flowSource.scalarSourceHash) {
    throw new Error('particle flow retained scalar source hash mismatch');
  }
  if (liveFlowHash !== advectionSource.flowSource.sourceHash) {
    throw new Error('particle flow vector source hash mismatch');
  }
}

export const normalizeParticleFlowAdvectionHand = hand('fx.particle.flow-advection-source-normalize', (state) => {
  const next = deepClone(state);
  const request = next.particleFlowRequest;
  if (!request || typeof request !== 'object') {
    throw new Error('particle flow advection requires particleFlowRequest state');
  }
  const id = String(request.id ?? 'flow-advected-particles').trim();
  if (!id) throw new Error('particleFlowRequest.id must be non-empty');

  const sourceStats = validateParticleSource(next.particles);
  const flow = normalizeFlowInput(next.fieldRequest, next.flowRequest);
  next.particleSourceHash = hashValue(next.particles);
  next.fieldSource = flow.fieldSource;
  next.fieldSourceHash = flow.fieldSourceHash;
  next.flowSource = flow.flowSource;
  next.flowSourceHash = flow.flowSourceHash;
  next.particleFlowSource = {
    schema: 'axm.particle-flow-advection-source/v0.1',
    id,
    algorithm: 'euler-vector-flow-advection2d',
    particleSource: {
      sourceHash: next.particleSourceHash,
      particleCount: sourceStats.particleCount,
    },
    flowSource: {
      id: flow.flowSource.id,
      sourceHash: flow.flowSourceHash,
      scalarSourceHash: flow.fieldSourceHash,
    },
    stepSize: round6(bounded(request.stepSize ?? 0.035, 0, 0.25, 'particleFlowRequest.stepSize')),
    steps: boundedInteger(request.steps ?? 16, 1, 256, 'particleFlowRequest.steps'),
    boundaryMode: 'clamp',
  };
  next.particleFlowSourceHash = hashValue(next.particleFlowSource);

  return {
    state: next,
    evidence: {
      particleSourceHash: next.particleSourceHash,
      fieldSourceHash: next.fieldSourceHash,
      flowSourceHash: next.flowSourceHash,
      particleFlowSourceHash: next.particleFlowSourceHash,
      particleCount: sourceStats.particleCount,
      stepSize: next.particleFlowSource.stepSize,
      steps: next.particleFlowSource.steps,
      boundaryMode: next.particleFlowSource.boundaryMode,
    },
  };
}, 'Bind retained normalized 2D particle seeds to retained vector-flow truth without rewriting source particles or choosing a renderer.');

export const buildFlowAdvectedParticleSetHand = hand('fx.particle.flow-advection-build', (state, params = {}) => {
  const next = deepClone(state);
  if (!next.particleSourceHash) throw new Error('flow-advection-build requires normalized particle source');
  if (!next.fieldSource || !next.fieldSourceHash) throw new Error('flow-advection-build requires normalized scalar source');
  if (!next.flowSource || !next.flowSourceHash) throw new Error('flow-advection-build requires normalized flow source');
  if (!next.particleFlowSource || !next.particleFlowSourceHash) {
    throw new Error('flow-advection-build requires normalized particle flow source');
  }
  if (hashValue(next.particles) !== next.particleSourceHash) {
    throw new Error('particle flow retained particle state hash mismatch');
  }
  if (hashValue(next.fieldSource) !== next.fieldSourceHash) {
    throw new Error('particle flow scalar source state hash mismatch');
  }
  if (hashValue(next.flowSource) !== next.flowSourceHash) {
    throw new Error('particle flow vector source state hash mismatch');
  }
  if (hashValue(next.particleFlowSource) !== next.particleFlowSourceHash) {
    throw new Error('particle flow advection source state hash mismatch');
  }

  const sourceStats = validateParticleSource(next.particles);
  if (sourceStats.particleCount !== next.particleFlowSource.particleSource.particleCount) {
    throw new Error('particle flow retained particle cardinality mismatch');
  }
  validateAdvectionLineage(next.particles, next.fieldSource, next.flowSource, next.particleFlowSource);

  const maxParticles = boundedInteger(params.maxParticles ?? 2048, 1, 4096, 'particleFlow.maxParticles');
  const maxSamples = boundedInteger(params.maxSamples ?? 65536, 2, 262144, 'particleFlow.maxSamples');
  if (sourceStats.particleCount > maxParticles) {
    throw new Error(`particleFlow particle budget exceeded: ${sourceStats.particleCount} > ${maxParticles}`);
  }
  const sampleCount = sourceStats.particleCount * (next.particleFlowSource.steps + 1);
  if (sampleCount > maxSamples) {
    throw new Error(`particleFlow sample budget exceeded: ${sampleCount} > ${maxSamples}`);
  }

  let maxStepDistance = 0;
  let movedParticleCount = 0;
  let clampedStepCount = 0;
  const trajectories = [];
  const particles = next.particles.map((particle) => {
    let x = Number(particle.x);
    let y = Number(particle.y);
    let moved = false;
    const points = [{ x: round6(x), y: round6(y) }];

    for (let stepIndex = 0; stepIndex < next.particleFlowSource.steps; stepIndex += 1) {
      const vector = sampleFlowFieldSource(next.fieldSource, next.flowSource, x, y);
      const rawX = x + vector.x * next.particleFlowSource.stepSize;
      const rawY = y + vector.y * next.particleFlowSource.stepSize;
      const nextX = round6(clamp01(rawX));
      const nextY = round6(clamp01(rawY));
      if (nextX !== round6(rawX) || nextY !== round6(rawY)) clampedStepCount += 1;
      const stepDistance = Math.hypot(nextX - x, nextY - y);
      maxStepDistance = Math.max(maxStepDistance, stepDistance);
      if (stepDistance > 0) moved = true;
      x = nextX;
      y = nextY;
      points.push({ x, y });
    }

    if (moved) movedParticleCount += 1;
    trajectories.push({ id: particle.id, points });
    return { ...particle, x, y };
  });

  const particleSet = {
    schema: 'axm.flow-advected-particle-set/v0.1',
    advectionSourceHash: next.particleFlowSourceHash,
    particleSourceHash: next.particleSourceHash,
    flowSourceHash: next.flowSourceHash,
    scalarSourceHash: next.fieldSourceHash,
    particleCount: sourceStats.particleCount,
    sampleCount,
    particles,
    trajectories,
    maxStepDistance: round6(maxStepDistance),
    movedParticleCount,
    clampedStepCount,
    derived: true,
    rebuildable: true,
  };
  particleSet.particleSetHash = hashValue(particleSet);

  next.flowAdvectedParticleSets ??= {};
  next.flowAdvectedParticleSets[next.particleFlowSource.id] = particleSet;

  return {
    state: next,
    evidence: {
      particleSourceHash: next.particleSourceHash,
      fieldSourceHash: next.fieldSourceHash,
      flowSourceHash: next.flowSourceHash,
      particleFlowSourceHash: next.particleFlowSourceHash,
      particleSetHash: particleSet.particleSetHash,
      particleCount: particleSet.particleCount,
      sampleCount: particleSet.sampleCount,
      movedParticleCount,
      clampedStepCount,
      maxStepDistance: particleSet.maxStepDistance,
      maxParticles,
      maxSamples,
    },
  };
}, 'Build bounded rebuildable 2D particle trajectories and final positions from continuous vector-flow guidance while retaining source particles beside them.');

export const PARTICLE_FLOW_ADVECTION_HANDS = [
  normalizeParticleFlowAdvectionHand,
  buildFlowAdvectedParticleSetHand,
];

export const PARTICLE_FLOW_ADVECTION_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.particle.flow-advect2d',
  version: '0.1.0',
  stages: [
    { id: 'normalize-particle-flow-source', hand: 'fx.particle.flow-advection-source-normalize', params: {} },
    { id: 'build-flow-advected-particles', hand: 'fx.particle.flow-advection-build', params: { maxParticles: 2048, maxSamples: 65536 } },
  ],
});

export function makeParticleFlowAdvectionState(particles, options = {}) {
  return {
    schema: 'axm.effect-work-state/v0.1',
    particles: deepClone(particles),
    fieldRequest: {
      id: options.field?.id ?? 'particle-flow-field',
      seed: options.field?.seed ?? 6007,
      frequency: options.field?.frequency ?? 4.5,
      octaves: options.field?.octaves ?? 5,
      lacunarity: options.field?.lacunarity ?? 2,
      gain: options.field?.gain ?? 0.5,
      offset: deepClone(options.field?.offset ?? [0, 0]),
    },
    flowRequest: {
      id: options.flow?.id ?? 'particle-flow',
      mode: options.flow?.mode ?? 'tangent',
      sampleStep: options.flow?.sampleStep ?? 0.015625,
      strength: options.flow?.strength ?? 1,
    },
    particleFlowRequest: {
      id: options.id ?? 'flow-advected-particles',
      stepSize: options.stepSize ?? 0.035,
      steps: options.steps ?? 16,
    },
    flowAdvectedParticleSets: {},
  };
}
