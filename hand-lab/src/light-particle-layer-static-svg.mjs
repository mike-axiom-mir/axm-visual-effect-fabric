import { deepClone, hashValue } from './hand-runtime.mjs';
import { realizeMaskGuidedLightRaysStaticSvgHand } from './mask-guided-light-rays.mjs';
import { particleFlowStaticSvgHand } from './particle-flow-static-svg.mjs';
import { validateLightParticleLayerPlan } from './light-particle-layer-plan2d.mjs';

const MAX_ID_LENGTH = 96;
const MAX_SVG_BYTES = 16 * 1024 * 1024;

const FIXED_RENDERER_SEMANTICS = Object.freeze({
  composition: 'ordered-embedded-svg-subdocuments',
  orderAuthority: 'verified-layer-plan-only',
  subrealizationMutation: 'none',
  blendModeAuthority: 'none',
  opacityAuthority: 'none',
  materialAuthority: 'none',
  canonicalAuthority: 'none',
  consumerAuthority: 'none',
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

function normalizeId(value, label) {
  const id = String(value ?? '').trim();
  if (!id || id.length > MAX_ID_LENGTH) {
    throw new Error(`${label} must be non-empty and <= ${MAX_ID_LENGTH} characters`);
  }
  return id;
}

function escapeAttribute(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function selectedPlan(state, planId) {
  const plan = state.effectLayerPlans?.[planId];
  if (!plan) throw new Error(`light/particle static SVG requires verified layer plan ${planId}`);
  validateLightParticleLayerPlan(state, plan);
  return plan;
}

function selectedLightRealization(state) {
  const realization = state.realizations?.maskGuidedLightRaysStaticSvg;
  if (!realization) throw new Error('light/particle static SVG missing light-ray subrealization');
  return realization;
}

function selectedParticleRealization(state) {
  const realization = state.realizations?.particleFlowStaticSvg;
  if (!realization) throw new Error('light/particle static SVG missing particle-flow subrealization');
  return realization;
}

function assertLightRealizationLineage(layer, realization) {
  if (layer.layerId !== 'light-rays' || layer.family !== 'mask-guided-light-rays2d') {
    throw new Error('light/particle static SVG expected light-ray layer descriptor');
  }
  if (realization.renderer !== 'axm.vfx.mask-guided-light-rays-static-svg/v0.1') {
    throw new Error('light/particle static SVG light-ray renderer mismatch');
  }
  const lineage = layer.lineage;
  if (
    realization.fieldSourceHash !== lineage.fieldSourceHash
    || realization.maskSourceHash !== lineage.maskSourceHash
    || realization.raySourceHash !== lineage.raySourceHash
    || realization.raySetHash !== lineage.raySetHash
  ) {
    throw new Error('light/particle static SVG light-ray realization lineage mismatch');
  }
}

function assertParticleRealizationLineage(layer, realization) {
  if (layer.layerId !== 'particles' || layer.family !== 'flow-advected-particles2d') {
    throw new Error('light/particle static SVG expected particle layer descriptor');
  }
  if (realization.renderer !== 'axm.vfx.particle-flow-static-svg/v0.1') {
    throw new Error('light/particle static SVG particle renderer mismatch');
  }
  const lineage = layer.lineage;
  if (
    realization.particleSourceHash !== lineage.particleSourceHash
    || realization.scalarSourceHash !== lineage.scalarSourceHash
    || realization.flowSourceHash !== lineage.flowSourceHash
    || realization.advectionSourceHash !== lineage.particleFlowSourceHash
    || realization.derivedFromParticleSetHash !== lineage.particleSetHash
  ) {
    throw new Error('light/particle static SVG particle realization lineage mismatch');
  }
}

function describeSubrealization(layer, realization) {
  return {
    layerId: layer.layerId,
    family: layer.family,
    sourceId: layer.sourceId,
    lineage: deepClone(layer.lineage),
    renderer: realization.renderer,
    mediaType: realization.mediaType,
    contentHash: hashValue(realization.content),
    bytes: Buffer.byteLength(realization.content),
  };
}

function realizationHashPayload(realization) {
  return {
    schema: realization.schema,
    renderer: realization.renderer,
    mediaType: realization.mediaType,
    derivedFromLayerPlanHash: realization.derivedFromLayerPlanHash,
    planId: realization.planId,
    orderMode: realization.orderMode,
    semantics: realization.semantics,
    renderControls: realization.renderControls,
    layers: realization.layers,
    contentHash: realization.contentHash,
    derived: realization.derived,
    replaceable: realization.replaceable,
  };
}

export const realizeLightParticleLayerStaticSvgHand = hand('fx.composition.light-particle-layer-static-svg-realize', (state, params = {}) => {
  const next = deepClone(state);
  const planId = normalizeId(params.planId ?? 'light-particle-layer-plan', 'lightParticleSvg.planId');
  const plan = selectedPlan(next, planId);

  const width = boundedInteger(params.width ?? 640, 64, 4096, 'lightParticleSvg.width');
  const height = boundedInteger(params.height ?? 420, 64, 4096, 'lightParticleSvg.height');
  const lightStrokeWidth = bounded(params.lightStrokeWidth ?? 1.5, 0.1, 16, 'lightParticleSvg.lightStrokeWidth');
  const lightMinOpacity = bounded(params.lightMinOpacity ?? 0, 0, 1, 'lightParticleSvg.lightMinOpacity');
  const lightMaxOpacity = bounded(params.lightMaxOpacity ?? 0.85, 0, 1, 'lightParticleSvg.lightMaxOpacity');
  if (lightMaxOpacity < lightMinOpacity) {
    throw new Error('lightParticleSvg.lightMaxOpacity must be >= lightMinOpacity');
  }
  const particlePadding = bounded(params.particlePadding ?? 20, 0, 512, 'lightParticleSvg.particlePadding');
  if (particlePadding * 2 >= Math.min(width, height)) {
    throw new Error('lightParticleSvg.particlePadding must leave a positive drawable area');
  }
  const particleMarkerRadius = bounded(params.particleMarkerRadius ?? 2.4, 0.25, 16, 'lightParticleSvg.particleMarkerRadius');
  const maxParticles = boundedInteger(params.maxParticles ?? 2048, 1, 4096, 'lightParticleSvg.maxParticles');
  const maxParticleSamples = boundedInteger(params.maxParticleSamples ?? 65536, 2, 262144, 'lightParticleSvg.maxParticleSamples');
  const maxSvgBytes = boundedInteger(params.maxSvgBytes ?? 1024 * 1024, 512, MAX_SVG_BYTES, 'lightParticleSvg.maxSvgBytes');

  const lightResult = realizeMaskGuidedLightRaysStaticSvgHand.execute(next.lightRayState, {
    width,
    height,
    strokeWidth: lightStrokeWidth,
    minOpacity: lightMinOpacity,
    maxOpacity: lightMaxOpacity,
  });
  const particleResult = particleFlowStaticSvgHand.execute(next.particleFlowState, {
    width,
    height,
    padding: particlePadding,
    markerRadius: particleMarkerRadius,
    maxParticles,
    maxSamples: maxParticleSamples,
  });
  const lightRealization = selectedLightRealization(lightResult.state);
  const particleRealization = selectedParticleRealization(particleResult.state);

  const lightLayer = plan.layers.find((layer) => layer.layerId === 'light-rays');
  const particleLayer = plan.layers.find((layer) => layer.layerId === 'particles');
  if (!lightLayer || !particleLayer) {
    throw new Error('light/particle static SVG plan must contain light-rays and particles layers');
  }
  assertLightRealizationLineage(lightLayer, lightRealization);
  assertParticleRealizationLineage(particleLayer, particleRealization);

  const byLayerId = {
    'light-rays': lightRealization,
    particles: particleRealization,
  };
  const descriptors = plan.layers.map((layer) => describeSubrealization(layer, byLayerId[layer.layerId]));
  const embeddedBytes = descriptors.reduce((sum, layer) => sum + layer.bytes, 0);
  if (embeddedBytes > maxSvgBytes) {
    throw new Error(`lightParticleSvg embedded SVG budget exceeded: ${embeddedBytes} > ${maxSvgBytes}`);
  }

  const layerMarkup = plan.layers.map((layer, index) => {
    const realization = byLayerId[layer.layerId];
    const descriptor = descriptors[index];
    return `<g data-layer-id="${escapeAttribute(layer.layerId)}" data-subrenderer="${escapeAttribute(descriptor.renderer)}" data-subcontent-hash="${escapeAttribute(descriptor.contentHash)}">${realization.content}</g>`;
  }).join('');
  const content = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" data-renderer="axm.vfx.light-particle-layer-static-svg/v0.1" data-plan-id="${escapeAttribute(plan.id)}" data-plan-hash="${escapeAttribute(plan.planHash)}" data-order-mode="${escapeAttribute(plan.orderMode)}"><title>AXM derived light and particle layer inspection</title>${layerMarkup}</svg>`;
  const bytes = Buffer.byteLength(content);
  if (bytes > maxSvgBytes) {
    throw new Error(`lightParticleSvg output byte budget exceeded: ${bytes} > ${maxSvgBytes}`);
  }

  const renderControls = {
    width,
    height,
    lightStrokeWidth,
    lightMinOpacity,
    lightMaxOpacity,
    particlePadding,
    particleMarkerRadius,
    maxParticles,
    maxParticleSamples,
    maxSvgBytes,
  };
  const realization = {
    schema: 'axm.vfx.light-particle-layer-static-svg/v0.1',
    renderer: 'axm.vfx.light-particle-layer-static-svg/v0.1',
    mediaType: 'image/svg+xml',
    derivedFromLayerPlanHash: plan.planHash,
    planId: plan.id,
    orderMode: plan.orderMode,
    semantics: deepClone(FIXED_RENDERER_SEMANTICS),
    renderControls,
    layers: descriptors,
    contentHash: hashValue(content),
    content,
    derived: true,
    replaceable: true,
  };
  realization.realizationHash = hashValue(realizationHashPayload(realization));

  next.realizations ??= {};
  next.realizations.lightParticleLayerStaticSvg = realization;

  return {
    state: next,
    evidence: {
      renderer: realization.renderer,
      realizationHash: realization.realizationHash,
      contentHash: realization.contentHash,
      planHash: plan.planHash,
      planId: plan.id,
      orderMode: plan.orderMode,
      layerOrder: plan.layers.map((layer) => layer.layerId),
      lightRenderer: lightRealization.renderer,
      particleRenderer: particleRealization.renderer,
      lightContentHash: descriptors.find((layer) => layer.layerId === 'light-rays').contentHash,
      particleContentHash: descriptors.find((layer) => layer.layerId === 'particles').contentHash,
      rayCount: lightLayer.itemCount,
      particleCount: particleLayer.itemCount,
      lightCoverageSamples: lightLayer.sampleCount,
      particleTrajectorySamples: particleLayer.sampleCount,
      embeddedBytes,
      bytes,
      maxSvgBytes,
      subrealizationMutation: realization.semantics.subrealizationMutation,
      blendModeAuthority: realization.semantics.blendModeAuthority,
      materialAuthority: realization.semantics.materialAuthority,
      canonicalAuthority: realization.semantics.canonicalAuthority,
      performanceMeasurement: 'NOT_TESTED',
      visualInspection: 'NOT_TESTED',
    },
  };
}, 'Compose the existing verified light-ray and particle static-SVG realizations in one verified derived layer-plan order without mutating either subrenderer output or assigning canonical blend/material/consumer meaning.');

export const LIGHT_PARTICLE_LAYER_STATIC_SVG_HANDS = [realizeLightParticleLayerStaticSvgHand];

export const LIGHT_PARTICLE_LAYER_STATIC_SVG_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.composition.light-particle-layer-static-svg',
  version: '0.1.0',
  stages: [
    {
      id: 'realize-verified-layer-plan-static-svg',
      hand: 'fx.composition.light-particle-layer-static-svg-realize',
      params: {
        planId: 'light-particle-layer-plan',
        width: 640,
        height: 420,
        lightStrokeWidth: 1.5,
        lightMinOpacity: 0,
        lightMaxOpacity: 0.85,
        particlePadding: 20,
        particleMarkerRadius: 2.4,
        maxParticles: 2048,
        maxParticleSamples: 65536,
        maxSvgBytes: 1048576,
      },
    },
  ],
});
