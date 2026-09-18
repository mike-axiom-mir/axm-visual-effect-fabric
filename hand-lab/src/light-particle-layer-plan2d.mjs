import { deepClone, hashValue } from './hand-runtime.mjs';
import { buildMaskGuidedLightRaySetHand } from './mask-guided-light-rays.mjs';
import { buildFlowAdvectedParticleSetHand } from './particle-flow-advection.mjs';

const ORDER_MODES = new Set(['rays-under-particles', 'particles-under-rays']);
const MAX_ID_LENGTH = 96;

const FIXED_SEMANTICS = Object.freeze({
  contract: 'independent-light-ray-and-particle-render-order-plan2d',
  coordinateSpace: 'normalized-2d',
  layerAuthority: 'derived-order-only',
  blendModeAuthority: 'none',
  opacityAuthority: 'none',
  materialAuthority: 'none',
  rendererAuthority: 'none',
  consumerAuthority: 'none',
  geometryMutation: 'none',
  sourceMerge: 'none',
});

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

function normalizeId(value, label) {
  const id = String(value ?? '').trim();
  if (!id || id.length > MAX_ID_LENGTH) {
    throw new Error(`${label} must be non-empty and <= ${MAX_ID_LENGTH} characters`);
  }
  return id;
}

function normalizeOrderMode(value) {
  const mode = String(value ?? 'rays-under-particles');
  if (!ORDER_MODES.has(mode)) {
    throw new Error('light/particle layer order must be rays-under-particles or particles-under-rays');
  }
  return mode;
}

function selectedRaySet(lightState) {
  const id = lightState?.lightRaySource?.id;
  if (!id) throw new Error('light/particle layer plan requires normalized light-ray source state');
  const set = lightState?.lightRaySets?.[id];
  if (!set) throw new Error(`light/particle layer plan requires derived light-ray set ${id}`);
  return set;
}

function selectedParticleSet(particleState) {
  const id = particleState?.particleFlowSource?.id;
  if (!id) throw new Error('light/particle layer plan requires normalized particle-flow source state');
  const set = particleState?.flowAdvectedParticleSets?.[id];
  if (!set) throw new Error(`light/particle layer plan requires derived particle set ${id}`);
  return set;
}

function validateLightDonor(lightState) {
  if (!lightState || typeof lightState !== 'object') {
    throw new Error('light/particle layer plan requires nested lightRayState');
  }
  const selected = selectedRaySet(lightState);
  const rebuiltState = buildMaskGuidedLightRaySetHand.execute(lightState, {
    rayCount: selected.rayCount,
    samplesPerRay: selected.samplesPerRay,
    maxRays: 256,
    maxSamples: 32768,
  }).state;
  const rebuilt = selectedRaySet(rebuiltState);
  if (rebuilt.raySetHash !== selected.raySetHash) {
    throw new Error('light/particle layer light-ray set does not rebuild from retained donor truth');
  }
  return {
    family: 'mask-guided-light-rays2d',
    sourceId: normalizeId(lightState.lightRaySource.id, 'light-ray source id'),
    fieldSourceHash: lightState.lightRaySource.fieldSourceHash,
    maskSourceHash: lightState.lightRaySource.maskSourceHash,
    raySourceHash: lightState.lightRaySourceHash,
    raySetHash: selected.raySetHash,
    rayCount: selected.rayCount,
    samplesPerRay: selected.samplesPerRay,
  };
}

function validateParticleDonor(particleState) {
  if (!particleState || typeof particleState !== 'object') {
    throw new Error('light/particle layer plan requires nested particleFlowState');
  }
  const selected = selectedParticleSet(particleState);
  const rebuiltState = buildFlowAdvectedParticleSetHand.execute(particleState, {
    maxParticles: 4096,
    maxSamples: 262144,
  }).state;
  const rebuilt = selectedParticleSet(rebuiltState);
  if (rebuilt.particleSetHash !== selected.particleSetHash) {
    throw new Error('light/particle layer particle set does not rebuild from retained donor truth');
  }
  return {
    family: 'flow-advected-particles2d',
    sourceId: normalizeId(particleState.particleFlowSource.id, 'particle-flow source id'),
    particleSourceHash: particleState.particleSourceHash,
    scalarSourceHash: particleState.fieldSourceHash,
    flowSourceHash: particleState.flowSourceHash,
    particleFlowSourceHash: particleState.particleFlowSourceHash,
    particleSetHash: selected.particleSetHash,
    particleCount: selected.particleCount,
    sampleCount: selected.sampleCount,
  };
}

function planHashPayload(plan) {
  return {
    schema: plan.schema,
    ...FIXED_SEMANTICS,
    id: plan.id,
    orderMode: plan.orderMode,
    layers: plan.layers,
    derived: plan.derived,
    rebuildable: plan.rebuildable,
  };
}

function buildExpectedPlan(state, params = {}) {
  const light = validateLightDonor(state.lightRayState);
  const particles = validateParticleDonor(state.particleFlowState);
  const id = normalizeId(params.id ?? 'light-particle-layer-plan', 'layer plan id');
  const orderMode = normalizeOrderMode(params.orderMode);

  const lightLayer = {
    layerId: 'light-rays',
    family: light.family,
    sourceId: light.sourceId,
    lineage: {
      fieldSourceHash: light.fieldSourceHash,
      maskSourceHash: light.maskSourceHash,
      raySourceHash: light.raySourceHash,
      raySetHash: light.raySetHash,
    },
    itemCount: light.rayCount,
    sampleCount: light.rayCount * light.samplesPerRay,
  };
  const particleLayer = {
    layerId: 'particles',
    family: particles.family,
    sourceId: particles.sourceId,
    lineage: {
      particleSourceHash: particles.particleSourceHash,
      scalarSourceHash: particles.scalarSourceHash,
      flowSourceHash: particles.flowSourceHash,
      particleFlowSourceHash: particles.particleFlowSourceHash,
      particleSetHash: particles.particleSetHash,
    },
    itemCount: particles.particleCount,
    sampleCount: particles.sampleCount,
  };

  const layers = orderMode === 'rays-under-particles'
    ? [lightLayer, particleLayer]
    : [particleLayer, lightLayer];

  const plan = {
    schema: 'axm.effect-layer-plan2d/v0.1',
    ...FIXED_SEMANTICS,
    id,
    orderMode,
    layers,
    derived: true,
    rebuildable: true,
  };
  plan.planHash = hashValue(planHashPayload(plan));
  return plan;
}

export function validateLightParticleLayerPlan(state, plan) {
  if (!plan || plan.schema !== 'axm.effect-layer-plan2d/v0.1') {
    throw new Error('light/particle layer validation requires derived effect layer plan');
  }
  for (const [key, expected] of Object.entries(FIXED_SEMANTICS)) {
    if (plan[key] !== expected) throw new Error(`light/particle layer plan ${key} semantics are invalid`);
  }
  if (plan.derived !== true || plan.rebuildable !== true) {
    throw new Error('light/particle layer plan must remain derived and rebuildable');
  }
  normalizeId(plan.id, 'layer plan id');
  normalizeOrderMode(plan.orderMode);
  if (!Array.isArray(plan.layers) || plan.layers.length !== 2) {
    throw new Error('light/particle layer plan must contain exactly two independent layers');
  }
  if (hashValue(planHashPayload(plan)) !== plan.planHash) {
    throw new Error('light/particle layer plan hash mismatch');
  }

  const expected = buildExpectedPlan(state, { id: plan.id, orderMode: plan.orderMode });
  if (expected.planHash !== plan.planHash) {
    throw new Error('light/particle layer plan does not rebuild from retained donor truth');
  }
  return true;
}

export const buildLightParticleLayerPlanHand = hand('fx.composition.light-particle-layer-plan2d-build', (state, params = {}) => {
  const next = deepClone(state);
  const plan = buildExpectedPlan(next, params);
  const lightLayer = plan.layers.find((layer) => layer.layerId === 'light-rays');
  const particleLayer = plan.layers.find((layer) => layer.layerId === 'particles');

  next.effectLayerPlans ??= {};
  next.effectLayerPlans[plan.id] = plan;

  return {
    state: next,
    evidence: {
      planHash: plan.planHash,
      planId: plan.id,
      orderMode: plan.orderMode,
      raySetHash: lightLayer.lineage.raySetHash,
      particleSetHash: particleLayer.lineage.particleSetHash,
      rayCount: lightLayer.itemCount,
      particleCount: particleLayer.itemCount,
      lightCoverageSamples: lightLayer.sampleCount,
      particleTrajectorySamples: particleLayer.sampleCount,
      blendModeAuthority: plan.blendModeAuthority,
      materialAuthority: plan.materialAuthority,
      rendererAuthority: plan.rendererAuthority,
      consumerAuthority: plan.consumerAuthority,
      performanceMeasurement: 'NOT_TESTED',
      visualInspection: 'NOT_TESTED',
    },
  };
}, 'Build a derived consumer-neutral render-order plan over one verified mask-guided light-ray donor and one verified flow-advected particle donor without merging their source truth or assigning blend/material/renderer meaning.');

export const LIGHT_PARTICLE_LAYER_PLAN_HANDS = [buildLightParticleLayerPlanHand];

export const LIGHT_PARTICLE_LAYER_PLAN_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.composition.light-particle-layer-plan2d',
  version: '0.1.0',
  stages: [
    {
      id: 'build-independent-effect-layer-plan',
      hand: 'fx.composition.light-particle-layer-plan2d-build',
      params: { id: 'light-particle-layer-plan', orderMode: 'rays-under-particles' },
    },
  ],
});

export function makeLightParticleLayerPlanState(lightRayState, particleFlowState) {
  if (!lightRayState || typeof lightRayState !== 'object') {
    throw new Error('makeLightParticleLayerPlanState requires lightRayState');
  }
  if (!particleFlowState || typeof particleFlowState !== 'object') {
    throw new Error('makeLightParticleLayerPlanState requires particleFlowState');
  }
  return {
    schema: 'axm.effect-work-state/v0.1',
    lightRayState: deepClone(lightRayState),
    particleFlowState: deepClone(particleFlowState),
    effectLayerPlans: {},
  };
}
