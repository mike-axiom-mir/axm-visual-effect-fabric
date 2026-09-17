import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph, hashValue } from '../src/hand-runtime.mjs';
import {
  FLICKER_CYCLE_GRAPH,
  FLICKER_CYCLE_HANDS,
  normalizeFlickerCycleSourceHand,
  buildFlickerCycleSamplesHand,
  sampleFlickerCycleSource,
  validateFlickerCycleSampleSet,
  makeFlickerCycleState,
} from '../src/flicker-cycle1d.mjs';

const registry = createHandRegistry(FLICKER_CYCLE_HANDS);

function initial(overrides = {}) {
  const state = makeFlickerCycleState({
    id: 'fixture-flicker',
    seed: 2468,
    slotCount: 9,
    minValue: 0.15,
    maxValue: 0.95,
    responsePower: 1.2,
    phaseOffset: 0.125,
    ...overrides,
  });
  state.consumerMetadata = { untouched: true, label: 'neutral-fixture' };
  return state;
}

function run(state, callerKind = 'human') {
  return executeHandGraph({ registry, graph: FLICKER_CYCLE_GRAPH, initialState: state, context: { callerKind } });
}

function normalize(state = initial()) {
  return normalizeFlickerCycleSourceHand.execute(state, {}, {}).state;
}

function sampleHashPayload(sampleSet) {
  return {
    schema: sampleSet.schema,
    sourceHash: sampleSet.sourceHash,
    sampleCount: sampleSet.sampleCount,
    samples: sampleSet.samples,
    minValue: sampleSet.minValue,
    maxValue: sampleSet.maxValue,
    derived: sampleSet.derived,
    rebuildable: sampleSet.rebuildable,
  };
}

test('human and machine callers produce identical retained flicker truth and derived samples', () => {
  const human = run(initial(), 'human');
  const machine = run(initial(), 'machine');
  assert.equal(human.finalState.flickerCycleSourceHash, machine.finalState.flickerCycleSourceHash);
  assert.equal(
    human.finalState.flickerCycleSamples['fixture-flicker'].sampleSetHash,
    machine.finalState.flickerCycleSamples['fixture-flicker'].sampleSetHash,
  );
  assert.deepEqual(human.finalState.flickerCycleSource, machine.finalState.flickerCycleSource);
  assert.deepEqual(human.finalState.consumerMetadata, initial().consumerMetadata);
});

test('periodic source wraps exactly across the normalized cycle seam', () => {
  const normalized = normalize();
  const source = normalized.flickerCycleSource;
  const atZero = sampleFlickerCycleSource(source, 0);
  assert.equal(sampleFlickerCycleSource(source, 1), atZero);
  assert.equal(sampleFlickerCycleSource(source, -1), atZero);
  assert.equal(sampleFlickerCycleSource(source, 2), atZero);
  assert.equal(sampleFlickerCycleSource(source, 0.25), sampleFlickerCycleSource(source, 1.25));

  const built = buildFlickerCycleSamplesHand.execute(normalized, { sampleCount: 17 }, {}).state;
  const samples = built.flickerCycleSamples['fixture-flicker'].samples;
  assert.equal(samples[0].value, samples.at(-1).value);
  assert.equal(samples[0].phase, 0);
  assert.equal(samples.at(-1).phase, 1);
});

test('sample density remains rebuildable and does not rewrite canonical flicker source truth', () => {
  const normalized = normalize();
  const sourceHash = normalized.flickerCycleSourceHash;
  const sourceSnapshot = structuredClone(normalized.flickerCycleSource);

  const coarse = buildFlickerCycleSamplesHand.execute(normalized, { sampleCount: 9 }, {}).state;
  const dense = buildFlickerCycleSamplesHand.execute(normalized, { sampleCount: 257 }, {}).state;
  assert.equal(coarse.flickerCycleSourceHash, sourceHash);
  assert.equal(dense.flickerCycleSourceHash, sourceHash);
  assert.deepEqual(coarse.flickerCycleSource, sourceSnapshot);
  assert.deepEqual(dense.flickerCycleSource, sourceSnapshot);
  assert.notEqual(
    coarse.flickerCycleSamples['fixture-flicker'].sampleSetHash,
    dense.flickerCycleSamples['fixture-flicker'].sampleSetHash,
  );
});

test('constant range is an exact modulation no-op regardless of seed or slots', () => {
  const a = run(initial({ seed: 1, slotCount: 2, minValue: 3.5, maxValue: 3.5 }));
  const b = run(initial({ seed: 4_294_967_295, slotCount: 256, minValue: 3.5, maxValue: 3.5 }));
  for (const result of [a, b]) {
    const sampleSet = result.finalState.flickerCycleSamples['fixture-flicker'];
    assert.equal(sampleSet.minValue, 3.5);
    assert.equal(sampleSet.maxValue, 3.5);
    assert.ok(sampleSet.samples.every((sample) => sample.value === 3.5));
  }
});

test('seed and retained phase offset produce materially distinct procedural cycles under one contract', () => {
  const seedA = run(initial({ seed: 11, phaseOffset: 0 }));
  const seedB = run(initial({ seed: 12, phaseOffset: 0 }));
  const shifted = run(initial({ seed: 11, phaseOffset: 0.3 }));

  assert.notEqual(seedA.finalState.flickerCycleSourceHash, seedB.finalState.flickerCycleSourceHash);
  assert.notEqual(
    seedA.finalState.flickerCycleSamples['fixture-flicker'].sampleSetHash,
    seedB.finalState.flickerCycleSamples['fixture-flicker'].sampleSetHash,
  );
  assert.notEqual(seedA.finalState.flickerCycleSourceHash, shifted.finalState.flickerCycleSourceHash);
  assert.notEqual(
    seedA.finalState.flickerCycleSamples['fixture-flicker'].sampleSetHash,
    shifted.finalState.flickerCycleSamples['fixture-flicker'].sampleSetHash,
  );
  assert.equal(seedA.finalState.flickerCycleSource.algorithm, shifted.finalState.flickerCycleSource.algorithm);
  assert.equal(seedA.finalState.flickerCycleSource.phaseDomain, 'normalized-cycle');
});

test('self-consistent source semantic forgery and derived sample tampering are rejected', () => {
  const normalized = normalize();
  const forgedSource = structuredClone(normalized);
  forgedSource.flickerCycleSource.algorithm = 'convenient-randomness/v9';
  forgedSource.flickerCycleSourceHash = hashValue(forgedSource.flickerCycleSource);
  assert.throws(() => buildFlickerCycleSamplesHand.execute(forgedSource, { sampleCount: 17 }, {}), /algorithm is invalid/);

  const built = buildFlickerCycleSamplesHand.execute(normalized, { sampleCount: 17 }, {}).state;
  const tampered = structuredClone(built);
  const set = tampered.flickerCycleSamples['fixture-flicker'];
  set.samples[3].value = Number((set.samples[3].value + 0.1).toFixed(6));
  set.minValue = Math.min(...set.samples.map((sample) => sample.value));
  set.maxValue = Math.max(...set.samples.map((sample) => sample.value));
  set.sampleSetHash = hashValue(sampleHashPayload(set));
  assert.throws(() => validateFlickerCycleSampleSet(tampered, set), /sample 3 value mismatch/);
});

test('invalid canonical controls and excessive derived work fail loudly', () => {
  const badSlots = initial({ slotCount: 1 });
  assert.throws(() => normalizeFlickerCycleSourceHand.execute(badSlots, {}, {}), /slotCount.*\[2,256\]/);

  const badSeed = initial({ seed: -1 });
  assert.throws(() => normalizeFlickerCycleSourceHand.execute(badSeed, {}, {}), /seed.*\[0,4294967295\]/);

  const badRange = initial({ minValue: 2, maxValue: 1 });
  assert.throws(() => normalizeFlickerCycleSourceHand.execute(badRange, {}, {}), />= minValue/);

  const badPower = initial({ responsePower: 5 });
  assert.throws(() => normalizeFlickerCycleSourceHand.execute(badPower, {}, {}), /responsePower.*\[0.25,4\]/);

  const normalized = normalize();
  assert.throws(() => buildFlickerCycleSamplesHand.execute(normalized, { sampleCount: 4098 }, {}), /sampleCount.*\[2,4097\]/);
});
