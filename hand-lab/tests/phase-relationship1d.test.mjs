import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph, hashValue } from '../src/hand-runtime.mjs';
import {
  PHASE_RELATIONSHIP_GRAPH,
  PHASE_RELATIONSHIP_HANDS,
  normalizePhaseRelationshipSourceHand,
  resolvePhaseRelationshipHand,
  validatePhaseRelationshipSet,
  makePhaseRelationshipState,
} from '../src/phase-relationship1d.mjs';

const registry = createHandRegistry(PHASE_RELATIONSHIP_HANDS);

function initial(overrides = {}) {
  const state = makePhaseRelationshipState({
    id: 'fixture-phase-links',
    channels: [
      { id: 'slow', cyclesPerGroup: 1, phaseOffset: 0.125 },
      { id: 'fast', cyclesPerGroup: 3, phaseOffset: 0.25 },
    ],
    ...overrides,
  });
  state.consumerMetadata = { untouched: true, label: 'neutral-fixture' };
  return state;
}

function run(state, callerKind = 'human') {
  return executeHandGraph({
    registry,
    graph: PHASE_RELATIONSHIP_GRAPH,
    initialState: state,
    context: { callerKind },
  });
}

function normalize(state = initial()) {
  return normalizePhaseRelationshipSourceHand.execute(state, {}, {}).state;
}

function payload(set) {
  return {
    schema: set.schema,
    sourceHash: set.sourceHash,
    groupPhase: set.groupPhase,
    channels: set.channels,
    derived: set.derived,
    rebuildable: set.rebuildable,
  };
}

test('human and machine callers produce identical retained relationships and derived phases', () => {
  const human = run(initial(), 'human');
  const machine = run(initial(), 'machine');
  assert.equal(human.finalState.phaseRelationshipSourceHash, machine.finalState.phaseRelationshipSourceHash);
  assert.equal(
    human.finalState.phaseRelationshipSets['fixture-phase-links'].phaseSetHash,
    machine.finalState.phaseRelationshipSets['fixture-phase-links'].phaseSetHash,
  );
  assert.deepEqual(human.finalState.phaseRelationshipSource, machine.finalState.phaseRelationshipSource);
  assert.deepEqual(human.finalState.consumerMetadata, initial().consumerMetadata);
});

test('channel request order does not change canonical relationship truth', () => {
  const a = normalize(initial());
  const b = normalize(initial({
    channels: [
      { id: 'fast', cyclesPerGroup: 3, phaseOffset: 0.25 },
      { id: 'slow', cyclesPerGroup: 1, phaseOffset: 0.125 },
    ],
  }));
  assert.equal(a.phaseRelationshipSourceHash, b.phaseRelationshipSourceHash);
  assert.deepEqual(a.phaseRelationshipSource.channels.map((channel) => channel.id), ['fast', 'slow']);
});

test('integer cycle relationships wrap exactly across the group seam', () => {
  const normalized = normalize();
  const zero = resolvePhaseRelationshipHand.execute(normalized, { groupPhase: 0 }, {}).state
    .phaseRelationshipSets['fixture-phase-links'];
  const one = resolvePhaseRelationshipHand.execute(normalized, { groupPhase: 1 }, {}).state
    .phaseRelationshipSets['fixture-phase-links'];
  const negative = resolvePhaseRelationshipHand.execute(normalized, { groupPhase: -1 }, {}).state
    .phaseRelationshipSets['fixture-phase-links'];
  assert.deepEqual(zero.channels, one.channels);
  assert.deepEqual(zero.channels, negative.channels);

  const quarter = resolvePhaseRelationshipHand.execute(normalized, { groupPhase: 0.25 }, {}).state
    .phaseRelationshipSets['fixture-phase-links'];
  assert.equal(quarter.channels.find((channel) => channel.id === 'slow').phase, 0.375);
  assert.equal(quarter.channels.find((channel) => channel.id === 'fast').phase, 0);
});

test('selected group phase stays derived and does not rewrite retained relationship source', () => {
  const normalized = normalize();
  const source = structuredClone(normalized.phaseRelationshipSource);
  const sourceHash = normalized.phaseRelationshipSourceHash;
  const a = resolvePhaseRelationshipHand.execute(normalized, { groupPhase: 0.1 }, {}).state;
  const b = resolvePhaseRelationshipHand.execute(normalized, { groupPhase: 0.4 }, {}).state;
  assert.equal(a.phaseRelationshipSourceHash, sourceHash);
  assert.equal(b.phaseRelationshipSourceHash, sourceHash);
  assert.deepEqual(a.phaseRelationshipSource, source);
  assert.deepEqual(b.phaseRelationshipSource, source);
  assert.notEqual(
    a.phaseRelationshipSets['fixture-phase-links'].phaseSetHash,
    b.phaseRelationshipSets['fixture-phase-links'].phaseSetHash,
  );
});

test('materially different cycle ratios and offsets remain distinct under one neutral contract', () => {
  const a = run(initial());
  const b = run(initial({
    channels: [
      { id: 'slow', cyclesPerGroup: 2, phaseOffset: 0 },
      { id: 'fast', cyclesPerGroup: 5, phaseOffset: 0.5 },
      { id: 'third', cyclesPerGroup: 7, phaseOffset: 0.2 },
    ],
  }));
  assert.notEqual(a.finalState.phaseRelationshipSourceHash, b.finalState.phaseRelationshipSourceHash);
  assert.equal(a.finalState.phaseRelationshipSource.algorithm, b.finalState.phaseRelationshipSource.algorithm);
  assert.equal(b.finalState.phaseRelationshipSource.channels.length, 3);
});

test('self-consistent source semantic forgery and derived phase tampering are rejected', () => {
  const normalized = normalize();
  const forged = structuredClone(normalized);
  forged.phaseRelationshipSource.relationshipRule = 'whatever-is-convenient';
  forged.phaseRelationshipSourceHash = hashValue(forged.phaseRelationshipSource);
  assert.throws(
    () => resolvePhaseRelationshipHand.execute(forged, { groupPhase: 0.2 }, {}),
    /relationship rule is invalid/,
  );

  const built = resolvePhaseRelationshipHand.execute(normalized, { groupPhase: 0.2 }, {}).state;
  const set = built.phaseRelationshipSets['fixture-phase-links'];
  set.channels[0].phase = Number((set.channels[0].phase + 0.1).toFixed(6));
  set.phaseSetHash = hashValue(payload(set));
  assert.throws(() => validatePhaseRelationshipSet(built, set), /phase mismatch/);
});

test('invalid canonical controls and excessive relationship work fail loudly', () => {
  assert.throws(
    () => normalizePhaseRelationshipSourceHand.execute(initial({
      channels: [{ id: 'only', cyclesPerGroup: 1, phaseOffset: 0 }],
    }), {}, {}),
    /2\.\.32/,
  );

  const tooMany = Array.from({ length: 33 }, (_, index) => ({
    id: `c${String(index).padStart(2, '0')}`,
    cyclesPerGroup: 1,
    phaseOffset: 0,
  }));
  assert.throws(
    () => normalizePhaseRelationshipSourceHand.execute(initial({ channels: tooMany }), {}, {}),
    /2\.\.32/,
  );

  assert.throws(
    () => normalizePhaseRelationshipSourceHand.execute(initial({
      channels: [
        { id: 'same', cyclesPerGroup: 1, phaseOffset: 0 },
        { id: 'same', cyclesPerGroup: 2, phaseOffset: 0 },
      ],
    }), {}, {}),
    /must be unique/,
  );

  assert.throws(
    () => normalizePhaseRelationshipSourceHand.execute(initial({
      channels: [
        { id: 'a', cyclesPerGroup: 0, phaseOffset: 0 },
        { id: 'b', cyclesPerGroup: 1, phaseOffset: 0 },
      ],
    }), {}, {}),
    /cyclesPerGroup.*\[1,32\]/,
  );
});
