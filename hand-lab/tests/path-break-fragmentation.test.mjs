import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph, hashValue } from '../src/hand-runtime.mjs';
import {
  PATH_BREAK_FRAGMENTATION_GRAPH,
  PATH_BREAK_FRAGMENTATION_HANDS,
  buildBrokenPathSetHand,
  makePathBreakFragmentationState,
  normalizePathBreakFragmentationHand,
} from '../src/path-break-fragmentation.mjs';

const registry = createHandRegistry(PATH_BREAK_FRAGMENTATION_HANDS);

function run(state, callerKind = 'test', graph = PATH_BREAK_FRAGMENTATION_GRAPH) {
  return executeHandGraph({ registry, graph, initialState: state, context: { callerKind } });
}

function pathSet(result, id = 'broken') {
  return result.finalState.brokenPathSets[id];
}

function graphWithBudgets({ maxSourcePoints = 4096, maxFragments = 8192, maxDerivedPoints = 16384 } = {}) {
  return {
    ...PATH_BREAK_FRAGMENTATION_GRAPH,
    stages: [
      PATH_BREAK_FRAGMENTATION_GRAPH.stages[0],
      {
        id: 'build-broken-paths',
        hand: 'fx.path.break-fragment-build',
        params: { maxSourcePoints, maxFragments, maxDerivedPoints },
      },
    ],
  };
}

const twoPaths = [
  {
    id: 'horizontal',
    role: 'generic',
    points: [
      { x: 0.1, y: 0.25, tag: 'a' },
      { x: 0.3, y: 0.25 },
      { x: 0.55, y: 0.25 },
      { x: 0.9, y: 0.25, tag: 'b' },
    ],
  },
  {
    id: 'vertical',
    role: 'generic',
    points: [
      { x: 0.65, y: 0.1 },
      { x: 0.65, y: 0.45 },
      { x: 0.65, y: 0.9 },
    ],
  },
];

test('path break fragmentation is deterministic, caller-neutral and leaves retained paths untouched', () => {
  const initial = makePathBreakFragmentationState(twoPaths, {
    id: 'broken', breakCount: 2, gapWidth: 0.08, phase: 0.25,
  });
  const sourceHash = hashValue(initial.paths);
  const human = run(initial, 'human');
  const machine = run(initial, 'machine');
  const humanSet = pathSet(human);
  const machineSet = pathSet(machine);

  assert.equal(human.finalStateHash, machine.finalStateHash);
  assert.equal(human.finalState.pathSourceHash, machine.finalState.pathSourceHash);
  assert.equal(human.finalState.pathBreakSourceHash, machine.finalState.pathBreakSourceHash);
  assert.equal(humanSet.pathSetHash, machineSet.pathSetHash);
  assert.equal(human.finalState.pathSourceHash, sourceHash);
  assert.deepEqual(human.finalState.paths, twoPaths);
  assert.deepEqual(machine.finalState.paths, twoPaths);
  assert.equal(humanSet.derived, true);
  assert.equal(humanSet.rebuildable, true);
  assert.equal(humanSet.sourcePathCount, 2);
  assert.equal(humanSet.fragmentCount, 6);
  assert.ok(humanSet.pointCount >= 12);
  assert.equal(humanSet.removedNormalizedLengthPerPath, 0.16);
});

test('zero breaks are an exact derived geometry and metadata no-op with separate retained lineage', () => {
  const result = run(makePathBreakFragmentationState(twoPaths, {
    id: 'broken', breakCount: 0, gapWidth: 0, phase: 0.9,
  }));
  const broken = pathSet(result);

  assert.deepEqual(broken.paths, twoPaths);
  assert.equal(broken.fragmentCount, twoPaths.length);
  assert.equal(broken.pointCount, twoPaths.reduce((sum, path) => sum + path.points.length, 0));
  assert.equal(broken.removedNormalizedLengthPerPath, 0);
  assert.equal(broken.pathSourceHash, hashValue(twoPaths));
  assert.equal(broken.breakSourceHash, result.finalState.pathBreakSourceHash);
});

test('one interior break clips a known horizontal path at exact normalized arc boundaries', () => {
  const paths = [{
    id: 'line',
    role: 'generic',
    points: [
      { x: 0, y: 0.5, tag: 'start' },
      { x: 0.25, y: 0.5, tag: 'quarter' },
      { x: 0.5, y: 0.5, tag: 'middle' },
      { x: 0.75, y: 0.5, tag: 'three-quarter' },
      { x: 1, y: 0.5, tag: 'end' },
    ],
  }];
  const result = run(makePathBreakFragmentationState(paths, {
    id: 'broken', breakCount: 1, gapWidth: 0.2, phase: 0.5,
  }));
  const broken = pathSet(result);

  assert.equal(broken.fragmentCount, 2);
  assert.deepEqual(broken.paths[0].normalizedArcRange, { start: 0, end: 0.4 });
  assert.deepEqual(broken.paths[1].normalizedArcRange, { start: 0.6, end: 1 });
  assert.deepEqual(broken.paths[0].points[0], paths[0].points[0]);
  assert.deepEqual(broken.paths[1].points.at(-1), paths[0].points.at(-1));
  assert.deepEqual(broken.paths[0].points.at(-1), { x: 0.4, y: 0.5 });
  assert.deepEqual(broken.paths[1].points[0], { x: 0.6, y: 0.5 });
  assert.equal(broken.paths[0].sourcePathId, 'line');
  assert.equal(broken.paths[1].sourcePathId, 'line');
  assert.equal(broken.paths[0].role, 'generic');
});

test('break placement follows normalized polyline length rather than point index spacing', () => {
  const paths = [{
    id: 'uneven',
    points: [
      { x: 0, y: 0.3 },
      { x: 0.1, y: 0.3 },
      { x: 0.9, y: 0.3 },
      { x: 1, y: 0.3 },
    ],
  }];
  const result = run(makePathBreakFragmentationState(paths, {
    id: 'broken', breakCount: 1, gapWidth: 0.1, phase: 0.5,
  }));
  const broken = pathSet(result);

  assert.deepEqual(broken.paths[0].points.at(-1), { x: 0.45, y: 0.3 });
  assert.deepEqual(broken.paths[1].points[0], { x: 0.55, y: 0.3 });
  assert.equal(broken.paths[0].normalizedArcRange.end, 0.45);
  assert.equal(broken.paths[1].normalizedArcRange.start, 0.55);
});

test('phase changes derived break placement while retaining identical canonical path truth', () => {
  const a = run(makePathBreakFragmentationState(twoPaths, {
    id: 'broken', breakCount: 2, gapWidth: 0.05, phase: 0.1,
  }));
  const b = run(makePathBreakFragmentationState(twoPaths, {
    id: 'broken', breakCount: 2, gapWidth: 0.05, phase: 0.9,
  }));

  assert.equal(a.finalState.pathSourceHash, b.finalState.pathSourceHash);
  assert.notEqual(a.finalState.pathBreakSourceHash, b.finalState.pathBreakSourceHash);
  assert.notEqual(pathSet(a).pathSetHash, pathSet(b).pathSetHash);
  assert.deepEqual(a.finalState.paths, twoPaths);
  assert.deepEqual(b.finalState.paths, twoPaths);
});

test('ordinary path drift and self-consistent semantic source tampering are rejected', () => {
  const normalized = normalizePathBreakFragmentationHand.execute(makePathBreakFragmentationState(twoPaths, {
    id: 'broken', breakCount: 2, gapWidth: 0.05, phase: 0.2,
  }), {}).state;

  const pathDrift = structuredClone(normalized);
  pathDrift.paths[0].points[1].x = 0.31;
  assert.throws(() => buildBrokenPathSetHand.execute(pathDrift, {}), /path break retained path state hash mismatch/);

  const algorithmTamper = structuredClone(normalized);
  algorithmTamper.pathBreakSource.algorithm = 'point-index-delete';
  algorithmTamper.pathBreakSourceHash = hashValue(algorithmTamper.pathBreakSource);
  assert.throws(() => buildBrokenPathSetHand.execute(algorithmTamper, {}), /path break algorithm mismatch/);

  const placementTamper = structuredClone(normalized);
  placementTamper.pathBreakSource.placementMode = 'random';
  placementTamper.pathBreakSourceHash = hashValue(placementTamper.pathBreakSource);
  assert.throws(() => buildBrokenPathSetHand.execute(placementTamper, {}), /path break placement mode mismatch/);
});

test('malformed controls and explicit source, fragment and derived-point budgets fail clearly', () => {
  assert.throws(
    () => run(makePathBreakFragmentationState([{ id: 'bad', points: [{ x: 0.5, y: 0.5 }] }])),
    /requires at least two points/,
  );
  assert.throws(
    () => run(makePathBreakFragmentationState(twoPaths, { breakCount: 65 })),
    /pathBreakRequest\.breakCount must be an integer within \[0,64\]/,
  );
  assert.throws(
    () => run(makePathBreakFragmentationState(twoPaths, { breakCount: 0, gapWidth: 0.01 })),
    /pathBreakRequest\.gapWidth must be 0 when breakCount is 0/,
  );
  assert.throws(
    () => run(makePathBreakFragmentationState(twoPaths, { breakCount: 1, gapWidth: 0.46 })),
    /pathBreakSource\.gapWidth must be <= 0.45 for breakCount 1/,
  );

  const pointCount = twoPaths.reduce((sum, path) => sum + path.points.length, 0);
  assert.throws(
    () => run(makePathBreakFragmentationState(twoPaths), 'test', graphWithBudgets({ maxSourcePoints: 4 })),
    new RegExp(`pathBreak source point budget exceeded: ${pointCount} > 4`),
  );
  assert.throws(
    () => run(makePathBreakFragmentationState(twoPaths, { breakCount: 2 }), 'test', graphWithBudgets({ maxFragments: 4 })),
    /pathBreak fragment budget exceeded: 6 > 4/,
  );
  assert.throws(
    () => run(makePathBreakFragmentationState(twoPaths, { breakCount: 2 }), 'test', graphWithBudgets({ maxDerivedPoints: 8 })),
    /pathBreak derived point budget exceeded: 15 > 8/,
  );
});
