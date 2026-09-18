import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph, hashValue } from '../src/hand-runtime.mjs';
import { makePathSweepFrameState } from '../src/path-sweep-frame2d.mjs';
import {
  PATH_SWEEP_RIBBON_2D_GRAPH,
  PATH_SWEEP_RIBBON_2D_HANDS,
  buildPathSweepRibbonSetHand,
  validatePathSweepRibbonSet,
} from '../src/path-sweep-ribbon2d.mjs';

const registry = createHandRegistry(PATH_SWEEP_RIBBON_2D_HANDS);

function run(state, callerKind = 'test', graph = PATH_SWEEP_RIBBON_2D_GRAPH) {
  return executeHandGraph({ registry, graph, initialState: state, context: { callerKind } });
}

function ribbonSet(result, id = 'sweep') {
  return result.finalState.pathSweepRibbonSets[id];
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

function graphWithRibbonBudget(maxPoints) {
  return {
    ...PATH_SWEEP_RIBBON_2D_GRAPH,
    stages: [
      PATH_SWEEP_RIBBON_2D_GRAPH.stages[0],
      PATH_SWEEP_RIBBON_2D_GRAPH.stages[1],
      { id: 'build-path-sweep-ribbon-set', hand: 'fx.geometry.path-sweep-ribbon2d-build', params: { maxPoints } },
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

test('path sweep ribbon boundaries are deterministic, caller-neutral and do not rewrite retained path/frame truth', () => {
  const initial = makePathSweepFrameState(genericPaths, { id: 'sweep', halfWidth: 0.025 });
  const human = run(initial, 'human');
  const machine = run(initial, 'machine');
  const humanSet = ribbonSet(human);
  const machineSet = ribbonSet(machine);

  assert.equal(human.finalStateHash, machine.finalStateHash);
  assert.deepEqual(human.finalState.paths, genericPaths);
  assert.deepEqual(machine.finalState.paths, genericPaths);
  assert.equal(frameSet(human).frameSetHash, frameSet(machine).frameSetHash);
  assert.equal(humanSet.ribbonSetHash, machineSet.ribbonSetHash);
  assert.equal(humanSet.derived, true);
  assert.equal(humanSet.rebuildable, true);
  assert.equal(humanSet.pathCount, 2);
  assert.equal(humanSet.pointCount, 7);
  assert.equal(validatePathSweepRibbonSet(human.finalState, humanSet), true);
});

test('straight frames realize exact symmetric boundary samples and zero width collapses both sides to the center', () => {
  const line = [{ id: 'line', points: [{ x: 0.1, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.9, y: 0.5 }] }];
  const wide = ribbonSet(run(makePathSweepFrameState(line, { id: 'sweep', halfWidth: 0.1 })));
  const middle = wide.paths[0].points[1];

  assert.deepEqual(middle.center, { x: 0.5, y: 0.5 });
  assert.deepEqual(middle.left, { x: 0.5, y: 0.6 });
  assert.deepEqual(middle.right, { x: 0.5, y: 0.4 });

  const zero = ribbonSet(run(makePathSweepFrameState(line, { id: 'sweep', halfWidth: 0 })));
  for (const point of zero.paths[0].points) {
    assert.deepEqual(point.left, point.center);
    assert.deepEqual(point.right, point.center);
  }
});

test('turning geometry changes derived boundaries while boundary realization stays unclipped and join/cap neutral', () => {
  const corner = [{ id: 'corner', points: [{ x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 0.5, y: 0.5 }] }];
  const result = run(makePathSweepFrameState(corner, { id: 'sweep', halfWidth: 0.1 }));
  const set = ribbonSet(result);
  const first = set.paths[0].points[0];
  const cornerPoint = set.paths[0].points[1];

  assert.equal(first.right.y, -0.1);
  assert.equal(set.semantics.clipping, 'none');
  assert.equal(set.semantics.joinAuthority, 'none');
  assert.equal(set.semantics.capAuthority, 'none');
  assert.equal(set.semantics.triangulation, 'none');
  assert.notEqual(cornerPoint.left.x, cornerPoint.center.x);
  assert.notEqual(cornerPoint.left.y, cornerPoint.center.y);
});

test('self-consistently rehashed frame-set tampering is rejected before ribbon derivation', () => {
  const result = run(makePathSweepFrameState(genericPaths, { id: 'sweep', halfWidth: 0.02 }));
  const tamperedState = structuredClone(result.finalState);
  const tampered = tamperedState.pathSweepFrameSets.sweep;
  tampered.paths[0].frames[1].normal.x = 0.123456;
  tampered.frameSetHash = hashValue(frameSetHashPayload(tampered));

  assert.throws(
    () => buildPathSweepRibbonSetHand.execute(tamperedState, {}),
    /does not rebuild from retained truth/,
  );
});

test('self-consistently rehashed ribbon-boundary tampering cannot become verified geometry', () => {
  const result = run(makePathSweepFrameState(genericPaths, { id: 'sweep', halfWidth: 0.02 }));
  const tampered = structuredClone(ribbonSet(result));
  tampered.paths[0].points[1].left.x += 0.01;
  tampered.ribbonSetHash = hashValue(ribbonSetHashPayload(tampered));

  assert.throws(
    () => validatePathSweepRibbonSet(result.finalState, tampered),
    /does not rebuild from verified frame truth/,
  );
});

test('self-consistently rehashed sweep-source semantic forgery remains rejected upstream', () => {
  const result = run(makePathSweepFrameState(genericPaths, { id: 'sweep', halfWidth: 0.03 }));
  const forged = structuredClone(result.finalState);
  forged.pathSweepFrameSource.framePolicy = 'renderer-owned-normal';
  forged.pathSweepFrameSourceHash = hashValue(forged.pathSweepFrameSource);

  assert.throws(
    () => buildPathSweepRibbonSetHand.execute(forged, {}),
    /path sweep frame source frame policy is invalid/,
  );
});

test('missing frame derivation, retained-path drift and excessive ribbon work fail explicitly', () => {
  const result = run(makePathSweepFrameState(genericPaths, { id: 'sweep' }));

  const missing = structuredClone(result.finalState);
  delete missing.pathSweepFrameSets.sweep;
  assert.throws(
    () => buildPathSweepRibbonSetHand.execute(missing, {}),
    /requires derived frame set for source: sweep/,
  );

  const drift = structuredClone(result.finalState);
  drift.paths[0].points[1].x = 0.41;
  assert.throws(
    () => buildPathSweepRibbonSetHand.execute(drift, {}),
    /retained path state hash mismatch/,
  );

  const totalPoints = genericPaths.reduce((sum, path) => sum + path.points.length, 0);
  assert.throws(
    () => run(makePathSweepFrameState(genericPaths, { id: 'sweep' }), 'test', graphWithRibbonBudget(2)),
    new RegExp(`path sweep frame point budget exceeded: ${totalPoints} > 2`),
  );
});
