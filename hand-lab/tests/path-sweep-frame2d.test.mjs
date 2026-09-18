import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph, hashValue } from '../src/hand-runtime.mjs';
import {
  PATH_SWEEP_FRAME_2D_GRAPH,
  PATH_SWEEP_FRAME_2D_HANDS,
  buildPathSweepFrameSetHand,
  makePathSweepFrameState,
  normalizePathSweepFrameSourceHand,
  validatePathSweepFrameSet,
} from '../src/path-sweep-frame2d.mjs';

const registry = createHandRegistry(PATH_SWEEP_FRAME_2D_HANDS);

function run(state, callerKind = 'test', graph = PATH_SWEEP_FRAME_2D_GRAPH) {
  return executeHandGraph({ registry, graph, initialState: state, context: { callerKind } });
}

function frameSet(result, id = 'sweep') {
  return result.finalState.pathSweepFrameSets[id];
}

function graphWithPointBudget(maxPoints) {
  return {
    ...PATH_SWEEP_FRAME_2D_GRAPH,
    stages: [
      PATH_SWEEP_FRAME_2D_GRAPH.stages[0],
      { id: 'build-path-sweep-frame-set', hand: 'fx.geometry.path-sweep-frame2d-build', params: { maxPoints } },
    ],
  };
}

const genericPaths = [
  {
    id: 'primary',
    role: 'generic-donor',
    energy: 0.8,
    points: [
      { x: 0.1, y: 0.2, tag: 'a' },
      { x: 0.4, y: 0.2, tag: 'b' },
      { x: 0.6, y: 0.45, tag: 'c' },
      { x: 0.9, y: 0.65, tag: 'd' },
    ],
  },
  {
    id: 'secondary',
    role: 'generic-donor',
    points: [
      { x: 0.2, y: 0.85 },
      { x: 0.45, y: 0.62 },
      { x: 0.72, y: 0.7 },
    ],
  },
];

test('path sweep frames are deterministic, caller-neutral and leave retained path truth untouched', () => {
  const initial = makePathSweepFrameState(genericPaths, { id: 'sweep', halfWidth: 0.025 });
  const initialPathHash = hashValue(initial.paths);
  const human = run(initial, 'human');
  const machine = run(initial, 'machine');
  const humanSet = frameSet(human);
  const machineSet = frameSet(machine);

  assert.equal(human.finalStateHash, machine.finalStateHash);
  assert.equal(human.finalState.pathSourceHash, initialPathHash);
  assert.equal(machine.finalState.pathSourceHash, initialPathHash);
  assert.deepEqual(human.finalState.paths, genericPaths);
  assert.deepEqual(machine.finalState.paths, genericPaths);
  assert.equal(humanSet.frameSetHash, machineSet.frameSetHash);
  assert.equal(humanSet.derived, true);
  assert.equal(humanSet.rebuildable, true);
  assert.equal(humanSet.pathCount, 2);
  assert.equal(humanSet.pointCount, 7);
  assert.equal(validatePathSweepFrameSet(human.finalState, humanSet), true);
});

test('straight and turning paths produce materially different local frames under one neutral contract', () => {
  const straight = [{ id: 'line', points: [{ x: 0.1, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.9, y: 0.5 }] }];
  const corner = [{ id: 'line', points: [{ x: 0.1, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.9 }] }];
  const a = frameSet(run(makePathSweepFrameState(straight, { id: 'sweep', halfWidth: 0.02 })));
  const b = frameSet(run(makePathSweepFrameState(corner, { id: 'sweep', halfWidth: 0.02 })));

  assert.deepEqual(a.paths[0].frames[1].tangent, { x: 1, y: 0 });
  assert.deepEqual(a.paths[0].frames[1].normal, { x: 0, y: 1 });
  assert.notDeepEqual(b.paths[0].frames[1].tangent, a.paths[0].frames[1].tangent);
  assert.deepEqual(b.paths[0].frames[1].tangent, { x: 0.707107, y: 0.707107 });
  assert.deepEqual(b.paths[0].frames[1].normal, { x: -0.707107, y: 0.707107 });
  assert.notEqual(a.frameSetHash, b.frameSetHash);
});

test('zero half-width is an exact geometry-width no-op while frame orientation remains rebuildable', () => {
  const result = run(makePathSweepFrameState(genericPaths, { id: 'sweep', halfWidth: 0 }));
  const set = frameSet(result);

  assert.equal(result.finalState.pathSweepFrameSource.halfWidth, 0);
  for (const path of set.paths) {
    for (const frame of path.frames) {
      assert.equal(frame.halfWidth, 0);
      assert.ok(Number.isFinite(frame.tangent.x) && Number.isFinite(frame.tangent.y));
      assert.ok(Number.isFinite(frame.normal.x) && Number.isFinite(frame.normal.y));
    }
  }
  assert.deepEqual(result.finalState.paths, genericPaths);
});

test('180-degree reversal uses the declared outgoing-segment fallback instead of hiding an undefined bisector', () => {
  const reversal = [{
    id: 'hairpin',
    points: [
      { x: 0.1, y: 0.5 },
      { x: 0.6, y: 0.5 },
      { x: 0.2, y: 0.5 },
    ],
  }];
  const result = run(makePathSweepFrameState(reversal, { id: 'sweep' }));
  const middle = frameSet(result).paths[0].frames[1];

  assert.equal(result.finalState.pathSweepFrameSource.reversalFallback, 'outgoing-segment');
  assert.deepEqual(middle.tangent, { x: -1, y: 0 });
  assert.deepEqual(middle.normal, { x: 0, y: -1 });
});

test('self-consistently rehashed source semantic forgery is rejected', () => {
  const normalized = normalizePathSweepFrameSourceHand.execute(
    makePathSweepFrameState(genericPaths, { id: 'sweep', halfWidth: 0.03 }),
    {},
  ).state;
  const forged = structuredClone(normalized);
  forged.pathSweepFrameSource.framePolicy = 'renderer-owned-normal';
  forged.pathSweepFrameSourceHash = hashValue(forged.pathSweepFrameSource);

  assert.throws(
    () => buildPathSweepFrameSetHand.execute(forged, {}),
    /path sweep frame source frame policy is invalid/,
  );
});

test('self-consistently rehashed derived frame tampering cannot become path truth', () => {
  const result = run(makePathSweepFrameState(genericPaths, { id: 'sweep', halfWidth: 0.02 }));
  const tampered = structuredClone(frameSet(result));
  tampered.paths[0].frames[1].normal.x = 0.123456;
  const payload = {
    schema: tampered.schema,
    sourceHash: tampered.sourceHash,
    pathSourceHash: tampered.pathSourceHash,
    pathCount: tampered.pathCount,
    pointCount: tampered.pointCount,
    paths: tampered.paths,
    derived: tampered.derived,
    rebuildable: tampered.rebuildable,
  };
  tampered.frameSetHash = hashValue(payload);

  assert.throws(
    () => validatePathSweepFrameSet(result.finalState, tampered),
    /does not rebuild from retained truth/,
  );
});

test('path drift, zero-length spans, unsupported semantics and excessive derived work fail explicitly', () => {
  const normalized = normalizePathSweepFrameSourceHand.execute(
    makePathSweepFrameState(genericPaths, { id: 'sweep' }),
    {},
  ).state;

  const pathDrift = structuredClone(normalized);
  pathDrift.paths[0].points[1].x = 0.41;
  assert.throws(
    () => buildPathSweepFrameSetHand.execute(pathDrift, {}),
    /retained path state hash mismatch/,
  );

  assert.throws(
    () => run(makePathSweepFrameState([{ id: 'bad', points: [{ x: 0.2, y: 0.2 }, { x: 0.2, y: 0.2 }] }])),
    /zero-length span/,
  );
  assert.throws(
    () => run(makePathSweepFrameState(genericPaths, { profile: 'tube3d' })),
    /profile must be symmetric-ribbon2d/,
  );
  assert.throws(
    () => run(makePathSweepFrameState(genericPaths, { framePolicy: 'frenet3d' })),
    /framePolicy must be left-normal-bisector2d/,
  );
  assert.throws(
    () => run(makePathSweepFrameState(genericPaths, { halfWidth: 0.251 })),
    /halfWidth must be within \[0,0.25\]/,
  );

  const totalPoints = genericPaths.reduce((sum, path) => sum + path.points.length, 0);
  assert.ok(totalPoints > 2);
  assert.throws(
    () => run(makePathSweepFrameState(genericPaths, { id: 'sweep' }), 'test', graphWithPointBudget(2)),
    new RegExp(`path sweep frame point budget exceeded: ${totalPoints} > 2`),
  );
});
