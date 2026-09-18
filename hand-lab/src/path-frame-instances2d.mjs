import { deepClone, hashValue } from './hand-runtime.mjs';
import {
  PATH_SWEEP_FRAME_2D_GRAPH,
  PATH_SWEEP_FRAME_2D_HANDS,
  validatePathSweepFrameSet,
} from './path-sweep-frame2d.mjs';

const MAX_POINTS_HARD = 16384;
const MAX_STRIDE = 256;

const DERIVATION_SEMANTICS = Object.freeze({
  algorithm: 'verified-path-frame-rigid-instance2d/v0.1',
  selectionPolicy: 'stride-with-final-frame',
  translationPolicy: 'frame-position',
  orientationPolicy: 'tangent-normal-rigid-basis',
  scalePolicy: 'identity-only',
  widthPolicy: 'carry-sweep-half-width-as-neutral-hint',
  prototypeBinding: 'external-required',
  rendererAuthority: 'none',
  meshAuthority: 'none',
  consumerPlacementAuthority: 'none',
});

const PROVENANCE = Object.freeze({
  origin: 'AXM Visual Effect Fabric hand-lab',
  internalDonors: [
    'hand-lab/src/path-sweep-frame2d.mjs#fx.geometry.path-sweep-frame2d',
  ],
  relationship: 'derived-renderer-neutral-instance-transform-realization',
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
  if (!id) throw new Error('path frame instances require normalized sweep-frame source state');
  const set = state?.pathSweepFrameSets?.[id];
  if (!set) throw new Error(`path frame instances require derived frame set for source: ${id}`);
  return set;
}

function selectedIndexes(frameCount, stride) {
  const indexes = [];
  for (let index = 0; index < frameCount; index += stride) indexes.push(index);
  const finalIndex = frameCount - 1;
  if (indexes[indexes.length - 1] !== finalIndex) indexes.push(finalIndex);
  return indexes;
}

function instanceSetHashPayload(set) {
  return {
    schema: set.schema,
    sweepSourceHash: set.sweepSourceHash,
    pathSourceHash: set.pathSourceHash,
    frameSetHash: set.frameSetHash,
    pathCount: set.pathCount,
    sourcePointCount: set.sourcePointCount,
    instanceCount: set.instanceCount,
    selection: set.selection,
    semantics: set.semantics,
    paths: set.paths,
    provenance: set.provenance,
    derived: set.derived,
    rebuildable: set.rebuildable,
  };
}

function validateSemantics(set) {
  if (!set.semantics || typeof set.semantics !== 'object') {
    throw new Error('path frame instances require fixed derivation semantics');
  }
  for (const [key, value] of Object.entries(DERIVATION_SEMANTICS)) {
    if (set.semantics[key] !== value) {
      throw new Error(`path frame instance derivation semantic ${key} is invalid`);
    }
  }
  if (!set.provenance || set.provenance.externalSourceReuse !== 'none') {
    throw new Error('path frame instance provenance must declare externalSourceReuse none');
  }
  if (hashValue(set.provenance) !== hashValue(PROVENANCE)) {
    throw new Error('path frame instance provenance is invalid');
  }
}

function validateSelection(selection) {
  if (!selection || typeof selection !== 'object') {
    throw new Error('path frame instances require derived selection controls');
  }
  const stride = boundedInteger(selection.stride, 1, MAX_STRIDE, 'pathFrameInstances.selection.stride');
  if (selection.includeFinalFrame !== true) {
    throw new Error('path frame instance selection must include the final frame');
  }
  return { stride, includeFinalFrame: true };
}

function deriveInstanceSet(state, frameSet, selection) {
  const paths = frameSet.paths.map((path) => {
    const indexes = selectedIndexes(path.frameCount, selection.stride);
    const instances = indexes.map((frameIndex) => {
      const frame = path.frames[frameIndex];
      return {
        frameIndex,
        translation: { x: frame.x, y: frame.y },
        basisX: { x: frame.tangent.x, y: frame.tangent.y },
        basisY: { x: frame.normal.x, y: frame.normal.y },
        scale: { x: 1, y: 1 },
        sweepHalfWidth: frame.halfWidth,
      };
    });
    return {
      id: path.id,
      sourceFrameCount: path.frameCount,
      instanceCount: instances.length,
      instances,
    };
  });
  const instanceCount = paths.reduce((sum, path) => sum + path.instanceCount, 0);

  const set = {
    schema: 'axm.path-frame-instance-transform-set2d/v0.1',
    sweepSourceHash: state.pathSweepFrameSourceHash,
    pathSourceHash: state.pathSourceHash,
    frameSetHash: frameSet.frameSetHash,
    pathCount: frameSet.pathCount,
    sourcePointCount: frameSet.pointCount,
    instanceCount,
    selection: deepClone(selection),
    semantics: deepClone(DERIVATION_SEMANTICS),
    paths,
    provenance: deepClone(PROVENANCE),
    derived: true,
    rebuildable: true,
  };
  set.instanceSetHash = hashValue(instanceSetHashPayload(set));
  return set;
}

export function validatePathFrameInstanceTransformSet(state, set, params = {}) {
  const maxPoints = boundedInteger(params.maxPoints ?? 4096, 2, MAX_POINTS_HARD, 'pathFrameInstances.maxPoints');
  const maxInstances = boundedInteger(params.maxInstances ?? 4096, 1, MAX_POINTS_HARD, 'pathFrameInstances.maxInstances');
  const frameSet = selectedFrameSet(state);
  validatePathSweepFrameSet(state, frameSet, { maxPoints });

  if (!set || set.schema !== 'axm.path-frame-instance-transform-set2d/v0.1') {
    throw new Error('path frame instance validation requires derived transform set');
  }
  if (set.sweepSourceHash !== state.pathSweepFrameSourceHash) {
    throw new Error('path frame instance sweep-source lineage mismatch');
  }
  if (set.pathSourceHash !== state.pathSourceHash) {
    throw new Error('path frame instance path-source lineage mismatch');
  }
  if (set.frameSetHash !== frameSet.frameSetHash) {
    throw new Error('path frame instance frame-set lineage mismatch');
  }
  if (set.pathCount !== frameSet.pathCount || set.sourcePointCount !== frameSet.pointCount) {
    throw new Error('path frame instance source cardinality mismatch');
  }
  if (set.derived !== true || set.rebuildable !== true) {
    throw new Error('path frame instance transform set must remain derived and rebuildable');
  }
  validateSemantics(set);
  const selection = validateSelection(set.selection);
  if (hashValue(instanceSetHashPayload(set)) !== set.instanceSetHash) {
    throw new Error('path frame instance transform set hash mismatch');
  }

  const expected = deriveInstanceSet(state, frameSet, selection);
  if (expected.instanceCount > maxInstances) {
    throw new Error(`path frame instance budget exceeded: ${expected.instanceCount} > ${maxInstances}`);
  }
  if (set.instanceCount !== expected.instanceCount) {
    throw new Error('path frame instance count does not match derived selection');
  }
  if (set.instanceSetHash !== expected.instanceSetHash || hashValue(set.paths) !== hashValue(expected.paths)) {
    throw new Error('path frame instance transform set does not rebuild from verified frame truth');
  }
  return true;
}

export const buildPathFrameInstanceTransformSetHand = hand('fx.geometry.path-frame-instances2d-build', (state, params = {}) => {
  const next = deepClone(state);
  const maxPoints = boundedInteger(params.maxPoints ?? 4096, 2, MAX_POINTS_HARD, 'pathFrameInstances.maxPoints');
  const maxInstances = boundedInteger(params.maxInstances ?? 4096, 1, MAX_POINTS_HARD, 'pathFrameInstances.maxInstances');
  const selection = {
    stride: boundedInteger(params.stride ?? 1, 1, MAX_STRIDE, 'pathFrameInstances.stride'),
    includeFinalFrame: true,
  };
  const frameSet = selectedFrameSet(next);
  validatePathSweepFrameSet(next, frameSet, { maxPoints });

  const set = deriveInstanceSet(next, frameSet, selection);
  if (set.instanceCount > maxInstances) {
    throw new Error(`path frame instance budget exceeded: ${set.instanceCount} > ${maxInstances}`);
  }

  next.pathFrameInstanceTransformSets ??= {};
  next.pathFrameInstanceTransformSets[next.pathSweepFrameSource.id] = set;

  return {
    state: next,
    evidence: {
      pathSourceHash: next.pathSourceHash,
      pathSweepFrameSourceHash: next.pathSweepFrameSourceHash,
      frameSetHash: frameSet.frameSetHash,
      instanceSetHash: set.instanceSetHash,
      pathCount: set.pathCount,
      sourcePointCount: set.sourcePointCount,
      instanceCount: set.instanceCount,
      stride: selection.stride,
      includeFinalFrame: true,
      maxPoints,
      maxInstances,
      prototypeBound: false,
      scaleAuthority: 'identity-only',
      meshGenerated: false,
      rendererSelected: false,
      consumerPlacementAuthority: false,
      externalSourceReuse: 'none',
      visualInspection: 'NOT_TESTED',
      performanceMeasurement: 'NOT_TESTED',
    },
  };
}, 'Derive bounded renderer-neutral rigid 2D instance transforms from verified path sweep frames while keeping prototype, renderer, mesh, and consumer placement authority external.');

export const PATH_FRAME_INSTANCES_2D_HANDS = [
  ...PATH_SWEEP_FRAME_2D_HANDS,
  buildPathFrameInstanceTransformSetHand,
];

export const PATH_FRAME_INSTANCES_2D_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.geometry.path-frame-instances2d',
  version: '0.1.0',
  stages: [
    ...PATH_SWEEP_FRAME_2D_GRAPH.stages,
    {
      id: 'build-path-frame-instance-transform-set',
      hand: 'fx.geometry.path-frame-instances2d-build',
      params: { maxPoints: 4096, maxInstances: 4096, stride: 1 },
    },
  ],
});
