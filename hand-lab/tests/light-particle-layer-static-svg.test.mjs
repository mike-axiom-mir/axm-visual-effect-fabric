import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createHandRegistry,
  deepClone,
  executeHandGraph,
  hashValue,
} from '../src/hand-runtime.mjs';
import {
  MASK_GUIDED_LIGHT_RAY_GRAPH,
  MASK_GUIDED_LIGHT_RAY_HANDS,
  makeMaskGuidedLightRayState,
  realizeMaskGuidedLightRaysStaticSvgHand,
} from '../src/mask-guided-light-rays.mjs';
import {
  PARTICLE_FLOW_ADVECTION_GRAPH,
  PARTICLE_FLOW_ADVECTION_HANDS,
  makeParticleFlowAdvectionState,
} from '../src/particle-flow-advection.mjs';
import { particleFlowStaticSvgHand } from '../src/particle-flow-static-svg.mjs';
import {
  buildLightParticleLayerPlanHand,
  makeLightParticleLayerPlanState,
} from '../src/light-particle-layer-plan2d.mjs';
import {
  LIGHT_PARTICLE_LAYER_STATIC_SVG_GRAPH,
  LIGHT_PARTICLE_LAYER_STATIC_SVG_HANDS,
  realizeLightParticleLayerStaticSvgHand,
} from '../src/light-particle-layer-static-svg.mjs';

const lightRegistry = createHandRegistry(MASK_GUIDED_LIGHT_RAY_HANDS);
const particleRegistry = createHandRegistry(PARTICLE_FLOW_ADVECTION_HANDS);
const compositeRegistry = createHandRegistry(LIGHT_PARTICLE_LAYER_STATIC_SVG_HANDS);

const lightGraphWithoutRenderer = Object.freeze({
  ...MASK_GUIDED_LIGHT_RAY_GRAPH,
  id: 'fx.light.mask-guided-rays2d-derived-only-composite-test',
  stages: MASK_GUIDED_LIGHT_RAY_GRAPH.stages.slice(0, 4),
});

function buildLightState(options = {}) {
  const initialState = makeMaskGuidedLightRayState({
    field: {
      id: options.fieldId ?? 'composite-light-field',
      seed: options.seed ?? 31415,
      frequency: options.frequency ?? 3.8,
      octaves: 4,
      lacunarity: 2,
      gain: 0.52,
    },
    mask: {
      id: options.maskId ?? 'composite-light-mask',
      threshold: options.threshold ?? 0.48,
      softness: options.softness ?? 0.14,
    },
    ray: {
      id: options.rayId ?? 'composite-rays',
      origin: options.origin ?? [0.16, 0.5],
      directionTurns: options.directionTurns ?? 0,
      spanTurns: options.spanTurns ?? 0.22,
      maxLength: options.maxLength ?? 1.25,
      weightPower: 1,
    },
  });
  return executeHandGraph({
    registry: lightRegistry,
    graph: lightGraphWithoutRenderer,
    initialState,
    context: { callerKind: 'fixture' },
  }).finalState;
}

function buildParticleState(options = {}) {
  const particles = options.particles ?? [
    { id: 'a', x: 0.2, y: 0.3 },
    { id: 'b', x: 0.48, y: 0.58 },
    { id: 'c', x: 0.75, y: 0.66 },
  ];
  const initialState = makeParticleFlowAdvectionState(particles, {
    id: options.id ?? 'composite-particles',
    stepSize: options.stepSize ?? 0.03,
    steps: options.steps ?? 6,
    field: {
      id: options.fieldId ?? 'composite-particle-field',
      seed: options.seed ?? 27182,
      frequency: 4.25,
      octaves: 4,
      lacunarity: 2,
      gain: 0.5,
    },
    flow: {
      id: options.flowId ?? 'composite-flow',
      mode: options.mode ?? 'tangent',
      sampleStep: 0.015625,
      strength: 1,
    },
  });
  return executeHandGraph({
    registry: particleRegistry,
    graph: PARTICLE_FLOW_ADVECTION_GRAPH,
    initialState,
    context: { callerKind: 'fixture' },
  }).finalState;
}

function preparedState(orderMode = 'rays-under-particles', planId = 'light-particle-layer-plan') {
  const base = makeLightParticleLayerPlanState(buildLightState(), buildParticleState());
  return buildLightParticleLayerPlanHand.execute(base, { id: planId, orderMode }).state;
}

function runComposite(state, callerKind = 'test', params = {}) {
  const graph = {
    ...LIGHT_PARTICLE_LAYER_STATIC_SVG_GRAPH,
    stages: [{
      ...LIGHT_PARTICLE_LAYER_STATIC_SVG_GRAPH.stages[0],
      params: {
        ...LIGHT_PARTICLE_LAYER_STATIC_SVG_GRAPH.stages[0].params,
        ...params,
      },
    }],
  };
  return executeHandGraph({
    registry: compositeRegistry,
    graph,
    initialState: state,
    context: { callerKind },
  });
}

function realization(state) {
  return state.realizations.lightParticleLayerStaticSvg;
}

function selectedParticleSet(state) {
  return state.particleFlowState.flowAdvectedParticleSets[state.particleFlowState.particleFlowSource.id];
}

function selfHashParticleSet(particleSet) {
  const payload = deepClone(particleSet);
  delete payload.particleSetHash;
  return hashValue(payload);
}

function selfHashPlan(plan) {
  return hashValue({
    schema: plan.schema,
    contract: plan.contract,
    coordinateSpace: plan.coordinateSpace,
    layerAuthority: plan.layerAuthority,
    blendModeAuthority: plan.blendModeAuthority,
    opacityAuthority: plan.opacityAuthority,
    materialAuthority: plan.materialAuthority,
    rendererAuthority: plan.rendererAuthority,
    consumerAuthority: plan.consumerAuthority,
    geometryMutation: plan.geometryMutation,
    sourceMerge: plan.sourceMerge,
    id: plan.id,
    orderMode: plan.orderMode,
    layers: plan.layers,
    derived: plan.derived,
    rebuildable: plan.rebuildable,
  });
}

test('composite static SVG is caller-neutral, derived/replaceable and preserves both donor states', () => {
  const state = preparedState();
  state.unrelated = { owner: 'caller', note: 'must survive' };
  const lightBefore = deepClone(state.lightRayState);
  const particleBefore = deepClone(state.particleFlowState);
  const planBefore = deepClone(state.effectLayerPlans['light-particle-layer-plan']);

  const human = runComposite(state, 'human');
  const machine = runComposite(state, 'machine');
  const view = realization(human.finalState);

  assert.equal(human.finalStateHash, machine.finalStateHash);
  assert.equal(view.realizationHash, realization(machine.finalState).realizationHash);
  assert.deepEqual(human.finalState.lightRayState, lightBefore);
  assert.deepEqual(human.finalState.particleFlowState, particleBefore);
  assert.deepEqual(human.finalState.effectLayerPlans['light-particle-layer-plan'], planBefore);
  assert.deepEqual(human.finalState.unrelated, state.unrelated);
  assert.equal(view.derived, true);
  assert.equal(view.replaceable, true);
  assert.equal(view.semantics.orderAuthority, 'verified-layer-plan-only');
  assert.equal(view.semantics.subrealizationMutation, 'none');
  assert.equal(view.semantics.blendModeAuthority, 'none');
  assert.equal(view.semantics.materialAuthority, 'none');
  assert.equal(view.semantics.canonicalAuthority, 'none');
  assert.equal(view.semantics.consumerAuthority, 'none');
  assert.equal(view.semantics.particleBackdropAuthority, 'renderer-local-only');
  assert.equal(view.renderControls.particleBackgroundMode, 'transparent');
  assert.equal(view.renderer, 'axm.vfx.light-particle-layer-static-svg/v0.2');
  assert.equal(view.renderControls.lightPresentationMode, 'volumetric-light');
  assert.match(view.content, /data-presentation-mode="volumetric-light"/);
  assert.match(view.content, /data-layer="ray-haze"/);
  assert.match(view.content, /data-layer="ray-beam"/);
  assert.match(view.content, /data-layer="ray-core"/);
});

test('verified plan order alone controls subrealization paint order while both subrender hashes stay unchanged', () => {
  const under = realization(runComposite(preparedState('rays-under-particles')).finalState);
  const over = realization(runComposite(preparedState('particles-under-rays')).finalState);

  assert.deepEqual(under.layers.map((layer) => layer.layerId), ['light-rays', 'particles']);
  assert.deepEqual(over.layers.map((layer) => layer.layerId), ['particles', 'light-rays']);
  assert.notEqual(under.contentHash, over.contentHash);
  assert.notEqual(under.realizationHash, over.realizationHash);
  const underHashes = Object.fromEntries(under.layers.map((layer) => [layer.layerId, layer.contentHash]));
  const overHashes = Object.fromEntries(over.layers.map((layer) => [layer.layerId, layer.contentHash]));
  assert.deepEqual(underHashes, overHashes);
  assert.ok(under.content.indexOf('data-layer-id="light-rays"') < under.content.indexOf('data-layer-id="particles"'));
  assert.ok(over.content.indexOf('data-layer-id="particles"') < over.content.indexOf('data-layer-id="light-rays"'));
});

test('compositor embeds existing light and particle SVG outputs verbatim instead of duplicating their geometry logic', () => {
  const state = preparedState();
  const light = realizeMaskGuidedLightRaysStaticSvgHand.execute(state.lightRayState, {
    width: 640,
    height: 420,
    strokeWidth: 1.5,
    minOpacity: 0,
    maxOpacity: 0.85,
    strokeColor: '#69d7ff',
    presentationMode: 'volumetric-light',
    hazeWidthMultiplier: 7.5,
    beamWidthMultiplier: 2.8,
    hazeBlur: 3.8,
    coreThreshold: 0.58,
    tipOpacity: 0.035,
    originGlowRadius: 30,
  }).state.realizations.maskGuidedLightRaysStaticSvg;
  const particles = particleFlowStaticSvgHand.execute(state.particleFlowState, {
    width: 640,
    height: 420,
    padding: 20,
    markerRadius: 2.4,
    maxParticles: 2048,
    maxSamples: 65536,
    backgroundMode: 'transparent',
  }).state.realizations.particleFlowStaticSvg;
  const composite = realization(runComposite(state).finalState);
  const byId = Object.fromEntries(composite.layers.map((layer) => [layer.layerId, layer]));

  assert.equal(byId['light-rays'].renderer, light.renderer);
  assert.equal(byId['light-rays'].contentHash, hashValue(light.content));
  assert.equal(byId.particles.renderer, particles.renderer);
  assert.equal(byId.particles.contentHash, hashValue(particles.content));
  assert.ok(composite.content.includes(light.content));
  assert.ok(composite.content.includes(particles.content));
  assert.equal(particles.backgroundMode, 'transparent');
  assert.doesNotMatch(particles.content, /data-layer="inspection-background"/);
});

test('composition removes the known opaque particle inspection backdrop without changing standalone donor default', () => {
  const state = preparedState('rays-under-particles');
  const standalone = particleFlowStaticSvgHand.execute(state.particleFlowState, {
    width: 640,
    height: 420,
    padding: 20,
    markerRadius: 2.4,
    maxParticles: 2048,
    maxSamples: 65536,
  }).state.realizations.particleFlowStaticSvg;
  const composite = realization(runComposite(state).finalState);

  assert.equal(standalone.backgroundMode, 'opaque-inspection');
  assert.match(standalone.content, /data-layer="inspection-background"/);
  assert.equal(composite.renderControls.particleBackgroundMode, 'transparent');
  assert.match(composite.content, /data-background-mode="transparent"/);
  assert.doesNotMatch(composite.content, /data-layer="inspection-background"/);
  assert.deepEqual(composite.layers.map((layer) => layer.layerId), ['light-rays', 'particles']);
});

test('renderer-local controls can change inspection output without rewriting plan or donor truth', () => {
  const state = preparedState();
  const narrow = realizeLightParticleLayerStaticSvgHand.execute(state, {
    lightStrokeWidth: 0.75,
    particleMarkerRadius: 1.5,
  }).state;
  const broad = realizeLightParticleLayerStaticSvgHand.execute(state, {
    lightStrokeWidth: 3,
    particleMarkerRadius: 4,
  }).state;

  assert.notEqual(realization(narrow).contentHash, realization(broad).contentHash);
  assert.equal(realization(narrow).derivedFromLayerPlanHash, realization(broad).derivedFromLayerPlanHash);
  assert.deepEqual(narrow.lightRayState, state.lightRayState);
  assert.deepEqual(broad.lightRayState, state.lightRayState);
  assert.deepEqual(narrow.particleFlowState, state.particleFlowState);
  assert.deepEqual(broad.particleFlowState, state.particleFlowState);
});

test('self-consistently rehashed donor tampering is rejected before SVG composition', () => {
  const state = preparedState();
  const tampered = deepClone(state);
  const particleSet = selectedParticleSet(tampered);
  particleSet.particles[0].x = particleSet.particles[0].x > 0.5 ? 0.2 : 0.8;
  particleSet.particleSetHash = selfHashParticleSet(particleSet);

  assert.throws(
    () => realizeLightParticleLayerStaticSvgHand.execute(tampered),
    /particle set does not rebuild from retained donor truth/,
  );
});

test('self-consistently rehashed plan tampering cannot become renderer input truth', () => {
  const state = preparedState();
  const tampered = deepClone(state);
  const plan = tampered.effectLayerPlans['light-particle-layer-plan'];
  plan.layers[0].itemCount += 1;
  plan.planHash = selfHashPlan(plan);

  assert.throws(
    () => realizeLightParticleLayerStaticSvgHand.execute(tampered),
    /layer plan does not rebuild from retained donor truth/,
  );
});

test('renderer boundary is explicit: ids are escaped and missing plans, invalid controls and output budgets fail', () => {
  const specialId = 'plan" <neutral>';
  const special = preparedState('particles-under-rays', specialId);
  const rendered = realizeLightParticleLayerStaticSvgHand.execute(special, { planId: specialId }).state;
  assert.ok(realization(rendered).content.includes('data-plan-id="plan&quot; &lt;neutral&gt;"'));
  assert.equal(realization(rendered).planId, specialId);

  const missing = deepClone(preparedState());
  delete missing.effectLayerPlans['light-particle-layer-plan'];
  assert.throws(
    () => realizeLightParticleLayerStaticSvgHand.execute(missing),
    /requires verified layer plan/,
  );
  assert.throws(
    () => realizeLightParticleLayerStaticSvgHand.execute(preparedState(), { lightMinOpacity: 0.9, lightMaxOpacity: 0.2 }),
    /lightMaxOpacity must be >= lightMinOpacity/,
  );
  assert.throws(
    () => realizeLightParticleLayerStaticSvgHand.execute(preparedState(), { maxParticles: 1 }),
    /particleFlowSvg particle budget exceeded/,
  );
  assert.throws(
    () => realizeLightParticleLayerStaticSvgHand.execute(preparedState(), { maxSvgBytes: 512 }),
    /embedded SVG budget exceeded|output byte budget exceeded/,
  );
});
