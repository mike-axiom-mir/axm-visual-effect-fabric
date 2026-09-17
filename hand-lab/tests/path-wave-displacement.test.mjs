import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph, hashValue } from '../src/hand-runtime.mjs';
import {
  branchPathHand,
  energyHand,
  makeElectricInitialState,
  seedPathHand,
} from '../src/electric-hands.mjs';
import {
  PATH_WAVE_DISPLACEMENT_GRAPH,
  PATH_WAVE_DISPLACEMENT_HANDS,
  buildWaveDisplacedPathSetHand,
  makePathWaveDisplacementState,
  normalizePathWaveDisplacementHand,
} from '../src/path-wave-displacement.mjs';

const registry = createHandRegistry(PATH_WAVE_DISPLACEMENT_HANDS);

function electricDonor({ seed = 1337, source, target, branchCount = 6 } = {}) {
  let state = makeElectricInitialState(seed);
  if (source) state.effect.source = source;
  if (target) state.effect.target = target;
  state = seedPathHand.execute(state, { segments: 18, jitter: 0.055 }).state;
  state = branchPathHand.execute(state, { branchCount, spread: 0.11 }).state;
  state = energyHand.execute(state, { trunkWidth: 1 }).state;
  return structuredClone(state.paths);
}

function run(state, callerKind = 'test', graph = PATH_WAVE_DISPLACEMENT_GRAPH) {
  return executeHandGraph({ registry, graph, initialState: state, context: { callerKind } });
}

function pathSet(result, id = 'waved') {
  return result.finalState.waveDisplacedPathSets[id];
}

function graphWithPointBudget(maxPoints) {
  return {
    ...PATH_WAVE_DISPLACEMENT_GRAPH,
    stages: [
      PATH_WAVE_DISPLACEMENT_GRAPH.stages[0],
      { id: 'build-wave-displaced-paths', hand: 'fx.path.wave-displacement-build', params: { maxPoints } },
    ],
  };
}

function assertPathMetadataPreserved(basePaths, derivedPaths) {
  assert.equal(basePaths.length, derivedPaths.length);
  for (let i = 0; i < basePaths.length; i += 1) {
    const { points: basePoints, ...baseMeta } = basePaths[i];
    const { points: derivedPoints, ...derivedMeta } = derivedPaths[i];
    assert.deepEqual(derivedMeta, baseMeta);
    assert.equal(derivedPoints.length, basePoints.length);
    for (let p = 0; p < basePoints.length; p += 1) {
      const { x: baseX, y: baseY, ...basePointMeta } = basePoints[p];
      const { x: derivedX, y: derivedY, ...derivedPointMeta } = derivedPoints[p];
      assert.deepEqual(derivedPointMeta, basePointMeta);
      assert.ok(Number.isFinite(derivedX) && derivedX >= 0 && derivedX <= 1);
      assert.ok(Number.isFinite(derivedY) && derivedY >= 0 && derivedY <= 1);
      assert.ok(Number.isFinite(baseX) && Number.isFinite(baseY));
    }
  }
}

test('wave path displacement is deterministic, caller-neutral and keeps canonical donor paths untouched', () => {
  const paths = electricDonor({ seed: 9001 });
  const initial = makePathWaveDisplacementState(paths, {
    id: 'waved',
    amplitude: 0.045,
    cycles: 2.5,
    phase: 0.125,
    endpointEnvelope: true,
  });
  const initialPathHash = hashValue(initial.paths);
  const human = run(initial, 'human');
  const machine = run(initial, 'machine');
  const humanSet = pathSet(human);
  const machineSet = pathSet(machine);

  assert.equal(human.finalStateHash, machine.finalStateHash);
  assert.equal(human.finalState.pathSourceHash, machine.finalState.pathSourceHash);
  assert.equal(human.finalState.pathWaveSourceHash, machine.finalState.pathWaveSourceHash);
  assert.equal(humanSet.pathSetHash, machineSet.pathSetHash);
  assert.equal(human.finalState.pathSourceHash, initialPathHash);
  assert.deepEqual(human.finalState.paths, paths);
  assert.deepEqual(machine.finalState.paths, paths);
  assert.equal(humanSet.derived, true);
  assert.equal(humanSet.rebuildable, true);
  assert.ok(humanSet.maxDisplacement > 0);
  assertPathMetadataPreserved(paths, humanSet.paths);
});

test('zero amplitude is an exact derived no-op with independent retained wave lineage', () => {
  const paths = electricDonor({ seed: 44, branchCount: 4 });
  const result = run(makePathWaveDisplacementState(paths, {
    id: 'waved',
    amplitude: 0,
    cycles: 17.5,
    phase: 0.37,
    endpointEnvelope: false,
  }));
  const waved = pathSet(result);

  assert.deepEqual(waved.paths, paths);
  assert.equal(waved.maxDisplacement, 0);
  assert.equal(waved.pathSourceHash, hashValue(paths));
  assert.equal(waved.displacementSourceHash, result.finalState.pathWaveSourceHash);
});

test('one local-normal contract waves horizontal and vertical paths without absorbing consumer meaning', () => {
  const horizontal = [{
    id: 'horizontal',
    role: 'generic',
    points: [
      { x: 0.1, y: 0.5, tag: 'start' },
      { x: 0.3, y: 0.5 },
      { x: 0.5, y: 0.5 },
      { x: 0.7, y: 0.5 },
      { x: 0.9, y: 0.5, tag: 'end' },
    ],
  }];
  const vertical = [{
    id: 'vertical',
    role: 'generic',
    points: [
      { x: 0.5, y: 0.1, tag: 'start' },
      { x: 0.5, y: 0.3 },
      { x: 0.5, y: 0.5 },
      { x: 0.5, y: 0.7 },
      { x: 0.5, y: 0.9, tag: 'end' },
    ],
  }];
  const options = { id: 'waved', amplitude: 0.08, cycles: 1, phase: 0, endpointEnvelope: true };
  const horizontalSet = pathSet(run(makePathWaveDisplacementState(horizontal, options)));
  const verticalSet = pathSet(run(makePathWaveDisplacementState(vertical, options)));

  assert.deepEqual(horizontalSet.paths[0].points[0], horizontal[0].points[0]);
  assert.deepEqual(horizontalSet.paths[0].points.at(-1), horizontal[0].points.at(-1));
  assert.deepEqual(verticalSet.paths[0].points[0], vertical[0].points[0]);
  assert.deepEqual(verticalSet.paths[0].points.at(-1), vertical[0].points.at(-1));

  assert.equal(horizontalSet.paths[0].points[1].x, horizontal[0].points[1].x);
  assert.notEqual(horizontalSet.paths[0].points[1].y, horizontal[0].points[1].y);
  assert.equal(verticalSet.paths[0].points[1].y, vertical[0].points[1].y);
  assert.notEqual(verticalSet.paths[0].points[1].x, vertical[0].points[1].x);
  assert.notEqual(horizontalSet.pathSetHash, verticalSet.pathSetHash);
  assertPathMetadataPreserved(horizontal, horizontalSet.paths);
  assertPathMetadataPreserved(vertical, verticalSet.paths);
});

test('wave phase follows normalized polyline arc length rather than point index spacing', () => {
  const paths = [{
    id: 'uneven',
    points: [
      { x: 0.1, y: 0.5 },
      { x: 0.2, y: 0.5 },
      { x: 0.8, y: 0.5 },
      { x: 0.9, y: 0.5 },
    ],
  }];
  const result = run(makePathWaveDisplacementState(paths, {
    id: 'waved',
    amplitude: 0.1,
    cycles: 1,
    phase: 0,
    endpointEnvelope: false,
  }));
  const points = pathSet(result).paths[0].points;

  assert.equal(points[0].y, 0.5);
  assert.ok(Math.abs(points[1].y - 0.570711) < 0.000002);
  assert.ok(Math.abs(points[2].y - 0.429289) < 0.000002);
  assert.equal(points[3].y, 0.5);
});

test('phase and cycle edits change only derived wave treatment while retaining identical path truth', () => {
  const paths = electricDonor({ seed: 1776 });
  const a = run(makePathWaveDisplacementState(paths, {
    id: 'waved', amplitude: 0.055, cycles: 1.5, phase: 0.1,
  }));
  const b = run(makePathWaveDisplacementState(paths, {
    id: 'waved', amplitude: 0.055, cycles: 3.25, phase: 0.45,
  }));

  assert.equal(a.finalState.pathSourceHash, b.finalState.pathSourceHash);
  assert.notEqual(a.finalState.pathWaveSourceHash, b.finalState.pathWaveSourceHash);
  assert.notEqual(pathSet(a).pathSetHash, pathSet(b).pathSetHash);
  assert.deepEqual(a.finalState.paths, paths);
  assert.deepEqual(b.finalState.paths, paths);
});

test('self-consistent semantic source tampering and ordinary lineage drift are rejected', () => {
  const paths = electricDonor({ seed: 1234, branchCount: 5 });
  const normalized = normalizePathWaveDisplacementHand.execute(makePathWaveDisplacementState(paths, {
    id: 'waved', amplitude: 0.05, cycles: 2.25, phase: 0.2,
  }), {}).state;

  const pathDrift = structuredClone(normalized);
  pathDrift.paths[0].points[1].x = Number((pathDrift.paths[0].points[1].x + 0.01).toFixed(6));
  assert.throws(() => buildWaveDisplacedPathSetHand.execute(pathDrift, {}), /path wave retained path state hash mismatch/);

  const semanticTamper = structuredClone(normalized);
  semanticTamper.pathWaveSource.algorithm = 'index-space-sine2d';
  semanticTamper.pathWaveSourceHash = hashValue(semanticTamper.pathWaveSource);
  assert.throws(() => buildWaveDisplacedPathSetHand.execute(semanticTamper, {}), /path wave displacement algorithm mismatch/);

  const tangentTamper = structuredClone(normalized);
  tangentTamper.pathWaveSource.tangentMethod = 'forward-only';
  tangentTamper.pathWaveSourceHash = hashValue(tangentTamper.pathWaveSource);
  assert.throws(() => buildWaveDisplacedPathSetHand.execute(tangentTamper, {}), /path wave tangent method mismatch/);
});

test('malformed controls, path sources and oversized derived working sets fail explicitly', () => {
  const paths = electricDonor({ seed: 321, branchCount: 4 });

  assert.throws(
    () => run(makePathWaveDisplacementState([{ id: 'broken', points: [{ x: 0.5, y: 0.5 }] }])),
    /requires at least two points/,
  );
  assert.throws(
    () => run(makePathWaveDisplacementState(paths, { amplitude: 0.51 })),
    /pathWaveRequest\.amplitude must be within \[0,0.5\]/,
  );
  assert.throws(
    () => run(makePathWaveDisplacementState(paths, { cycles: 65 })),
    /pathWaveRequest\.cycles must be within \[0,64\]/,
  );
  assert.throws(
    () => run(makePathWaveDisplacementState(paths, { endpointEnvelope: 'yes' })),
    /pathWaveRequest\.endpointEnvelope must be boolean/,
  );

  const totalPoints = paths.reduce((sum, path) => sum + path.points.length, 0);
  assert.ok(totalPoints > 4);
  assert.throws(
    () => run(makePathWaveDisplacementState(paths), 'test', graphWithPointBudget(4)),
    new RegExp(`pathWave point budget exceeded: ${totalPoints} > 4`),
  );
});
