import { deepClone, hashValue } from './hand-runtime.mjs';
import {
  PATH_SWEEP_FRAME_2D_GRAPH,
  PATH_SWEEP_FRAME_2D_HANDS,
  validatePathSweepFrameSet,
} from './path-sweep-frame2d.mjs';

const MAX_POINTS_HARD = 16384;
const round6 = (value) => {
  const rounded = Number(Number(value).toFixed(6));
  return Object.is(rounded, -0) ? 0 : rounded;
};

const DERIVATION_SEMANTICS = Object.freeze({
  algorithm: 'frame-normal-ribbon-boundary2d/v0.1',
  profile: 'symmetric-ribbon2d',
  boundaryPolicy: 'center-plus-minus-normal-half-width',
  clipping: 'none',
  joinAuthority: 'none',
  capAuthority: 'none',
  triangulation: 'none',
  rendererAuthority: 'none',
  meshAuthority: 'none',
});

const PROVENANCE = Object.freeze({
  origin: 'AXM Visual Effect Fabric hand-lab',
  internalDonors: [
    'hand-lab/src/path-sweep-frame2d.mjs#fx.geometry.path-sweep-frame2d',
  ],
  relationship: 'derived-renderer-neutral-ribbon-boundary-realization',
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

function selectedFrameSet(state) {
  const id = state?.pathSweepFrameSource?.id;
  if (!id) throw new Error('path sweep ribbon requires normalized sweep-frame source state');
  const set = state?.pathSweepFrameSets?.[id];
  if (!set) throw new Error(`path sweep ribbon requires derived frame set for source: ${id}`);
  return set;
}

function ribbonSetHashPayload(set) {
  return {
    schema: set.schema,
    sweepSourceHash: set.sweepSourceHash,
    pathSourceHash: set.pathSourceHash,
    frameSetHash: set.frameSetHash,
    pathCount: set.pathCount,
    pointCount: set.pointCount,
    semantics: set.semantics,
    paths: set.paths,
    provenance: set.provenance,
    derived: set.derived,
    rebuildable: set.rebuildable,
  };
}

function validateSemantics(set) {
  if (!set.semantics || typeof set.semantics !== 'object') {
    throw new Error('path sweep ribbon requires fixed derivation semantics');
  }
  for (const [key, value] of Object.entries(DERIVATION_SEMANTICS)) {
    if (set.semantics[key] !== value) {
      throw new Error(`path sweep ribbon derivation semantic ${key} is invalid`);
    }
  }
  if (!set.provenance || set.provenance.externalSourceReuse !== 'none') {
    throw new Error('path sweep ribbon provenance must declare externalSourceReuse none');
  }
  if (hashValue(set.provenance) !== hashValue(PROVENANCE)) {
    throw new Error('path sweep ribbon provenance is invalid');
  }
}

function deriveRibbonSet(state, frameSet) {
  const paths = frameSet.paths.map((path) => ({
    id: path.id,
    pointCount: path.frameCount,
    points: path.frames.map((frame) => ({
      index: frame.index,
      center: { x: round6(frame.x), y: round6(frame.y) },
      left: {
        x: round6(frame.x + (frame.normal.x * frame.halfWidth)),
        y: round6(frame.y + (frame.normal.y * frame.halfWidth)),
      },
      right: {
        x: round6(frame.x - (frame.normal.x * frame.halfWidth)),
        y: round6(frame.y - (frame.normal.y * frame.halfWidth)),
      },
    })),
  }));

  const set = {
    schema: 'axm.path-sweep-ribbon-set/v0.1',
    sweepSourceHash: state.pathSweepFrameSourceHash,
    pathSourceHash: state.pathSourceHash,
    frameSetHash: frameSet.frameSetHash,
    pathCount: frameSet.pathCount,
    pointCount: frameSet.pointCount,
    semantics: deepClone(DERIVATION_SEMANTICS),
    paths,
    provenance: deepClone(PROVENANCE),
    derived: true,
    rebuildable: true,
  };
  set.ribbonSetHash = hashValue(ribbonSetHashPayload(set));
  return set;
}

export function validatePathSweepRibbonSet(state, set, params = {}) {
  const maxPoints = boundedInteger(params.maxPoints ?? 4096, 2, MAX_POINTS_HARD, 'pathSweepRibbon.maxPoints');
  const frameSet = selectedFrameSet(state);
  validatePathSweepFrameSet(state, frameSet, { maxPoints });

  if (!set || set.schema !== 'axm.path-sweep-ribbon-set/v0.1') {
    throw new Error('path sweep ribbon validation requires derived ribbon set');
  }
  if (set.sweepSourceHash !== state.pathSweepFrameSourceHash) {
    throw new Error('path sweep ribbon sweep-source lineage mismatch');
  }
  if (set.pathSourceHash !== state.pathSourceHash) {
    throw new Error('path sweep ribbon path-source lineage mismatch');
  }
  if (set.frameSetHash !== frameSet.frameSetHash) {
    throw new Error('path sweep ribbon frame-set lineage mismatch');
  }
  if (set.pathCount !== frameSet.pathCount || set.pointCount !== frameSet.pointCount) {
    throw new Error('path sweep ribbon cardinality mismatch');
  }
  if (set.derived !== true || set.rebuildable !== true) {
    throw new Error('path sweep ribbon set must remain derived and rebuildable');
  }
  validateSemantics(set);
  if (hashValue(ribbonSetHashPayload(set)) !== set.ribbonSetHash) {
    throw new Error('path sweep ribbon set hash mismatch');
  }

  const expected = deriveRibbonSet(state, frameSet);
  if (set.ribbonSetHash !== expected.ribbonSetHash || hashValue(set.paths) !== hashValue(expected.paths)) {
    throw new Error('path sweep ribbon set does not rebuild from verified frame truth');
  }
  return true;
}

export const buildPathSweepRibbonSetHand = hand('fx.geometry.path-sweep-ribbon2d-build', (state, params = {}) => {
  const next = deepClone(state);
  const maxPoints = boundedInteger(params.maxPoints ?? 4096, 2, MAX_POINTS_HARD, 'pathSweepRibbon.maxPoints');
  const frameSet = selectedFrameSet(next);
  validatePathSweepFrameSet(next, frameSet, { maxPoints });

  const set = deriveRibbonSet(next, frameSet);
  next.pathSweepRibbonSets ??= {};
  next.pathSweepRibbonSets[next.pathSweepFrameSource.id] = set;

  return {
    state: next,
    evidence: {
      pathSourceHash: next.pathSourceHash,
      pathSweepFrameSourceHash: next.pathSweepFrameSourceHash,
      frameSetHash: frameSet.frameSetHash,
      ribbonSetHash: set.ribbonSetHash,
      pathCount: set.pathCount,
      pointCount: set.pointCount,
      maxPoints,
      boundaryPolicy: set.semantics.boundaryPolicy,
      clippingApplied: false,
      joinsGenerated: false,
      capsGenerated: false,
      triangulationGenerated: false,
      meshGenerated: false,
      rendererSelected: false,
      externalSourceReuse: 'none',
      visualInspection: 'NOT_TESTED',
      performanceMeasurement: 'NOT_TESTED',
    },
  };
}, 'Derive bounded renderer-neutral left/right ribbon boundary samples from a verified 2D path sweep frame set without joining, clipping, triangulating, meshing, or selecting a renderer.');

export const PATH_SWEEP_RIBBON_2D_HANDS = [
  ...PATH_SWEEP_FRAME_2D_HANDS,
  buildPathSweepRibbonSetHand,
];

export const PATH_SWEEP_RIBBON_2D_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.geometry.path-sweep-ribbon2d',
  version: '0.1.0',
  stages: [
    ...PATH_SWEEP_FRAME_2D_GRAPH.stages,
    { id: 'build-path-sweep-ribbon-set', hand: 'fx.geometry.path-sweep-ribbon2d-build', params: { maxPoints: 4096 } },
  ],
});
