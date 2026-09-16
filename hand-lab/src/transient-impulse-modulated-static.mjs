import { deepClone, hashValue } from './hand-runtime.mjs';
import { impulseEnvelopeHand } from './transient-impulse-hands.mjs';
import { impulseStaticSvgHand } from './transient-impulse-static.mjs';
import {
  TRANSIENT_IMPULSE_FIELD_MODULATION_HANDS,
  makeTransientImpulseFieldModulationState,
} from './transient-impulse-field-modulation.mjs';

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

function requireExactLineage(next, selected) {
  if (hashValue(next.event) !== next.eventCanonicalHash) {
    throw new Error('canonical transient event hash mismatch');
  }
  if (hashValue(next.impulseField.geometry) !== next.impulseField.geometryHash) {
    throw new Error('base impulse field geometry hash mismatch');
  }
  if (hashValue(selected.geometry) !== selected.geometryHash) {
    throw new Error('modulated impulse field geometry hash mismatch');
  }
  if (hashValue(next.fieldCompositionSource) !== next.fieldCompositionSourceHash) {
    throw new Error('field composition source hash mismatch');
  }
  if (hashValue(next.fieldSources?.a) !== next.fieldSourceHashes?.a) {
    throw new Error('composition inputA source hash mismatch');
  }
  if (hashValue(next.fieldSources?.b) !== next.fieldSourceHashes?.b) {
    throw new Error('composition inputB source hash mismatch');
  }
  if (hashValue(next.fieldModulationSource) !== next.fieldModulationSourceHash) {
    throw new Error('field modulation source hash mismatch');
  }
  if (selected.canonicalEventHash !== next.eventCanonicalHash) {
    throw new Error('modulated impulse canonical event lineage mismatch');
  }
  if (selected.baseFieldGeometryHash !== next.impulseField.geometryHash) {
    throw new Error('modulated impulse base field lineage mismatch');
  }
  if (selected.fieldCompositionSourceHash !== next.fieldCompositionSourceHash) {
    throw new Error('modulated impulse composition lineage mismatch');
  }
  if (selected.inputAHash !== next.fieldSourceHashes?.a || selected.inputBHash !== next.fieldSourceHashes?.b) {
    throw new Error('modulated impulse input field lineage mismatch');
  }
  if (selected.fieldModulationSourceHash !== next.fieldModulationSourceHash) {
    throw new Error('modulated impulse modulation lineage mismatch');
  }
  if (next.impulseEnvelope.fieldGeometryHash !== next.impulseField.geometryHash) {
    throw new Error('temporal envelope base field lineage mismatch');
  }
}

export const impulseModulatedStaticSvgHand = hand('fx.impulse.modulated-static-svg-realize', (state) => {
  const next = deepClone(state);
  if (!next.event || !next.eventCanonicalHash || !next.impulseField || !next.impulseEnvelope) {
    throw new Error('modulated-static-svg-realize requires canonical event + base field + envelope');
  }
  if (!next.fieldModulationSource || !next.fieldModulationSourceHash) {
    throw new Error('modulated-static-svg-realize requires normalized modulation source');
  }

  const selectionId = next.fieldModulationSource.id;
  const selected = next.modulatedImpulseFields?.[selectionId];
  if (!selected) {
    throw new Error(`modulated-static-svg-realize requires modulated field ${selectionId}`);
  }
  requireExactLineage(next, selected);

  // The existing static renderer is reused as a donor. Only this disposable render-view
  // swaps the selected derived geometry; canonical event state and the retained base
  // impulseField in `next` are never overwritten.
  const renderView = deepClone(next);
  renderView.impulseField = {
    ...deepClone(next.impulseField),
    geometry: deepClone(selected.geometry),
    geometryHash: selected.geometryHash,
    counts: deepClone(selected.counts),
    renderSelection: {
      schema: 'axm.effect-render-selection/v0.1',
      kind: 'modulated-impulse-field',
      id: selectionId,
      baseFieldGeometryHash: next.impulseField.geometryHash,
      selectedFieldGeometryHash: selected.geometryHash,
    },
    derived: true,
    rebuildable: true,
  };

  const donorResult = impulseStaticSvgHand.execute(renderView, {});
  const donorRealization = donorResult.state.realizations?.transientImpulseStaticSvg;
  if (!donorRealization) throw new Error('static SVG donor did not produce a realization');

  const realization = {
    mediaType: donorRealization.mediaType,
    renderer: 'axm.vfx.transient-impulse-modulated-static-svg/v0.1',
    derivedFromStateHash: donorRealization.derivedFromStateHash,
    canonicalEventHash: next.eventCanonicalHash,
    baseFieldGeometryHash: next.impulseField.geometryHash,
    selectedField: {
      kind: 'modulated-impulse-field',
      id: selectionId,
      geometryHash: selected.geometryHash,
    },
    fieldCompositionSourceHash: next.fieldCompositionSourceHash,
    inputAHash: next.fieldSourceHashes.a,
    inputBHash: next.fieldSourceHashes.b,
    fieldModulationSourceHash: next.fieldModulationSourceHash,
    envelopeSourceFieldGeometryHash: next.impulseEnvelope.fieldGeometryHash,
    motion: deepClone(donorRealization.motion),
    content: donorRealization.content,
  };

  next.realizations ??= {};
  next.realizations.transientImpulseModulatedStaticSvg = realization;

  return {
    state: next,
    evidence: {
      renderer: realization.renderer,
      bytes: Buffer.byteLength(realization.content),
      canonicalEventHash: realization.canonicalEventHash,
      baseFieldGeometryHash: realization.baseFieldGeometryHash,
      selectedFieldGeometryHash: realization.selectedField.geometryHash,
      fieldCompositionSourceHash: realization.fieldCompositionSourceHash,
      fieldModulationSourceHash: realization.fieldModulationSourceHash,
      inputAHash: realization.inputAHash,
      inputBHash: realization.inputBHash,
      envelopeSourceFieldGeometryHash: realization.envelopeSourceFieldGeometryHash,
      motionMode: realization.motion.mode,
      sampleT: realization.motion.sampleT,
    },
  };
}, 'Select a separately retained modulated impulse field for the proven static SVG donor without overwriting the canonical event or base impulse field.');

export const TRANSIENT_IMPULSE_MODULATED_STATIC_HANDS = [
  ...TRANSIENT_IMPULSE_FIELD_MODULATION_HANDS,
  impulseEnvelopeHand,
  impulseModulatedStaticSvgHand,
];

export const TRANSIENT_IMPULSE_MODULATED_STATIC_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.transient-impulse.modulated-static',
  version: '0.1.0',
  stages: [
    { id: 'normalize-event', hand: 'fx.impulse.event-normalize', params: {} },
    { id: 'build-base-impulse-field', hand: 'fx.impulse.field-build', params: { maxRings: 8, maxSpokes: 18, maxFragments: 42 } },
    { id: 'normalize-composition-source', hand: 'fx.field.composition-source-normalize', params: {} },
    { id: 'normalize-field-modulation-source', hand: 'fx.impulse.field-modulation-source-normalize', params: {} },
    { id: 'modulate-derived-impulse-field', hand: 'fx.impulse.composed-field-modulate', params: {} },
    { id: 'temporal-envelope', hand: 'fx.impulse.temporal-envelope', params: { samples: 17, attack: 0.12 } },
    { id: 'realize-modulated-static-svg', hand: 'fx.impulse.modulated-static-svg-realize', params: {} },
  ],
});

export function makeTransientImpulseModulatedStaticState(options = {}) {
  return makeTransientImpulseFieldModulationState(options);
}
