import { deepClone, hashValue } from './hand-runtime.mjs';
import {
  branchPathHand,
  energyHand,
  makeElectricInitialState,
  seedPathHand,
  svgPreviewHand,
} from './electric-hands.mjs';
import {
  buildFlowGuidedPathSetHand,
  makePathFlowDisplacementState,
  normalizePathFlowDisplacementHand,
} from './path-flow-displacement.mjs';

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

function hashPathSetPayload(pathSet) {
  const payload = deepClone(pathSet);
  delete payload.pathSetHash;
  return hashValue(payload);
}

function requireExactLineage(next, selected) {
  if (hashValue(next.paths) !== next.pathSourceHash) {
    throw new Error('flow-guided electric base path hash mismatch');
  }
  if (hashValue(next.fieldSource) !== next.fieldSourceHash) {
    throw new Error('flow-guided electric scalar source hash mismatch');
  }
  if (hashValue(next.flowSource) !== next.flowSourceHash) {
    throw new Error('flow-guided electric vector source hash mismatch');
  }
  if (hashValue(next.pathFlowSource) !== next.pathFlowSourceHash) {
    throw new Error('flow-guided electric displacement source hash mismatch');
  }
  if (hashPathSetPayload(selected) !== selected.pathSetHash) {
    throw new Error('flow-guided electric selected path set hash mismatch');
  }
  if (selected.pathSourceHash !== next.pathSourceHash) {
    throw new Error('flow-guided electric base path lineage mismatch');
  }
  if (selected.scalarSourceHash !== next.fieldSourceHash) {
    throw new Error('flow-guided electric scalar lineage mismatch');
  }
  if (selected.flowSourceHash !== next.flowSourceHash) {
    throw new Error('flow-guided electric vector lineage mismatch');
  }
  if (selected.displacementSourceHash !== next.pathFlowSourceHash) {
    throw new Error('flow-guided electric displacement lineage mismatch');
  }
  if (!Array.isArray(selected.paths) || selected.paths.length !== selected.pathCount) {
    throw new Error('flow-guided electric selected path cardinality mismatch');
  }
  const selectedPointCount = selected.paths.reduce((sum, path) => sum + (Array.isArray(path.points) ? path.points.length : 0), 0);
  if (selectedPointCount !== selected.pointCount) {
    throw new Error('flow-guided electric selected point cardinality mismatch');
  }
}

export const electricFlowGuidedSvgHand = hand('fx.electric.flow-guided-svg-realize', (state) => {
  const next = deepClone(state);
  if (!Array.isArray(next.paths) || next.paths.length === 0 || !next.pathSourceHash) {
    throw new Error('flow-guided-svg-realize requires retained electric base paths');
  }
  if (!next.pathFlowSource || !next.pathFlowSourceHash) {
    throw new Error('flow-guided-svg-realize requires normalized path flow source');
  }

  const selectionId = next.pathFlowSource.id;
  const selected = next.flowGuidedPathSets?.[selectionId];
  if (!selected) {
    throw new Error(`flow-guided-svg-realize requires flow-guided path set ${selectionId}`);
  }
  requireExactLineage(next, selected);

  // Reuse the existing electric SVG donor through a disposable render view.
  // The retained electric paths remain source truth in `next`; only the donor's
  // temporary input selects the independently rebuildable flow-guided path set.
  const selectedPathsHash = hashValue(selected.paths);
  const renderView = deepClone(next);
  renderView.paths = deepClone(selected.paths);
  renderView.electricRenderSelection = {
    schema: 'axm.effect-render-selection/v0.1',
    kind: 'flow-guided-path-set',
    id: selectionId,
    basePathsHash: next.pathSourceHash,
    selectedPathSetHash: selected.pathSetHash,
    selectedPathsHash,
  };

  const donorResult = svgPreviewHand.execute(renderView, {});
  const donorRealization = donorResult.state.realizations?.svgPreview;
  if (!donorRealization) throw new Error('electric SVG donor did not produce a realization');
  if (donorRealization.derivedFromTopologyHash !== selectedPathsHash) {
    throw new Error('electric SVG donor selected path topology hash mismatch');
  }

  const realization = {
    mediaType: donorRealization.mediaType,
    renderer: 'axm.vfx.electric-flow-guided-svg/v0.1',
    basePathsHash: next.pathSourceHash,
    selectedPathSet: {
      kind: 'flow-guided-path-set',
      id: selectionId,
      pathSetHash: selected.pathSetHash,
      pathsHash: selectedPathsHash,
    },
    scalarSourceHash: next.fieldSourceHash,
    flowSourceHash: next.flowSourceHash,
    displacementSourceHash: next.pathFlowSourceHash,
    pathCount: selected.pathCount,
    pointCount: selected.pointCount,
    maxDisplacement: selected.maxDisplacement,
    content: donorRealization.content,
  };

  next.realizations ??= {};
  next.realizations.electricFlowGuidedSvg = realization;

  return {
    state: next,
    evidence: {
      renderer: realization.renderer,
      bytes: Buffer.byteLength(realization.content),
      basePathsHash: realization.basePathsHash,
      selectedPathSetHash: realization.selectedPathSet.pathSetHash,
      selectedPathsHash: realization.selectedPathSet.pathsHash,
      scalarSourceHash: realization.scalarSourceHash,
      flowSourceHash: realization.flowSourceHash,
      displacementSourceHash: realization.displacementSourceHash,
      pathCount: realization.pathCount,
      pointCount: realization.pointCount,
      maxDisplacement: realization.maxDisplacement,
    },
  };
}, 'Select a separately retained flow-guided electric path set for the proven SVG donor without overwriting the editable base paths.');

export const ELECTRIC_FLOW_GUIDED_SVG_HANDS = [
  seedPathHand,
  branchPathHand,
  energyHand,
  normalizePathFlowDisplacementHand,
  buildFlowGuidedPathSetHand,
  electricFlowGuidedSvgHand,
];

export const ELECTRIC_FLOW_GUIDED_SVG_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.electric-storm.flow-guided-svg',
  version: '0.1.0',
  stages: [
    { id: 'seed-topology', hand: 'fx.electric.seed-path', params: { segments: 18, jitter: 0.06 } },
    { id: 'grow-branches', hand: 'fx.electric.branch-paths', params: { branchCount: 7, spread: 0.12 } },
    { id: 'profile-energy', hand: 'fx.electric.energy-profile', params: { trunkWidth: 1 } },
    { id: 'normalize-path-flow-source', hand: 'fx.path.flow-displacement-source-normalize', params: {} },
    { id: 'build-flow-guided-paths', hand: 'fx.path.flow-displacement-build', params: { maxPoints: 4096 } },
    { id: 'realize-flow-guided-svg', hand: 'fx.electric.flow-guided-svg-realize', params: {} },
  ],
});

export function makeElectricFlowGuidedSvgState(options = {}) {
  const electricOptions = options.electric ?? {};
  const electric = makeElectricInitialState(electricOptions.seed ?? options.seed ?? 1337);
  if (electricOptions.source) electric.effect.source = deepClone(electricOptions.source);
  if (electricOptions.target) electric.effect.target = deepClone(electricOptions.target);
  if (electricOptions.controls) {
    electric.effect.controls = { ...electric.effect.controls, ...deepClone(electricOptions.controls) };
  }

  const guidance = makePathFlowDisplacementState([], {
    id: options.id ?? 'electric-flow-guided-paths',
    amplitude: options.amplitude ?? 0.08,
    endpointEnvelope: options.endpointEnvelope ?? true,
    field: options.field,
    flow: options.flow,
  });

  return {
    ...electric,
    fieldRequest: guidance.fieldRequest,
    flowRequest: guidance.flowRequest,
    pathFlowRequest: guidance.pathFlowRequest,
    flowGuidedPathSets: {},
  };
}
