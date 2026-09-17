import { deepClone, hashValue } from './hand-runtime.mjs';
import {
  buildFlowGuidedPathSetHand,
  makePathFlowDisplacementState,
  normalizePathFlowDisplacementHand,
} from './path-flow-displacement.mjs';
import {
  hashDerivedPathSetPayload,
  renderDerivedPathSetStaticSvg,
  validateNormalizedPathArray,
  validatePathIdentity,
} from './path-static-svg-core.mjs';

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
  if (hashValue(next.paths) !== next.pathSourceHash) throw new Error('path-flow SVG base path hash mismatch');
  if (hashValue(next.fieldSource) !== next.fieldSourceHash) throw new Error('path-flow SVG scalar source hash mismatch');
  if (hashValue(next.flowSource) !== next.flowSourceHash) throw new Error('path-flow SVG vector source hash mismatch');
  if (hashValue(next.pathFlowSource) !== next.pathFlowSourceHash) throw new Error('path-flow SVG displacement source hash mismatch');

  if (!selected || selected.schema !== 'axm.flow-guided-path-set/v0.1') {
    throw new Error('path-flow SVG requires a derived flow-guided path set');
  }
  if (selected.derived !== true || selected.rebuildable !== true) {
    throw new Error('path-flow SVG selected path set must remain derived and rebuildable');
  }
  if (hashDerivedPathSetPayload(selected) !== selected.pathSetHash) {
    throw new Error('path-flow SVG selected path set hash mismatch');
  }
  if (selected.pathSourceHash !== next.pathSourceHash) throw new Error('path-flow SVG path lineage mismatch');
  if (selected.scalarSourceHash !== next.fieldSourceHash) throw new Error('path-flow SVG scalar lineage mismatch');
  if (selected.flowSourceHash !== next.flowSourceHash) throw new Error('path-flow SVG vector lineage mismatch');
  if (selected.displacementSourceHash !== next.pathFlowSourceHash) throw new Error('path-flow SVG displacement lineage mismatch');

  validateNormalizedPathArray(next.paths, selected.pathCount, selected.pointCount, 'path-flow SVG base');
  validateNormalizedPathArray(selected.paths, selected.pathCount, selected.pointCount, 'path-flow SVG derived');
  validatePathIdentity(next.paths, selected.paths, 'path-flow SVG');

  const rebuildState = deepClone(next);
  rebuildState.flowGuidedPathSets = {};
  const expectedResult = buildFlowGuidedPathSetHand.execute(
    rebuildState,
    { maxPoints: Math.max(4, selected.pointCount) },
  );
  const expected = expectedResult.state.flowGuidedPathSets?.[next.pathFlowSource.id];
  if (!expected || expected.pathSetHash !== selected.pathSetHash) {
    throw new Error('path-flow SVG selected path set does not match retained sources');
  }
}

export const pathFlowStaticSvgHand = hand('fx.path.flow-static-svg-realize', (state, params = {}) => {
  const next = deepClone(state);
  if (!next.pathSourceHash || !next.fieldSourceHash || !next.flowSourceHash || !next.pathFlowSourceHash) {
    throw new Error('path-flow-static-svg-realize requires normalized path-flow source lineage');
  }
  const selectionId = next.pathFlowSource?.id;
  if (!selectionId) throw new Error('path-flow-static-svg-realize requires path flow source id');
  const selected = next.flowGuidedPathSets?.[selectionId];
  if (!selected) throw new Error(`path-flow-static-svg-realize requires flow-guided path set ${selectionId}`);
  requireExactLineage(next, selected);

  const rendered = renderDerivedPathSetStaticSvg({
    basePaths: next.paths,
    pathSet: selected,
    renderer: 'axm.vfx.path-flow-static-svg/v0.1',
    title: 'AXM derived path-flow inspection',
    params,
    paramPrefix: 'pathFlowSvg',
  });

  const realization = {
    schema: 'axm.static-svg-realization/v0.1',
    kind: 'flow-guided-paths2d',
    mediaType: rendered.mediaType,
    renderer: rendered.renderer,
    artifactHash: rendered.artifactHash,
    derivedFromPathSetHash: selected.pathSetHash,
    pathSourceHash: next.pathSourceHash,
    scalarSourceHash: next.fieldSourceHash,
    flowSourceHash: next.flowSourceHash,
    displacementSourceHash: next.pathFlowSourceHash,
    pathCount: selected.pathCount,
    pointCount: selected.pointCount,
    width: rendered.width,
    height: rendered.height,
    padding: rendered.padding,
    strokeWidth: rendered.strokeWidth,
    opacity: rendered.opacity,
    baseOpacity: rendered.baseOpacity,
    showBase: rendered.showBase,
    content: rendered.content,
  };

  next.realizations ??= {};
  next.realizations.pathFlowStaticSvg = realization;

  return {
    state: next,
    evidence: {
      renderer: rendered.renderer,
      artifactHash: rendered.artifactHash,
      bytes: rendered.bytes,
      derivedFromPathSetHash: selected.pathSetHash,
      pathSourceHash: next.pathSourceHash,
      scalarSourceHash: next.fieldSourceHash,
      flowSourceHash: next.flowSourceHash,
      displacementSourceHash: next.pathFlowSourceHash,
      pathCount: selected.pathCount,
      pointCount: selected.pointCount,
      maxPoints: rendered.maxPoints,
      width: rendered.width,
      height: rendered.height,
      showBase: rendered.showBase,
      visualInspection: 'NOT_TESTED',
      performanceMeasurement: 'NOT_TESTED',
    },
  };
}, 'Render a bounded deterministic SVG inspection view of a separately retained flow-guided path set without rewriting canonical path topology or claiming aesthetic quality.');

export const PATH_FLOW_STATIC_SVG_HANDS = [
  normalizePathFlowDisplacementHand,
  buildFlowGuidedPathSetHand,
  pathFlowStaticSvgHand,
];

export const PATH_FLOW_STATIC_SVG_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.path.flow-displaced-static-svg',
  version: '0.1.0',
  stages: [
    { id: 'normalize-path-flow-source', hand: 'fx.path.flow-displacement-source-normalize', params: {} },
    { id: 'build-flow-guided-paths', hand: 'fx.path.flow-displacement-build', params: { maxPoints: 4096 } },
    {
      id: 'realize-path-flow-static-svg',
      hand: 'fx.path.flow-static-svg-realize',
      params: {
        width: 640,
        height: 420,
        padding: 20,
        strokeWidth: 2,
        opacity: 0.92,
        baseOpacity: 0.3,
        showBase: true,
        maxPoints: 4096,
      },
    },
  ],
});

export function makePathFlowStaticSvgState(paths, options = {}) {
  return makePathFlowDisplacementState(paths, options);
}
