import { deepClone, hashValue } from './hand-runtime.mjs';

const round6 = (value) => Number(Number(value).toFixed(6));
const clamp01 = (value) => Math.max(0, Math.min(1, Number(value)));
const TAU = Math.PI * 2;

const WAVE_SOURCE_SCHEMA = 'axm.path-wave-displacement-source/v0.1';
const WAVE_SET_SCHEMA = 'axm.wave-displaced-path-set/v0.1';
const WAVE_ALGORITHM = 'polyline-arc-local-normal-sine2d';
const ARC_PARAMETERIZATION = 'normalized-polyline-length-with-index-fallback';
const TANGENT_METHOD = 'centered-polyline-tangent-with-axis-fallback';
const CLAMP_MODE = 'unit-domain-clamp';

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
  const phase = finite(value, 'pathWaveRequest.phase');
  return round6(((phase % 1) + 1) % 1);
}

function validatePathSource(paths) {
  if (!Array.isArray(paths) || paths.length === 0) {
    throw new Error('path wave displacement requires a non-empty paths array');
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

function assertWaveSemantics(source) {
  if (!source || source.schema !== WAVE_SOURCE_SCHEMA) {
    throw new Error('path wave displacement requires normalized wave source');
  }
  if (source.algorithm !== WAVE_ALGORITHM) throw new Error('path wave displacement algorithm mismatch');
  if (source.arcParameterization !== ARC_PARAMETERIZATION) throw new Error('path wave arc parameterization mismatch');
  if (source.tangentMethod !== TANGENT_METHOD) throw new Error('path wave tangent method mismatch');
  if (source.clampMode !== CLAMP_MODE) throw new Error('path wave clamp mode mismatch');
  bounded(source.amplitude, 0, 0.5, 'pathWaveSource.amplitude');
  bounded(source.cycles, 0, 64, 'pathWaveSource.cycles');
  bounded(source.phase, 0, 1, 'pathWaveSource.phase');
  if (typeof source.endpointEnvelope !== 'boolean') {
    throw new Error('pathWaveSource.endpointEnvelope must be boolean');
  }
}

function validateWaveLineage(paths, source) {
  assertWaveSemantics(source);
  const stats = validatePathSource(paths);
  const livePathHash = hashValue(paths);
  if (livePathHash !== source.pathSource.sourceHash) throw new Error('path wave source path hash mismatch');
  if (stats.pathCount !== source.pathSource.pathCount || stats.pointCount !== source.pathSource.pointCount) {
    throw new Error('path wave retained path cardinality mismatch');
  }
  return stats;
}

function arcParameters(points) {
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
    return points.map((_, index) => index / (points.length - 1));
  }
  return cumulative.map((distance) => distance / totalLength);
}

function localTangent(points, index) {
  for (let radius = 1; radius < points.length; radius += 1) {
    const left = points[Math.max(0, index - radius)];
    const right = points[Math.min(points.length - 1, index + radius)];
    const dx = Number(right.x) - Number(left.x);
    const dy = Number(right.y) - Number(left.y);
    const length = Math.hypot(dx, dy);
    if (length > 1e-12) return { x: dx / length, y: dy / length };
  }
  return { x: 1, y: 0 };
}

export const normalizePathWaveDisplacementHand = hand('fx.path.wave-displacement-source-normalize', (state) => {
  const next = deepClone(state);
  const request = next.pathWaveRequest;
  if (!request || typeof request !== 'object') throw new Error('path wave displacement requires pathWaveRequest state');
  const id = String(request.id ?? 'wave-displaced-paths').trim();
  if (!id) throw new Error('pathWaveRequest.id must be non-empty');

  const stats = validatePathSource(next.paths);
  next.pathSourceHash = hashValue(next.paths);
  next.pathWaveSource = {
    schema: WAVE_SOURCE_SCHEMA,
    id,
    algorithm: WAVE_ALGORITHM,
    arcParameterization: ARC_PARAMETERIZATION,
    tangentMethod: TANGENT_METHOD,
    clampMode: CLAMP_MODE,
    pathSource: {
      sourceHash: next.pathSourceHash,
      pathCount: stats.pathCount,
      pointCount: stats.pointCount,
    },
    amplitude: round6(bounded(request.amplitude ?? 0.05, 0, 0.5, 'pathWaveRequest.amplitude')),
    cycles: round6(bounded(request.cycles ?? 2, 0, 64, 'pathWaveRequest.cycles')),
    phase: normalizePhase(request.phase ?? 0),
    endpointEnvelope: request.endpointEnvelope ?? true,
  };
  if (typeof next.pathWaveSource.endpointEnvelope !== 'boolean') {
    throw new Error('pathWaveRequest.endpointEnvelope must be boolean');
  }
  assertWaveSemantics(next.pathWaveSource);
  next.pathWaveSourceHash = hashValue(next.pathWaveSource);

  return {
    state: next,
    evidence: {
      pathSourceHash: next.pathSourceHash,
      pathWaveSourceHash: next.pathWaveSourceHash,
      pathCount: stats.pathCount,
      pointCount: stats.pointCount,
      amplitude: next.pathWaveSource.amplitude,
      cycles: next.pathWaveSource.cycles,
      phase: next.pathWaveSource.phase,
      endpointEnvelope: next.pathWaveSource.endpointEnvelope,
    },
  };
}, 'Bind retained 2D path topology to a deterministic local-normal sine-wave treatment without rewriting the canonical paths or choosing a renderer.');

export const buildWaveDisplacedPathSetHand = hand('fx.path.wave-displacement-build', (state, params = {}) => {
  const next = deepClone(state);
  if (!next.pathSourceHash) throw new Error('wave-displacement-build requires normalized path source');
  if (!next.pathWaveSource || !next.pathWaveSourceHash) throw new Error('wave-displacement-build requires normalized path wave source');
  if (hashValue(next.paths) !== next.pathSourceHash) throw new Error('path wave retained path state hash mismatch');
  if (hashValue(next.pathWaveSource) !== next.pathWaveSourceHash) throw new Error('path wave displacement source state hash mismatch');

  const stats = validateWaveLineage(next.paths, next.pathWaveSource);
  const maxPoints = boundedInteger(params.maxPoints ?? 4096, 4, 16384, 'pathWave.maxPoints');
  if (stats.pointCount > maxPoints) {
    throw new Error(`pathWave point budget exceeded: ${stats.pointCount} > ${maxPoints}`);
  }

  let maxDisplacement = 0;
  let displacedPointCount = 0;
  const source = next.pathWaveSource;
  const paths = next.paths.map((path) => {
    const arc = arcParameters(path.points);
    return {
      ...path,
      points: path.points.map((point, pointIndex) => {
        if (source.amplitude === 0 || (source.endpointEnvelope && (pointIndex === 0 || pointIndex === path.points.length - 1))) {
          return deepClone(point);
        }

        const t = arc[pointIndex];
        const tangent = localTangent(path.points, pointIndex);
        const normal = { x: -tangent.y, y: tangent.x };
        const envelope = source.endpointEnvelope ? Math.sin(Math.PI * t) : 1;
        const wave = Math.sin(TAU * ((source.cycles * t) + source.phase));
        const signedOffset = source.amplitude * envelope * wave;
        const x = round6(clamp01(Number(point.x) + (normal.x * signedOffset)));
        const y = round6(clamp01(Number(point.y) + (normal.y * signedOffset)));
        const displacement = Math.hypot(x - Number(point.x), y - Number(point.y));
        if (displacement > 0) displacedPointCount += 1;
        maxDisplacement = Math.max(maxDisplacement, displacement);
        return { ...point, x, y };
      }),
    };
  });

  const pathSet = {
    schema: WAVE_SET_SCHEMA,
    displacementSourceHash: next.pathWaveSourceHash,
    pathSourceHash: next.pathSourceHash,
    pathCount: stats.pathCount,
    pointCount: stats.pointCount,
    paths,
    maxDisplacement: round6(maxDisplacement),
    derived: true,
    rebuildable: true,
  };
  pathSet.pathSetHash = hashValue(pathSet);

  next.waveDisplacedPathSets ??= {};
  next.waveDisplacedPathSets[source.id] = pathSet;

  return {
    state: next,
    evidence: {
      pathSourceHash: next.pathSourceHash,
      pathWaveSourceHash: next.pathWaveSourceHash,
      pathSetHash: pathSet.pathSetHash,
      pathCount: pathSet.pathCount,
      pointCount: pathSet.pointCount,
      displacedPointCount,
      maxDisplacement: pathSet.maxDisplacement,
      maxPoints,
    },
  };
}, 'Build a bounded rebuildable path set with deterministic arc-length wave displacement along each path local normal while retaining canonical path topology beside it.');

export const PATH_WAVE_DISPLACEMENT_HANDS = [
  normalizePathWaveDisplacementHand,
  buildWaveDisplacedPathSetHand,
];

export const PATH_WAVE_DISPLACEMENT_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.path.wave-displace2d',
  version: '0.1.0',
  stages: [
    { id: 'normalize-path-wave-source', hand: 'fx.path.wave-displacement-source-normalize', params: {} },
    { id: 'build-wave-displaced-paths', hand: 'fx.path.wave-displacement-build', params: { maxPoints: 4096 } },
  ],
});

export function makePathWaveDisplacementState(paths, options = {}) {
  return {
    schema: 'axm.effect-work-state/v0.1',
    paths: deepClone(paths),
    pathWaveRequest: {
      id: options.id ?? 'wave-displaced-paths',
      amplitude: options.amplitude ?? 0.05,
      cycles: options.cycles ?? 2,
      phase: options.phase ?? 0,
      endpointEnvelope: options.endpointEnvelope ?? true,
    },
    waveDisplacedPathSets: {},
  };
}
