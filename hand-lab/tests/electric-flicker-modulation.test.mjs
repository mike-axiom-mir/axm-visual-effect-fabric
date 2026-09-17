import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph, hashValue } from '../src/hand-runtime.mjs';
import {
  branchPathHand,
  energyHand,
  seedPathHand,
} from '../src/electric-hands.mjs';
import { normalizeFlickerCycleSourceHand } from '../src/flicker-cycle1d.mjs';
import {
  ELECTRIC_FLICKER_MODULATION_GRAPH,
  ELECTRIC_FLICKER_MODULATION_HANDS,
  makeElectricFlickerModulationState,
  modulateElectricPathsWithFlickerHand,
  normalizeElectricFlickerModulationRequestHand,
  validateElectricFlickerModulatedPathSet,
} from '../src/electric-flicker-modulation.mjs';

const registry = createHandRegistry(ELECTRIC_FLICKER_MODULATION_HANDS);

function initial(overrides = {}) {
  const state = makeElectricFlickerModulationState({
    seed: 2468,
    id: 'fixture-electric-flicker',
    strength: 0.85,
    floor: 0.25,
    flicker: {
      id: 'fixture-cycle',
      seed: 777,
      slotCount: 11,
      minValue: -2,
      maxValue: 3,
      responsePower: 1.15,
      phaseOffset: 0.07,
    },
    ...overrides,
  });
  state.consumerMetadata = { untouched: true, label: 'neutral-fixture' };
  return state;
}

function run(state = initial(), callerKind = 'human') {
  return executeHandGraph({ registry, graph: ELECTRIC_FLICKER_MODULATION_GRAPH, initialState: state, context: { callerKind } });
}

function prepare(state = initial()) {
  let next = seedPathHand.execute(state, { segments: 18, jitter: 0.06 }, {}).state;
  next = branchPathHand.execute(next, { branchCount: 7, spread: 0.12 }, {}).state;
  next = energyHand.execute(next, { trunkWidth: 1 }, {}).state;
  next = normalizeFlickerCycleSourceHand.execute(next, {}, {}).state;
  next = normalizeElectricFlickerModulationRequestHand.execute(next, {}, {}).state;
  return next;
}

function selected(state) {
  return state.flickerModulatedElectricPathSets['fixture-electric-flicker'];
}

function setHashPayload(set) {
  return {
    schema: set.schema,
    basePathsHash: set.basePathsHash,
    flickerCycleSourceHash: set.flickerCycleSourceHash,
    electricFlickerModulationSourceHash: set.electricFlickerModulationSourceHash,
    phase: set.phase,
    sampleValue: set.sampleValue,
    normalizedSample: set.normalizedSample,
    factor: set.factor,
    paths: set.paths,
    pathSetHash: set.pathSetHash,
    pathCount: set.pathCount,
    pointCount: set.pointCount,
    derived: set.derived,
    rebuildable: set.rebuildable,
  };
}

test('human and machine callers produce identical flicker-modulated electric path sets', () => {
  const human = run(initial(), 'human');
  const machine = run(initial(), 'machine');
  const humanSet = selected(human.finalState);
  const machineSet = selected(machine.finalState);

  assert.equal(human.finalState.electricBasePathsHash, machine.finalState.electricBasePathsHash);
  assert.equal(human.finalState.flickerCycleSourceHash, machine.finalState.flickerCycleSourceHash);
  assert.equal(humanSet.modulatedSetHash, machineSet.modulatedSetHash);
  assert.deepEqual(humanSet, machineSet);
  assert.deepEqual(human.finalState.consumerMetadata, initial().consumerMetadata);
});

test('phase is rebuildable working state: loop-equivalent phases match while distinct phases can change energy', () => {
  const base = prepare();
  const atZero = modulateElectricPathsWithFlickerHand.execute(base, { phase: 0 }, {}).state;
  const atOne = modulateElectricPathsWithFlickerHand.execute(base, { phase: 1 }, {}).state;
  const later = modulateElectricPathsWithFlickerHand.execute(base, { phase: 0.43 }, {}).state;

  assert.equal(selected(atZero).phase, 0);
  assert.equal(selected(atOne).phase, 0);
  assert.equal(selected(atZero).modulatedSetHash, selected(atOne).modulatedSetHash);
  assert.notEqual(selected(atZero).factor, selected(later).factor);
  assert.notEqual(selected(atZero).pathSetHash, selected(later).pathSetHash);
  assert.equal(atZero.flickerCycleSourceHash, later.flickerCycleSourceHash);
  assert.equal(atZero.electricBasePathsHash, later.electricBasePathsHash);
});

test('zero strength preserves profiled electric paths exactly while leaving flicker truth available', () => {
  const base = prepare(initial({ strength: 0 }));
  const basePaths = structuredClone(base.paths);
  const result = modulateElectricPathsWithFlickerHand.execute(base, { phase: 0.37 }, {}).state;
  const set = selected(result);

  assert.equal(set.factor, 1);
  assert.deepEqual(set.paths, basePaths);
  assert.deepEqual(result.paths, basePaths);
  assert.ok(result.flickerCycleSourceHash);
});

test('constant flicker range is an exact no-op instead of inventing arbitrary normalization', () => {
  const base = prepare(initial({
    flicker: {
      id: 'fixture-cycle',
      seed: 123,
      slotCount: 16,
      minValue: 4.5,
      maxValue: 4.5,
      responsePower: 2,
      phaseOffset: 0.2,
    },
  }));
  const result = modulateElectricPathsWithFlickerHand.execute(base, { phase: 0.61 }, {}).state;
  const set = selected(result);

  assert.equal(set.sampleValue, 4.5);
  assert.equal(set.normalizedSample, 1);
  assert.equal(set.factor, 1);
  assert.deepEqual(set.paths, base.paths);
});

test('flicker and electric binding semantics remain independently hash-bound and reject self-consistent forgery', () => {
  const base = prepare();

  const forgedFlicker = structuredClone(base);
  forgedFlicker.flickerCycleSource.interpolation = 'nearest';
  forgedFlicker.flickerCycleSourceHash = hashValue(forgedFlicker.flickerCycleSource);
  assert.throws(
    () => modulateElectricPathsWithFlickerHand.execute(forgedFlicker, { phase: 0.2 }, {}),
    /interpolation is invalid/,
  );

  const forgedBinding = structuredClone(base);
  forgedBinding.electricFlickerModulationSource.mapping = 'convenient-direct-multiply/v9';
  forgedBinding.electricFlickerModulationSourceHash = hashValue(forgedBinding.electricFlickerModulationSource);
  assert.throws(
    () => modulateElectricPathsWithFlickerHand.execute(forgedBinding, { phase: 0.2 }, {}),
    /mapping is invalid/,
  );
});

test('self-consistent derived path tampering is rejected by exact source-truth rebuild', () => {
  const result = modulateElectricPathsWithFlickerHand.execute(prepare(), { phase: 0.31 }, {}).state;
  const tampered = structuredClone(result);
  const set = selected(tampered);
  set.paths[0].energy = Number((set.paths[0].energy * 0.5).toFixed(6));
  set.pathSetHash = hashValue(set.paths);
  set.modulatedSetHash = hashValue(setHashPayload(set));

  assert.throws(
    () => validateElectricFlickerModulatedPathSet(tampered, set),
    /does not rebuild from retained source truth/,
  );
});

test('retained electric path drift, invalid controls, and excessive work fail loudly', () => {
  const built = modulateElectricPathsWithFlickerHand.execute(prepare(), { phase: 0.22 }, {}).state;
  const drifted = structuredClone(built);
  drifted.paths[0].energy = 0.123456;
  assert.throws(
    () => validateElectricFlickerModulatedPathSet(drifted, selected(drifted)),
    /base path hash mismatch/,
  );

  const badStrength = initial({ strength: 1.1 });
  assert.throws(() => prepare(badStrength), /strength.*\[0,1\]/);
  const badFloor = initial({ floor: -0.1 });
  assert.throws(() => prepare(badFloor), /floor.*\[0,1\]/);

  const tooManyPaths = prepare();
  tooManyPaths.paths = Array.from({ length: 65 }, (_, index) => ({
    id: `budget-${index}`,
    role: 'branch',
    energy: 1,
    points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
  }));
  tooManyPaths.electricBasePathsHash = hashValue(tooManyPaths.paths);
  assert.throws(
    () => modulateElectricPathsWithFlickerHand.execute(tooManyPaths, { phase: 0 }, {}),
    /pathCount exceeds structural ceiling 64/,
  );
});
