import { deepClone, hashValue } from './hand-runtime.mjs';
import { svgPreviewHand } from './electric-hands.mjs';
import {
  ELECTRIC_FLICKER_MODULATION_HANDS,
  makeElectricFlickerModulationState,
  validateElectricFlickerModulatedPathSet,
} from './electric-flicker-modulation.mjs';

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

function requireExactSelection(next, selected) {
  if (!Array.isArray(next.paths) || next.paths.length === 0 || !next.electricBasePathsHash) {
    throw new Error('flicker-modulated-svg-realize requires retained electric base paths');
  }
  if (hashValue(next.paths) !== next.electricBasePathsHash) {
    throw new Error('electric flicker SVG base path hash mismatch');
  }
  if (!next.flickerCycleSource || !next.flickerCycleSourceHash) {
    throw new Error('flicker-modulated-svg-realize requires retained flicker cycle truth');
  }
  if (!next.electricFlickerModulationSource || !next.electricFlickerModulationSourceHash) {
    throw new Error('flicker-modulated-svg-realize requires normalized electric flicker modulation source');
  }

  // This validator does more than hash checking: it rebuilds the expected
  // derived path set from retained electric + flicker + binding truth.
  validateElectricFlickerModulatedPathSet(next, selected);
}

export const electricFlickerModulatedSvgHand = hand('fx.electric.flicker-modulated-svg-realize', (state) => {
  const next = deepClone(state);
  const selectionId = next.electricFlickerModulationSource?.id;
  if (!selectionId) {
    throw new Error('flicker-modulated-svg-realize requires normalized electric flicker modulation source');
  }

  const selected = next.flickerModulatedElectricPathSets?.[selectionId];
  if (!selected) {
    throw new Error(`flicker-modulated-svg-realize requires flicker-modulated electric path set ${selectionId}`);
  }
  requireExactSelection(next, selected);

  // Reuse the already-proven electric SVG donor through a disposable render
  // view. Canonical electric paths, flicker truth, binding truth, and the
  // source-verified derived set all remain separate in `next`.
  const renderView = deepClone(next);
  renderView.paths = deepClone(selected.paths);
  renderView.electricRenderSelection = {
    schema: 'axm.effect-render-selection/v0.1',
    kind: 'flicker-modulated-electric-path-set',
    id: selectionId,
    basePathsHash: next.electricBasePathsHash,
    selectedPathSetHash: selected.pathSetHash,
    modulatedSetHash: selected.modulatedSetHash,
    phase: selected.phase,
  };

  const donorResult = svgPreviewHand.execute(renderView, {});
  const donorRealization = donorResult.state.realizations?.svgPreview;
  if (!donorRealization) throw new Error('electric SVG donor did not produce a realization');
  if (donorRealization.derivedFromTopologyHash !== selected.pathSetHash) {
    throw new Error('electric SVG donor selected flicker path-set hash mismatch');
  }

  const realization = {
    mediaType: donorRealization.mediaType,
    renderer: 'axm.vfx.electric-flicker-modulated-svg/v0.1',
    derivedFromSelectedPathSetHash: donorRealization.derivedFromTopologyHash,
    basePathsHash: next.electricBasePathsHash,
    selectedPathSet: {
      kind: 'flicker-modulated-electric-path-set',
      id: selectionId,
      pathSetHash: selected.pathSetHash,
      modulatedSetHash: selected.modulatedSetHash,
      phase: selected.phase,
    },
    flickerCycleSourceHash: next.flickerCycleSourceHash,
    electricFlickerModulationSourceHash: next.electricFlickerModulationSourceHash,
    sampleValue: selected.sampleValue,
    normalizedSample: selected.normalizedSample,
    factor: selected.factor,
    content: donorRealization.content,
  };
  realization.contentHash = hashValue(realization.content);

  next.realizations ??= {};
  next.realizations.electricFlickerModulatedSvg = realization;

  return {
    state: next,
    evidence: {
      renderer: realization.renderer,
      bytes: Buffer.byteLength(realization.content),
      contentHash: realization.contentHash,
      basePathsHash: realization.basePathsHash,
      selectedPathSetHash: realization.selectedPathSet.pathSetHash,
      modulatedSetHash: realization.selectedPathSet.modulatedSetHash,
      flickerCycleSourceHash: realization.flickerCycleSourceHash,
      electricFlickerModulationSourceHash: realization.electricFlickerModulationSourceHash,
      phase: realization.selectedPathSet.phase,
      factor: realization.factor,
      pathCount: selected.pathCount,
      pointCount: selected.pointCount,
      rendererDonor: 'hand-lab/src/electric-hands.mjs#fx.electric.svg-preview',
      externalSourceReuse: 'none',
      performanceMeasurement: 'NOT_TESTED',
      visualInspection: 'NOT_TESTED',
    },
  };
}, 'Render one source-verified flicker-modulated electric path set through the existing replaceable SVG donor without rewriting retained electric or flicker truth.');

export const ELECTRIC_FLICKER_MODULATED_SVG_HANDS = [
  ...ELECTRIC_FLICKER_MODULATION_HANDS,
  electricFlickerModulatedSvgHand,
];

export const ELECTRIC_FLICKER_MODULATED_SVG_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.electric-storm.flicker-cycle-modulated-svg',
  version: '0.1.0',
  stages: [
    { id: 'seed-topology', hand: 'fx.electric.seed-path', params: { segments: 18, jitter: 0.06 } },
    { id: 'grow-branches', hand: 'fx.electric.branch-paths', params: { branchCount: 7, spread: 0.12 } },
    { id: 'profile-energy', hand: 'fx.electric.energy-profile', params: { trunkWidth: 1 } },
    { id: 'normalize-flicker-cycle-source', hand: 'fx.animation.flicker-cycle1d-source-normalize', params: {} },
    { id: 'normalize-electric-flicker-modulation-source', hand: 'fx.electric.flicker-modulation-source-normalize', params: {} },
    { id: 'modulate-derived-electric-paths', hand: 'fx.electric.flicker-cycle-modulate', params: { phase: 0 } },
    { id: 'realize-flicker-modulated-svg', hand: 'fx.electric.flicker-modulated-svg-realize', params: {} },
  ],
});

export function makeElectricFlickerModulatedSvgState(options = {}) {
  return makeElectricFlickerModulationState(options);
}
