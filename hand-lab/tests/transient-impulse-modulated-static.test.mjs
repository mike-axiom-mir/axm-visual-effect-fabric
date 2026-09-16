import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph } from '../src/hand-runtime.mjs';
import { makeTransientImpulseState } from '../src/transient-impulse-hands.mjs';
import {
  TRANSIENT_IMPULSE_STATIC_GRAPH,
  TRANSIENT_IMPULSE_STATIC_HANDS,
} from '../src/transient-impulse-static.mjs';
import {
  TRANSIENT_IMPULSE_MODULATED_STATIC_GRAPH,
  TRANSIENT_IMPULSE_MODULATED_STATIC_HANDS,
  impulseModulatedStaticSvgHand,
  makeTransientImpulseModulatedStaticState,
} from '../src/transient-impulse-modulated-static.mjs';

const registry = createHandRegistry(TRANSIENT_IMPULSE_MODULATED_STATIC_HANDS);
const baseRegistry = createHandRegistry(TRANSIENT_IMPULSE_STATIC_HANDS);

const sharedImpulse = Object.freeze({
  id: 'shared-render-impulse',
  seed: 20260916,
  origin: [0.5, 0.5],
  direction: [1, -0.12],
  energy: 1.2,
  radius: 0.32,
  duration: 0.78,
  tint: [0.18, 0.9, 1],
  accent: [1, 0.5, 0.17],
  controls: {
    symmetry: 0.16,
    directionality: 0.95,
    fragmentation: 0.82,
    ringWeight: 0.7,
    spokeWeight: 1.14,
  },
});

function composition(operation = 'multiply') {
  return {
    id: 'render-composition',
    operation,
    a: {
      id: 'render-broad', seed: 812, frequency: 2.1, octaves: 4,
      lacunarity: 2, gain: 0.56, offset: [0.13, -0.18],
    },
    b: {
      id: 'render-detail', seed: 9917, frequency: 7.4, octaves: 3,
      lacunarity: 1.9, gain: 0.43, offset: [-0.24, 0.22],
    },
  };
}

function modulatedState({ id = 'render-modulation', strength = 1, floor = 0, impulse = sharedImpulse, operation = 'multiply' } = {}) {
  return makeTransientImpulseModulatedStaticState({
    id,
    strength,
    floor,
    impulse,
    composition: composition(operation),
  });
}

function run(state, callerKind = 'test') {
  return executeHandGraph({
    registry,
    graph: TRANSIENT_IMPULSE_MODULATED_STATIC_GRAPH,
    initialState: state,
    context: { callerKind },
  });
}

function runBase(impulse = sharedImpulse) {
  return executeHandGraph({
    registry: baseRegistry,
    graph: TRANSIENT_IMPULSE_STATIC_GRAPH,
    initialState: makeTransientImpulseState(impulse),
    context: { callerKind: 'base-proof' },
  });
}

test('modulated static realization is deterministic, caller-neutral and selects derived geometry without overwriting the base field', () => {
  const human = run(modulatedState(), 'human');
  const machine = run(modulatedState(), 'machine');
  const realization = human.finalState.realizations.transientImpulseModulatedStaticSvg;
  const selected = human.finalState.modulatedImpulseFields['render-modulation'];

  assert.equal(human.finalStateHash, machine.finalStateHash);
  assert.equal(
    realization.content,
    machine.finalState.realizations.transientImpulseModulatedStaticSvg.content,
  );
  assert.equal(realization.renderer, 'axm.vfx.transient-impulse-modulated-static-svg/v0.1');
  assert.equal(realization.canonicalEventHash, human.finalState.eventCanonicalHash);
  assert.equal(realization.baseFieldGeometryHash, human.finalState.impulseField.geometryHash);
  assert.equal(realization.selectedField.geometryHash, selected.geometryHash);
  assert.equal(realization.fieldCompositionSourceHash, human.finalState.fieldCompositionSourceHash);
  assert.equal(realization.fieldModulationSourceHash, human.finalState.fieldModulationSourceHash);
  assert.equal(realization.inputAHash, human.finalState.fieldSourceHashes.a);
  assert.equal(realization.inputBHash, human.finalState.fieldSourceHashes.b);
  assert.equal(realization.envelopeSourceFieldGeometryHash, human.finalState.impulseField.geometryHash);
  assert.ok(human.finalState.impulseField.geometry.spokes.every((spoke) => !('scalarModulation' in spoke)));
  assert.ok(selected.geometry.spokes.every((spoke) => spoke.scalarModulation));
  assert.notEqual(selected.geometryHash, human.finalState.impulseField.geometryHash);
});

test('non-zero scalar modulation changes the static renderer artifact while retaining the exact base impulse geometry', () => {
  const base = runBase();
  const modulated = run(modulatedState());
  const baseRealization = base.finalState.realizations.transientImpulseStaticSvg;
  const modulatedRealization = modulated.finalState.realizations.transientImpulseModulatedStaticSvg;

  assert.equal(modulated.finalState.eventCanonicalHash, base.finalState.eventCanonicalHash);
  assert.equal(modulated.finalState.impulseField.geometryHash, base.finalState.impulseField.geometryHash);
  assert.notEqual(modulatedRealization.selectedField.geometryHash, base.finalState.impulseField.geometryHash);
  assert.notEqual(modulatedRealization.content, baseRealization.content);
  assert.match(modulatedRealization.content, /<svg/);
  assert.match(modulatedRealization.content, /<ellipse/);
  assert.match(modulatedRealization.content, /<line/);
  assert.doesNotMatch(modulatedRealization.content, /<animate/);
  assert.doesNotMatch(modulatedRealization.content, /<script/i);
});

test('zero-strength derived modulation produces the same static SVG artifact as the base renderer while retaining separate lineage', () => {
  const base = runBase();
  const zero = run(modulatedState({ id: 'zero-render-modulation', strength: 0, floor: 0 }));
  const selected = zero.finalState.modulatedImpulseFields['zero-render-modulation'];
  const realization = zero.finalState.realizations.transientImpulseModulatedStaticSvg;

  assert.equal(zero.finalState.impulseField.geometryHash, base.finalState.impulseField.geometryHash);
  assert.notEqual(selected.geometryHash, base.finalState.impulseField.geometryHash);
  assert.equal(selected.factorStats.min, 1);
  assert.equal(selected.factorStats.max, 1);
  assert.equal(realization.content, base.finalState.realizations.transientImpulseStaticSvg.content);
  assert.equal(realization.selectedField.geometryHash, selected.geometryHash);
  assert.equal(realization.baseFieldGeometryHash, base.finalState.impulseField.geometryHash);
});

test('one realization graph supports materially different directional and symmetric impulse contexts', () => {
  const directional = run(modulatedState({ id: 'directional-render' })).finalState;
  const symmetricImpulse = {
    ...sharedImpulse,
    direction: [0, -1],
    controls: {
      symmetry: 0.98,
      directionality: 0.12,
      fragmentation: 0.08,
      ringWeight: 1.22,
      spokeWeight: 0.38,
    },
  };
  const symmetric = run(modulatedState({ id: 'symmetric-render', impulse: symmetricImpulse, operation: 'max' })).finalState;

  assert.notEqual(directional.impulseField.geometryHash, symmetric.impulseField.geometryHash);
  assert.notEqual(
    directional.realizations.transientImpulseModulatedStaticSvg.selectedField.geometryHash,
    symmetric.realizations.transientImpulseModulatedStaticSvg.selectedField.geometryHash,
  );
  assert.match(directional.realizations.transientImpulseModulatedStaticSvg.content, /<svg/);
  assert.match(symmetric.realizations.transientImpulseModulatedStaticSvg.content, /<svg/);
});

test('renderer selection rejects broken modulated geometry lineage instead of silently rendering altered state', () => {
  const finalState = run(modulatedState()).finalState;
  const changed = structuredClone(finalState);
  changed.modulatedImpulseFields['render-modulation'].geometry.spokes[0].intensity += 0.1;

  assert.throws(
    () => impulseModulatedStaticSvgHand.execute(changed, {}),
    /modulated impulse field geometry hash mismatch/,
  );
});
