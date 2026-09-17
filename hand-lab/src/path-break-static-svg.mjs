import { deepClone, hashValue } from './hand-runtime.mjs';
import {
  buildBrokenPathSetHand,
  makePathBreakFragmentationState,
  normalizePathBreakFragmentationHand,
} from './path-break-fragmentation.mjs';
import {
  hashDerivedPathSetPayload,
  renderDerivedPathSetStaticSvg,
  validateNormalizedPathArray,
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

function boundedInteger(value, min, max, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || !Number.isInteger(number) || number < min || number > max) {
    throw new Error(`${label} must be an integer within [${min},${max}]`);
  }
  return number;
}

function requireExactLineage(next, selected) {
  if (hashValue(next.paths) !== next.pathSourceHash) throw new Error('path-break SVG base path hash mismatch');
  if (hashValue(next.pathBreakSource) !== next.pathBreakSourceHash) throw new Error('path-break SVG break source hash mismatch');

  if (!selected || selected.schema !== 'axm.broken-path-set/v0.1') {
    throw new Error('path-break SVG requires a derived broken path set');
  }
  if (selected.derived !== true || selected.rebuildable !== true) {
    throw new Error('path-break SVG selected path set must remain derived and rebuildable');
  }
  if (hashDerivedPathSetPayload(selected) !== selected.pathSetHash) {
    throw new Error('path-break SVG selected path set hash mismatch');
  }
  if (selected.pathSourceHash !== next.pathSourceHash) throw new Error('path-break SVG path lineage mismatch');
  if (selected.breakSourceHash !== next.pathBreakSourceHash) throw new Error('path-break SVG break lineage mismatch');

  const sourcePathCount = boundedInteger(selected.sourcePathCount, 1, 16384, 'pathBreakSvg.sourcePathCount');
  const sourcePointCount = boundedInteger(selected.sourcePointCount, 2, 16384, 'pathBreakSvg.sourcePointCount');
  const fragmentCount = boundedInteger(selected.fragmentCount, 1, 32768, 'pathBreakSvg.fragmentCount');
  const pointCount = boundedInteger(selected.pointCount, 2, 65536, 'pathBreakSvg.pointCount');

  validateNormalizedPathArray(next.paths, sourcePathCount, sourcePointCount, 'path-break SVG base');
  validateNormalizedPathArray(selected.paths, fragmentCount, pointCount, 'path-break SVG fragments');

  const sourceIds = new Set(next.paths.map((path) => String(path.id)));
  for (const [fragmentIndex, fragment] of selected.paths.entries()) {
    if (!sourceIds.has(String(fragment.sourcePathId))) {
      throw new Error(`path-break SVG fragment ${fragmentIndex} source path identity mismatch`);
    }
    if (!Number.isInteger(fragment.fragmentIndex) || fragment.fragmentIndex < 0) {
      throw new Error(`path-break SVG fragment ${fragmentIndex} index is malformed`);
    }
  }

  const rebuildState = deepClone(next);
  rebuildState.brokenPathSets = {};
  const expectedResult = buildBrokenPathSetHand.execute(rebuildState, {
    maxSourcePoints: 16384,
    maxFragments: 32768,
    maxDerivedPoints: 65536,
  });
  const expected = expectedResult.state.brokenPathSets?.[next.pathBreakSource.id];
  if (!expected || expected.pathSetHash !== selected.pathSetHash) {
    throw new Error('path-break SVG selected path set does not match retained sources');
  }
}

export const pathBreakStaticSvgHand = hand('fx.path.break-static-svg-realize', (state, params = {}) => {
  const next = deepClone(state);
  if (!next.pathSourceHash || !next.pathBreakSourceHash) {
    throw new Error('path-break-static-svg-realize requires normalized path-break source lineage');
  }
  const selectionId = next.pathBreakSource?.id;
  if (!selectionId) throw new Error('path-break-static-svg-realize requires path break source id');
  const selected = next.brokenPathSets?.[selectionId];
  if (!selected) throw new Error(`path-break-static-svg-realize requires broken path set ${selectionId}`);
  requireExactLineage(next, selected);

  if (params.showBase !== undefined && params.showBase !== false) {
    throw new Error('pathBreakSvg.showBase must remain false because fragmented topology cannot use the shared same-topology base underlay');
  }

  const projectionSet = {
    pathSetHash: selected.pathSetHash,
    pathCount: selected.fragmentCount,
    pointCount: selected.pointCount,
    paths: selected.paths,
  };
  const rendered = renderDerivedPathSetStaticSvg({
    basePaths: selected.paths,
    pathSet: projectionSet,
    renderer: 'axm.vfx.path-break-static-svg/v0.1',
    title: 'AXM broken path fragment inspection',
    params: { ...params, showBase: false },
    paramPrefix: 'pathBreakSvg',
  });

  const realization = {
    schema: 'axm.static-svg-realization/v0.1',
    kind: 'broken-path-fragments2d',
    mediaType: rendered.mediaType,
    renderer: rendered.renderer,
    artifactHash: rendered.artifactHash,
    derivedFromPathSetHash: selected.pathSetHash,
    pathSourceHash: next.pathSourceHash,
    breakSourceHash: next.pathBreakSourceHash,
    sourcePathCount: selected.sourcePathCount,
    sourcePointCount: selected.sourcePointCount,
    fragmentCount: selected.fragmentCount,
    pointCount: selected.pointCount,
    width: rendered.width,
    height: rendered.height,
    padding: rendered.padding,
    strokeWidth: rendered.strokeWidth,
    opacity: rendered.opacity,
    showBase: false,
    content: rendered.content,
  };

  next.realizations ??= {};
  next.realizations.pathBreakStaticSvg = realization;

  return {
    state: next,
    evidence: {
      renderer: rendered.renderer,
      artifactHash: rendered.artifactHash,
      bytes: rendered.bytes,
      derivedFromPathSetHash: selected.pathSetHash,
      pathSourceHash: next.pathSourceHash,
      breakSourceHash: next.pathBreakSourceHash,
      sourcePathCount: selected.sourcePathCount,
      fragmentCount: selected.fragmentCount,
      pointCount: selected.pointCount,
      maxPoints: rendered.maxPoints,
      width: rendered.width,
      height: rendered.height,
      showBase: false,
      visualInspection: 'NOT_TESTED',
      performanceMeasurement: 'NOT_TESTED',
    },
  };
}, 'Render a bounded deterministic SVG inspection view of source-verified broken path fragments through the shared neutral path projection core without promoting fragmented topology into canonical path truth.');

export const PATH_BREAK_STATIC_SVG_HANDS = [
  normalizePathBreakFragmentationHand,
  buildBrokenPathSetHand,
  pathBreakStaticSvgHand,
];

export const PATH_BREAK_STATIC_SVG_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.path.break-fragment-static-svg',
  version: '0.1.0',
  stages: [
    { id: 'normalize-path-break-source', hand: 'fx.path.break-fragment-source-normalize', params: {} },
    {
      id: 'build-broken-paths',
      hand: 'fx.path.break-fragment-build',
      params: { maxSourcePoints: 4096, maxFragments: 8192, maxDerivedPoints: 16384 },
    },
    {
      id: 'realize-path-break-static-svg',
      hand: 'fx.path.break-static-svg-realize',
      params: {
        width: 640,
        height: 420,
        padding: 20,
        strokeWidth: 2,
        opacity: 0.92,
        showBase: false,
        maxPoints: 4096,
      },
    },
  ],
});

export function makePathBreakStaticSvgState(paths, options = {}) {
  return makePathBreakFragmentationState(paths, options);
}
