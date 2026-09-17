import { deepClone, hashValue } from './hand-runtime.mjs';
import {
  buildWaveDisplacedPathSetHand,
  makePathWaveDisplacementState,
  normalizePathWaveDisplacementHand,
} from './path-wave-displacement.mjs';
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
  if (hashValue(next.paths) !== next.pathSourceHash) throw new Error('path-wave SVG base path hash mismatch');
  if (hashValue(next.pathWaveSource) !== next.pathWaveSourceHash) throw new Error('path-wave SVG displacement source hash mismatch');

  if (!selected || selected.schema !== 'axm.wave-displaced-path-set/v0.1') {
    throw new Error('path-wave SVG requires a derived wave-displaced path set');
  }
  if (selected.derived !== true || selected.rebuildable !== true) {
    throw new Error('path-wave SVG selected path set must remain derived and rebuildable');
  }
  if (hashDerivedPathSetPayload(selected) !== selected.pathSetHash) {
    throw new Error('path-wave SVG selected path set hash mismatch');
  }
  if (selected.pathSourceHash !== next.pathSourceHash) throw new Error('path-wave SVG path lineage mismatch');
  if (selected.displacementSourceHash !== next.pathWaveSourceHash) throw new Error('path-wave SVG displacement lineage mismatch');

  validateNormalizedPathArray(next.paths, selected.pathCount, selected.pointCount, 'path-wave SVG base');
  validateNormalizedPathArray(selected.paths, selected.pathCount, selected.pointCount, 'path-wave SVG derived');
  validatePathIdentity(next.paths, selected.paths, 'path-wave SVG');

  const rebuildState = deepClone(next);
  rebuildState.waveDisplacedPathSets = {};
  const expectedResult = buildWaveDisplacedPathSetHand.execute(
    rebuildState,
    { maxPoints: Math.max(4, selected.pointCount) },
  );
  const expected = expectedResult.state.waveDisplacedPathSets?.[next.pathWaveSource.id];
  if (!expected || expected.pathSetHash !== selected.pathSetHash) {
    throw new Error('path-wave SVG selected path set does not match retained sources');
  }
}

export const pathWaveStaticSvgHand = hand('fx.path.wave-static-svg-realize', (state, params = {}) => {
  const next = deepClone(state);
  if (!next.pathSourceHash || !next.pathWaveSourceHash) {
    throw new Error('path-wave-static-svg-realize requires normalized path-wave source lineage');
  }
  const selectionId = next.pathWaveSource?.id;
  if (!selectionId) throw new Error('path-wave-static-svg-realize requires path wave source id');
  const selected = next.waveDisplacedPathSets?.[selectionId];
  if (!selected) throw new Error(`path-wave-static-svg-realize requires wave-displaced path set ${selectionId}`);
  requireExactLineage(next, selected);

  const rendered = renderDerivedPathSetStaticSvg({
    basePaths: next.paths,
    pathSet: selected,
    renderer: 'axm.vfx.path-wave-static-svg/v0.1',
    title: 'AXM derived path-wave inspection',
    params,
    paramPrefix: 'pathWaveSvg',
  });

  const realization = {
    schema: 'axm.static-svg-realization/v0.1',
    kind: 'wave-displaced-paths2d',
    mediaType: rendered.mediaType,
    renderer: rendered.renderer,
    artifactHash: rendered.artifactHash,
    derivedFromPathSetHash: selected.pathSetHash,
    pathSourceHash: next.pathSourceHash,
    displacementSourceHash: next.pathWaveSourceHash,
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
  next.realizations.pathWaveStaticSvg = realization;

  return {
    state: next,
    evidence: {
      renderer: rendered.renderer,
      artifactHash: rendered.artifactHash,
      bytes: rendered.bytes,
      derivedFromPathSetHash: selected.pathSetHash,
      pathSourceHash: next.pathSourceHash,
      displacementSourceHash: next.pathWaveSourceHash,
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
}, 'Render a bounded deterministic SVG inspection view of a separately retained wave-displaced path set without rewriting canonical path topology or claiming aesthetic quality.');

export const PATH_WAVE_STATIC_SVG_HANDS = [
  normalizePathWaveDisplacementHand,
  buildWaveDisplacedPathSetHand,
  pathWaveStaticSvgHand,
];

export const PATH_WAVE_STATIC_SVG_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.path.wave-displaced-static-svg',
  version: '0.1.0',
  stages: [
    { id: 'normalize-path-wave-source', hand: 'fx.path.wave-displacement-source-normalize', params: {} },
    { id: 'build-wave-displaced-paths', hand: 'fx.path.wave-displacement-build', params: { maxPoints: 4096 } },
    {
      id: 'realize-path-wave-static-svg',
      hand: 'fx.path.wave-static-svg-realize',
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

export function makePathWaveStaticSvgState(paths, options = {}) {
  return makePathWaveDisplacementState(paths, options);
}
