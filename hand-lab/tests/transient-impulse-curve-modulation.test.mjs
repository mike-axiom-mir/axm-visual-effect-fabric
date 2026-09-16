import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph, hashValue } from '../src/hand-runtime.mjs';
import {
  TRANSIENT_IMPULSE_CURVE_MODULATION_GRAPH,
  TRANSIENT_IMPULSE_CURVE_MODULATION_HANDS,
  makeTransientImpulseCurveModulationState,
  modulateImpulseEnvelopeWithParameterCurveHand,
} from '../src/transient-impulse-curve-modulation.mjs';

const registry = createHandRegistry(TRANSIENT_IMPULSE_CURVE_MODULATION_HANDS);

function run(state, callerKind = 'test') {
  return executeHandGraph({
    registry,
    graph: TRANSIENT_IMPULSE_CURVE_MODULATION_GRAPH,
    initialState: state,
    context: { callerKind },
  });
}

function stateFor({ curveId = 'curve-proof', keyframes, symmetry = 0.2, direction = [1, -0.15], duration = 0.72 } = {}) {
  return makeTransientImpulseCurveModulationState({
    impulse: {
      id: 'shared-impulse',
      seed: 20260917,
      origin: [0.5, 0.5],
      direction,
      energy: 1.18,
      radius: 0.31,
      duration,
      controls: {
        symmetry,
        directionality: symmetry > 0.8 ? 0.16 : 0.94,
        fragmentation: symmetry > 0.8 ? 0.16 : 0.78,
        ringWeight: symmetry > 0.8 ? 1.15 : 0.72,
        spokeWeight: symmetry > 0.8 ? 0.42 : 1.12,
      },
    },
    curve: {
      id: curveId,
      keyframes: keyframes ?? [
        { t: 0, value: 1, interpolation: 'linear' },
        { t: 1, value: 1, interpolation: 'linear' },
      ],
    },
  });
}

function modulated(finalState, id = 'curve-proof') {
  return finalState.curveModulatedImpulseEnvelopes[id];
}

test('parameter-curve impulse modulation is deterministic and caller-neutral while retaining both source lineages', () => {
  const human = run(stateFor(), 'human');
  const machine = run(stateFor(), 'machine');
  const result = modulated(human.finalState);

  assert.equal(human.finalStateHash, machine.finalStateHash);
  assert.equal(result.canonicalEventHash, human.finalState.eventCanonicalHash);
  assert.equal(result.fieldGeometryHash, human.finalState.impulseField.geometryHash);
  assert.equal(result.baseEnvelopeHash, hashValue(human.finalState.impulseEnvelope));
  assert.equal(result.parameterCurveSourceHash, human.finalState.parameterCurveSourceHash);
  assert.equal(result.derived, true);
  assert.equal(result.rebuildable, true);
  assert.ok(!('curveMultiplier' in human.finalState.impulseEnvelope.samples[0]));
});

test('constant-one curve is an exact intensity no-op while keeping expansion and base envelope untouched', () => {
  const finalState = run(stateFor()).finalState;
  const result = modulated(finalState);

  assert.equal(result.multiplierStats.min, 1);
  assert.equal(result.multiplierStats.max, 1);
  assert.equal(result.samples.length, finalState.impulseEnvelope.samples.length);
  for (let index = 0; index < result.samples.length; index += 1) {
    const base = finalState.impulseEnvelope.samples[index];
    const derived = result.samples[index];
    assert.equal(derived.t, base.t);
    assert.equal(derived.intensity, base.intensity);
    assert.equal(derived.expansion, base.expansion);
    assert.equal(derived.curveMultiplier, 1);
  }
});

test('shaped curve changes only the derived intensity path and preserves expansion', () => {
  const finalState = run(stateFor({
    keyframes: [
      { t: 0, value: 0.25, interpolation: 'smoothstep' },
      { t: 0.25, value: 1.4, interpolation: 'smoothstep' },
      { t: 1, value: 0.35, interpolation: 'linear' },
    ],
  })).finalState;
  const result = modulated(finalState);
  const base = finalState.impulseEnvelope.samples;

  assert.ok(result.multiplierStats.min >= 0.25);
  assert.ok(result.multiplierStats.max <= 1.4);
  assert.ok(result.samples.some((sample, index) => sample.intensity !== base[index].intensity));
  assert.ok(result.samples.every((sample, index) => sample.expansion === base[index].expansion));
  assert.equal(hashValue(finalState.impulseEnvelope), result.baseEnvelopeHash);
});

test('same adapter supports materially different directional and symmetric transient impulse contexts', () => {
  const directional = run(stateFor({ curveId: 'directional', symmetry: 0.05, direction: [1, 0.1], duration: 0.55 })).finalState;
  const symmetric = run(stateFor({ curveId: 'symmetric', symmetry: 0.98, direction: [0, -1], duration: 1.2 })).finalState;
  const directionalResult = modulated(directional, 'directional');
  const symmetricResult = modulated(symmetric, 'symmetric');

  assert.notEqual(directional.eventCanonicalHash, symmetric.eventCanonicalHash);
  assert.notEqual(directional.impulseField.geometryHash, symmetric.impulseField.geometryHash);
  assert.notEqual(directionalResult.baseEnvelopeHash, symmetricResult.baseEnvelopeHash);
  assert.equal(directionalResult.parameterCurveSource.keyframes, undefined);
  assert.equal(directionalResult.samples.length, symmetricResult.samples.length);
});

test('source drift and broken base-envelope lineage fail explicitly', () => {
  const finalState = run(stateFor()).finalState;

  const changedCurve = {
    ...finalState,
    parameterCurveSource: {
      ...finalState.parameterCurveSource,
      keyframes: finalState.parameterCurveSource.keyframes.map((keyframe, index) => index === 0 ? { ...keyframe, value: 0.5 } : keyframe),
    },
  };
  assert.throws(
    () => modulateImpulseEnvelopeWithParameterCurveHand.execute(changedCurve, {}),
    /parameter curve source state hash mismatch/,
  );

  const changedEvent = {
    ...finalState,
    event: { ...finalState.event, energy: finalState.event.energy + 0.1 },
  };
  assert.throws(
    () => modulateImpulseEnvelopeWithParameterCurveHand.execute(changedEvent, {}),
    /canonical transient event hash mismatch/,
  );

  const brokenEnvelope = {
    ...finalState,
    impulseEnvelope: { ...finalState.impulseEnvelope, fieldGeometryHash: 'broken-lineage' },
  };
  assert.throws(
    () => modulateImpulseEnvelopeWithParameterCurveHand.execute(brokenEnvelope, {}),
    /base impulse envelope field geometry lineage mismatch/,
  );
});

test('transient impulse adapter rejects curve multipliers outside its bounded [0,2] contract', () => {
  assert.throws(
    () => run(stateFor({
      keyframes: [
        { t: 0, value: 2.2, interpolation: 'linear' },
        { t: 1, value: 2.2, interpolation: 'linear' },
      ],
    })),
    /parameter curve multiplier must stay within \[0,2\]/,
  );
  assert.throws(
    () => run(stateFor({
      keyframes: [
        { t: 0, value: -0.1, interpolation: 'linear' },
        { t: 1, value: -0.1, interpolation: 'linear' },
      ],
    })),
    /parameter curve multiplier must stay within \[0,2\]/,
  );
});
