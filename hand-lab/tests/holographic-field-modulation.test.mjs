import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createHandRegistry,
  executeHandGraph,
  hashValue,
  resumeHandGraph,
} from '../src/hand-runtime.mjs';
import { makeGlobeForm, makeRoverForm } from '../src/holographic-state-projector.mjs';
import {
  HOLOGRAPHIC_FIELD_MODULATION_GRAPH,
  HOLOGRAPHIC_FIELD_MODULATION_HANDS,
  makeHolographicFieldModulationState,
} from '../src/holographic-field-modulation.mjs';

const registry = createHandRegistry(HOLOGRAPHIC_FIELD_MODULATION_HANDS);

function run(form, options = {}, callerKind = 'test') {
  return executeHandGraph({
    registry,
    graph: HOLOGRAPHIC_FIELD_MODULATION_GRAPH,
    initialState: makeHolographicFieldModulationState(form, options),
    context: { callerKind },
  });
}

function selected(state, id = 'holographic-field-modulation') {
  return state.modulatedHolographicSampleFields[id];
}

function assertGeometryChannelsUnchanged(basePoints, modulatedPoints) {
  assert.equal(basePoints.length, modulatedPoints.length);
  for (let i = 0; i < basePoints.length; i += 7) {
    assert.deepEqual(
      modulatedPoints.slice(i, i + 6),
      basePoints.slice(i, i + 6),
      `point ${i / 7} geometry/role/phase channels changed`,
    );
  }
}

test('holographic composed-field modulation is deterministic and caller-neutral', () => {
  const options = {
    seed: 71,
    axes: 'xz',
    strength: 0.82,
    floor: 0.17,
    composition: {
      operation: 'multiply',
      a: { id: 'large-shape', seed: 1001, frequency: 2.1, octaves: 3 },
      b: { id: 'fine-breakup', seed: 1002, frequency: 7.4, octaves: 2 },
    },
  };
  const human = run(makeGlobeForm(), options, 'human');
  const machine = run(makeGlobeForm(), options, 'machine');

  assert.equal(human.finalStateHash, machine.finalStateHash);
  assert.equal(
    selected(human.finalState).sampleFieldHash,
    selected(machine.finalState).sampleFieldHash,
  );
  assert.equal(
    human.finalState.holographicBaseSampleFieldHash,
    hashValue(human.finalState.sampleField),
  );
});

test('globe and rover reuse one modulation graph without rewriting form or sampled geometry', () => {
  const cases = [
    { form: makeGlobeForm(), axes: 'xz' },
    { form: makeRoverForm(), axes: 'xy' },
  ];

  for (const item of cases) {
    const result = run(item.form, {
      seed: 44,
      axes: item.axes,
      strength: 0.9,
      floor: 0.12,
      composition: {
        operation: 'max',
        a: { seed: 211, frequency: 1.7, octaves: 3 },
        b: { seed: 919, frequency: 8.2, octaves: 2 },
      },
    }).finalState;
    const modulated = selected(result);

    assert.equal(result.sampleField.canonicalFormHash, hashValue(result.form));
    assert.equal(result.holographicBaseSampleFieldHash, hashValue(result.sampleField));
    assert.equal(modulated.canonicalFormHash, result.sampleField.canonicalFormHash);
    assert.equal(modulated.baseSampleFieldHash, result.holographicBaseSampleFieldHash);
    assert.equal(modulated.pointCount, result.sampleField.pointCount);
    assert.equal(modulated.derived, true);
    assert.equal(modulated.rebuildable, true);
    assertGeometryChannelsUnchanged(result.sampleField.points, modulated.points);
    assert.ok(modulated.factorStats.min >= 0.12);
    assert.ok(modulated.factorStats.max <= 1);
    assert.equal(modulated.factorStats.samples, result.sampleField.pointCount);
    assert.notEqual(modulated.sampleFieldHash, hashValue(result.sampleField.points));
  }
});

test('different neutral scalar composition changes intensity expression over the same retained holographic sample field', () => {
  const shared = {
    seed: 2026,
    axes: 'yz',
    strength: 1,
    floor: 0.08,
    composition: {
      a: { seed: 77, frequency: 2.4, octaves: 3 },
      b: { seed: 88, frequency: 5.9, octaves: 2 },
    },
  };
  const multiply = run(makeRoverForm(), {
    ...shared,
    composition: { ...shared.composition, operation: 'multiply' },
  }).finalState;
  const add = run(makeRoverForm(), {
    ...shared,
    composition: { ...shared.composition, operation: 'add-clamp' },
  }).finalState;

  assert.equal(multiply.holographicBaseSampleFieldHash, add.holographicBaseSampleFieldHash);
  assert.equal(multiply.sampleField.canonicalFormHash, add.sampleField.canonicalFormHash);
  assert.notEqual(
    selected(multiply).sampleFieldHash,
    selected(add).sampleFieldHash,
  );
});

test('zero modulation strength is a derived no-op over point values', () => {
  const result = run(makeGlobeForm(), {
    strength: 0,
    floor: 0,
    composition: {
      operation: 'multiply',
      a: { seed: 12, frequency: 3.2 },
      b: { seed: 13, frequency: 9.1 },
    },
  }).finalState;
  const modulated = selected(result);

  assert.deepEqual(modulated.points, result.sampleField.points);
  assert.equal(modulated.factorStats.min, 1);
  assert.equal(modulated.factorStats.max, 1);
  assert.equal(modulated.factorStats.mean, 1);
});

test('captured holographic and scalar lineage rejects silent drift before modulation', () => {
  const original = run(makeGlobeForm(), {
    strength: 0.75,
    composition: {
      operation: 'multiply',
      a: { seed: 501, frequency: 2 },
      b: { seed: 502, frequency: 6 },
    },
  });
  const checkpoint = original.checkpoints.find(
    (item) => item.stageId === 'normalize-holographic-field-modulation-source',
  );
  assert.ok(checkpoint);

  assert.throws(() => resumeHandGraph({
    registry,
    graph: HOLOGRAPHIC_FIELD_MODULATION_GRAPH,
    checkpoint,
    edits: [{
      op: 'set',
      path: ['sampleField', 'points', 6],
      value: checkpoint.state.sampleField.points[6] * 0.5,
    }],
    context: { callerKind: 'machine' },
  }), /holographic base sample field hash mismatch/);

  assert.throws(() => resumeHandGraph({
    registry,
    graph: HOLOGRAPHIC_FIELD_MODULATION_GRAPH,
    checkpoint,
    edits: [{
      op: 'set',
      path: ['fieldSources', 'a', 'frequency'],
      value: checkpoint.state.fieldSources.a.frequency + 1,
    }],
    context: { callerKind: 'human' },
  }), /composition inputA source hash mismatch/);
});

test('invalid holographic modulation axes fail instead of silently choosing a projection', () => {
  assert.throws(() => run(makeGlobeForm(), { axes: 'xyz' }), /axes must be one of xy, xz, yz/);
});
