import { deepClone, hashValue } from './hand-runtime.mjs';

const EPSILON = 1e-9;
const MAX_PATHS = 1024;
const MAX_POINTS_HARD = 16384;
const round6 = (value) => Number(Number(value).toFixed(6));

const FIXED_SEMANTICS = Object.freeze({
  algorithm: 'polyline-bisector-sweep-frame2d/v0.1',
  profile: 'symmetric-ribbon2d',
  framePolicy: 'left-normal-bisector2d',
  reversalFallback: 'outgoing-segment',
  widthMode: 'constant-half-width',
});

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

function normalizeId(value, label) {
  const id = String(value ?? '').trim();
  if (!id || id.length > 96) throw new Error(`${label} must be non-empty and <= 96 characters`);
  return id;
}

function validatePathSource(paths) {
  if (!Array.isArray(paths) || paths.length === 0) {
    throw new Error('path sweep frame requires a non-empty paths array');
  }
  if (paths.length > MAX_PATHS) {
    throw new Error(`path sweep frame path count exceeds hard limit: ${paths.length} > ${MAX_PATHS}`);
  }

  let pointCount = 0;
  const ids = new Set();
  for (const [pathIndex, path] of paths.entries()) {
    if (!path || typeof path !== 'object') throw new Error(`paths[${pathIndex}] must be an object`);
    const id = normalizeId(path.id, `paths[${pathIndex}].id`);
    if (ids.has(id)) throw new Error(`duplicate path id: ${id}`);
    ids.add(id);
    if (!Array.isArray(path.points) || path.points.length < 2) {
      throw new Error(`path ${id} requires at least two points`);
    }

    pointCount += path.points.length;
    if (pointCount > MAX_POINTS_HARD) {
      throw new Error(`path sweep frame point count exceeds hard limit: ${pointCount} > ${MAX_POINTS_HARD}`);
    }

    let previous = null;
    for (const [pointIndex, point] of path.points.entries()) {
      if (!point || typeof point !== 'object') throw new Error(`path ${id} point ${pointIndex} must be an object`);
      const x = bounded(point.x, 0, 1, `path ${id} point ${pointIndex}.x`);
      const y = bounded(point.y, 0, 1, `path ${id} point ${pointIndex}.y`);
      if (previous && Math.hypot(x - previous.x, y - previous.y) <= EPSILON) {
        throw new Error(`path ${id} contains zero-length span at ${pointIndex - 1}->${pointIndex}; sweep frame is undefined`);
      }
      previous = { x, y };
    }
  }

  return { pathCount: paths.length, pointCount };
}

function unit(dx, dy, label) {
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length <= EPSILON) throw new Error(`${label} must have non-zero length`);
  return { x: dx / length, y: dy / length };
}

function frameForPoint(points, index, halfWidth) {
  const point = points[index];
  let tangent;

  if (index === 0) {
    tangent = unit(
      Number(points[1].x) - Number(point.x),
      Number(points[1].y) - Number(point.y),
      'path sweep first segment',
    );
  } else if (index === points.length - 1) {
    tangent = unit(
      Number(point.x) - Number(points[index - 1].x),
      Number(point.y) - Number(points[index - 1].y),
      'path sweep final segment',
    );
  } else {
    const incoming = unit(
      Number(point.x) - Number(points[index - 1].x),
      Number(point.y) - Number(points[index - 1].y),
      'path sweep incoming segment',
    );
    const outgoing = unit(
      Number(points[index + 1].x) - Number(point.x),
      Number(points[index + 1].y) - Number(point.y),
      'path sweep outgoing segment',
    );
    const bisectorX = incoming.x + outgoing.x;
    const bisectorY = incoming.y + outgoing.y;
    tangent = Math.hypot(bisectorX, bisectorY) <= EPSILON
      ? outgoing
      : unit(bisectorX, bisectorY, 'path sweep bisector');
  }

  return {
    index,
    x: round6(point.x),
    y: round6(point.y),
    tangent: { x: round6(tangent.x), y: round6(tangent.y) },
    normal: { x: round6(-tangent.y), y: round6(tangent.x) },
    halfWidth,
  };
}

function validateNormalizedSource(source) {
  if (!source || source.schema !== 'axm.path-sweep-frame-source/v0.1') {
    throw new Error('path sweep frame requires normalized source');
  }
  normalizeId(source.id, 'path sweep frame source id');
  if (source.algorithm !== FIXED_SEMANTICS.algorithm) throw new Error('path sweep frame source algorithm is invalid');
  if (source.profile !== FIXED_SEMANTICS.profile) throw new Error('path sweep frame source profile is invalid');
  if (source.framePolicy !== FIXED_SEMANTICS.framePolicy) throw new Error('path sweep frame source frame policy is invalid');
  if (source.reversalFallback !== FIXED_SEMANTICS.reversalFallback) throw new Error('path sweep frame source reversal fallback is invalid');
  if (source.widthMode !== FIXED_SEMANTICS.widthMode) throw new Error('path sweep frame source width mode is invalid');
  bounded(source.halfWidth, 0, 0.25, 'path sweep frame source halfWidth');

  if (!source.pathSource || typeof source.pathSource !== 'object') {
    throw new Error('path sweep frame source requires pathSource lineage');
  }
  if (typeof source.pathSource.sourceHash !== 'string' || source.pathSource.sourceHash.length !== 64) {
    throw new Error('path sweep frame source path hash is invalid');
  }
  boundedInteger(source.pathSource.pathCount, 1, MAX_PATHS, 'path sweep frame source pathCount');
  boundedInteger(source.pathSource.pointCount, 2, MAX_POINTS_HARD, 'path sweep frame source pointCount');

  if (!source.provenance || source.provenance.sourceReuse !== 'none') {
    throw new Error('path sweep frame source provenance must declare sourceReuse none');
  }
  if (source.provenance.rendererAuthority !== 'none' || source.provenance.meshAuthority !== 'none') {
    throw new Error('path sweep frame source provenance must not claim renderer or mesh authority');
  }
}

function validateSourceState(state) {
  if (!state.pathSweepFrameSource || !state.pathSweepFrameSourceHash || !state.pathSourceHash) {
    throw new Error('path sweep frame requires normalized source state');
  }
  if (hashValue(state.paths) !== state.pathSourceHash) {
    throw new Error('path sweep frame retained path state hash mismatch');
  }
  if (hashValue(state.pathSweepFrameSource) !== state.pathSweepFrameSourceHash) {
    throw new Error('path sweep frame source state hash mismatch');
  }
  validateNormalizedSource(state.pathSweepFrameSource);
  if (state.pathSweepFrameSource.pathSource.sourceHash !== state.pathSourceHash) {
    throw new Error('path sweep frame source path lineage mismatch');
  }

  const stats = validatePathSource(state.paths);
  if (
    stats.pathCount !== state.pathSweepFrameSource.pathSource.pathCount
    || stats.pointCount !== state.pathSweepFrameSource.pathSource.pointCount
  ) {
    throw new Error('path sweep frame retained path cardinality mismatch');
  }
  return stats;
}

function frameSetHashPayload(set) {
  return {
    schema: set.schema,
    sourceHash: set.sourceHash,
    pathSourceHash: set.pathSourceHash,
    pathCount: set.pathCount,
    pointCount: set.pointCount,
    paths: set.paths,
    derived: set.derived,
    rebuildable: set.rebuildable,
  };
}

function deriveFrameSet(paths, source, sourceHash) {
  const sweepPaths = paths.map((path) => ({
    id: path.id,
    frameCount: path.points.length,
    frames: path.points.map((_, index) => frameForPoint(path.points, index, source.halfWidth)),
  }));
  const pointCount = sweepPaths.reduce((sum, path) => sum + path.frameCount, 0);
  const set = {
    schema: 'axm.path-sweep-frame-set/v0.1',
    sourceHash,
    pathSourceHash: source.pathSource.sourceHash,
    pathCount: sweepPaths.length,
    pointCount,
    paths: sweepPaths,
    derived: true,
    rebuildable: true,
  };
  set.frameSetHash = hashValue(frameSetHashPayload(set));
  return set;
}

export function validatePathSweepFrameSet(state, set, params = {}) {
  const stats = validateSourceState(state);
  const maxPoints = boundedInteger(params.maxPoints ?? 4096, 2, MAX_POINTS_HARD, 'pathSweepFrame.maxPoints');
  if (stats.pointCount > maxPoints) {
    throw new Error(`path sweep frame point budget exceeded: ${stats.pointCount} > ${maxPoints}`);
  }

  if (!set || set.schema !== 'axm.path-sweep-frame-set/v0.1') {
    throw new Error('path sweep frame validation requires derived frame set');
  }
  if (set.sourceHash !== state.pathSweepFrameSourceHash) {
    throw new Error('path sweep frame derived source lineage mismatch');
  }
  if (set.pathSourceHash !== state.pathSourceHash) {
    throw new Error('path sweep frame derived path lineage mismatch');
  }
  if (set.derived !== true || set.rebuildable !== true) {
    throw new Error('path sweep frame set must remain derived and rebuildable');
  }
  if (hashValue(frameSetHashPayload(set)) !== set.frameSetHash) {
    throw new Error('path sweep frame set hash mismatch');
  }

  const expected = deriveFrameSet(state.paths, state.pathSweepFrameSource, state.pathSweepFrameSourceHash);
  if (set.frameSetHash !== expected.frameSetHash || hashValue(set.paths) !== hashValue(expected.paths)) {
    throw new Error('path sweep frame set does not rebuild from retained truth');
  }
  return true;
}

export const normalizePathSweepFrameSourceHand = hand('fx.geometry.path-sweep-frame2d-source-normalize', (state) => {
  const next = deepClone(state);
  const request = next.pathSweepFrameRequest;
  if (!request || typeof request !== 'object') throw new Error('path sweep frame requires pathSweepFrameRequest state');
  const stats = validatePathSource(next.paths);
  const id = normalizeId(request.id ?? 'path-sweep-frame', 'pathSweepFrameRequest.id');

  if (request.profile !== undefined && request.profile !== FIXED_SEMANTICS.profile) {
    throw new Error(`pathSweepFrameRequest.profile must be ${FIXED_SEMANTICS.profile}`);
  }
  if (request.framePolicy !== undefined && request.framePolicy !== FIXED_SEMANTICS.framePolicy) {
    throw new Error(`pathSweepFrameRequest.framePolicy must be ${FIXED_SEMANTICS.framePolicy}`);
  }

  next.pathSourceHash = hashValue(next.paths);
  next.pathSweepFrameSource = {
    schema: 'axm.path-sweep-frame-source/v0.1',
    id,
    ...FIXED_SEMANTICS,
    halfWidth: round6(bounded(request.halfWidth ?? 0.01, 0, 0.25, 'pathSweepFrameRequest.halfWidth')),
    pathSource: {
      sourceHash: next.pathSourceHash,
      pathCount: stats.pathCount,
      pointCount: stats.pointCount,
    },
    provenance: {
      origin: 'AXM Visual Effect Fabric hand-lab',
      adjacentDonors: [
        'hand-lab/src/path-flow-displacement.mjs#fx.path.flow-displace2d',
        'hand-lab/src/path-wave-displacement.mjs#fx.path.wave-displace2d',
        'hand-lab/src/path-break-fragmentation.mjs#fx.path.break-fragment2d',
      ],
      relationship: 'renderer-neutral-derived-geometry-frame-contract',
      sourceReuse: 'none',
      rendererAuthority: 'none',
      meshAuthority: 'none',
    },
  };
  validateNormalizedSource(next.pathSweepFrameSource);
  next.pathSweepFrameSourceHash = hashValue(next.pathSweepFrameSource);

  return {
    state: next,
    evidence: {
      pathSourceHash: next.pathSourceHash,
      pathSweepFrameSourceHash: next.pathSweepFrameSourceHash,
      pathCount: stats.pathCount,
      pointCount: stats.pointCount,
      halfWidth: next.pathSweepFrameSource.halfWidth,
      profile: next.pathSweepFrameSource.profile,
      framePolicy: next.pathSweepFrameSource.framePolicy,
      sourceReuse: 'none',
      visualInspection: 'NOT_TESTED',
      performanceMeasurement: 'NOT_TESTED',
    },
  };
}, 'Normalize a bounded renderer-neutral 2D sweep-frame contract over retained paths without creating mesh, material, or consumer authority.');

export const buildPathSweepFrameSetHand = hand('fx.geometry.path-sweep-frame2d-build', (state, params = {}) => {
  const next = deepClone(state);
  const stats = validateSourceState(next);
  const maxPoints = boundedInteger(params.maxPoints ?? 4096, 2, MAX_POINTS_HARD, 'pathSweepFrame.maxPoints');
  if (stats.pointCount > maxPoints) {
    throw new Error(`path sweep frame point budget exceeded: ${stats.pointCount} > ${maxPoints}`);
  }

  const set = deriveFrameSet(next.paths, next.pathSweepFrameSource, next.pathSweepFrameSourceHash);
  next.pathSweepFrameSets ??= {};
  next.pathSweepFrameSets[next.pathSweepFrameSource.id] = set;

  return {
    state: next,
    evidence: {
      pathSourceHash: next.pathSourceHash,
      pathSweepFrameSourceHash: next.pathSweepFrameSourceHash,
      frameSetHash: set.frameSetHash,
      pathCount: set.pathCount,
      pointCount: set.pointCount,
      maxPoints,
      meshGenerated: false,
      rendererSelected: false,
      visualInspection: 'NOT_TESTED',
      performanceMeasurement: 'NOT_TESTED',
    },
  };
}, 'Build bounded rebuildable per-point tangent/normal sweep frames from retained 2D path truth without selecting a renderer or generating a mesh.');

export const PATH_SWEEP_FRAME_2D_HANDS = [
  normalizePathSweepFrameSourceHand,
  buildPathSweepFrameSetHand,
];

export const PATH_SWEEP_FRAME_2D_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.geometry.path-sweep-frame2d',
  version: '0.1.0',
  stages: [
    { id: 'normalize-path-sweep-frame-source', hand: 'fx.geometry.path-sweep-frame2d-source-normalize', params: {} },
    { id: 'build-path-sweep-frame-set', hand: 'fx.geometry.path-sweep-frame2d-build', params: { maxPoints: 4096 } },
  ],
});

export function makePathSweepFrameState(paths, options = {}) {
  return {
    schema: 'axm.effect-work-state/v0.1',
    paths: deepClone(paths),
    pathSweepFrameRequest: {
      id: options.id ?? 'path-sweep-frame',
      halfWidth: options.halfWidth ?? 0.01,
      profile: options.profile ?? FIXED_SEMANTICS.profile,
      framePolicy: options.framePolicy ?? FIXED_SEMANTICS.framePolicy,
    },
    pathSweepFrameSets: {},
  };
}
