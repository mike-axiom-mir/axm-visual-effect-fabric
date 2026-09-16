import { deepClone, hashValue } from './hand-runtime.mjs';
import {
  normalizeFlowFieldRequestHand,
  sampleFlowFieldSource,
} from './field-flow-operators.mjs';

const round6 = (value) => Number(Number(value).toFixed(6));
const clamp01 = (value) => Math.max(0, Math.min(1, Number(value)));

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

function validatePathSource(paths) {
  if (!Array.isArray(paths) || paths.length === 0) {
    throw new Error('path flow displacement requires a non-empty paths array');
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

function normalizeFlowInput(fieldRequest, flowRequest) {
  if (!fieldRequest || typeof fieldRequest !== 'object') throw new Error('path flow displacement requires fieldRequest state');
  if (!flowRequest || typeof flowRequest !== 'object') throw new Error('path flow displacement requires flowRequest state');
  const normalized = normalizeFlowFieldRequestHand.execute({
    schema: 'axm.effect-work-state/v0.1',
    fieldRequest: deepClone(fieldRequest),
    flowRequest: deepClone(flowRequest),
    vectorFields: {},
  }, {});
  return {
    fieldSource: normalized.state.fieldSource,
    fieldSourceHash: normalized.state.fieldSourceHash,
    flowSource: normalized.state.flowSource,
    flowSourceHash: normalized.state.flowSourceHash,
  };
}

function validateDisplacementLineage(paths, fieldSource, flowSource, displacementSource) {
  if (!displacementSource || displacementSource.schema !== 'axm.path-flow-displacement-source/v0.1') {
    throw new Error('path flow displacement requires normalized displacement source');
  }
  const livePathHash = hashValue(paths);
  const liveFieldHash = hashValue(fieldSource);
  const liveFlowHash = hashValue(flowSource);
  if (livePathHash !== displacementSource.pathSource.sourceHash) throw new Error('path flow source path hash mismatch');
  if (liveFieldHash !== flowSource.scalarSource.sourceHash) throw new Error('path flow scalar source hash mismatch');
  if (liveFieldHash !== displacementSource.flowSource.scalarSourceHash) throw new Error('path flow retained scalar source hash mismatch');
  if (liveFlowHash !== displacementSource.flowSource.sourceHash) throw new Error('path flow vector source hash mismatch');
}

export const normalizePathFlowDisplacementHand = hand('fx.path.flow-displacement-source-normalize', (state) => {
  const next = deepClone(state);
  const request = next.pathFlowRequest;
  if (!request || typeof request !== 'object') throw new Error('path flow displacement requires pathFlowRequest state');
  const id = String(request.id ?? 'flow-guided-paths').trim();
  if (!id) throw new Error('pathFlowRequest.id must be non-empty');

  const sourceStats = validatePathSource(next.paths);
  const flow = normalizeFlowInput(next.fieldRequest, next.flowRequest);
  next.pathSourceHash = hashValue(next.paths);
  next.fieldSource = flow.fieldSource;
  next.fieldSourceHash = flow.fieldSourceHash;
  next.flowSource = flow.flowSource;
  next.flowSourceHash = flow.flowSourceHash;
  next.pathFlowSource = {
    schema: 'axm.path-flow-displacement-source/v0.1',
    id,
    algorithm: 'sample-vector-flow-path-displacement2d',
    pathSource: {
      sourceHash: next.pathSourceHash,
      pathCount: sourceStats.pathCount,
      pointCount: sourceStats.pointCount,
    },
    flowSource: {
      id: flow.flowSource.id,
      sourceHash: flow.flowSourceHash,
      scalarSourceHash: flow.fieldSourceHash,
    },
    amplitude: round6(bounded(request.amplitude ?? 0.08, 0, 0.5, 'pathFlowRequest.amplitude')),
    endpointEnvelope: request.endpointEnvelope ?? true,
  };
  if (typeof next.pathFlowSource.endpointEnvelope !== 'boolean') {
    throw new Error('pathFlowRequest.endpointEnvelope must be boolean');
  }
  next.pathFlowSourceHash = hashValue(next.pathFlowSource);

  return {
    state: next,
    evidence: {
      pathSourceHash: next.pathSourceHash,
      fieldSourceHash: next.fieldSourceHash,
      flowSourceHash: next.flowSourceHash,
      pathFlowSourceHash: next.pathFlowSourceHash,
      pathCount: sourceStats.pathCount,
      pointCount: sourceStats.pointCount,
      amplitude: next.pathFlowSource.amplitude,
      endpointEnvelope: next.pathFlowSource.endpointEnvelope,
    },
  };
}, 'Bind retained 2D path topology to a retained vector-flow source without rewriting the canonical paths or choosing a renderer.');

export const buildFlowGuidedPathSetHand = hand('fx.path.flow-displacement-build', (state, params = {}) => {
  const next = deepClone(state);
  if (!next.pathSourceHash) throw new Error('flow-displacement-build requires normalized path source');
  if (!next.fieldSource || !next.fieldSourceHash) throw new Error('flow-displacement-build requires normalized scalar source');
  if (!next.flowSource || !next.flowSourceHash) throw new Error('flow-displacement-build requires normalized flow source');
  if (!next.pathFlowSource || !next.pathFlowSourceHash) throw new Error('flow-displacement-build requires normalized path flow source');
  if (hashValue(next.paths) !== next.pathSourceHash) throw new Error('path flow retained path state hash mismatch');
  if (hashValue(next.fieldSource) !== next.fieldSourceHash) throw new Error('path flow scalar source state hash mismatch');
  if (hashValue(next.flowSource) !== next.flowSourceHash) throw new Error('path flow vector source state hash mismatch');
  if (hashValue(next.pathFlowSource) !== next.pathFlowSourceHash) throw new Error('path flow displacement source state hash mismatch');

  const sourceStats = validatePathSource(next.paths);
  if (sourceStats.pathCount !== next.pathFlowSource.pathSource.pathCount || sourceStats.pointCount !== next.pathFlowSource.pathSource.pointCount) {
    throw new Error('path flow retained path cardinality mismatch');
  }
  validateDisplacementLineage(next.paths, next.fieldSource, next.flowSource, next.pathFlowSource);

  const maxPoints = boundedInteger(params.maxPoints ?? 4096, 4, 16384, 'pathFlow.maxPoints');
  if (sourceStats.pointCount > maxPoints) {
    throw new Error(`pathFlow point budget exceeded: ${sourceStats.pointCount} > ${maxPoints}`);
  }

  let maxDisplacement = 0;
  let displacedPointCount = 0;
  const paths = next.paths.map((path) => ({
    ...path,
    points: path.points.map((point, pointIndex) => {
      const t = path.points.length <= 1 ? 0 : pointIndex / (path.points.length - 1);
      const envelope = next.pathFlowSource.endpointEnvelope ? Math.sin(Math.PI * t) : 1;
      const vector = sampleFlowFieldSource(next.fieldSource, next.flowSource, point.x, point.y);
      const rawDx = vector.x * next.pathFlowSource.amplitude * envelope;
      const rawDy = vector.y * next.pathFlowSource.amplitude * envelope;
      const x = round6(clamp01(Number(point.x) + rawDx));
      const y = round6(clamp01(Number(point.y) + rawDy));
      const displacement = Math.hypot(x - Number(point.x), y - Number(point.y));
      if (displacement > 0) displacedPointCount += 1;
      maxDisplacement = Math.max(maxDisplacement, displacement);
      return { ...point, x, y };
    }),
  }));

  const pathSet = {
    schema: 'axm.flow-guided-path-set/v0.1',
    displacementSourceHash: next.pathFlowSourceHash,
    pathSourceHash: next.pathSourceHash,
    flowSourceHash: next.flowSourceHash,
    scalarSourceHash: next.fieldSourceHash,
    pathCount: sourceStats.pathCount,
    pointCount: sourceStats.pointCount,
    paths,
    maxDisplacement: round6(maxDisplacement),
    derived: true,
    rebuildable: true,
  };
  pathSet.pathSetHash = hashValue(pathSet);

  next.flowGuidedPathSets ??= {};
  next.flowGuidedPathSets[next.pathFlowSource.id] = pathSet;

  return {
    state: next,
    evidence: {
      pathSourceHash: next.pathSourceHash,
      fieldSourceHash: next.fieldSourceHash,
      flowSourceHash: next.flowSourceHash,
      pathFlowSourceHash: next.pathFlowSourceHash,
      pathSetHash: pathSet.pathSetHash,
      pathCount: pathSet.pathCount,
      pointCount: pathSet.pointCount,
      displacedPointCount,
      maxDisplacement: pathSet.maxDisplacement,
      maxPoints,
    },
  };
}, 'Build a bounded rebuildable path set displaced by continuous vector-flow guidance while retaining canonical path topology beside it.');

export const PATH_FLOW_DISPLACEMENT_HANDS = [
  normalizePathFlowDisplacementHand,
  buildFlowGuidedPathSetHand,
];

export const PATH_FLOW_DISPLACEMENT_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.path.flow-displace2d',
  version: '0.1.0',
  stages: [
    { id: 'normalize-path-flow-source', hand: 'fx.path.flow-displacement-source-normalize', params: {} },
    { id: 'build-flow-guided-paths', hand: 'fx.path.flow-displacement-build', params: { maxPoints: 4096 } },
  ],
});

export function makePathFlowDisplacementState(paths, options = {}) {
  return {
    schema: 'axm.effect-work-state/v0.1',
    paths: deepClone(paths),
    fieldRequest: {
      id: options.field?.id ?? 'path-flow-field',
      seed: options.field?.seed ?? 5011,
      frequency: options.field?.frequency ?? 4.5,
      octaves: options.field?.octaves ?? 5,
      lacunarity: options.field?.lacunarity ?? 2,
      gain: options.field?.gain ?? 0.5,
      offset: deepClone(options.field?.offset ?? [0, 0]),
    },
    flowRequest: {
      id: options.flow?.id ?? 'path-flow',
      mode: options.flow?.mode ?? 'tangent',
      sampleStep: options.flow?.sampleStep ?? 0.015625,
      strength: options.flow?.strength ?? 1,
    },
    pathFlowRequest: {
      id: options.id ?? 'flow-guided-paths',
      amplitude: options.amplitude ?? 0.08,
      endpointEnvelope: options.endpointEnvelope ?? true,
    },
    flowGuidedPathSets: {},
  };
}
