import { deepClone, hashValue } from './hand-runtime.mjs';
import {
  buildFlowGuidedPathSetHand,
  makePathFlowDisplacementState,
  normalizePathFlowDisplacementHand,
} from './path-flow-displacement.mjs';

const round3 = (value) => Number(Number(value).toFixed(3));

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

function bounded(value, min, max, label) {
  const number = finite(value, label);
  if (number < min || number > max) throw new Error(`${label} must be within [${min},${max}]`);
  return number;
}

function boundedInteger(value, min, max, label) {
  const number = finite(value, label);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(`${label} must be an integer within [${min},${max}]`);
  }
  return number;
}

function escapeAttribute(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function hashPathSetPayload(pathSet) {
  const payload = deepClone(pathSet);
  delete payload.pathSetHash;
  return hashValue(payload);
}

function validateNormalizedPoint(point, label) {
  if (!point || typeof point !== 'object') throw new Error(`${label} must be an object`);
  const x = finite(point.x, `${label}.x`);
  const y = finite(point.y, `${label}.y`);
  if (x < 0 || x > 1 || y < 0 || y > 1) {
    throw new Error(`${label} must remain inside normalized [0,1] bounds`);
  }
}

function validatePathArray(paths, expectedPathCount, expectedPointCount, label) {
  if (!Array.isArray(paths) || paths.length !== expectedPathCount) {
    throw new Error(`${label} path cardinality mismatch`);
  }
  let pointCount = 0;
  for (let pathIndex = 0; pathIndex < paths.length; pathIndex += 1) {
    const path = paths[pathIndex];
    if (!path || typeof path !== 'object' || !Array.isArray(path.points) || path.points.length < 2) {
      throw new Error(`${label} path ${pathIndex} is malformed`);
    }
    pointCount += path.points.length;
    path.points.forEach((point, pointIndex) => validateNormalizedPoint(point, `${label} path ${pathIndex} point ${pointIndex}`));
  }
  if (pointCount !== expectedPointCount) throw new Error(`${label} point cardinality mismatch`);
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
  if (hashPathSetPayload(selected) !== selected.pathSetHash) {
    throw new Error('path-flow SVG selected path set hash mismatch');
  }
  if (selected.pathSourceHash !== next.pathSourceHash) throw new Error('path-flow SVG path lineage mismatch');
  if (selected.scalarSourceHash !== next.fieldSourceHash) throw new Error('path-flow SVG scalar lineage mismatch');
  if (selected.flowSourceHash !== next.flowSourceHash) throw new Error('path-flow SVG vector lineage mismatch');
  if (selected.displacementSourceHash !== next.pathFlowSourceHash) throw new Error('path-flow SVG displacement lineage mismatch');

  validatePathArray(next.paths, selected.pathCount, selected.pointCount, 'path-flow SVG base');
  validatePathArray(selected.paths, selected.pathCount, selected.pointCount, 'path-flow SVG derived');
  for (let index = 0; index < selected.pathCount; index += 1) {
    const base = next.paths[index];
    const derived = selected.paths[index];
    if (String(base.id) !== String(derived.id) || base.points.length !== derived.points.length) {
      throw new Error(`path-flow SVG path identity mismatch at index ${index}`);
    }
  }

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

function project(point, width, height, padding) {
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  return {
    x: round3(padding + Number(point.x) * innerWidth),
    y: round3(padding + Number(point.y) * innerHeight),
  };
}

function svgNumber(value) {
  return Number(value).toFixed(3).replace(/\.000$/, '');
}

function pathPolyline(path, layer, width, height, padding) {
  const points = path.points
    .map((point) => {
      const projected = project(point, width, height, padding);
      return `${svgNumber(projected.x)},${svgNumber(projected.y)}`;
    })
    .join(' ');
  return `<polyline data-layer="${layer}" data-path-id="${escapeAttribute(path.id)}" points="${points}"/>`;
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

  const width = boundedInteger(params.width ?? 640, 64, 4096, 'pathFlowSvg.width');
  const height = boundedInteger(params.height ?? 420, 64, 4096, 'pathFlowSvg.height');
  const padding = bounded(params.padding ?? 20, 0, 512, 'pathFlowSvg.padding');
  if (padding * 2 >= Math.min(width, height)) {
    throw new Error('pathFlowSvg.padding must leave a positive drawable area');
  }
  const strokeWidth = bounded(params.strokeWidth ?? 2, 0.25, 16, 'pathFlowSvg.strokeWidth');
  const opacity = bounded(params.opacity ?? 0.92, 0, 1, 'pathFlowSvg.opacity');
  const baseOpacity = bounded(params.baseOpacity ?? 0.3, 0, 1, 'pathFlowSvg.baseOpacity');
  const showBase = params.showBase ?? true;
  if (typeof showBase !== 'boolean') throw new Error('pathFlowSvg.showBase must be boolean');
  const maxPoints = boundedInteger(params.maxPoints ?? 4096, 4, 16384, 'pathFlowSvg.maxPoints');
  if (selected.pointCount > maxPoints) {
    throw new Error(`pathFlowSvg point budget exceeded: ${selected.pointCount} > ${maxPoints}`);
  }

  const baseMarkup = showBase
    ? next.paths.map((path) => pathPolyline(path, 'base', width, height, padding)).join('')
    : '';
  const derivedMarkup = selected.paths
    .map((path) => pathPolyline(path, 'derived', width, height, padding))
    .join('');

  const content = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" data-renderer="axm.vfx.path-flow-static-svg/v0.1" data-path-set-hash="${escapeAttribute(selected.pathSetHash)}"><title>AXM derived path-flow inspection</title><rect width="100%" height="100%" fill="#071018"/>${showBase ? `<g data-layer="base-paths" fill="none" stroke="#7b8794" stroke-opacity="${svgNumber(baseOpacity)}" stroke-width="${svgNumber(strokeWidth)}" stroke-dasharray="4 4" vector-effect="non-scaling-stroke">${baseMarkup}</g>` : ''}<g data-layer="derived-paths" fill="none" stroke="#75e6ff" stroke-opacity="${svgNumber(opacity)}" stroke-width="${svgNumber(strokeWidth)}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke">${derivedMarkup}</g></svg>`;
  const renderer = 'axm.vfx.path-flow-static-svg/v0.1';
  const mediaType = 'image/svg+xml';
  const artifactHash = hashValue({ mediaType, renderer, content });
  const realization = {
    schema: 'axm.static-svg-realization/v0.1',
    kind: 'flow-guided-paths2d',
    mediaType,
    renderer,
    artifactHash,
    derivedFromPathSetHash: selected.pathSetHash,
    pathSourceHash: next.pathSourceHash,
    scalarSourceHash: next.fieldSourceHash,
    flowSourceHash: next.flowSourceHash,
    displacementSourceHash: next.pathFlowSourceHash,
    pathCount: selected.pathCount,
    pointCount: selected.pointCount,
    width,
    height,
    padding,
    strokeWidth,
    opacity,
    baseOpacity,
    showBase,
    content,
  };

  next.realizations ??= {};
  next.realizations.pathFlowStaticSvg = realization;

  return {
    state: next,
    evidence: {
      renderer,
      artifactHash,
      bytes: Buffer.byteLength(content),
      derivedFromPathSetHash: selected.pathSetHash,
      pathSourceHash: next.pathSourceHash,
      scalarSourceHash: next.fieldSourceHash,
      flowSourceHash: next.flowSourceHash,
      displacementSourceHash: next.pathFlowSourceHash,
      pathCount: selected.pathCount,
      pointCount: selected.pointCount,
      maxPoints,
      width,
      height,
      showBase,
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
