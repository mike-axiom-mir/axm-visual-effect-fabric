import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph, hashValue } from '../src/hand-runtime.mjs';
import {
  PROPAGATION_FRONT_GRAPH,
  PROPAGATION_FRONT_HANDS,
  normalizePropagationFrontSourceHand,
  buildPropagationFrontSamplesHand,
  samplePropagationFrontSource,
  validatePropagationFrontSampleSet,
  makePropagationFrontState,
} from '../src/propagation-front1d.mjs';

const registry = createHandRegistry(PROPAGATION_FRONT_HANDS);

function initial(overrides = {}) {
  const state = makePropagationFrontState({
    id: 'fixture-propagation',
    direction: 'forward',
    frontSoftness: 0.25,
    ...overrides,
  });
  state.consumerMetadata = { untouched: true, label: 'neutral-fixture' };
  return state;
}

function run(state, callerKind = 'human') {
  return executeHandGraph({ registry, graph: PROPAGATION_FRONT_GRAPH, initialState: state, context: { callerKind } });
}

function normalize(state = initial()) {
  return normalizePropagationFrontSourceHand.execute(state, {}, {}).state;
}

function sampleHashPayload(sampleSet) {
  return {
    schema: sampleSet.schema,
    sourceHash: sampleSet.sourceHash,
    phase: sampleSet.phase,
    sampleCount: sampleSet.sampleCount,
    samples: sampleSet.samples,
    minWeight: sampleSet.minWeight,
    maxWeight: sampleSet.maxWeight,
    derived: sampleSet.derived,
    rebuildable: sampleSet.rebuildable,
  };
}

test('human and machine callers produce identical retained propagation truth and derived samples', () => {
  const human = run(initial(), 'human');
  const machine = run(initial(), 'machine');
  assert.equal(human.finalState.propagationFrontSourceHash, machine.finalState.propagationFrontSourceHash);
  assert.equal(
    human.finalState.propagationFrontSamples['fixture-propagation'].sampleSetHash,
    machine.finalState.propagationFrontSamples['fixture-propagation'].sampleSetHash,
  );
  assert.deepEqual(human.finalState.propagationFrontSource, machine.finalState.propagationFrontSource);
  assert.deepEqual(human.finalState.consumerMetadata, initial().consumerMetadata);
});

test('forward and reverse directions propagate the same neutral contract from opposite ends', () => {
  const forward = normalize(initial({ direction: 'forward', frontSoftness: 0 }));
  const reverse = normalize(initial({ direction: 'reverse', frontSoftness: 0 }));
  assert.equal(samplePropagationFrontSource(forward.propagationFrontSource, 0.2, 0.3), 1);
  assert.equal(samplePropagationFrontSource(forward.propagationFrontSource, 0.8, 0.3), 0);
  assert.equal(samplePropagationFrontSource(reverse.propagationFrontSource, 0.8, 0.3), 1);
  assert.equal(samplePropagationFrontSource(reverse.propagationFrontSource, 0.2, 0.3), 0);
  assert.equal(samplePropagationFrontSource(forward.propagationFrontSource, 0.5, 0), 0);
  assert.equal(samplePropagationFrontSource(reverse.propagationFrontSource, 0.5, 1), 1);
});

test('front softness uses a bounded smooth transition behind the selected phase', () => {
  const normalized = normalize(initial({ frontSoftness: 0.25 }));
  const source = normalized.propagationFrontSource;
  assert.equal(samplePropagationFrontSource(source, 0.25, 0.5), 1);
  assert.equal(samplePropagationFrontSource(source, 0.375, 0.5), 0.5);
  assert.equal(samplePropagationFrontSource(source, 0.5, 0.5), 0);
  assert.equal(samplePropagationFrontSource(source, 0.75, 0.5), 0);
});

test('selected phase and sample density remain derived and do not rewrite canonical source truth', () => {
  const normalized = normalize();
  const sourceHash = normalized.propagationFrontSourceHash;
  const sourceSnapshot = structuredClone(normalized.propagationFrontSource);

  const early = buildPropagationFrontSamplesHand.execute(normalized, { phase: 0.2, sampleCount: 17 }, {}).state;
  const late = buildPropagationFrontSamplesHand.execute(normalized, { phase: 0.8, sampleCount: 257 }, {}).state;
  assert.equal(early.propagationFrontSourceHash, sourceHash);
  assert.equal(late.propagationFrontSourceHash, sourceHash);
  assert.deepEqual(early.propagationFrontSource, sourceSnapshot);
  assert.deepEqual(late.propagationFrontSource, sourceSnapshot);
  assert.notEqual(
    early.propagationFrontSamples['fixture-propagation'].sampleSetHash,
    late.propagationFrontSamples['fixture-propagation'].sampleSetHash,
  );
});

test('phase inputs clamp explicitly while canonical propagation truth remains unchanged', () => {
  const normalized = normalize();
  const before = buildPropagationFrontSamplesHand.execute(normalized, { phase: -5, sampleCount: 9 }, {}).state;
  const after = buildPropagationFrontSamplesHand.execute(normalized, { phase: 7, sampleCount: 9 }, {}).state;
  const beforeSet = before.propagationFrontSamples['fixture-propagation'];
  const afterSet = after.propagationFrontSamples['fixture-propagation'];
  assert.equal(beforeSet.phase, 0);
  assert.equal(afterSet.phase, 1);
  assert.ok(beforeSet.samples.every((sample) => sample.weight === 0));
  assert.ok(afterSet.samples.every((sample) => sample.weight === 1));
  assert.equal(before.propagationFrontSourceHash, after.propagationFrontSourceHash);
});

test('self-consistent source semantic forgery and derived sample tampering are rejected', () => {
  const normalized = normalize();
  const forgedSource = structuredClone(normalized);
  forgedSource.propagationFrontSource.profile = 'linear-convenience/v9';
  forgedSource.propagationFrontSourceHash = hashValue(forgedSource.propagationFrontSource);
  assert.throws(() => buildPropagationFrontSamplesHand.execute(forgedSource, { phase: 0.4, sampleCount: 17 }, {}), /profile is invalid/);

  const built = buildPropagationFrontSamplesHand.execute(normalized, { phase: 0.4, sampleCount: 17 }, {}).state;
  const tampered = structuredClone(built);
  const set = tampered.propagationFrontSamples['fixture-propagation'];
  set.samples[3].weight = Number((set.samples[3].weight + 0.2).toFixed(6));
  set.minWeight = Math.min(...set.samples.map((sample) => sample.weight));
  set.maxWeight = Math.max(...set.samples.map((sample) => sample.weight));
  set.sampleSetHash = hashValue(sampleHashPayload(set));
  assert.throws(() => validatePropagationFrontSampleSet(tampered, set), /sample 3 weight mismatch/);
});

test('invalid canonical controls and excessive derived work fail loudly', () => {
  assert.throws(
    () => normalizePropagationFrontSourceHand.execute(initial({ direction: 'sideways' }), {}, {}),
    /direction must be forward or reverse/,
  );
  assert.throws(
    () => normalizePropagationFrontSourceHand.execute(initial({ frontSoftness: 1.1 }), {}, {}),
    /frontSoftness.*\[0,1\]/,
  );
  const normalized = normalize();
  assert.throws(
    () => buildPropagationFrontSamplesHand.execute(normalized, { sampleCount: 4098 }, {}),
    /sampleCount.*\[2,4097\]/,
  );
});
