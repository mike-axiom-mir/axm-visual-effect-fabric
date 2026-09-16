import { deepClone, hashValue } from './hand-runtime.mjs';
import { svgPreviewHand } from './electric-hands.mjs';
import {
  ELECTRIC_FIELD_MODULATION_HANDS,
  makeElectricFieldModulationState,
} from './electric-field-modulation.mjs';

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
  if (hashValue(next.paths) !== next.electricBasePathsHash) {
    throw new Error('electric base path hash mismatch');
  }
  if (hashValue(selected.paths) !== selected.pathSetHash) {
    throw new Error('modulated electric path set hash mismatch');
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
  if (hashValue(next.electricFieldModulationSource) !== next.electricFieldModulationSourceHash) {
    throw new Error('electric field modulation source hash mismatch');
  }
  if (selected.basePathsHash !== next.electricBasePathsHash) {
    throw new Error('modulated electric base path lineage mismatch');
  }
  if (selected.fieldCompositionSourceHash !== next.fieldCompositionSourceHash) {
    throw new Error('modulated electric composition lineage mismatch');
  }
  if (selected.inputAHash !== next.fieldSourceHashes?.a || selected.inputBHash !== next.fieldSourceHashes?.b) {
    throw new Error('modulated electric input field lineage mismatch');
  }
  if (selected.electricFieldModulationSourceHash !== next.electricFieldModulationSourceHash) {
    throw new Error('modulated electric modulation lineage mismatch');
  }
}

export const electricModulatedSvgHand = hand('fx.electric.modulated-svg-realize', (state) => {
  const next = deepClone(state);
  if (!Array.isArray(next.paths) || next.paths.length === 0 || !next.electricBasePathsHash) {
    throw new Error('modulated-svg-realize requires retained electric base paths');
  }
  if (!next.electricFieldModulationSource || !next.electricFieldModulationSourceHash) {
    throw new Error('modulated-svg-realize requires normalized electric field modulation source');
  }

  const selectionId = next.electricFieldModulationSource.id;
  const selected = next.modulatedElectricPathSets?.[selectionId];
  if (!selected) {
    throw new Error(`modulated-svg-realize requires modulated electric path set ${selectionId}`);
  }
  requireExactLineage(next, selected);

  // Reuse the existing SVG donor through a disposable render view. The retained
  // base paths stay untouched in `next`; only the donor's temporary input selects
  // the separately derived modulated path set.
  const renderView = deepClone(next);
  renderView.paths = deepClone(selected.paths);
  renderView.electricRenderSelection = {
    schema: 'axm.effect-render-selection/v0.1',
    kind: 'modulated-electric-path-set',
    id: selectionId,
    basePathsHash: next.electricBasePathsHash,
    selectedPathSetHash: selected.pathSetHash,
  };

  const donorResult = svgPreviewHand.execute(renderView, {});
  const donorRealization = donorResult.state.realizations?.svgPreview;
  if (!donorRealization) throw new Error('electric SVG donor did not produce a realization');
  if (donorRealization.derivedFromTopologyHash !== selected.pathSetHash) {
    throw new Error('electric SVG donor selected path-set hash mismatch');
  }

  const realization = {
    mediaType: donorRealization.mediaType,
    renderer: 'axm.vfx.electric-modulated-svg/v0.1',
    derivedFromSelectedPathSetHash: donorRealization.derivedFromTopologyHash,
    basePathsHash: next.electricBasePathsHash,
    selectedPathSet: {
      kind: 'modulated-electric-path-set',
      id: selectionId,
      pathSetHash: selected.pathSetHash,
    },
    fieldCompositionSourceHash: next.fieldCompositionSourceHash,
    inputAHash: next.fieldSourceHashes.a,
    inputBHash: next.fieldSourceHashes.b,
    electricFieldModulationSourceHash: next.electricFieldModulationSourceHash,
    factorStats: deepClone(selected.factorStats),
    content: donorRealization.content,
  };

  next.realizations ??= {};
  next.realizations.electricModulatedSvg = realization;

  return {
    state: next,
    evidence: {
      renderer: realization.renderer,
      bytes: Buffer.byteLength(realization.content),
      basePathsHash: realization.basePathsHash,
      selectedPathSetHash: realization.selectedPathSet.pathSetHash,
      fieldCompositionSourceHash: realization.fieldCompositionSourceHash,
      electricFieldModulationSourceHash: realization.electricFieldModulationSourceHash,
      inputAHash: realization.inputAHash,
      inputBHash: realization.inputBHash,
      pathCount: selected.paths.length,
      factorStats: realization.factorStats,
    },
  };
}, 'Select a separately retained modulated electric path set for the proven SVG donor without overwriting the editable base paths.');

export const ELECTRIC_MODULATED_SVG_HANDS = [
  ...ELECTRIC_FIELD_MODULATION_HANDS,
  electricModulatedSvgHand,
];

export const ELECTRIC_MODULATED_SVG_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.electric-storm.modulated-svg',
  version: '0.1.0',
  stages: [
    { id: 'seed-topology', hand: 'fx.electric.seed-path', params: { segments: 18, jitter: 0.06 } },
    { id: 'grow-branches', hand: 'fx.electric.branch-paths', params: { branchCount: 7, spread: 0.12 } },
    { id: 'profile-energy', hand: 'fx.electric.energy-profile', params: { trunkWidth: 1 } },
    { id: 'normalize-composition-source', hand: 'fx.field.composition-source-normalize', params: {} },
    { id: 'normalize-electric-field-modulation-source', hand: 'fx.electric.field-modulation-source-normalize', params: {} },
    { id: 'modulate-derived-electric-paths', hand: 'fx.electric.composed-field-modulate', params: {} },
    { id: 'realize-modulated-svg', hand: 'fx.electric.modulated-svg-realize', params: {} },
  ],
});

export function makeElectricModulatedSvgState(options = {}) {
  return makeElectricFieldModulationState(options);
}
