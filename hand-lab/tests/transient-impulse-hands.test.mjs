import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph, resumeHandGraph } from '../src/hand-runtime.mjs';
import {
  TRANSIENT_IMPULSE_GRAPH,
  TRANSIENT_IMPULSE_HANDS,
  makeTransientImpulseState,
} from '../src/transient-impulse-hands.mjs';

const registry = createHandRegistry(TRANSIENT_IMPULSE_HANDS);

function run(state, callerKind = 'test') {
  return executeHandGraph({
    registry,
    graph: TRANSIENT_IMPULSE_GRAPH,
    initialState: state,
    context: { callerKind },
  });
}

function assertFiniteField(field) {
  for (const ring of field.geometry.rings) {
    for (const value of [ring.radiusScale, ring.widthScale, ring.intensity, ring.phase, ring.axisRatio, ring.rotation]) {
      assert.equal(Number.isFinite(value), true);
    }
  }
  for (const spoke of field.geometry.spokes) {
    for (const value of [spoke.angle, spoke.startScale, spoke.lengthScale, spoke.widthScale, spoke.intensity, spoke.bend, spoke.phase]) {
      assert.equal(Number.isFinite(value), true);
    }
  }
  for (const fragment of field.geometry.fragments) {
    for (const value of [fragment.angle, fragment.radialScale, fragment.lengthScale, fragment.tangentScale, fragment.intensity, fragment.phase]) {
      assert.equal(Number.isFinite(value), true);
    }
  }
}

test('transient impulse is deterministic and caller-neutral', () => {
  const state = makeTransientImpulseState({
    id: 'neutral-proof',
    seed: 90210,
    origin: [0.42, 0.57],
    direction: [0.8, -0.2],
    energy: 1.15,
  });
  const human = run(state, 'human');
  const machine = run(state, 'machine');

  assert.equal(human.finalStateHash, machine.finalStateHash);
  assert.equal(human.finalState.eventCanonicalHash, machine.finalState.eventCanonicalHash);
  assert.equal(human.finalState.impulseField.geometryHash, machine.finalState.impulseField.geometryHash);
  assert.equal(human.finalState.realizations.transientImpulseSvg.content, machine.finalState.realizations.transientImpulseSvg.content);
  assert.equal(human.finalState.impulseField.derived, true);
  assert.equal(human.finalState.impulseField.rebuildable, true);
  assert.equal(human.finalState.realizations.transientImpulseSvg.canonicalEventHash, human.finalState.eventCanonicalHash);
});

test('one graph produces materially different directional and symmetric transient fields', () => {
  const directional = run(makeTransientImpulseState({
    id: 'directional-proof',
    seed: 77,
    direction: [1, 0.15],
    controls: {
      symmetry: 0.12,
      directionality: 0.95,
      fragmentation: 0.82,
      ringWeight: 0.62,
      spokeWeight: 1.18,
    },
  })).finalState;

  const symmetric = run(makeTransientImpulseState({
    id: 'symmetric-proof',
    seed: 77,
    direction: [0, -1],
    controls: {
      symmetry: 0.98,
      directionality: 0.15,
      fragmentation: 0.04,
      ringWeight: 1.2,
      spokeWeight: 0.42,
    },
  })).finalState;

  assert.equal(directional.impulseField.schema, 'axm.transient-impulse-field/v0.1');
  assert.equal(symmetric.impulseField.schema, 'axm.transient-impulse-field/v0.1');
  assert.notEqual(directional.impulseField.geometryHash, symmetric.impulseField.geometryHash);
  assert.ok(directional.impulseField.counts.fragments > symmetric.impulseField.counts.fragments);
  assert.ok(symmetric.impulseField.counts.rings >= directional.impulseField.counts.rings);
  assert.ok(directional.impulseField.counts.rings <= 8);
  assert.ok(directional.impulseField.counts.spokes <= 18);
  assert.ok(directional.impulseField.counts.fragments <= 42);
  assertFiniteField(directional.impulseField);
  assertFiniteField(symmetric.impulseField);
  assert.match(directional.realizations.transientImpulseSvg.content, /<ellipse/);
  assert.match(directional.realizations.transientImpulseSvg.content, /<line/);
  assert.match(symmetric.realizations.transientImpulseSvg.content, /AXM \/\/ TRANSIENT IMPULSE/);
});

test('renderer style can replay from the envelope checkpoint without rewriting canonical event state', () => {
  const initial = makeTransientImpulseState({ id: 'style-replay', seed: 404 });
  const original = run(initial, 'human');
  const checkpoint = original.checkpoints.find((item) => item.stageId === 'temporal-envelope');
  assert.ok(checkpoint);

  const resumed = resumeHandGraph({
    registry,
    graph: TRANSIENT_IMPULSE_GRAPH,
    checkpoint,
    edits: [
      { op: 'set', path: ['effect', 'tint'], value: [1, 0.18, 0.42] },
      { op: 'set', path: ['effect', 'accent'], value: [0.25, 0.9, 1] },
    ],
    context: { callerKind: 'machine' },
  });

  assert.deepEqual(resumed.executedStageIds, ['realize-svg']);
  assert.equal(resumed.finalState.eventCanonicalHash, original.finalState.eventCanonicalHash);
  assert.equal(resumed.finalState.impulseField.geometryHash, original.finalState.impulseField.geometryHash);
  assert.notEqual(
    resumed.finalState.realizations.transientImpulseSvg.derivedFromStateHash,
    original.finalState.realizations.transientImpulseSvg.derivedFromStateHash,
  );
  assert.notEqual(
    resumed.finalState.realizations.transientImpulseSvg.content,
    original.finalState.realizations.transientImpulseSvg.content,
  );
});

test('invalid source event coordinates fail instead of being silently rewritten', () => {
  const state = makeTransientImpulseState({ origin: [1.4, 0.5] });
  assert.throws(() => run(state), /event\.origin must stay inside normalized/);
});
