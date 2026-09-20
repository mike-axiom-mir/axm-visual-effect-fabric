import { mkdirSync, writeFileSync } from 'node:fs';
import { createHandRegistry, executeHandGraph, hashValue } from '../src/hand-runtime.mjs';
import {
  MASK_GUIDED_LIGHT_RAY_GRAPH,
  MASK_GUIDED_LIGHT_RAY_HANDS,
  makeMaskGuidedLightRayState,
} from '../src/mask-guided-light-rays.mjs';
import {
  PARTICLE_FLOW_ADVECTION_GRAPH,
  PARTICLE_FLOW_ADVECTION_HANDS,
  makeParticleFlowAdvectionState,
} from '../src/particle-flow-advection.mjs';
import {
  buildLightParticleLayerPlanHand,
  makeLightParticleLayerPlanState,
} from '../src/light-particle-layer-plan2d.mjs';
import {
  LIGHT_PARTICLE_LAYER_STATIC_SVG_GRAPH,
  LIGHT_PARTICLE_LAYER_STATIC_SVG_HANDS,
} from '../src/light-particle-layer-static-svg.mjs';

const lightRegistry = createHandRegistry(MASK_GUIDED_LIGHT_RAY_HANDS);
const particleRegistry = createHandRegistry(PARTICLE_FLOW_ADVECTION_HANDS);
const compositeRegistry = createHandRegistry(LIGHT_PARTICLE_LAYER_STATIC_SVG_HANDS);

const lightGraphWithoutRenderer = {
  ...MASK_GUIDED_LIGHT_RAY_GRAPH,
  id: 'fx.light.mask-guided-rays2d-derived-only-screenshot',
  stages: MASK_GUIDED_LIGHT_RAY_GRAPH.stages.slice(0, 4),
};

function buildLightState() {
  const initialState = makeMaskGuidedLightRayState({
    field: {
      id: 'ci-shot-light-field',
      seed: 31415,
      frequency: 3.8,
      octaves: 4,
      lacunarity: 2,
      gain: 0.52,
    },
    mask: {
      id: 'ci-shot-light-mask',
      threshold: 0.48,
      softness: 0.14,
    },
    ray: {
      id: 'ci-shot-rays',
      origin: [0.16, 0.5],
      directionTurns: 0,
      spanTurns: 0.22,
      maxLength: 1.25,
      weightPower: 1,
    },
  });
  return executeHandGraph({
    registry: lightRegistry,
    graph: lightGraphWithoutRenderer,
    initialState,
    context: { callerKind: 'github-ci-evidence' },
  }).finalState;
}

function buildParticleState() {
  const particles = [
    { id: 'a', x: 0.2, y: 0.3 },
    { id: 'b', x: 0.48, y: 0.58 },
    { id: 'c', x: 0.75, y: 0.66 },
    { id: 'd', x: 0.38, y: 0.77 },
    { id: 'e', x: 0.63, y: 0.27 },
  ];
  const initialState = makeParticleFlowAdvectionState(particles, {
    id: 'ci-shot-particles',
    stepSize: 0.03,
    steps: 9,
    field: {
      id: 'ci-shot-particle-field',
      seed: 27182,
      frequency: 4.25,
      octaves: 4,
      lacunarity: 2,
      gain: 0.5,
    },
    flow: {
      id: 'ci-shot-flow',
      mode: 'tangent',
      sampleStep: 0.015625,
      strength: 1,
    },
  });
  return executeHandGraph({
    registry: particleRegistry,
    graph: PARTICLE_FLOW_ADVECTION_GRAPH,
    initialState,
    context: { callerKind: 'github-ci-evidence' },
  }).finalState;
}

const base = makeLightParticleLayerPlanState(buildLightState(), buildParticleState());
const planned = buildLightParticleLayerPlanHand.execute(base, {
  id: 'ci-shot-light-particle-plan',
  orderMode: 'rays-under-particles',
}).state;

function graphFor(lightPresentationMode) {
  return {
    ...LIGHT_PARTICLE_LAYER_STATIC_SVG_GRAPH,
    id: `fx.composition.light-particle-layer-static-svg-ci-evidence-${lightPresentationMode}`,
    stages: [{
      ...LIGHT_PARTICLE_LAYER_STATIC_SVG_GRAPH.stages[0],
      params: {
        ...LIGHT_PARTICLE_LAYER_STATIC_SVG_GRAPH.stages[0].params,
        planId: 'ci-shot-light-particle-plan',
        width: 960,
        height: 630,
        lightStrokeWidth: 2.2,
        lightMinOpacity: 0.03,
        lightMaxOpacity: 0.92,
        lightStrokeColor: '#69d7ff',
        lightPresentationMode,
        lightHazeWidthMultiplier: 5,
        lightBeamWidthMultiplier: 1.8,
        lightHazeBlur: 7,
        lightBeamThreshold: 0.5,
        lightCoreThreshold: 0.7,
        lightTipOpacity: 0,
        lightOriginGlowRadius: 14,
        particlePadding: 28,
        particleMarkerRadius: 3.2,
        maxSvgBytes: 2 * 1024 * 1024,
      },
    }],
  };
}

function executeVariant(lightPresentationMode) {
  const run = executeHandGraph({
    registry: compositeRegistry,
    graph: graphFor(lightPresentationMode),
    initialState: planned,
    context: { callerKind: 'github-ci-evidence' },
  });
  return {
    run,
    realization: run.finalState.realizations.lightParticleLayerStaticSvg,
  };
}

const before = executeVariant('line-inspection');
const after = executeVariant('volumetric-light');

mkdirSync('hand-lab/out/ci-vfx-evidence', { recursive: true });
writeFileSync('hand-lab/out/ci-vfx-evidence/light-particle-before.svg', before.realization.content);
writeFileSync('hand-lab/out/ci-vfx-evidence/light-particle-after.svg', after.realization.content);
writeFileSync('hand-lab/out/ci-vfx-evidence/evidence.json', JSON.stringify({
  schema: 'axm.vfx-ci-screenshot-evidence/v0.2',
  fixtureInvariant: {
    planHash: before.realization.derivedFromLayerPlanHash,
    layerOrder: before.realization.layers.map((layer) => layer.layerId),
    beforeStateHash: before.run.finalStateHash,
    afterStateHash: after.run.finalStateHash,
    samePlanHash: before.realization.derivedFromLayerPlanHash === after.realization.derivedFromLayerPlanHash,
    sameLayerLineage: JSON.stringify(before.realization.layers.map((layer) => layer.lineage))
      === JSON.stringify(after.realization.layers.map((layer) => layer.lineage)),
  },
  before: {
    renderer: before.realization.renderer,
    realizationHash: before.realization.realizationHash,
    contentHash: before.realization.contentHash,
    lightPresentationMode: before.realization.renderControls.lightPresentationMode,
    particleBackgroundMode: before.realization.renderControls.particleBackgroundMode,
    svgBytes: Buffer.byteLength(before.realization.content),
  },
  after: {
    renderer: after.realization.renderer,
    realizationHash: after.realization.realizationHash,
    contentHash: after.realization.contentHash,
    lightPresentationMode: after.realization.renderControls.lightPresentationMode,
    particleBackgroundMode: after.realization.renderControls.particleBackgroundMode,
    svgBytes: Buffer.byteLength(after.realization.content),
  },
  screenshotRenderer: 'librsvg/rsvg-convert on github-actions ubuntu-latest',
  visualJudgement: 'NOT_ASSIGNED_BY_CI',
}, null, 2));
console.log(JSON.stringify({
  beforeSvg: 'hand-lab/out/ci-vfx-evidence/light-particle-before.svg',
  afterSvg: 'hand-lab/out/ci-vfx-evidence/light-particle-after.svg',
  evidence: 'hand-lab/out/ci-vfx-evidence/evidence.json',
  planHash: before.realization.derivedFromLayerPlanHash,
  samePlanHash: before.realization.derivedFromLayerPlanHash === after.realization.derivedFromLayerPlanHash,
  beforeContentHash: before.realization.contentHash,
  afterContentHash: after.realization.contentHash,
}, null, 2));
