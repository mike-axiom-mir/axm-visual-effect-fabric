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
} from '../src/mask-guided-light-rays.mjs';
import {
  PARTICLE_FLOW_ADVECTION_GRAPH,
  PARTICLE_FLOW_ADVECTION_HANDS,
  makeParticleFlowAdvectionState,
} from '../src/particle-flow-advection.mjs';
import {
  LIGHT_PARTICLE_LAYER_PLAN_GRAPH,
  LIGHT_PARTICLE_LAYER_PLAN_HANDS,
  buildLightParticleLayerPlanHand,
  makeLightParticleLayerPlanState,
  validateLightParticleLayerPlan,
} from '../src/light-particle-layer-plan2d.mjs';

const lightRegistry = createHandRegistry(MASK_GUIDED_LIGHT_RAY_HANDS);
const particleRegistry = createHandRegistry(PARTICLE_FLOW_ADVECTION_HANDS);
const layerRegistry = createHandRegistry(LIGHT_PARTICLE_LAYER_PLAN_HANDS);

const lightGraphWithoutRenderer = Object.freeze({
  ...MASK_GUIDED_LIGHT_RAY_GRAPH,
  id: 'fx.light.mask-guided-rays2d-derived-only-test',
  stages: MASK_GUIDED_LIGHT_RAY_GRAPH.stages.slice(0, 4),
});

function buildLightState(options = {}) {
  const state = makeMaskGuidedLightRayState({
    field: {
      id: options.fieldId ?? 'layer-light-field',
      seed: options.seed ?? 1217,
      frequency: options.frequency ?? 4.25,
      octaves: options.octaves ?? 5,
      lacunarity: 2.05,
      gain: 0.56,
    },
    mask: {
      id: options.maskId ?? 'layer-light-mask',
      threshold: options.threshold ?? 0.5,
      softness: options.softness ?? 0.12,
    },
    ray: {
      id: options.rayId ?? 'layer-rays',
      origin: options.origin ?? [0.18, 0.52],
      directionTurns: options.directionTurns ?? 0,
      spanTurns: options.spanTurns ?? 0.24,
      maxLength: options.maxLength ?? 1.3,
      weightPower: options.weightPower ?? 1,
    },
  });
  return executeHandGraph({
    registry: lightRegistry,
    graph: lightGraphWithoutRenderer,
    initialState: state,
    context: { callerKind: 'fixture' },
  }).finalState;
}

function buildParticleState(particles = null, options = {}) {
  const seeds = particles ?? [
    { id: 'p0', x: 0.2, y: 0.25, tag: 'a' },
    { id: 'p1', x: 0.45, y: 0.55, tag: 'b' },
    { id: 'p2', x: 0.72, y: 0.68, tag: 'c' },
  ];
  const state = makeParticleFlowAdvectionState(seeds, {
    id: options.id ?? 'layer-particles',
    stepSize: options.stepSize ?? 0.032,
    steps: options.steps ?? 8,
    field: {
      id: options.fieldId ?? 'layer-particle-field',
      seed: options.seed ?? 7703,
      frequency: options.frequency ?? 4.75,
      octaves: options.octaves ?? 4,
      lacunarity: 2,
      gain: 0.5,
    },
    flow: {
      id: options.flowId ?? 'layer-particle-flow',
      mode: options.mode ?? 'tangent',
      sampleStep: 0.015625,
      strength: options.strength ?? 1,
    },
  });
  return executeHandGraph({
    registry: particleRegistry,
    graph: PARTICLE_FLOW_ADVECTION_GRAPH,
    initialState: state,
    context: { callerKind: 'fixture' },
  }).finalState;
}

function runLayerPlan(state, callerKind = 'test', orderMode = 'rays-under-particles') {
  const graph = {
    ...LIGHT_PARTICLE_LAYER_PLAN_GRAPH,
    stages: [{
      ...LIGHT_PARTICLE_LAYER_PLAN_GRAPH.stages[0],
      params: { id: 'light-particle-layer-plan', orderMode },
    }],
  };
  return executeHandGraph({
    registry: layerRegistry,
    graph,
    initialState: state,
    context: { callerKind },
  });
}

function selectedPlan(state) {
  return state.effectLayerPlans['light-particle-layer-plan'];
}

function selectedRaySet(lightState) {
  return lightState.lightRaySets[lightState.lightRaySource.id];
}

function selectedParticleSet(particleState) {
  return particleState.flowAdvectedParticleSets[particleState.particleFlowSource.id];
}

function selfHashRaySet(raySet) {
  return hashValue({
    schema: raySet.schema,
    raySourceHash: raySet.raySourceHash,
    fieldSourceHash: raySet.fieldSourceHash,
    maskSourceHash: raySet.maskSourceHash,
    rayCount: raySet.rayCount,
    samplesPerRay: raySet.samplesPerRay,
    rays: raySet.rays,
  });
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

test('light/particle layer plan is caller-neutral and preserves both donor states independently', () => {
  const light = buildLightState();
  const particles = buildParticleState();
  const state = makeLightParticleLayerPlanState(light, particles);
  state.unrelated = { owner: 'caller', note: 'must survive' };

  const human = runLayerPlan(state, 'human');
  const machine = runLayerPlan(state, 'machine');
  const humanPlan = selectedPlan(human.finalState);
  const machinePlan = selectedPlan(machine.finalState);

  assert.equal(human.finalStateHash, machine.finalStateHash);
  assert.equal(humanPlan.planHash, machinePlan.planHash);
  assert.deepEqual(human.finalState.lightRayState, light);
  assert.deepEqual(human.finalState.particleFlowState, particles);
  assert.deepEqual(human.finalState.unrelated, state.unrelated);
  assert.equal(humanPlan.derived, true);
  assert.equal(humanPlan.rebuildable, true);
  assert.equal(humanPlan.layers.length, 2);
  assert.equal(humanPlan.blendModeAuthority, 'none');
  assert.equal(humanPlan.materialAuthority, 'none');
  assert.equal(humanPlan.rendererAuthority, 'none');
  assert.equal(humanPlan.consumerAuthority, 'none');
});

test('render order is derived-only: reversing order changes only the plan while donor lineage stays exact', () => {
  const light = buildLightState();
  const particles = buildParticleState();
  const state = makeLightParticleLayerPlanState(light, particles);
  const under = runLayerPlan(state, 'test', 'rays-under-particles').finalState;
  const over = runLayerPlan(state, 'test', 'particles-under-rays').finalState;
  const underPlan = selectedPlan(under);
  const overPlan = selectedPlan(over);

  assert.notEqual(underPlan.planHash, overPlan.planHash);
  assert.deepEqual(underPlan.layers.map((layer) => layer.layerId), ['light-rays', 'particles']);
  assert.deepEqual(overPlan.layers.map((layer) => layer.layerId), ['particles', 'light-rays']);
  assert.equal(under.lightRayState.lightRaySourceHash, over.lightRayState.lightRaySourceHash);
  assert.equal(selectedRaySet(under.lightRayState).raySetHash, selectedRaySet(over.lightRayState).raySetHash);
  assert.equal(under.particleFlowState.particleFlowSourceHash, over.particleFlowState.particleFlowSourceHash);
  assert.equal(selectedParticleSet(under.particleFlowState).particleSetHash, selectedParticleSet(over.particleFlowState).particleSetHash);
  assert.equal(underPlan.sourceMerge, 'none');
  assert.equal(overPlan.opacityAuthority, 'none');
});

test('same bounded composition contract accepts materially different light and particle forms without consumer meaning', () => {
  const compact = makeLightParticleLayerPlanState(
    buildLightState({ rayId: 'compact-rays', origin: [0.08, 0.5], spanTurns: 0.12, seed: 99 }),
    buildParticleState([
      { id: 'left', x: 0.15, y: 0.3 },
      { id: 'right', x: 0.82, y: 0.7 },
    ], { id: 'compact-particles', steps: 4, seed: 555 }),
  );
  const radial = makeLightParticleLayerPlanState(
    buildLightState({ rayId: 'radial-rays', origin: [0.5, 0.5], spanTurns: 1, seed: 1001 }),
    buildParticleState(Array.from({ length: 9 }, (_, index) => ({
      id: `ring-${index}`,
      x: Number((0.5 + Math.cos((index / 9) * Math.PI * 2) * 0.24).toFixed(6)),
      y: Number((0.5 + Math.sin((index / 9) * Math.PI * 2) * 0.24).toFixed(6)),
    })), { id: 'radial-particles', steps: 12, seed: 1111 }),
  );

  const a = selectedPlan(runLayerPlan(compact).finalState);
  const b = selectedPlan(runLayerPlan(radial).finalState);
  assert.notEqual(a.planHash, b.planHash);
  assert.equal(a.contract, b.contract);
  assert.equal(a.coordinateSpace, 'normalized-2d');
  assert.equal(b.layerAuthority, 'derived-order-only');
  assert.equal(a.sourceMerge, 'none');
  assert.equal(b.consumerAuthority, 'none');
});

test('self-consistently rehashed light-ray working-set tampering is rejected by donor rebuild', () => {
  const state = makeLightParticleLayerPlanState(buildLightState(), buildParticleState());
  const tampered = deepClone(state);
  const raySet = selectedRaySet(tampered.lightRayState);
  raySet.rays[0].weight = raySet.rays[0].weight > 0.5 ? 0.125 : 0.875;
  raySet.raySetHash = selfHashRaySet(raySet);

  assert.throws(
    () => buildLightParticleLayerPlanHand.execute(tampered),
    /light-ray set does not rebuild from retained donor truth/,
  );
});

test('self-consistently rehashed particle working-set tampering is rejected by donor rebuild', () => {
  const state = makeLightParticleLayerPlanState(buildLightState(), buildParticleState());
  const tampered = deepClone(state);
  const particleSet = selectedParticleSet(tampered.particleFlowState);
  particleSet.particles[0].x = particleSet.particles[0].x > 0.5 ? 0.25 : 0.75;
  particleSet.particleSetHash = selfHashParticleSet(particleSet);

  assert.throws(
    () => buildLightParticleLayerPlanHand.execute(tampered),
    /particle set does not rebuild from retained donor truth/,
  );
});

test('self-consistently rehashed layer-plan tampering cannot become derived truth', () => {
  const state = makeLightParticleLayerPlanState(buildLightState(), buildParticleState());
  const built = runLayerPlan(state).finalState;
  const plan = selectedPlan(built);
  const tampered = deepClone(plan);
  tampered.layers[0].itemCount += 1;
  tampered.planHash = selfHashPlan(tampered);

  assert.throws(
    () => validateLightParticleLayerPlan(built, tampered),
    /does not rebuild from retained donor truth/,
  );

  const forged = deepClone(plan);
  forged.blendModeAuthority = 'multiply';
  forged.planHash = selfHashPlan(forged);
  assert.throws(
    () => validateLightParticleLayerPlan(built, forged),
    /blendModeAuthority semantics are invalid/,
  );
});

test('composition stays deliberately narrow: invalid ordering, missing donors and extra layers fail explicitly', () => {
  const state = makeLightParticleLayerPlanState(buildLightState(), buildParticleState());
  assert.throws(
    () => buildLightParticleLayerPlanHand.execute(state, { orderMode: 'depth-sort' }),
    /must be rays-under-particles or particles-under-rays/,
  );

  const missingLight = deepClone(state);
  delete missingLight.lightRayState.lightRaySets[missingLight.lightRayState.lightRaySource.id];
  assert.throws(
    () => buildLightParticleLayerPlanHand.execute(missingLight),
    /requires derived light-ray set/,
  );

  const built = runLayerPlan(state).finalState;
  const extra = deepClone(selectedPlan(built));
  extra.layers.push(deepClone(extra.layers[0]));
  extra.planHash = selfHashPlan(extra);
  assert.throws(
    () => validateLightParticleLayerPlan(built, extra),
    /exactly two independent layers/,
  );
});
