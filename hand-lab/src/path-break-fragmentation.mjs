import { deepClone, hashValue } from './hand-runtime.mjs';

const round6 = (value) => Number(Number(value).toFixed(6));
const BREAK_SOURCE_SCHEMA = 'axm.path-break-source/v0.1';
const BROKEN_SET_SCHEMA = 'axm.broken-path-set/v0.1';
const BREAK_ALGORITHM = 'polyline-arc-even-gap-fragment2d';
const ARC_PARAMETERIZATION = 'normalized-polyline-length-with-index-fallback';
const PLACEMENT_MODE = 'interior-even-spacing-phase-shift';
const GAP_MODE = 'normalized-path-length';

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

function normalizePhase(value) {
  const phase = finite(value, 'pathBreakRequest.phase');
  return round6(((phase % 1) + 1) % 1);
}

function validatePathSource(paths) {
  if (!Array.isArray(paths) || paths.length === 0) {
    throw new Error('path break fragmentation requires a non-empty paths array');
  }

  let pointCount = 0;
  const ids = new Set();
  for (const [pathIndex, path] of paths.entries()) {
    if (!path || typeof path !== 'object') throw new Error(`paths[${pathIndex}] must be an object`);
    const id = String(path.id ?? '').trim();
    if (!id) throw new Error(`paths[${pathIndex}].id must be non-empty`);
    if (ids.has(id)) throw new Error(`duplicate path id: ${id}`);
    ids.add(id);
    if (!Array.isArray(path.points) || path.points.length < 2) {
      throw new Error(`path ${id} requires at least two points`);
    }

    pointCount += path.points.length;
    for (const [pointIndex, point] of path.points.entries()) {
      if (!point || typeof point !== 'object') throw new Error(`path ${id} point ${pointIndex} must be an object`);
      bounded(point.x, 0, 1, `path ${id} point ${pointIndex}.x`);
      bounded(point.y, 0, 1, `path ${id} point ${pointIndex}.y`);
    }
  }

  return { pathCount: paths.length, pointCount };
}

function assertBreakSemantics(source) {
  if (!source || source.schema !== BREAK_SOURCE_SCHEMA) {
    throw new Error('path break fragmentation requires normalized break source');
  }
  if (source.algorithm !== BREAK_ALGORITHM) throw new Error('path break algorithm mismatch');
  if (source.arcParameterization !== ARC_PARAMETERIZATION) throw new Error('path break arc parameterization mismatch');
  if (source.placementMode !== PLACEMENT_MODE) throw new Error('path break placement mode mismatch');
  if (source.gapMode !== GAP_MODE) throw new Error('path break gap mode mismatch');
  boundedInteger(source.breakCount, 0, 64, 'pathBreakSource.breakCount');
  bounded(source.gapWidth, 0, 0.5, 'pathBreakSource.gapWidth');
  bounded(source.phase, 0, 1, 'pathBreakSource.phase');

  if (source.breakCount === 0) {
    if (source.gapWidth !== 0) throw new Error('path break gapWidth must be 0 when breakCount is 0');
    return;
  }
  const spacing = 1 / (source.breakCount + 1);
  const maxGapWidth = 0.9 * spacing;
  if (source.gapWidth > maxGapWidth + 1e-12) {
    throw new Error(`pathBreakSource.gapWidth must be <= ${round6(maxGapWidth)} for breakCount ${source.breakCount}`);
  }
}

function validateBreakLineage(paths, source) {
  assertBreakSemantics(source);
  const stats = validatePathSource(paths);
  const livePathHash = hashValue(paths);
  if (livePathHash !== source.pathSource.sourceHash) throw new Error('path break source path hash mismatch');
  if (stats.pathCount !== source.pathSource.pathCount || stats.pointCount !== source.pathSource.pointCount) {
    throw new Error('path break retained path cardinality mismatch');
  }
  return stats;
}

function arcTable(points) {
  const cumulative = [0];
  let totalLength = 0;
  for (let i = 1; i < points.length; i += 1) {
    totalLength += Math.hypot(
      Number(points[i].x) - Number(points[i - 1].x),
      Number(points[i].y) - Number(points[i - 1].y),
    );
    cumulative.push(totalLength);
  }

  if (totalLength <= 1e-12) {
    return {
      parameters: points.map((_, index) => index / (points.length - 1)),
      totalLength: 0,
    };
  }
  return {
    parameters: cumulative.map((distance) => distance / totalLength),
    totalLength,
  };
}

function pointAt(points, parameters, t) {
  if (t <= 0) return deepClone(points[0]);
  if (t >= 1) return deepClone(points.at(-1));

  for (let i = 1; i < parameters.length; i += 1) {
    const leftT = parameters[i - 1];
    const rightT = parameters[i];
    if (t > rightT + 1e-12) continue;
    const span = rightT - leftT;
    if (span <= 1e-12) continue;
    const local = (t - leftT) / span;
    if (Math.abs(local) <= 1e-12) return deepClone(points[i - 1]);
    if (Math.abs(local - 1) <= 1e-12) return deepClone(points[i]);
    return {
      x: round6(Number(points[i - 1].x) + ((Number(points[i].x) - Number(points[i - 1].x)) * local)),
      y: round6(Number(points[i - 1].y) + ((Number(points[i].y) - Number(points[i - 1].y)) * local)),
    };
  }
  return deepClone(points.at(-1));
}

function gapIntervals(source) {
  if (source.breakCount === 0) return [];
  const spacing = 1 / (source.breakCount + 1);
  const shift = (source.phase - 0.5) * spacing;
  const halfGap = source.gapWidth / 2;
  const intervals = [];
  for (let index = 0; index < source.breakCount; index += 1) {
    const center = ((index + 1) * spacing) + shift;
    intervals.push({
      start: Math.max(0, center - halfGap),
      end: Math.min(1, center + halfGap),
    });
  }
  return intervals;
}

function visibleIntervals(source) {
  const gaps = gapIntervals(source);
  if (gaps.length === 0) return [{ start: 0, end: 1 }];
  const visible = [];
  let cursor = 0;
  for (const gap of gaps) {
    if (gap.start > cursor + 1e-12) visible.push({ start: cursor, end: gap.start });
    cursor = Math.max(cursor, gap.end);
  }
  if (cursor < 1 - 1e-12) visible.push({ start: cursor, end: 1 });
  return visible;
}

function fragmentPoints(path, parameters, interval) {
  const points = [pointAt(path.points, parameters, interval.start)];
  for (let i = 1; i < path.points.length - 1; i += 1) {
    const t = parameters[i];
    if (t > interval.start + 1e-12 && t < interval.end - 1e-12) points.push(deepClone(path.points[i]));
  }
  const endPoint = pointAt(path.points, parameters, interval.end);
  const last = points.at(-1);
  if (!last || last.x !== endPoint.x || last.y !== endPoint.y || hashValue(last) !== hashValue(endPoint)) {
    points.push(endPoint);
  }
  if (points.length === 1) points.push(deepClone(endPoint));
  return points;
}

export const normalizePathBreakFragmentationHand = hand('fx.path.break-fragment-source-normalize', (state) => {
  const next = deepClone(state);
  const request = next.pathBreakRequest;
  if (!request || typeof request !== 'object') throw new Error('path break fragmentation requires pathBreakRequest state');
  const id = String(request.id ?? 'broken-paths').trim();
  if (!id) throw new Error('pathBreakRequest.id must be non-empty');

  const stats = validatePathSource(next.paths);
  const breakCount = boundedInteger(request.breakCount ?? 1, 0, 64, 'pathBreakRequest.breakCount');
  const gapWidth = round6(bounded(request.gapWidth ?? (breakCount === 0 ? 0 : 0.04), 0, 0.5, 'pathBreakRequest.gapWidth'));
  if (breakCount === 0 && gapWidth !== 0) {
    throw new Error('pathBreakRequest.gapWidth must be 0 when breakCount is 0');
  }

  next.pathSourceHash = hashValue(next.paths);
  next.pathBreakSource = {
    schema: BREAK_SOURCE_SCHEMA,
    id,
    algorithm: BREAK_ALGORITHM,
    arcParameterization: ARC_PARAMETERIZATION,
    placementMode: PLACEMENT_MODE,
    gapMode: GAP_MODE,
    pathSource: {
      sourceHash: next.pathSourceHash,
      pathCount: stats.pathCount,
      pointCount: stats.pointCount,
    },
    breakCount,
    gapWidth,
    phase: normalizePhase(request.phase ?? 0.5),
  };
  assertBreakSemantics(next.pathBreakSource);
  next.pathBreakSourceHash = hashValue(next.pathBreakSource);

  return {
    state: next,
    evidence: {
      pathSourceHash: next.pathSourceHash,
      pathBreakSourceHash: next.pathBreakSourceHash,
      pathCount: stats.pathCount,
      pointCount: stats.pointCount,
      breakCount,
      gapWidth,
      phase: next.pathBreakSource.phase,
    },
  };
}, 'Bind retained 2D path topology to deterministic normalized arc-length gaps without rewriting canonical paths or choosing a renderer or consumer meaning.');

export const buildBrokenPathSetHand = hand('fx.path.break-fragment-build', (state, params = {}) => {
  const next = deepClone(state);
  if (!next.pathSourceHash) throw new Error('break-fragment-build requires normalized path source');
  if (!next.pathBreakSource || !next.pathBreakSourceHash) throw new Error('break-fragment-build requires normalized path break source');
  if (hashValue(next.paths) !== next.pathSourceHash) throw new Error('path break retained path state hash mismatch');
  if (hashValue(next.pathBreakSource) !== next.pathBreakSourceHash) throw new Error('path break source state hash mismatch');

  const stats = validateBreakLineage(next.paths, next.pathBreakSource);
  const maxSourcePoints = boundedInteger(params.maxSourcePoints ?? 4096, 4, 16384, 'pathBreak.maxSourcePoints');
  const maxFragments = boundedInteger(params.maxFragments ?? 8192, 1, 32768, 'pathBreak.maxFragments');
  const maxDerivedPoints = boundedInteger(params.maxDerivedPoints ?? 16384, 4, 65536, 'pathBreak.maxDerivedPoints');
  if (stats.pointCount > maxSourcePoints) {
    throw new Error(`pathBreak source point budget exceeded: ${stats.pointCount} > ${maxSourcePoints}`);
  }

  const source = next.pathBreakSource;
  const fragmentUpperBound = stats.pathCount * (source.breakCount + 1);
  const derivedPointUpperBound = stats.pointCount + (2 * source.breakCount * stats.pathCount);
  if (fragmentUpperBound > maxFragments) {
    throw new Error(`pathBreak fragment budget exceeded: ${fragmentUpperBound} > ${maxFragments}`);
  }
  if (derivedPointUpperBound > maxDerivedPoints) {
    throw new Error(`pathBreak derived point budget exceeded: ${derivedPointUpperBound} > ${maxDerivedPoints}`);
  }

  if (source.breakCount === 0) {
    const pathSet = {
      schema: BROKEN_SET_SCHEMA,
      breakSourceHash: next.pathBreakSourceHash,
      pathSourceHash: next.pathSourceHash,
      sourcePathCount: stats.pathCount,
      sourcePointCount: stats.pointCount,
      fragmentCount: stats.pathCount,
      pointCount: stats.pointCount,
      paths: deepClone(next.paths),
      removedNormalizedLengthPerPath: 0,
      derived: true,
      rebuildable: true,
    };
    pathSet.pathSetHash = hashValue(pathSet);
    next.brokenPathSets ??= {};
    next.brokenPathSets[source.id] = pathSet;
    return {
      state: next,
      evidence: {
        pathSourceHash: next.pathSourceHash,
        pathBreakSourceHash: next.pathBreakSourceHash,
        pathSetHash: pathSet.pathSetHash,
        sourcePathCount: stats.pathCount,
        fragmentCount: pathSet.fragmentCount,
        pointCount: pathSet.pointCount,
        removedNormalizedLengthPerPath: 0,
        maxSourcePoints,
        maxFragments,
        maxDerivedPoints,
      },
    };
  }

  const intervals = visibleIntervals(source);
  const paths = [];
  let pointCount = 0;
  for (const path of next.paths) {
    const { parameters } = arcTable(path.points);
    for (let fragmentIndex = 0; fragmentIndex < intervals.length; fragmentIndex += 1) {
      const interval = intervals[fragmentIndex];
      const points = fragmentPoints(path, parameters, interval);
      const { points: _ignoredPoints, id: sourcePathId, ...sourceMetadata } = path;
      paths.push({
        ...deepClone(sourceMetadata),
        id: `${sourcePathId}::fragment:${fragmentIndex}`,
        sourcePathId,
        fragmentIndex,
        normalizedArcRange: {
          start: round6(interval.start),
          end: round6(interval.end),
        },
        points,
      });
      pointCount += points.length;
    }
  }

  if (paths.length > maxFragments) throw new Error(`pathBreak fragment budget exceeded after build: ${paths.length} > ${maxFragments}`);
  if (pointCount > maxDerivedPoints) throw new Error(`pathBreak derived point budget exceeded after build: ${pointCount} > ${maxDerivedPoints}`);

  const pathSet = {
    schema: BROKEN_SET_SCHEMA,
    breakSourceHash: next.pathBreakSourceHash,
    pathSourceHash: next.pathSourceHash,
    sourcePathCount: stats.pathCount,
    sourcePointCount: stats.pointCount,
    fragmentCount: paths.length,
    pointCount,
    paths,
    removedNormalizedLengthPerPath: round6(source.breakCount * source.gapWidth),
    derived: true,
    rebuildable: true,
  };
  pathSet.pathSetHash = hashValue(pathSet);
  next.brokenPathSets ??= {};
  next.brokenPathSets[source.id] = pathSet;

  return {
    state: next,
    evidence: {
      pathSourceHash: next.pathSourceHash,
      pathBreakSourceHash: next.pathBreakSourceHash,
      pathSetHash: pathSet.pathSetHash,
      sourcePathCount: stats.pathCount,
      fragmentCount: pathSet.fragmentCount,
      pointCount: pathSet.pointCount,
      removedNormalizedLengthPerPath: pathSet.removedNormalizedLengthPerPath,
      fragmentUpperBound,
      derivedPointUpperBound,
      maxSourcePoints,
      maxFragments,
      maxDerivedPoints,
    },
  };
}, 'Build bounded rebuildable path fragments by removing deterministic normalized arc-length gaps while retaining canonical path topology beside the derived set.');

export const PATH_BREAK_FRAGMENTATION_HANDS = [
  normalizePathBreakFragmentationHand,
  buildBrokenPathSetHand,
];

export const PATH_BREAK_FRAGMENTATION_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.path.break-fragment2d',
  version: '0.1.0',
  stages: [
    { id: 'normalize-path-break-source', hand: 'fx.path.break-fragment-source-normalize', params: {} },
    {
      id: 'build-broken-paths',
      hand: 'fx.path.break-fragment-build',
      params: { maxSourcePoints: 4096, maxFragments: 8192, maxDerivedPoints: 16384 },
    },
  ],
});

export function makePathBreakFragmentationState(paths, options = {}) {
  const breakCount = options.breakCount ?? 1;
  return {
    schema: 'axm.effect-work-state/v0.1',
    paths: deepClone(paths),
    pathBreakRequest: {
      id: options.id ?? 'broken-paths',
      breakCount,
      gapWidth: options.gapWidth ?? (breakCount === 0 ? 0 : 0.04),
      phase: options.phase ?? 0.5,
    },
    brokenPathSets: {},
  };
}
