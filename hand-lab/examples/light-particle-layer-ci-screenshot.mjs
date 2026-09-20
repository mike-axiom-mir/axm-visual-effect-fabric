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

const graph = {
  ...LIGHT_PARTICLE_LAYER_STATIC_SVG_GRAPH,
  id: 'fx.composition.light-particle-layer-static-svg-ci-evidence',
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
      particlePadding: 28,
      particleMarkerRadius: 3.2,
      maxSvgBytes: 2 * 1024 * 1024,
    },
  }],
};

const run = executeHandGraph({
  registry: compositeRegistry,
  graph,
  initialState: planned,
  context: { callerKind: 'github-ci-evidence' },
});
const realization = run.finalState.realizations.lightParticleLayerStaticSvg;

mkdirSync('hand-lab/out/ci-vfx-evidence', { recursive: true });
writeFileSync('hand-lab/out/ci-vfx-evidence/light-particle-composite.svg', realization.content);
writeFileSync('hand-lab/out/ci-vfx-evidence/evidence.json', JSON.stringify({
  schema: 'axm.vfx-ci-screenshot-evidence/v0.1',
  renderer: realization.renderer,
  realizationHash: realization.realizationHash,
  contentHash: realization.contentHash,
  planHash: realization.derivedFromLayerPlanHash,
  orderMode: realization.orderMode,
  particleBackgroundMode: realization.renderControls.particleBackgroundMode,
  layerOrder: realization.layers.map((layer) => layer.layerId),
  svgBytes: Buffer.byteLength(realization.content),
  finalStateHash: run.finalStateHash,
  screenshotRenderer: 'librsvg/rsvg-convert on github-actions ubuntu-latest',
  visualJudgement: 'NOT_ASSIGNED_BY_CI',
}, null, 2));
console.log(JSON.stringify({
  svg: 'hand-lab/out/ci-vfx-evidence/light-particle-composite.svg',
  evidence: 'hand-lab/out/ci-vfx-evidence/evidence.json',
  renderer: realization.renderer,
  contentHash: realization.contentHash,
  stateHash: run.finalStateHash,
  particleBackgroundMode: realization.renderControls.particleBackgroundMode,
}, null, 2));
