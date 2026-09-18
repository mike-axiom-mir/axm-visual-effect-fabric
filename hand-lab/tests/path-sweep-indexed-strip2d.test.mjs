import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph, hashValue } from '../src/hand-runtime.mjs';
import { makePathSweepFrameState } from '../src/path-sweep-frame2d.mjs';
import {
  PATH_SWEEP_INDEXED_STRIP_2D_GRAPH,
  PATH_SWEEP_INDEXED_STRIP_2D_HANDS,
  buildPathSweepIndexedStripSetHand,
  validatePathSweepIndexedStripSet,
} from '../src/path-sweep-indexed-strip2d.mjs';

const registry = createHandRegistry(PATH_SWEEP_INDEXED_STRIP_2D_HANDS);

function run(state, callerKind = 'test', graph = PATH_SWEEP_INDEXED_STRIP_2D_GRAPH) {
  return executeHandGraph({ registry, graph, initialState: state, context: { callerKind } });
}

function indexedSet(result, id = 'sweep') {
  return result.finalState.pathSweepIndexedStripSets[id];
}

function ribbonSet(result, id = 'sweep') {
  return result.finalState.pathSweepRibbonSets[id];
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

function indexedSetHashPayload(set) {
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

function graphWithIndexedBudget(maxPoints) {
  return {
    ...PATH_SWEEP_INDEXED_STRIP_2D_GRAPH,
    stages: PATH_SWEEP_INDEXED_STRIP_2D_GRAPH.stages.map((stage) => (
      stage.id === 'build-path-sweep-indexed-strip-set'
        ? { ...stage, params: { maxPoints } }
        : stage
    )),
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

test('indexed strip connectivity is deterministic, caller-neutral and preserves retained path/sweep truth', () => {
  const initial = makePathSweepFrameState(genericPaths, { id: 'sweep', halfWidth: 0.025 });
  const human = run(initial, 'human');
  const machine = run(initial, 'machine');
  const humanSet = indexedSet(human);
  const machineSet = indexedSet(machine);

  assert.equal(human.finalStateHash, machine.finalStateHash);
  assert.deepEqual(human.finalState.paths, genericPaths);
  assert.deepEqual(machine.finalState.paths, genericPaths);
  assert.equal(humanSet.indexedStripSetHash, machineSet.indexedStripSetHash);
  assert.equal(humanSet.derived, true);
  assert.equal(humanSet.rebuildable, true);
  assert.equal(humanSet.pathCount, 2);
  assert.equal(humanSet.pointCount, 7);
  assert.equal(humanSet.vertexCount, 14);
  assert.equal(humanSet.triangleCount, 10);
  assert.equal(humanSet.indexCount, 30);
  assert.equal(validatePathSweepIndexedStripSet(human.finalState, humanSet), true);
});

test('straight ribbon pairs receive exact local vertices and deterministic adjacent-pair triangle connectivity', () => {
  const line = [{ id: 'line', points: [{ x: 0.1, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.9, y: 0.5 }] }];
  const set = indexedSet(run(makePathSweepFrameState(line, { id: 'sweep', halfWidth: 0.1 })));
  const path = set.paths[0];

  assert.deepEqual(path.vertices, [
    { index: 0, pointIndex: 0, side: 'left', x: 0.1, y: 0.6 },
    { index: 1, pointIndex: 0, side: 'right', x: 0.1, y: 0.4 },
    { index: 2, pointIndex: 1, side: 'left', x: 0.5, y: 0.6 },
    { index: 3, pointIndex: 1, side: 'right', x: 0.5, y: 0.4 },
    { index: 4, pointIndex: 2, side: 'left', x: 0.9, y: 0.6 },
    { index: 5, pointIndex: 2, side: 'right', x: 0.9, y: 0.4 },
  ]);
  assert.deepEqual(path.triangles, [
    [0, 1, 2],
    [1, 3, 2],
    [2, 3, 4],
    [3, 5, 4],
  ]);
  assert.equal(path.vertexCount, 6);
  assert.equal(path.triangleCount, 4);
  assert.equal(path.indexCount, 12);
});

test('multiple paths stay topologically isolated and zero-width strips remain connectivity-only degenerates', () => {
  const result = run(makePathSweepFrameState(genericPaths, { id: 'sweep', halfWidth: 0 }));
  const set = indexedSet(result);

  assert.equal(set.paths[0].vertexCount, 8);
  assert.equal(set.paths[0].triangleCount, 6);
  assert.equal(set.paths[1].vertexCount, 6);
  assert.equal(set.paths[1].triangleCount, 4);
  for (const path of set.paths) {
    for (let index = 0; index < path.vertices.length; index += 2) {
      assert.equal(path.vertices[index].x, path.vertices[index + 1].x);
      assert.equal(path.vertices[index].y, path.vertices[index + 1].y);
    }
  }
  assert.equal(set.semantics.pathBridging, 'forbidden');
  assert.equal(set.semantics.joinAuthority, 'none');
  assert.equal(set.semantics.capAuthority, 'none');
  assert.equal(set.semantics.uvAuthority, 'none');
  assert.equal(set.semantics.rendererAuthority, 'none');
  assert.equal(set.semantics.frontFaceAuthority, 'none');
  assert.equal(set.semantics.manifoldAuthority, 'none');
  assert.equal(set.semantics.selfIntersectionResolution, 'none');
  assert.equal(set.semantics.geometryValidityClaim, 'connectivity-only');
});

test('turning geometry changes vertices while topology stays a neutral adjacent-pair descriptor', () => {
  const straight = [{ id: 'shape', points: [{ x: 0.1, y: 0.2 }, { x: 0.5, y: 0.2 }, { x: 0.9, y: 0.2 }] }];
  const turning = [{ id: 'shape', points: [{ x: 0.1, y: 0.2 }, { x: 0.5, y: 0.2 }, { x: 0.5, y: 0.8 }] }];
  const straightSet = indexedSet(run(makePathSweepFrameState(straight, { id: 'sweep', halfWidth: 0.05 })));
  const turningSet = indexedSet(run(makePathSweepFrameState(turning, { id: 'sweep', halfWidth: 0.05 })));

  assert.notDeepEqual(straightSet.paths[0].vertices, turningSet.paths[0].vertices);
  assert.deepEqual(straightSet.paths[0].triangles, turningSet.paths[0].triangles);
  assert.equal(turningSet.semantics.frontFaceAuthority, 'none');
  assert.equal(turningSet.semantics.geometryValidityClaim, 'connectivity-only');
});

test('self-consistently rehashed ribbon tampering is rejected before indexed connectivity derivation', () => {
  const result = run(makePathSweepFrameState(genericPaths, { id: 'sweep', halfWidth: 0.02 }));
  const tamperedState = structuredClone(result.finalState);
  const tampered = tamperedState.pathSweepRibbonSets.sweep;
  tampered.paths[0].points[1].left.x += 0.01;
  tampered.ribbonSetHash = hashValue(ribbonSetHashPayload(tampered));

  assert.throws(
    () => buildPathSweepIndexedStripSetHand.execute(tamperedState, {}),
    /does not rebuild from verified frame truth/,
  );
});

test('self-consistently rehashed topology tampering and topology-semantic forgery cannot become verified geometry', () => {
  const result = run(makePathSweepFrameState(genericPaths, { id: 'sweep', halfWidth: 0.02 }));

  const tampered = structuredClone(indexedSet(result));
  tampered.paths[0].triangles[0] = [0, 3, 2];
  tampered.indexedStripSetHash = hashValue(indexedSetHashPayload(tampered));
  assert.throws(
    () => validatePathSweepIndexedStripSet(result.finalState, tampered),
    /does not rebuild from verified ribbon truth/,
  );

  const forged = structuredClone(indexedSet(result));
  forged.semantics.rendererAuthority = 'svg';
  forged.indexedStripSetHash = hashValue(indexedSetHashPayload(forged));
  assert.throws(
    () => validatePathSweepIndexedStripSet(result.finalState, forged),
    /topology semantic rendererAuthority is invalid/,
  );
});

test('missing ribbon derivation, retained-path drift and excessive indexed-strip work fail explicitly', () => {
  const result = run(makePathSweepFrameState(genericPaths, { id: 'sweep' }));

  const missing = structuredClone(result.finalState);
  delete missing.pathSweepRibbonSets.sweep;
  assert.throws(
    () => buildPathSweepIndexedStripSetHand.execute(missing, {}),
    /requires derived ribbon set for source: sweep/,
  );

  const drift = structuredClone(result.finalState);
  drift.paths[0].points[1].x = 0.41;
  assert.throws(
    () => buildPathSweepIndexedStripSetHand.execute(drift, {}),
    /retained path state hash mismatch/,
  );

  const totalPoints = genericPaths.reduce((sum, path) => sum + path.points.length, 0);
  assert.throws(
    () => run(makePathSweepFrameState(genericPaths, { id: 'sweep' }), 'test', graphWithIndexedBudget(2)),
    new RegExp(`path sweep frame point budget exceeded: ${totalPoints} > 2`),
  );
});
