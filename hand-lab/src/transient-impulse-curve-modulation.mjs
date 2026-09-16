import { deepClone, hashValue } from './hand-runtime.mjs';
import {
  buildImpulseFieldHand,
  impulseEnvelopeHand,
  makeTransientImpulseState,
  normalizeImpulseEventHand,
} from './transient-impulse-hands.mjs';
import {
  makeParameterCurveState,
  normalizeParameterCurveHand,
  sampleParameterCurveSource,
} from './parameter-curve.mjs';

const round6 = (value) => Number(Number(value).toFixed(6));
const MIN_MULTIPLIER = 0;
const MAX_MULTIPLIER = 2;

function hand(id, execute, description) {
  return Object.freeze({
    schema: 'axm.hand/v0.1',
    id,
    version: '0.1.0',
    deterministic: true,
    callerNeutral: true,
    network: 'forbidden',
    description,
    execute,
  });
}

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be finite`);
  return number;
}

function validateBaseEnvelope(state) {
  const envelope = state.impulseEnvelope;
  if (!envelope || envelope.schema !== 'axm.transient-envelope/v0.1') {
    throw new Error('parameter-curve impulse modulation requires base transient envelope');
  }
  if (envelope.fieldGeometryHash !== state.impulseField.geometryHash) {
    throw new Error('base impulse envelope field geometry lineage mismatch');
  }
  if (envelope.duration !== state.event.duration) {
    throw new Error('base impulse envelope duration does not match canonical event');
  }
  if (!Array.isArray(envelope.samples) || envelope.samples.length < 5 || envelope.samples.length > 33) {
    throw new Error('base impulse envelope samples must contain 5..33 entries');
  }

  let previousT = -Infinity;
  for (const [index, sample] of envelope.samples.entries()) {
    if (!sample || typeof sample !== 'object') throw new Error(`base impulse envelope sample ${index} must be an object`);
    const t = finite(sample.t, `base impulse envelope sample ${index}.t`);
    const intensity = finite(sample.intensity, `base impulse envelope sample ${index}.intensity`);
    const expansion = finite(sample.expansion, `base impulse envelope sample ${index}.expansion`);
    if (t < 0 || t > 1 || t <= previousT) throw new Error('base impulse envelope sample times must increase inside [0,1]');
    if (intensity < 0) throw new Error('base impulse envelope intensity must be non-negative');
    if (expansion < 0) throw new Error('base impulse envelope expansion must be non-negative');
    previousT = t;
  }
}

export const modulateImpulseEnvelopeWithParameterCurveHand = hand('fx.impulse.parameter-curve-modulate-envelope', (state) => {
  const next = deepClone(state);
  if (!next.event || !next.eventCanonicalHash || !next.impulseField) {
    throw new Error('parameter-curve impulse modulation requires normalized event + impulse field');
  }
  if (!next.parameterCurveSource || !next.parameterCurveSourceHash) {
    throw new Error('parameter-curve impulse modulation requires normalized parameter curve source');
  }
  if (hashValue(next.event) !== next.eventCanonicalHash) {
    throw new Error('canonical transient event hash mismatch');
  }
  if (hashValue(next.impulseField.geometry) !== next.impulseField.geometryHash) {
    throw new Error('base impulse field geometry hash mismatch');
  }
  if (hashValue(next.parameterCurveSource) !== next.parameterCurveSourceHash) {
    throw new Error('parameter curve source state hash mismatch');
  }
  validateBaseEnvelope(next);

  const baseEnvelopeHash = hashValue(next.impulseEnvelope);
  const samples = [];
  const multipliers = [];

  for (const baseSample of next.impulseEnvelope.samples) {
    const multiplier = sampleParameterCurveSource(next.parameterCurveSource, baseSample.t);
    if (multiplier < MIN_MULTIPLIER || multiplier > MAX_MULTIPLIER) {
      throw new Error(`parameter curve multiplier must stay within [${MIN_MULTIPLIER},${MAX_MULTIPLIER}] for transient impulse modulation`);
    }
    multipliers.push(multiplier);
    samples.push({
      t: baseSample.t,
      intensity: round6(baseSample.intensity * multiplier),
      expansion: baseSample.expansion,
      curveMultiplier: multiplier,
    });
  }

  const modulated = {
    schema: 'axm.transient-impulse-curve-envelope/v0.1',
    canonicalEventHash: next.eventCanonicalHash,
    fieldGeometryHash: next.impulseField.geometryHash,
    baseEnvelopeHash,
    parameterCurveSourceHash: next.parameterCurveSourceHash,
    parameterCurveId: next.parameterCurveSource.id,
    duration: next.impulseEnvelope.duration,
    samples,
    multiplierStats: {
      min: round6(Math.min(...multipliers)),
      max: round6(Math.max(...multipliers)),
      samples: multipliers.length,
    },
    derived: true,
    rebuildable: true,
  };
  const modulatedEnvelopeHash = hashValue(modulated);

  next.curveModulatedImpulseEnvelopes ??= {};
  next.curveModulatedImpulseEnvelopes[next.parameterCurveSource.id] = modulated;

  return {
    state: next,
    evidence: {
      canonicalEventHash: next.eventCanonicalHash,
      fieldGeometryHash: next.impulseField.geometryHash,
      baseEnvelopeHash,
      parameterCurveSourceHash: next.parameterCurveSourceHash,
      modulatedEnvelopeHash,
      sampleCount: samples.length,
      multiplierStats: modulated.multiplierStats,
      performanceMeasurement: 'NOT_TESTED',
      visualInspection: 'NOT_TESTED',
    },
  };
}, 'Apply a retained renderer-neutral parameter curve as bounded derived intensity modulation over a transient impulse envelope while preserving the canonical event, base field, base envelope, and curve source.');

export const TRANSIENT_IMPULSE_CURVE_MODULATION_HANDS = [
  normalizeImpulseEventHand,
  buildImpulseFieldHand,
  impulseEnvelopeHand,
  normalizeParameterCurveHand,
  modulateImpulseEnvelopeWithParameterCurveHand,
];

export const TRANSIENT_IMPULSE_CURVE_MODULATION_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.transient-impulse.parameter-curve-modulation',
  version: '0.1.0',
  stages: [
    { id: 'normalize-event', hand: 'fx.impulse.event-normalize', params: {} },
    { id: 'build-base-impulse-field', hand: 'fx.impulse.field-build', params: { maxRings: 8, maxSpokes: 18, maxFragments: 42 } },
    { id: 'build-base-temporal-envelope', hand: 'fx.impulse.temporal-envelope', params: { samples: 17, attack: 0.12 } },
    { id: 'normalize-parameter-curve-source', hand: 'fx.animation.parameter-curve-source-normalize', params: {} },
    { id: 'modulate-derived-envelope', hand: 'fx.impulse.parameter-curve-modulate-envelope', params: {} },
  ],
});

export function makeTransientImpulseCurveModulationState(options = {}) {
  const impulse = makeTransientImpulseState(options.impulse ?? {});
  const curveOptions = options.curve ?? {};
  const curve = makeParameterCurveState({
    id: curveOptions.id ?? 'impulse-envelope-modulation',
    wrapMode: curveOptions.wrapMode ?? 'clamp',
    keyframes: curveOptions.keyframes ?? [
      { t: 0, value: 1, interpolation: 'linear' },
      { t: 1, value: 1, interpolation: 'linear' },
    ],
  });

  return {
    ...impulse,
    parameterCurveRequest: curve.parameterCurveRequest,
    parameterCurveSamples: curve.parameterCurveSamples,
    curveModulatedImpulseEnvelopes: {},
  };
}
