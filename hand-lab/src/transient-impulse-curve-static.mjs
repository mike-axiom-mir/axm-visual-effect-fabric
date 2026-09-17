import { deepClone, hashValue } from './hand-runtime.mjs';
import { sampleParameterCurveSource } from './parameter-curve.mjs';
import { impulseStaticSvgHand } from './transient-impulse-static.mjs';
import {
  TRANSIENT_IMPULSE_CURVE_MODULATION_HANDS,
  makeTransientImpulseCurveModulationState,
} from './transient-impulse-curve-modulation.mjs';

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

function requireExactLineage(next, selected) {
  if (hashValue(next.event) !== next.eventCanonicalHash) {
    throw new Error('canonical transient event hash mismatch');
  }
  if (hashValue(next.impulseField.geometry) !== next.impulseField.geometryHash) {
    throw new Error('base impulse field geometry hash mismatch');
  }
  if (hashValue(next.parameterCurveSource) !== next.parameterCurveSourceHash) {
    throw new Error('parameter curve source state hash mismatch');
  }
  if (next.impulseEnvelope?.fieldGeometryHash !== next.impulseField.geometryHash) {
    throw new Error('base impulse envelope field geometry lineage mismatch');
  }

  const baseEnvelopeHash = hashValue(next.impulseEnvelope);
  if (selected.schema !== 'axm.transient-impulse-curve-envelope/v0.1') {
    throw new Error('selected parameter-curve impulse envelope schema mismatch');
  }
  if (selected.canonicalEventHash !== next.eventCanonicalHash) {
    throw new Error('selected envelope canonical event lineage mismatch');
  }
  if (selected.fieldGeometryHash !== next.impulseField.geometryHash) {
    throw new Error('selected envelope field geometry lineage mismatch');
  }
  if (selected.baseEnvelopeHash !== baseEnvelopeHash) {
    throw new Error('selected envelope base lineage mismatch');
  }
  if (selected.parameterCurveSourceHash !== next.parameterCurveSourceHash) {
    throw new Error('selected envelope parameter curve lineage mismatch');
  }
  if (selected.parameterCurveId !== next.parameterCurveSource.id) {
    throw new Error('selected envelope parameter curve id mismatch');
  }
  if (selected.duration !== next.impulseEnvelope.duration) {
    throw new Error('selected envelope duration mismatch');
  }
  if (selected.derived !== true || selected.rebuildable !== true) {
    throw new Error('selected envelope must remain derived and rebuildable');
  }
  if (!Array.isArray(selected.samples) || selected.samples.length !== next.impulseEnvelope.samples.length) {
    throw new Error('selected envelope sample cardinality mismatch');
  }

  const multipliers = [];
  for (let index = 0; index < selected.samples.length; index += 1) {
    const base = next.impulseEnvelope.samples[index];
    const derived = selected.samples[index];
    if (!derived || typeof derived !== 'object') {
      throw new Error(`selected envelope sample ${index} must be an object`);
    }

    const multiplier = finite(derived.curveMultiplier, `selected envelope sample ${index}.curveMultiplier`);
    if (multiplier < MIN_MULTIPLIER || multiplier > MAX_MULTIPLIER) {
      throw new Error(`selected envelope multiplier must stay within [${MIN_MULTIPLIER},${MAX_MULTIPLIER}]`);
    }
    const expectedMultiplier = sampleParameterCurveSource(next.parameterCurveSource, base.t);
    if (multiplier !== expectedMultiplier) {
      throw new Error('selected envelope curve multiplier mismatch');
    }
    if (derived.t !== base.t) {
      throw new Error('selected envelope sample time mismatch');
    }
    if (derived.expansion !== base.expansion) {
      throw new Error('selected envelope expansion mismatch');
    }
    if (derived.intensity !== round6(base.intensity * multiplier)) {
      throw new Error('selected envelope intensity mismatch');
    }
    multipliers.push(multiplier);
  }

  const expectedStats = {
    min: round6(Math.min(...multipliers)),
    max: round6(Math.max(...multipliers)),
    samples: multipliers.length,
  };
  if (hashValue(selected.multiplierStats) !== hashValue(expectedStats)) {
    throw new Error('selected envelope multiplier stats mismatch');
  }

  return {
    baseEnvelopeHash,
    selectedEnvelopeHash: hashValue(selected),
  };
}

export const impulseCurveStaticSvgHand = hand('fx.impulse.parameter-curve-static-svg-realize', (state) => {
  const next = deepClone(state);
  if (!next.event || !next.eventCanonicalHash || !next.impulseField || !next.impulseEnvelope) {
    throw new Error('parameter-curve-static-svg-realize requires canonical event + base field + envelope');
  }
  if (!next.parameterCurveSource || !next.parameterCurveSourceHash) {
    throw new Error('parameter-curve-static-svg-realize requires normalized parameter curve source');
  }

  const selectionId = next.parameterCurveSource.id;
  const selected = next.curveModulatedImpulseEnvelopes?.[selectionId];
  if (!selected) {
    throw new Error(`parameter-curve-static-svg-realize requires curve-modulated envelope ${selectionId}`);
  }
  const lineage = requireExactLineage(next, selected);

  // Reuse the existing static SVG donor through a disposable view. The retained
  // base envelope in `next` is never overwritten; only the donor view selects
  // the separately derived curve-modulated envelope samples.
  const renderView = deepClone(next);
  renderView.impulseEnvelope = {
    schema: 'axm.transient-envelope/v0.1',
    fieldGeometryHash: selected.fieldGeometryHash,
    duration: selected.duration,
    samples: selected.samples.map(({ t, intensity, expansion }) => ({ t, intensity, expansion })),
    renderSelection: {
      schema: 'axm.effect-render-selection/v0.1',
      kind: 'parameter-curve-impulse-envelope',
      id: selectionId,
      baseEnvelopeHash: lineage.baseEnvelopeHash,
      selectedEnvelopeHash: lineage.selectedEnvelopeHash,
    },
    derived: true,
    rebuildable: true,
  };

  const donorResult = impulseStaticSvgHand.execute(renderView, {});
  const donorRealization = donorResult.state.realizations?.transientImpulseStaticSvg;
  if (!donorRealization) throw new Error('static SVG donor did not produce a realization');

  const realization = {
    mediaType: donorRealization.mediaType,
    renderer: 'axm.vfx.transient-impulse-curve-static-svg/v0.1',
    derivedFromStateHash: donorRealization.derivedFromStateHash,
    canonicalEventHash: next.eventCanonicalHash,
    fieldGeometryHash: next.impulseField.geometryHash,
    baseEnvelopeHash: lineage.baseEnvelopeHash,
    selectedEnvelope: {
      kind: 'parameter-curve-impulse-envelope',
      id: selectionId,
      hash: lineage.selectedEnvelopeHash,
    },
    parameterCurveSourceHash: next.parameterCurveSourceHash,
    motion: deepClone(donorRealization.motion),
    content: donorRealization.content,
  };

  next.realizations ??= {};
  next.realizations.transientImpulseCurveStaticSvg = realization;

  return {
    state: next,
    evidence: {
      renderer: realization.renderer,
      bytes: Buffer.byteLength(realization.content),
      canonicalEventHash: realization.canonicalEventHash,
      fieldGeometryHash: realization.fieldGeometryHash,
      baseEnvelopeHash: realization.baseEnvelopeHash,
      selectedEnvelopeHash: realization.selectedEnvelope.hash,
      parameterCurveSourceHash: realization.parameterCurveSourceHash,
      motionMode: realization.motion.mode,
      sampleT: realization.motion.sampleT,
      sampleIntensity: realization.motion.intensity,
      sampleExpansion: realization.motion.expansion,
      performanceMeasurement: 'NOT_TESTED',
      visualInspection: 'NOT_TESTED',
    },
  };
}, 'Select a separately retained parameter-curve-modulated transient envelope for the existing static SVG donor without overwriting canonical event, base field, base envelope, or parameter-curve truth.');

export const TRANSIENT_IMPULSE_CURVE_STATIC_HANDS = [
  ...TRANSIENT_IMPULSE_CURVE_MODULATION_HANDS,
  impulseCurveStaticSvgHand,
];

export const TRANSIENT_IMPULSE_CURVE_STATIC_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.transient-impulse.parameter-curve-static',
  version: '0.1.0',
  stages: [
    { id: 'normalize-event', hand: 'fx.impulse.event-normalize', params: {} },
    { id: 'build-base-impulse-field', hand: 'fx.impulse.field-build', params: { maxRings: 8, maxSpokes: 18, maxFragments: 42 } },
    { id: 'build-base-temporal-envelope', hand: 'fx.impulse.temporal-envelope', params: { samples: 17, attack: 0.12 } },
    { id: 'normalize-parameter-curve-source', hand: 'fx.animation.parameter-curve-source-normalize', params: {} },
    { id: 'modulate-derived-envelope', hand: 'fx.impulse.parameter-curve-modulate-envelope', params: {} },
    { id: 'realize-curve-modulated-static-svg', hand: 'fx.impulse.parameter-curve-static-svg-realize', params: {} },
  ],
});

export function makeTransientImpulseCurveStaticState(options = {}) {
  return makeTransientImpulseCurveModulationState(options);
}
