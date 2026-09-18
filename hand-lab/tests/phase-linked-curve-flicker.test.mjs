import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph, hashValue } from '../src/hand-runtime.mjs';
import { normalizeParameterCurveHand, sampleParameterCurveSource } from '../src/parameter-curve.mjs';
import { normalizeFlickerCycleSourceHand, sampleFlickerCycleSource } from '../src/flicker-cycle1d.mjs';
import {
  normalizePhaseRelationshipSourceHand,
  resolvePhaseRelationshipHand,
} from '../src/phase-relationship1d.mjs';
import {
  PHASE_LINKED_CURVE_FLICKER_GRAPH,
  PHASE_LINKED_CURVE_FLICKER_HANDS,
  makePhaseLinkedCurveFlickerState,
  samplePhaseLinkedCurveFlickerHand,
  validatePhaseLinkedCurveFlickerSample,
} from '../src/phase-linked-curve-flicker.mjs';

const registry = createHandRegistry(PHASE_LINKED_CURVE_FLICKER_HANDS);

function initial(overrides = {}) {
  const state = makePhaseLinkedCurveFlickerState({
    curve: {
      id: 'fixture-curve',
      keyframes: [
        { t: 0, value: 0, interpolation: 'linear' },
        { t: 0.5, value: 1, interpolation: 'linear' },
        { t: 1, value: 0, interpolation: 'linear' },
      ],
      ...overrides.curve,
    },
    flicker: {
      id: 'fixture-flicker',
      seed: 991,
      slotCount: 8,
      minValue: -1,
      maxValue: 1,
      ...overrides.flicker,
    },
    relationship: {
      id: 'fixture-linked-phases',
      channels: [
        { id: 'curve', cyclesPerGroup: 1, phaseOffset: 0 },
        { id: 'flicker', cyclesPerGroup: 2, phaseOffset: 0.25 },
      ],
      ...overrides.relationship,
    },
  });
  state.consumerMetadata = { untouched: true, label: 'consumer-neutral' };
  return state;
}

function runGraph(state, callerKind = 'human') {
  return executeHandGraph({
    registry,
    graph: PHASE_LINKED_CURVE_FLICKER_GRAPH,
    initialState: state,
    context: { callerKind },
  });
}

function normalizeSources(state = initial()) {
  let next = normalizeParameterCurveHand.execute(state, {}, {}).state;
  next = normalizeFlickerCycleSourceHand.execute(next, {}, {}).state;
  next = normalizePhaseRelationshipSourceHand.execute(next, {}, {}).state;
  return next;
}

function resolveAndSample(base, groupPhase, params = {}) {
  let next = resolvePhaseRelationshipHand.execute(base, { groupPhase }, {}).state;
  next = samplePhaseLinkedCurveFlickerHand.execute(next, {
    curveChannelId: 'curve',
    flickerChannelId: 'flicker',
    ...params,
  }, {}).state;
  return next;
}

function phaseSetPayload(set) {
  return {
    schema: set.schema,
    sourceHash: set.sourceHash,
    groupPhase: set.groupPhase,
    channels: set.channels,
    derived: set.derived,
    rebuildable: set.rebuildable,
  };
}

function samplePayload(sample) {
  return {
    schema: sample.schema,
    mapping: sample.mapping,
    combination: sample.combination,
    schedulerAuthority: sample.schedulerAuthority,
    phaseSelection: sample.phaseSelection,
    phaseRelationshipSourceHash: sample.phaseRelationshipSourceHash,
    phaseSetHash: sample.phaseSetHash,
    parameterCurveSourceHash: sample.parameterCurveSourceHash,
    flickerCycleSourceHash: sample.flickerCycleSourceHash,
    groupPhase: sample.groupPhase,
    curve: sample.curve,
    flicker: sample.flicker,
    derived: sample.derived,
    rebuildable: sample.rebuildable,
  };
}

test('human and machine callers produce identical linked samples without changing unrelated consumer state', () => {
  const human = runGraph(initial(), 'human');
  const machine = runGraph(initial(), 'machine');
  const id = 'fixture-linked-phases';
  assert.equal(
    human.finalState.phaseLinkedCurveFlickerSamples[id].sampleHash,
    machine.finalState.phaseLinkedCurveFlickerSamples[id].sampleHash,
  );
  assert.equal(human.finalState.parameterCurveSourceHash, machine.finalState.parameterCurveSourceHash);
  assert.equal(human.finalState.flickerCycleSourceHash, machine.finalState.flickerCycleSourceHash);
  assert.equal(human.finalState.phaseRelationshipSourceHash, machine.finalState.phaseRelationshipSourceHash);
  assert.deepEqual(human.finalState.consumerMetadata, initial().consumerMetadata);
});

test('one verified relationship resolves independent curve and flicker phases without combining their values', () => {
  const base = normalizeSources();
  const state = resolveAndSample(base, 0.25);
  const sample = state.phaseLinkedCurveFlickerSamples['fixture-linked-phases'];
  assert.equal(sample.curve.phase, 0.25);
  assert.equal(sample.flicker.phase, 0.75);
  assert.equal(sample.curve.value, sampleParameterCurveSource(state.parameterCurveSource, 0.25));
  assert.equal(sample.flicker.value, sampleFlickerCycleSource(state.flickerCycleSource, 0.75));
  assert.equal(sample.curve.value, 0.5);
  assert.equal(sample.combination, 'none');
  assert.equal(sample.schedulerAuthority, 'none');
  assert.equal(Object.hasOwn(sample, 'combinedValue'), false);
});

test('whole-group-cycle equivalents rebuild to the exact same phase-linked sample', () => {
  const base = normalizeSources();
  const zero = resolveAndSample(base, 0).phaseLinkedCurveFlickerSamples['fixture-linked-phases'];
  const one = resolveAndSample(base, 1).phaseLinkedCurveFlickerSamples['fixture-linked-phases'];
  const negative = resolveAndSample(base, -1).phaseLinkedCurveFlickerSamples['fixture-linked-phases'];
  assert.equal(zero.sampleHash, one.sampleHash);
  assert.equal(zero.sampleHash, negative.sampleHash);
  assert.deepEqual(zero.curve, one.curve);
  assert.deepEqual(zero.flicker, one.flicker);
});

test('changing only derived group phase changes the sample while all three retained source lineages stay untouched', () => {
  const base = normalizeSources();
  const retained = {
    curve: structuredClone(base.parameterCurveSource),
    curveHash: base.parameterCurveSourceHash,
    flicker: structuredClone(base.flickerCycleSource),
    flickerHash: base.flickerCycleSourceHash,
    relationship: structuredClone(base.phaseRelationshipSource),
    relationshipHash: base.phaseRelationshipSourceHash,
  };
  const a = resolveAndSample(base, 0.1);
  const b = resolveAndSample(base, 0.4);
  const aSample = a.phaseLinkedCurveFlickerSamples['fixture-linked-phases'];
  const bSample = b.phaseLinkedCurveFlickerSamples['fixture-linked-phases'];
  assert.notEqual(aSample.sampleHash, bSample.sampleHash);
  for (const state of [a, b]) {
    assert.equal(state.parameterCurveSourceHash, retained.curveHash);
    assert.equal(state.flickerCycleSourceHash, retained.flickerHash);
    assert.equal(state.phaseRelationshipSourceHash, retained.relationshipHash);
    assert.deepEqual(state.parameterCurveSource, retained.curve);
    assert.deepEqual(state.flickerCycleSource, retained.flicker);
    assert.deepEqual(state.phaseRelationshipSource, retained.relationship);
  }
});

test('self-consistently rehashed phase-set and linked-sample tampering are rejected by source reconstruction', () => {
  const base = normalizeSources();
  const built = resolveAndSample(base, 0.2);
  const tamperedSetState = structuredClone(built);
  const set = tamperedSetState.phaseRelationshipSets['fixture-linked-phases'];
  set.channels[0].phase = Number((set.channels[0].phase + 0.125).toFixed(6));
  set.phaseSetHash = hashValue(phaseSetPayload(set));
  assert.throws(
    () => samplePhaseLinkedCurveFlickerHand.execute(tamperedSetState, {
      curveChannelId: 'curve',
      flickerChannelId: 'flicker',
    }, {}),
    /phase mismatch/,
  );

  const tamperedSampleState = structuredClone(built);
  const sample = tamperedSampleState.phaseLinkedCurveFlickerSamples['fixture-linked-phases'];
  sample.curve.value = Number((sample.curve.value + 0.2).toFixed(6));
  sample.sampleHash = hashValue(samplePayload(sample));
  assert.throws(
    () => validatePhaseLinkedCurveFlickerSample(tamperedSampleState, sample),
    /does not rebuild from retained donor truth/,
  );
});

test('forged retained semantics remain invalid even when their hashes are recomputed', () => {
  const base = normalizeSources();

  const forgedCurve = structuredClone(base);
  forgedCurve.parameterCurveSource.wrapMode = 'clamp';
  forgedCurve.parameterCurveSourceHash = hashValue(forgedCurve.parameterCurveSource);
  forgedCurve.phaseRelationshipSets = resolvePhaseRelationshipHand.execute(forgedCurve, { groupPhase: 0.2 }, {}).state.phaseRelationshipSets;
  assert.throws(
    () => samplePhaseLinkedCurveFlickerHand.execute(forgedCurve, {}, {}),
    /requires parameter curve wrapMode loop/,
  );

  const forgedFlicker = structuredClone(base);
  forgedFlicker.flickerCycleSource.interpolation = 'invented';
  forgedFlicker.flickerCycleSourceHash = hashValue(forgedFlicker.flickerCycleSource);
  forgedFlicker.phaseRelationshipSets = resolvePhaseRelationshipHand.execute(forgedFlicker, { groupPhase: 0.2 }, {}).state.phaseRelationshipSets;
  assert.throws(
    () => samplePhaseLinkedCurveFlickerHand.execute(forgedFlicker, {}, {}),
    /interpolation is invalid/,
  );

  const forgedRelationship = structuredClone(base);
  forgedRelationship.phaseRelationshipSource.relationshipRule = 'scheduler-decides';
  forgedRelationship.phaseRelationshipSourceHash = hashValue(forgedRelationship.phaseRelationshipSource);
  const originalSet = resolvePhaseRelationshipHand.execute(base, { groupPhase: 0.2 }, {}).state
    .phaseRelationshipSets['fixture-linked-phases'];
  forgedRelationship.phaseRelationshipSets['fixture-linked-phases'] = originalSet;
  assert.throws(
    () => samplePhaseLinkedCurveFlickerHand.execute(forgedRelationship, {}, {}),
    /relationship rule is invalid|source lineage mismatch/,
  );
});

test('the bounded bridge rejects incompatible or ambiguous channel bindings instead of growing a generic scheduler', () => {
  const base = normalizeSources();
  const resolved = resolvePhaseRelationshipHand.execute(base, { groupPhase: 0.3 }, {}).state;
  assert.throws(
    () => samplePhaseLinkedCurveFlickerHand.execute(resolved, {
      curveChannelId: 'curve',
      flickerChannelId: 'curve',
    }, {}),
    /requires distinct curve and flicker channels/,
  );
  assert.throws(
    () => samplePhaseLinkedCurveFlickerHand.execute(resolved, {
      curveChannelId: 'missing',
      flickerChannelId: 'flicker',
    }, {}),
    /is absent from the selected phase relationship set/,
  );

  const clamped = initial();
  clamped.parameterCurveRequest.wrapMode = 'clamp';
  let normalized = normalizeParameterCurveHand.execute(clamped, {}, {}).state;
  normalized = normalizeFlickerCycleSourceHand.execute(normalized, {}, {}).state;
  normalized = normalizePhaseRelationshipSourceHand.execute(normalized, {}, {}).state;
  normalized = resolvePhaseRelationshipHand.execute(normalized, { groupPhase: 0.3 }, {}).state;
  assert.throws(
    () => samplePhaseLinkedCurveFlickerHand.execute(normalized, {}, {}),
    /requires parameter curve wrapMode loop/,
  );
});
