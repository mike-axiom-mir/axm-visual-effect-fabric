import { deepClone, hashValue } from './hand-runtime.mjs';
import {
  projectionStateHand,
  stateNativeProjectorHand,
} from './holographic-state-projector.mjs';
import {
  HOLOGRAPHIC_FIELD_MODULATION_HANDS,
  makeHolographicFieldModulationState,
} from './holographic-field-modulation.mjs';

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
  const base = next.sampleField;
  if (!base || hashValue(base) !== next.holographicBaseSampleFieldHash) {
    throw new Error('holographic base sample field hash mismatch');
  }
  if (hashValue(next.form) !== base.canonicalFormHash) {
    throw new Error('canonical form hash mismatch');
  }
  if (hashValue(selected.points) !== selected.sampleFieldHash) {
    throw new Error('modulated holographic sample field hash mismatch');
  }
  if (selected.canonicalFormHash !== base.canonicalFormHash) {
    throw new Error('modulated holographic canonical form lineage mismatch');
  }
  if (selected.baseSampleFieldHash !== next.holographicBaseSampleFieldHash) {
    throw new Error('modulated holographic base sample field lineage mismatch');
  }
  if (selected.pointCount !== base.pointCount || selected.stride !== base.stride) {
    throw new Error('modulated holographic sample field shape mismatch');
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
  if (hashValue(next.holographicFieldModulationSource) !== next.holographicFieldModulationSourceHash) {
    throw new Error('holographic field modulation source hash mismatch');
  }
  if (selected.fieldCompositionSourceHash !== next.fieldCompositionSourceHash) {
    throw new Error('modulated holographic composition lineage mismatch');
  }
  if (selected.inputAHash !== next.fieldSourceHashes?.a || selected.inputBHash !== next.fieldSourceHashes?.b) {
    throw new Error('modulated holographic input field lineage mismatch');
  }
  if (selected.holographicFieldModulationSourceHash !== next.holographicFieldModulationSourceHash) {
    throw new Error('modulated holographic modulation lineage mismatch');
  }
}

export const holographicModulatedProjectorHand = hand('fx.hologram.modulated-state-projector-webgl', (state) => {
  const next = deepClone(state);
  if (!next.projection) {
    throw new Error('modulated-state-projector-webgl requires projection state');
  }
  if (!next.holographicFieldModulationSource || !next.holographicFieldModulationSourceHash) {
    throw new Error('modulated-state-projector-webgl requires normalized holographic field modulation source');
  }

  const selectionId = next.holographicFieldModulationSource.id;
  const selected = next.modulatedHolographicSampleFields?.[selectionId];
  if (!selected) {
    throw new Error(`modulated-state-projector-webgl requires modulated holographic sample field ${selectionId}`);
  }
  requireExactLineage(next, selected);

  // Reuse the existing state-native WebGL projector through a disposable render
  // view. The retained base sampleField stays untouched in `next`; only the
  // donor's temporary input selects the separately derived intensity field.
  const renderView = deepClone(next);
  renderView.sampleField = deepClone(next.sampleField);
  renderView.sampleField.points = deepClone(selected.points);
  renderView.sampleField.renderSelection = {
    schema: 'axm.effect-render-selection/v0.1',
    kind: 'modulated-holographic-sample-field',
    id: selectionId,
    baseSampleFieldHash: next.holographicBaseSampleFieldHash,
    selectedSamplePointsHash: selected.sampleFieldHash,
  };

  const renderSampleFieldHash = hashValue(renderView.sampleField);
  const donorResult = stateNativeProjectorHand.execute(renderView, {});
  const donorRealization = donorResult.state.realizations?.holographicStateProjector;
  if (!donorRealization) {
    throw new Error('holographic state projector donor did not produce a realization');
  }
  if (donorRealization.sampleFieldHash !== renderSampleFieldHash) {
    throw new Error('holographic state projector donor selected sample-field hash mismatch');
  }
  if (donorRealization.canonicalFormHash !== next.sampleField.canonicalFormHash) {
    throw new Error('holographic state projector donor canonical form hash mismatch');
  }

  const realization = {
    mediaType: donorRealization.mediaType,
    renderer: 'axm.vfx.holographic-modulated-state-projector/v0.1',
    donorRenderer: donorRealization.renderer,
    canonicalFormHash: next.sampleField.canonicalFormHash,
    baseSampleFieldHash: next.holographicBaseSampleFieldHash,
    selectedSampleField: {
      kind: 'modulated-holographic-sample-field',
      id: selectionId,
      sampleFieldHash: selected.sampleFieldHash,
    },
    renderSampleFieldHash,
    fieldCompositionSourceHash: next.fieldCompositionSourceHash,
    inputAHash: next.fieldSourceHashes.a,
    inputBHash: next.fieldSourceHashes.b,
    holographicFieldModulationSourceHash: next.holographicFieldModulationSourceHash,
    factorStats: deepClone(selected.factorStats),
    pointCount: selected.pointCount,
    workingSet: {
      ...deepClone(donorRealization.workingSet),
      baseSampleFieldRetained: true,
      selectedDerivedSampleField: true,
      selectedSamplePointsHash: selected.sampleFieldHash,
    },
    content: donorRealization.content,
  };

  next.realizations ??= {};
  next.realizations.holographicModulatedStateProjector = realization;

  return {
    state: next,
    evidence: {
      renderer: realization.renderer,
      donorRenderer: realization.donorRenderer,
      bytes: Buffer.byteLength(realization.content),
      canonicalFormHash: realization.canonicalFormHash,
      baseSampleFieldHash: realization.baseSampleFieldHash,
      selectedSampleFieldHash: realization.selectedSampleField.sampleFieldHash,
      renderSampleFieldHash: realization.renderSampleFieldHash,
      fieldCompositionSourceHash: realization.fieldCompositionSourceHash,
      holographicFieldModulationSourceHash: realization.holographicFieldModulationSourceHash,
      inputAHash: realization.inputAHash,
      inputBHash: realization.inputBHash,
      pointCount: realization.pointCount,
      modeledBufferBytes: realization.workingSet.modeledBufferBytes,
      factorStats: realization.factorStats,
    },
  };
}, 'Select a separately retained modulated holographic sample field for the existing state-native WebGL projector without overwriting canonical form or the base sample field.');

export const HOLOGRAPHIC_MODULATED_PROJECTOR_HANDS = [
  ...HOLOGRAPHIC_FIELD_MODULATION_HANDS,
  projectionStateHand,
  holographicModulatedProjectorHand,
];

export const HOLOGRAPHIC_MODULATED_PROJECTOR_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.holographic-state-projector.modulated-webgl',
  version: '0.1.0',
  stages: [
    { id: 'normalize-form', hand: 'fx.hologram.form-normalize', params: {} },
    { id: 'sample-form', hand: 'fx.hologram.form-sample', params: {} },
    { id: 'creative-field', hand: 'fx.hologram.creative-field', params: {} },
    { id: 'normalize-composition-source', hand: 'fx.field.composition-source-normalize', params: {} },
    { id: 'normalize-holographic-field-modulation-source', hand: 'fx.hologram.field-modulation-source-normalize', params: {} },
    { id: 'modulate-derived-holographic-sample-field', hand: 'fx.hologram.composed-field-modulate', params: {} },
    { id: 'projection-state', hand: 'fx.hologram.projection-state', params: {} },
    { id: 'realize-modulated-projector', hand: 'fx.hologram.modulated-state-projector-webgl', params: {} },
  ],
});

export function makeHolographicModulatedProjectorState(form, options = {}) {
  return makeHolographicFieldModulationState(form, options);
}
