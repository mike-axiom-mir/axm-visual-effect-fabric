import { deepClone, hashValue } from './hand-runtime.mjs';
import { makePathSweepFrameState } from './path-sweep-frame2d.mjs';
import {
  PATH_SWEEP_INDEXED_STRIP_2D_GRAPH,
  PATH_SWEEP_INDEXED_STRIP_2D_HANDS,
  validatePathSweepIndexedStripSet,
} from './path-sweep-indexed-strip2d.mjs';
import {
  normalizePropagationFrontSourceHand,
  samplePropagationFrontSource,
} from './propagation-front1d.mjs';

const MAX_POINTS_HARD = 16384;
const MAX_VERTICES_HARD = MAX_POINTS_HARD * 2;
const round6 = (value) => Number(Number(value).toFixed(6));

const FIXED_SEMANTICS = Object.freeze({
  algorithm: 'indexed-strip-path-arclength-propagation-weight/v0.1',
  coordinateMetric: 'polyline-actual-length',
  normalization: 'per-path-total-length',
  sampleSites: 'indexed-strip-vertices-via-source-point',
  pairedSidePolicy: 'same-source-point-same-weight',
  phaseSelection: 'derived-only',
  attributeMeaning: 'neutral-scalar-weight',
  outputRange: '[0,1]',
  crossPathRelationship: 'none',
  geometryMutation: 'none',
  materialAuthority: 'none',
  rendererAuthority: 'none',
  consumerAuthority: 'none',
});

const PROVENANCE = Object.freeze({
  origin: 'AXM Visual Effect Fabric hand-lab',
  internalDonors: [
    'hand-lab/src/path-sweep-indexed-strip2d.mjs#fx.geometry.path-sweep-indexed-strip2d',
    'hand-lab/src/propagation-front1d.mjs#fx.animation.propagation-front1d',
  ],
  relationship: 'derived-neutral-propagation-vertex-attribute',
  externalSourceReuse: 'none',
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

function clampUnit(value, label) {
  return round6(Math.min(1, Math.max(0, finite(value, label))));
}

function selectedIndexedStripSet(state) {
  const id = state?.pathSweepFrameSource?.id;
  if (!id) throw new Error('path sweep propagation weights require normalized sweep-frame source state');
  const set = state?.pathSweepIndexedStripSets?.[id];
  if (!set) throw new Error(`path sweep propagation weights require derived indexed strip set for source: ${id}`);
  return set;
}

function validatePropagationSource(state) {
  if (!state.propagationFrontSource || !state.propagationFrontSourceHash) {
    throw new Error('path sweep propagation weights require retained propagation front source state');
  }
  if (hashValue(state.propagationFrontSource) !== state.propagationFrontSourceHash) {
    throw new Error('path sweep propagation weights propagation source hash mismatch');
  }
  // The donor sampler owns authoritative fixed-semantics and provenance validation.
  samplePropagationFrontSource(state.propagationFrontSource, 0, 0);
}

function weightSetHashPayload(set) {
  return {
    schema: set.schema,
    sweepSourceHash: set.sweepSourceHash,
    pathSourceHash: set.pathSourceHash,
    frameSetHash: set.frameSetHash,
    ribbonSetHash: set.ribbonSetHash,
    indexedStripSetHash: set.indexedStripSetHash,
    propagationSourceHash: set.propagationSourceHash,
    phase: set.phase,
    pathCount: set.pathCount,
    pointCount: set.pointCount,
    vertexCount: set.vertexCount,
    minWeight: set.minWeight,
    maxWeight: set.maxWeight,
    semantics: set.semantics,
    paths: set.paths,
    provenance: set.provenance,
    derived: set.derived,
    rebuildable: set.rebuildable,
  };
}

function validateSemantics(set) {
  if (!set.semantics || typeof set.semantics !== 'object') {
    throw new Error('path sweep propagation weights require fixed derivation semantics');
  }
  for (const [key, value] of Object.entries(FIXED_SEMANTICS)) {
    if (set.semantics[key] !== value) {
      throw new Error(`path sweep propagation weight semantic ${key} is invalid`);
    }
  }
  if (!set.provenance || set.provenance.externalSourceReuse !== 'none') {
    throw new Error('path sweep propagation weight provenance must declare externalSourceReuse none');
  }
  if (hashValue(set.provenance) !== hashValue(PROVENANCE)) {
    throw new Error('path sweep propagation weight provenance is invalid');
  }
}

function pathDistances(path) {
  const distances = [0];
  let total = 0;
  for (let index = 1; index < path.points.length; index += 1) {
    const previous = path.points[index - 1];
    const current = path.points[index];
    total += Math.hypot(Number(current.x) - Number(previous.x), Number(current.y) - Number(previous.y));
    distances.push(total);
  }
  return { distances, total };
}

function deriveWeightSet(state, indexedStripSet, phase) {
  const retainedPathById = new Map(state.paths.map((path) => [path.id, path]));
  let minWeight = Infinity;
  let maxWeight = -Infinity;

  const paths = indexedStripSet.paths.map((stripPath) => {
    const retainedPath = retainedPathById.get(stripPath.id);
    if (!retainedPath) throw new Error(`path sweep propagation retained path missing: ${stripPath.id}`);
    const { distances, total } = pathDistances(retainedPath);
    if (!(total > 0)) throw new Error(`path sweep propagation path ${stripPath.id} has no measurable length`);

    const pointDistances = distances.map((distance, pointIndex) => ({
      pointIndex,
      normalizedDistance: round6(distance / total),
    }));
    const normalizedByPoint = new Map(pointDistances.map((entry) => [entry.pointIndex, entry.normalizedDistance]));

    const vertices = stripPath.vertices.map((vertex) => {
      const normalizedDistance = normalizedByPoint.get(vertex.pointIndex);
      if (normalizedDistance === undefined) {
        throw new Error(`path sweep propagation vertex ${vertex.index} references unknown point ${vertex.pointIndex}`);
      }
      const weight = samplePropagationFrontSource(state.propagationFrontSource, normalizedDistance, phase);
      minWeight = Math.min(minWeight, weight);
      maxWeight = Math.max(maxWeight, weight);
      return {
        vertexIndex: vertex.index,
        pointIndex: vertex.pointIndex,
        side: vertex.side,
        normalizedDistance,
        weight,
      };
    });

    return {
      id: stripPath.id,
      pathLength: round6(total),
      pointCount: stripPath.pointCount,
      vertexCount: stripPath.vertexCount,
      vertices,
    };
  });

  const set = {
    schema: 'axm.path-sweep-propagation-weight-set2d/v0.1',
    sweepSourceHash: state.pathSweepFrameSourceHash,
    pathSourceHash: state.pathSourceHash,
    frameSetHash: indexedStripSet.frameSetHash,
    ribbonSetHash: indexedStripSet.ribbonSetHash,
    indexedStripSetHash: indexedStripSet.indexedStripSetHash,
    propagationSourceHash: state.propagationFrontSourceHash,
    phase,
    pathCount: indexedStripSet.pathCount,
    pointCount: indexedStripSet.pointCount,
    vertexCount: indexedStripSet.vertexCount,
    minWeight: round6(minWeight),
    maxWeight: round6(maxWeight),
    semantics: deepClone(FIXED_SEMANTICS),
    paths,
    provenance: deepClone(PROVENANCE),
    derived: true,
    rebuildable: true,
  };
  set.weightSetHash = hashValue(weightSetHashPayload(set));
  return set;
}

export function validatePathSweepPropagationWeightSet(state, set, params = {}) {
  const maxPoints = boundedInteger(params.maxPoints ?? 4096, 2, MAX_POINTS_HARD, 'pathSweepPropagation.maxPoints');
  const maxVertices = boundedInteger(params.maxVertices ?? 8192, 4, MAX_VERTICES_HARD, 'pathSweepPropagation.maxVertices');
  const indexedStripSet = selectedIndexedStripSet(state);
  validatePathSweepIndexedStripSet(state, indexedStripSet, { maxPoints });
  validatePropagationSource(state);

  if (!set || set.schema !== 'axm.path-sweep-propagation-weight-set2d/v0.1') {
    throw new Error('path sweep propagation validation requires derived weight set');
  }
  if (indexedStripSet.vertexCount > maxVertices) {
    throw new Error(`path sweep propagation vertex budget exceeded: ${indexedStripSet.vertexCount} > ${maxVertices}`);
  }
  if (set.sweepSourceHash !== state.pathSweepFrameSourceHash) throw new Error('path sweep propagation sweep-source lineage mismatch');
  if (set.pathSourceHash !== state.pathSourceHash) throw new Error('path sweep propagation path-source lineage mismatch');
  if (set.frameSetHash !== indexedStripSet.frameSetHash) throw new Error('path sweep propagation frame-set lineage mismatch');
  if (set.ribbonSetHash !== indexedStripSet.ribbonSetHash) throw new Error('path sweep propagation ribbon-set lineage mismatch');
  if (set.indexedStripSetHash !== indexedStripSet.indexedStripSetHash) throw new Error('path sweep propagation indexed-strip lineage mismatch');
  if (set.propagationSourceHash !== state.propagationFrontSourceHash) throw new Error('path sweep propagation propagation-source lineage mismatch');
  if (set.pathCount !== indexedStripSet.pathCount || set.pointCount !== indexedStripSet.pointCount || set.vertexCount !== indexedStripSet.vertexCount) {
    throw new Error('path sweep propagation source cardinality mismatch');
  }
  if (set.derived !== true || set.rebuildable !== true) {
    throw new Error('path sweep propagation weight set must remain derived and rebuildable');
  }
  bounded(set.phase, 0, 1, 'path sweep propagation phase');
  bounded(set.minWeight, 0, 1, 'path sweep propagation minWeight');
  bounded(set.maxWeight, 0, 1, 'path sweep propagation maxWeight');
  validateSemantics(set);
  if (hashValue(weightSetHashPayload(set)) !== set.weightSetHash) {
    throw new Error('path sweep propagation weight set hash mismatch');
  }

  const expected = deriveWeightSet(state, indexedStripSet, set.phase);
  if (set.weightSetHash !== expected.weightSetHash || hashValue(set.paths) !== hashValue(expected.paths)) {
    throw new Error('path sweep propagation weight set does not rebuild from verified strip and propagation truth');
  }
  return true;
}

export const buildPathSweepPropagationWeightSetHand = hand('fx.geometry.path-sweep-propagation-weights2d-build', (state, params = {}) => {
  const next = deepClone(state);
  const maxPoints = boundedInteger(params.maxPoints ?? 4096, 2, MAX_POINTS_HARD, 'pathSweepPropagation.maxPoints');
  const maxVertices = boundedInteger(params.maxVertices ?? 8192, 4, MAX_VERTICES_HARD, 'pathSweepPropagation.maxVertices');
  const phase = clampUnit(params.phase ?? 0.5, 'pathSweepPropagation.phase');
  const indexedStripSet = selectedIndexedStripSet(next);
  validatePathSweepIndexedStripSet(next, indexedStripSet, { maxPoints });
  validatePropagationSource(next);
  if (indexedStripSet.vertexCount > maxVertices) {
    throw new Error(`path sweep propagation vertex budget exceeded: ${indexedStripSet.vertexCount} > ${maxVertices}`);
  }

  const set = deriveWeightSet(next, indexedStripSet, phase);
  next.pathSweepPropagationWeightSets ??= {};
  const key = `${next.pathSweepFrameSource.id}::${next.propagationFrontSource.id}`;
  next.pathSweepPropagationWeightSets[key] = set;

  return {
    state: next,
    evidence: {
      pathSourceHash: next.pathSourceHash,
      pathSweepFrameSourceHash: next.pathSweepFrameSourceHash,
      indexedStripSetHash: indexedStripSet.indexedStripSetHash,
      propagationFrontSourceHash: next.propagationFrontSourceHash,
      weightSetHash: set.weightSetHash,
      phase,
      pathCount: set.pathCount,
      pointCount: set.pointCount,
      vertexCount: set.vertexCount,
      minWeight: set.minWeight,
      maxWeight: set.maxWeight,
      normalization: set.semantics.normalization,
      attributeMeaning: set.semantics.attributeMeaning,
      materialAssigned: false,
      rendererSelected: false,
      consumerMeaningAssigned: false,
      externalSourceReuse: 'none',
      visualInspection: 'NOT_TESTED',
      performanceMeasurement: 'NOT_TESTED',
    },
  };
}, 'Derive a bounded neutral propagation scalar for each verified indexed-strip vertex using per-path normalized arc length while keeping geometry, propagation, materials, renderers, and consumer meaning independently authoritative.');

export const PATH_SWEEP_PROPAGATION_WEIGHTS_2D_HANDS = [
  ...PATH_SWEEP_INDEXED_STRIP_2D_HANDS,
  normalizePropagationFrontSourceHand,
  buildPathSweepPropagationWeightSetHand,
];

export const PATH_SWEEP_PROPAGATION_WEIGHTS_2D_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.geometry.path-sweep-propagation-weights2d',
  version: '0.1.0',
  stages: [
    ...PATH_SWEEP_INDEXED_STRIP_2D_GRAPH.stages,
    { id: 'normalize-propagation-front-source', hand: normalizePropagationFrontSourceHand.id, params: {} },
    {
      id: 'build-path-sweep-propagation-weight-set',
      hand: buildPathSweepPropagationWeightSetHand.id,
      params: { phase: 0.5, maxPoints: 4096, maxVertices: 8192 },
    },
  ],
});

export function makePathSweepPropagationWeightState(paths, options = {}) {
  const state = makePathSweepFrameState(paths, {
    id: options.sweepId ?? 'sweep',
    halfWidth: options.halfWidth ?? 0.01,
    profile: options.profile,
    framePolicy: options.framePolicy,
  });
  state.propagationFrontRequest = {
    id: options.propagationId ?? 'propagation-front',
    direction: options.direction ?? 'forward',
    frontSoftness: options.frontSoftness ?? 0.125,
  };
  return state;
}
