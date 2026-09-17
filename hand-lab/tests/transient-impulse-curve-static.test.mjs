import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph, hashValue } from '../src/hand-runtime.mjs';
import { makeTransientImpulseState } from '../src/transient-impulse-hands.mjs';
import {
  TRANSIENT_IMPULSE_STATIC_GRAPH,
  TRANSIENT_IMPULSE_STATIC_HANDS,
} from '../src/transient-impulse-static.mjs';
import {
  TRANSIENT_IMPULSE_CURVE_STATIC_GRAPH,
  TRANSIENT_IMPULSE_CURVE_STATIC_HANDS,
  impulseCurveStaticSvgHand,
  makeTransientImpulseCurveStaticState,
} from '../src/transient-impulse-curve-static.mjs';

const registry = createHandRegistry(TRANSIENT_IMPULSE_CURVE_STATIC_HANDS);
const baseRegistry = createHandRegistry(TRANSIENT_IMPULSE_STATIC_HANDS);

const sharedImpulse = Object.freeze({
  id: 'curve-static-shared-impulse',
  seed: 20260917,
  origin: [0.48, 0.52],
  direction: [1, -0.18],
  energy: 1.16,
  radius: 0.3,
  duration: 0.74,
  tint: [0.2, 0.88, 1],
  accent: [1, 0.52, 0.18],
  controls: {
    symmetry: 0.18,
    directionality: 0.94,
    fragmentation: 0.79,
    ringWeight: 0.72,
    spokeWeight: 1.12,
  },
});

function curveState({
  curveId = 'curve-static-proof',
  keyframes,
  impulse = sharedImpulse,
} = {}) {
  return makeTransientImpulseCurveStaticState({
    impulse,
    curve: {
      id: curveId,
      keyframes: keyframes ?? [
        { t: 0, value: 1, interpolation: 'linear' },
        { t: 1, value: 1, interpolation: 'linear' },
      ],
    },
  });
}

function run(state, callerKind = 'test') {
  return executeHandGraph({
    registry,
    graph: TRANSIENT_IMPULSE_CURVE_STATIC_GRAPH,
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

test('curve-selected static SVG is deterministic and caller-neutral while retaining the base envelope and curve source', () => {
  const human = run(curveState(), 'human');
  const machine = run(curveState(), 'machine');
  const realization = human.finalState.realizations.transientImpulseCurveStaticSvg;
  const selected = human.finalState.curveModulatedImpulseEnvelopes['curve-static-proof'];

  assert.equal(human.finalStateHash, machine.finalStateHash);
  assert.equal(realization.content, machine.finalState.realizations.transientImpulseCurveStaticSvg.content);
  assert.equal(realization.renderer, 'axm.vfx.transient-impulse-curve-static-svg/v0.1');
  assert.equal(realization.canonicalEventHash, human.finalState.eventCanonicalHash);
  assert.equal(realization.fieldGeometryHash, human.finalState.impulseField.geometryHash);
  assert.equal(realization.baseEnvelopeHash, hashValue(human.finalState.impulseEnvelope));
  assert.equal(realization.selectedEnvelope.hash, hashValue(selected));
  assert.equal(realization.parameterCurveSourceHash, human.finalState.parameterCurveSourceHash);
  assert.equal(realization.motion.mode, 'static');
  assert.ok(human.finalState.impulseEnvelope.samples.every((sample) => !('curveMultiplier' in sample)));
  assert.ok(selected.samples.every((sample) => 'curveMultiplier' in sample));
});

test('constant-one curve is byte-identical to the existing static SVG donor while retaining separate envelope lineage', () => {
  const base = runBase();
  const selected = run(curveState());
  const baseRealization = base.finalState.realizations.transientImpulseStaticSvg;
  const selectedRealization = selected.finalState.realizations.transientImpulseCurveStaticSvg;
  const derivedEnvelope = selected.finalState.curveModulatedImpulseEnvelopes['curve-static-proof'];

  assert.equal(selected.finalState.eventCanonicalHash, base.finalState.eventCanonicalHash);
  assert.equal(selected.finalState.impulseField.geometryHash, base.finalState.impulseField.geometryHash);
  assert.equal(hashValue(selected.finalState.impulseEnvelope), hashValue(base.finalState.impulseEnvelope));
  assert.notEqual(hashValue(derivedEnvelope), hashValue(base.finalState.impulseEnvelope));
  assert.equal(selectedRealization.content, baseRealization.content);
  assert.deepEqual(selectedRealization.motion, baseRealization.motion);
  assert.equal(selectedRealization.baseEnvelopeHash, hashValue(base.finalState.impulseEnvelope));
  assert.equal(selectedRealization.selectedEnvelope.hash, hashValue(derivedEnvelope));
});

test('shaped curve changes the static SVG artifact without rewriting canonical event, base field, or base envelope', () => {
  const base = runBase();
  const curved = run(curveState({
    curveId: 'shaped-static-proof',
    keyframes: [
      { t: 0, value: 0.25, interpolation: 'smoothstep' },
      { t: 0.25, value: 1.4, interpolation: 'smoothstep' },
      { t: 1, value: 0.35, interpolation: 'linear' },
    ],
  }));
  const realization = curved.finalState.realizations.transientImpulseCurveStaticSvg;
  const derivedEnvelope = curved.finalState.curveModulatedImpulseEnvelopes['shaped-static-proof'];

  assert.equal(curved.finalState.eventCanonicalHash, base.finalState.eventCanonicalHash);
  assert.equal(curved.finalState.impulseField.geometryHash, base.finalState.impulseField.geometryHash);
  assert.equal(hashValue(curved.finalState.impulseEnvelope), hashValue(base.finalState.impulseEnvelope));
  assert.ok(derivedEnvelope.samples.some((sample, index) => sample.intensity !== curved.finalState.impulseEnvelope.samples[index].intensity));
  assert.notEqual(realization.content, base.finalState.realizations.transientImpulseStaticSvg.content);
  assert.match(realization.content, /<svg/);
  assert.match(realization.content, /<ellipse/);
  assert.match(realization.content, /<line/);
  assert.doesNotMatch(realization.content, /<animate/);
  assert.doesNotMatch(realization.content, /<script/i);
});

test('one curve-selected renderer serves materially different directional and symmetric impulse forms', () => {
  const directional = run(curveState({
    curveId: 'directional-curve-static',
    keyframes: [
      { t: 0, value: 0.4, interpolation: 'linear' },
      { t: 0.3, value: 1.25, interpolation: 'smoothstep' },
      { t: 1, value: 0.3, interpolation: 'linear' },
    ],
  })).finalState;
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
  const symmetric = run(curveState({
    curveId: 'symmetric-curve-static',
    impulse: symmetricImpulse,
    keyframes: [
      { t: 0, value: 0.8, interpolation: 'linear' },
      { t: 0.4, value: 1.1, interpolation: 'smoothstep' },
      { t: 1, value: 0.45, interpolation: 'linear' },
    ],
  })).finalState;

  assert.notEqual(directional.eventCanonicalHash, symmetric.eventCanonicalHash);
  assert.notEqual(directional.impulseField.geometryHash, symmetric.impulseField.geometryHash);
  assert.notEqual(
    directional.realizations.transientImpulseCurveStaticSvg.content,
    symmetric.realizations.transientImpulseCurveStaticSvg.content,
  );
  assert.match(directional.realizations.transientImpulseCurveStaticSvg.content, /<svg/);
  assert.match(symmetric.realizations.transientImpulseCurveStaticSvg.content, /<svg/);
});

test('curve-selected renderer rejects drift in retained truth or the separately derived envelope', () => {
  const finalState = run(curveState()).finalState;

  const changedCurve = structuredClone(finalState);
  changedCurve.parameterCurveSource.keyframes[0].value = 0.5;
  assert.throws(
    () => impulseCurveStaticSvgHand.execute(changedCurve, {}),
    /parameter curve source state hash mismatch/,
  );

  const changedBaseEnvelope = structuredClone(finalState);
  changedBaseEnvelope.impulseEnvelope.samples[0].intensity += 0.01;
  assert.throws(
    () => impulseCurveStaticSvgHand.execute(changedBaseEnvelope, {}),
    /selected envelope base lineage mismatch/,
  );

  const changedSelectedEnvelope = structuredClone(finalState);
  changedSelectedEnvelope.curveModulatedImpulseEnvelopes['curve-static-proof'].samples[0].intensity += 0.01;
  assert.throws(
    () => impulseCurveStaticSvgHand.execute(changedSelectedEnvelope, {}),
    /selected envelope intensity mismatch/,
  );

  const changedStats = structuredClone(finalState);
  changedStats.curveModulatedImpulseEnvelopes['curve-static-proof'].multiplierStats.max = 1.5;
  assert.throws(
    () => impulseCurveStaticSvgHand.execute(changedStats, {}),
    /selected envelope multiplier stats mismatch/,
  );
});
