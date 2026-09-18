import { deepClone, hashValue } from './hand-runtime.mjs';
import {
  PATH_SWEEP_RIBBON_2D_GRAPH,
  PATH_SWEEP_RIBBON_2D_HANDS,
  validatePathSweepRibbonSet,
} from './path-sweep-ribbon2d.mjs';

const MAX_POINTS_HARD = 16384;

const TOPOLOGY_SEMANTICS = Object.freeze({
  algorithm: 'ribbon-adjacent-pair-indexed-strip2d/v0.1',
  primitiveTopology: 'triangle-list',
  vertexOrder: 'left-right-per-path-point',
  trianglePolicy: 'left_i-right_i-left_next;right_i-right_next-left_next',
  pathBridging: 'forbidden',
  joinAuthority: 'none',
  capAuthority: 'none',
  clipping: 'none',
  uvAuthority: 'none',
  materialAuthority: 'none',
  rendererAuthority: 'none',
  frontFaceAuthority: 'none',
  manifoldAuthority: 'none',
  selfIntersectionResolution: 'none',
  geometryValidityClaim: 'connectivity-only',
});

const PROVENANCE = Object.freeze({
  origin: 'AXM Visual Effect Fabric hand-lab',
  internalDonors: [
    'hand-lab/src/path-sweep-ribbon2d.mjs#fx.geometry.path-sweep-ribbon2d',
  ],
  relationship: 'derived-renderer-neutral-indexed-strip-connectivity',
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

function boundedInteger(value, min, max, label) {
  const number = finite(value, label);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(`${label} must be an integer within [${min},${max}]`);
  }
  return number;
}

function selectedRibbonSet(state) {
  const id = state?.pathSweepFrameSource?.id;
  if (!id) throw new Error('path sweep indexed strip requires normalized sweep-frame source state');
  const set = state?.pathSweepRibbonSets?.[id];
  if (!set) throw new Error(`path sweep indexed strip requires derived ribbon set for source: ${id}`);
  return set;
}

function indexedStripSetHashPayload(set) {
  return {
    schema: set.schema,
    sweepSourceHash: set.sweepSourceHash,
    pathSourceHash: set.pathSourceHash,
    frameSetHash: set.frameSetHash,
    ribbonSetHash: set.ribbonSetHash,
    pathCount: set.pathCount,
    pointCount: set.pointCount,
    vertexCount: set.vertexCount,
    triangleCount: set.triangleCount,
    indexCount: set.indexCount,
    semantics: set.semantics,
    paths: set.paths,
    provenance: set.provenance,
    derived: set.derived,
    rebuildable: set.rebuildable,
  };
}

function validateSemantics(set) {
  if (!set.semantics || typeof set.semantics !== 'object') {
    throw new Error('path sweep indexed strip requires fixed topology semantics');
  }
  for (const [key, value] of Object.entries(TOPOLOGY_SEMANTICS)) {
    if (set.semantics[key] !== value) {
      throw new Error(`path sweep indexed strip topology semantic ${key} is invalid`);
    }
  }
  if (!set.provenance || set.provenance.externalSourceReuse !== 'none') {
    throw new Error('path sweep indexed strip provenance must declare externalSourceReuse none');
  }
  if (hashValue(set.provenance) !== hashValue(PROVENANCE)) {
    throw new Error('path sweep indexed strip provenance is invalid');
  }
}

function deriveIndexedStripSet(state, ribbonSet) {
  const paths = ribbonSet.paths.map((path) => {
    const vertices = [];
    for (const point of path.points) {
      vertices.push({
        index: vertices.length,
        pointIndex: point.index,
        side: 'left',
        x: point.left.x,
        y: point.left.y,
      });
      vertices.push({
        index: vertices.length,
        pointIndex: point.index,
        side: 'right',
        x: point.right.x,
        y: point.right.y,
      });
    }

    const triangles = [];
    for (let pointIndex = 0; pointIndex < path.points.length - 1; pointIndex += 1) {
      const left = pointIndex * 2;
      const right = left + 1;
      const nextLeft = left + 2;
      const nextRight = left + 3;
      triangles.push([left, right, nextLeft]);
      triangles.push([right, nextRight, nextLeft]);
    }

    return {
      id: path.id,
      pointCount: path.pointCount,
      vertexCount: vertices.length,
      triangleCount: triangles.length,
      indexCount: triangles.length * 3,
      vertices,
      triangles,
    };
  });

  const vertexCount = paths.reduce((sum, path) => sum + path.vertexCount, 0);
  const triangleCount = paths.reduce((sum, path) => sum + path.triangleCount, 0);
  const set = {
    schema: 'axm.path-sweep-indexed-strip-set/v0.1',
    sweepSourceHash: state.pathSweepFrameSourceHash,
    pathSourceHash: state.pathSourceHash,
    frameSetHash: ribbonSet.frameSetHash,
    ribbonSetHash: ribbonSet.ribbonSetHash,
    pathCount: ribbonSet.pathCount,
    pointCount: ribbonSet.pointCount,
    vertexCount,
    triangleCount,
    indexCount: triangleCount * 3,
    semantics: deepClone(TOPOLOGY_SEMANTICS),
    paths,
    provenance: deepClone(PROVENANCE),
    derived: true,
    rebuildable: true,
  };
  set.indexedStripSetHash = hashValue(indexedStripSetHashPayload(set));
  return set;
}

export function validatePathSweepIndexedStripSet(state, set, params = {}) {
  const maxPoints = boundedInteger(params.maxPoints ?? 4096, 2, MAX_POINTS_HARD, 'pathSweepIndexedStrip.maxPoints');
  const ribbonSet = selectedRibbonSet(state);
  validatePathSweepRibbonSet(state, ribbonSet, { maxPoints });

  if (!set || set.schema !== 'axm.path-sweep-indexed-strip-set/v0.1') {
    throw new Error('path sweep indexed strip validation requires derived indexed strip set');
  }
  if (set.sweepSourceHash !== state.pathSweepFrameSourceHash) {
    throw new Error('path sweep indexed strip sweep-source lineage mismatch');
  }
  if (set.pathSourceHash !== state.pathSourceHash) {
    throw new Error('path sweep indexed strip path-source lineage mismatch');
  }
  if (set.frameSetHash !== ribbonSet.frameSetHash) {
    throw new Error('path sweep indexed strip frame-set lineage mismatch');
  }
  if (set.ribbonSetHash !== ribbonSet.ribbonSetHash) {
    throw new Error('path sweep indexed strip ribbon-set lineage mismatch');
  }
  if (set.pathCount !== ribbonSet.pathCount || set.pointCount !== ribbonSet.pointCount) {
    throw new Error('path sweep indexed strip source cardinality mismatch');
  }

  const expectedVertexCount = ribbonSet.pointCount * 2;
  const expectedTriangleCount = (ribbonSet.pointCount - ribbonSet.pathCount) * 2;
  if (set.vertexCount !== expectedVertexCount) {
    throw new Error('path sweep indexed strip vertex cardinality mismatch');
  }
  if (set.triangleCount !== expectedTriangleCount || set.indexCount !== expectedTriangleCount * 3) {
    throw new Error('path sweep indexed strip index cardinality mismatch');
  }
  if (set.derived !== true || set.rebuildable !== true) {
    throw new Error('path sweep indexed strip set must remain derived and rebuildable');
  }
  validateSemantics(set);
  if (hashValue(indexedStripSetHashPayload(set)) !== set.indexedStripSetHash) {
    throw new Error('path sweep indexed strip set hash mismatch');
  }

  const expected = deriveIndexedStripSet(state, ribbonSet);
  if (
    set.indexedStripSetHash !== expected.indexedStripSetHash
    || hashValue(set.paths) !== hashValue(expected.paths)
  ) {
    throw new Error('path sweep indexed strip set does not rebuild from verified ribbon truth');
  }
  return true;
}

export const buildPathSweepIndexedStripSetHand = hand('fx.geometry.path-sweep-indexed-strip2d-build', (state, params = {}) => {
  const next = deepClone(state);
  const maxPoints = boundedInteger(params.maxPoints ?? 4096, 2, MAX_POINTS_HARD, 'pathSweepIndexedStrip.maxPoints');
  const ribbonSet = selectedRibbonSet(next);
  validatePathSweepRibbonSet(next, ribbonSet, { maxPoints });

  const set = deriveIndexedStripSet(next, ribbonSet);
  next.pathSweepIndexedStripSets ??= {};
  next.pathSweepIndexedStripSets[next.pathSweepFrameSource.id] = set;

  return {
    state: next,
    evidence: {
      pathSourceHash: next.pathSourceHash,
      pathSweepFrameSourceHash: next.pathSweepFrameSourceHash,
      frameSetHash: ribbonSet.frameSetHash,
      ribbonSetHash: ribbonSet.ribbonSetHash,
      indexedStripSetHash: set.indexedStripSetHash,
      pathCount: set.pathCount,
      pointCount: set.pointCount,
      vertexCount: set.vertexCount,
      triangleCount: set.triangleCount,
      indexCount: set.indexCount,
      maxPoints,
      primitiveTopology: set.semantics.primitiveTopology,
      pathBridging: false,
      joinsGenerated: false,
      capsGenerated: false,
      uvGenerated: false,
      materialAssigned: false,
      rendererSelected: false,
      frontFaceClaimed: false,
      manifoldClaimed: false,
      externalSourceReuse: 'none',
      visualInspection: 'NOT_TESTED',
      performanceMeasurement: 'NOT_TESTED',
    },
  };
}, 'Derive bounded renderer-neutral triangle-list connectivity over verified 2D ribbon boundary pairs without inventing joins, caps, UVs, materials, front-face/manifold validity, or a renderer.');

export const PATH_SWEEP_INDEXED_STRIP_2D_HANDS = [
  ...PATH_SWEEP_RIBBON_2D_HANDS,
  buildPathSweepIndexedStripSetHand,
];

export const PATH_SWEEP_INDEXED_STRIP_2D_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.geometry.path-sweep-indexed-strip2d',
  version: '0.1.0',
  stages: [
    ...PATH_SWEEP_RIBBON_2D_GRAPH.stages,
    { id: 'build-path-sweep-indexed-strip-set', hand: 'fx.geometry.path-sweep-indexed-strip2d-build', params: { maxPoints: 4096 } },
  ],
});
