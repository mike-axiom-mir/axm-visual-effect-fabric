import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph, hashValue } from '../src/hand-runtime.mjs';
import { makePathSweepFrameState } from '../src/path-sweep-frame2d.mjs';
import {
  PATH_FRAME_INSTANCES_2D_GRAPH,
  PATH_FRAME_INSTANCES_2D_HANDS,
  buildPathFrameInstanceTransformSetHand,
  validatePathFrameInstanceTransformSet,
} from '../src/path-frame-instances2d.mjs';

const registry = createHandRegistry(PATH_FRAME_INSTANCES_2D_HANDS);

function run(state, callerKind = 'test', graph = PATH_FRAME_INSTANCES_2D_GRAPH) {
  return executeHandGraph({ registry, graph, initialState: state, context: { callerKind } });
}

function instanceSet(result, id = 'sweep') {
  return result.finalState.pathFrameInstanceTransformSets[id];
}

function frameSet(result, id = 'sweep') {
  return result.finalState.pathSweepFrameSets[id];
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

function graphWithInstanceParams({ stride = 1, maxInstances = 4096, maxPoints = 4096 } = {}) {
  return {
    ...PATH_FRAME_INSTANCES_2D_GRAPH,
    stages: [
      PATH_FRAME_INSTANCES_2D_GRAPH.stages[0],
      PATH_FRAME_INSTANCES_2D_GRAPH.stages[1],
      {
        id: 'build-path-frame-instance-transform-set',
        hand: 'fx.geometry.path-frame-instances2d-build',
        params: { stride, maxInstances, maxPoints },
      },
    ],
  };
}

const genericPaths = [
  {
    id: 'primary',
    role: 'generic-donor',
    points: [
      { x: 0.1, y: 0.2 },
      { x: 0.4, y: 0.2 },
      { x: 0.6, y: 0.45 },
      { x: 0.9, y: 0.65 },
    ],
  },
  {
    id: 'secondary',
    points: [
      { x: 0.2, y: 0.85 },
      { x: 0.45, y: 0.62 },
      { x: 0.72, y: 0.7 },
    ],
  },
];

test('path frame instance transforms are deterministic, caller-neutral and preserve retained path/frame truth', () => {
  const initial = makePathSweepFrameState(genericPaths, { id: 'sweep', halfWidth: 0.025 });
  const human = run(initial, 'human');
  const machine = run(initial, 'machine');
  const humanSet = instanceSet(human);
  const machineSet = instanceSet(machine);

  assert.equal(human.finalStateHash, machine.finalStateHash);
  assert.deepEqual(human.finalState.paths, genericPaths);
  assert.deepEqual(machine.finalState.paths, genericPaths);
  assert.equal(frameSet(human).frameSetHash, frameSet(machine).frameSetHash);
  assert.equal(humanSet.instanceSetHash, machineSet.instanceSetHash);
  assert.equal(humanSet.derived, true);
  assert.equal(humanSet.rebuildable, true);
  assert.equal(humanSet.pathCount, 2);
  assert.equal(humanSet.sourcePointCount, 7);
  assert.equal(humanSet.instanceCount, 7);
  assert.equal(validatePathFrameInstanceTransformSet(human.finalState, humanSet), true);
});

test('stride selection reduces derived instance density but deterministically preserves each path final frame', () => {
  const paths = [
    {
      id: 'six',
      points: [
        { x: 0, y: 0.1 }, { x: 0.2, y: 0.1 }, { x: 0.4, y: 0.1 },
        { x: 0.6, y: 0.1 }, { x: 0.8, y: 0.1 }, { x: 1, y: 0.1 },
      ],
    },
    {
      id: 'four',
      points: [
        { x: 0.1, y: 0.8 }, { x: 0.3, y: 0.8 }, { x: 0.5, y: 0.8 }, { x: 0.7, y: 0.8 },
      ],
    },
  ];
  const result = run(
    makePathSweepFrameState(paths, { id: 'sweep' }),
    'test',
    graphWithInstanceParams({ stride: 2 }),
  );
  const set = instanceSet(result);

  assert.equal(set.selection.stride, 2);
  assert.equal(set.selection.includeFinalFrame, true);
  assert.deepEqual(set.paths[0].instances.map((entry) => entry.frameIndex), [0, 2, 4, 5]);
  assert.deepEqual(set.paths[1].instances.map((entry) => entry.frameIndex), [0, 2, 3]);
  assert.equal(set.instanceCount, 7);
  assert.equal(validatePathFrameInstanceTransformSet(result.finalState, set), true);
});

test('instance transforms carry verified translation and rigid tangent/normal orientation without inventing scale', () => {
  const paths = [
    { id: 'horizontal', points: [{ x: 0.1, y: 0.25 }, { x: 0.9, y: 0.25 }] },
    { id: 'vertical', points: [{ x: 0.7, y: 0.1 }, { x: 0.7, y: 0.9 }] },
  ];
  const set = instanceSet(run(makePathSweepFrameState(paths, { id: 'sweep', halfWidth: 0.04 })));
  const horizontal = set.paths[0].instances[0];
  const vertical = set.paths[1].instances[0];

  assert.deepEqual(horizontal.translation, { x: 0.1, y: 0.25 });
  assert.deepEqual(horizontal.basisX, { x: 1, y: 0 });
  assert.equal(horizontal.basisY.y, 1);
  assert.deepEqual(horizontal.scale, { x: 1, y: 1 });
  assert.equal(horizontal.sweepHalfWidth, 0.04);

  assert.deepEqual(vertical.translation, { x: 0.7, y: 0.1 });
  assert.deepEqual(vertical.basisX, { x: 0, y: 1 });
  assert.equal(vertical.basisY.x, -1);
  assert.deepEqual(vertical.scale, { x: 1, y: 1 });
});

test('zero sweep width remains a neutral carried hint and does not collapse the rigid instance transform', () => {
  const line = [{ id: 'line', points: [{ x: 0.1, y: 0.5 }, { x: 0.9, y: 0.5 }] }];
  const set = instanceSet(run(makePathSweepFrameState(line, { id: 'sweep', halfWidth: 0 })));
  const instance = set.paths[0].instances[0];

  assert.equal(instance.sweepHalfWidth, 0);
  assert.deepEqual(instance.scale, { x: 1, y: 1 });
  assert.deepEqual(instance.basisX, { x: 1, y: 0 });
  assert.equal(set.semantics.scalePolicy, 'identity-only');
  assert.equal(set.semantics.prototypeBinding, 'external-required');
  assert.equal(set.semantics.rendererAuthority, 'none');
  assert.equal(set.semantics.consumerPlacementAuthority, 'none');
});

test('self-consistently rehashed frame-set tampering is rejected before instance derivation', () => {
  const result = run(makePathSweepFrameState(genericPaths, { id: 'sweep', halfWidth: 0.02 }));
  const tamperedState = structuredClone(result.finalState);
  const tampered = tamperedState.pathSweepFrameSets.sweep;
  tampered.paths[0].frames[1].tangent.x = 0.123456;
  tampered.frameSetHash = hashValue(frameSetHashPayload(tampered));

  assert.throws(
    () => buildPathFrameInstanceTransformSetHand.execute(tamperedState, {}),
    /does not rebuild from retained truth/,
  );
});

test('self-consistently rehashed instance transform or fixed semantic tampering cannot become verified geometry', () => {
  const result = run(makePathSweepFrameState(genericPaths, { id: 'sweep', halfWidth: 0.02 }));

  const alteredTransform = structuredClone(instanceSet(result));
  alteredTransform.paths[0].instances[1].translation.x += 0.01;
  alteredTransform.instanceSetHash = hashValue(instanceSetHashPayload(alteredTransform));
  assert.throws(
    () => validatePathFrameInstanceTransformSet(result.finalState, alteredTransform),
    /does not rebuild from verified frame truth/,
  );

  const forgedSemantics = structuredClone(instanceSet(result));
  forgedSemantics.semantics.prototypeBinding = 'svg-symbol';
  forgedSemantics.instanceSetHash = hashValue(instanceSetHashPayload(forgedSemantics));
  assert.throws(
    () => validatePathFrameInstanceTransformSet(result.finalState, forgedSemantics),
    /derivation semantic prototypeBinding is invalid/,
  );
});

test('missing frame derivation, retained-path drift, invalid stride and excessive instance work fail explicitly', () => {
  const result = run(makePathSweepFrameState(genericPaths, { id: 'sweep' }));

  const missing = structuredClone(result.finalState);
  delete missing.pathSweepFrameSets.sweep;
  assert.throws(
    () => buildPathFrameInstanceTransformSetHand.execute(missing, {}),
    /require derived frame set for source: sweep/,
  );

  const drift = structuredClone(result.finalState);
  drift.paths[0].points[1].x = 0.41;
  assert.throws(
    () => buildPathFrameInstanceTransformSetHand.execute(drift, {}),
    /retained path state hash mismatch/,
  );

  assert.throws(
    () => run(makePathSweepFrameState(genericPaths, { id: 'sweep' }), 'test', graphWithInstanceParams({ stride: 0 })),
    /pathFrameInstances.stride must be an integer within \[1,256\]/,
  );

  assert.throws(
    () => run(makePathSweepFrameState(genericPaths, { id: 'sweep' }), 'test', graphWithInstanceParams({ maxInstances: 2 })),
    /path frame instance budget exceeded: 7 > 2/,
  );
});
