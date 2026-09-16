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
  PATH_FLOW_DISPLACEMENT_GRAPH,
  PATH_FLOW_DISPLACEMENT_HANDS,
  buildFlowGuidedPathSetHand,
  makePathFlowDisplacementState,
  normalizePathFlowDisplacementHand,
} from '../src/path-flow-displacement.mjs';

const registry = createHandRegistry(PATH_FLOW_DISPLACEMENT_HANDS);

function electricDonor({ seed = 1337, source, target, branchCount = 6 } = {}) {
  let state = makeElectricInitialState(seed);
  if (source) state.effect.source = source;
  if (target) state.effect.target = target;
  state = seedPathHand.execute(state, { segments: 18, jitter: 0.055 }).state;
  state = branchPathHand.execute(state, { branchCount, spread: 0.11 }).state;
  state = energyHand.execute(state, { trunkWidth: 1 }).state;
  return structuredClone(state.paths);
}

function run(state, callerKind = 'test', graph = PATH_FLOW_DISPLACEMENT_GRAPH) {
  return executeHandGraph({ registry, graph, initialState: state, context: { callerKind } });
}

function pathSet(result, id = 'guided') {
  return result.finalState.flowGuidedPathSets[id];
}

function graphWithPointBudget(maxPoints) {
  return {
    ...PATH_FLOW_DISPLACEMENT_GRAPH,
    stages: [
      PATH_FLOW_DISPLACEMENT_GRAPH.stages[0],
      { id: 'build-flow-guided-paths', hand: 'fx.path.flow-displacement-build', params: { maxPoints } },
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

test('flow-guided path displacement is deterministic, caller-neutral and keeps canonical donor paths untouched', () => {
  const paths = electricDonor({ seed: 9001 });
  const initial = makePathFlowDisplacementState(paths, {
    id: 'guided',
    amplitude: 0.07,
    flow: { id: 'guide-flow', mode: 'tangent', strength: 1.1, sampleStep: 0.0125 },
    field: { id: 'guide-field', seed: 8128, frequency: 5.25, octaves: 5, lacunarity: 2.1, gain: 0.52 },
  });
  const initialPathHash = hashValue(initial.paths);
  const human = run(initial, 'human');
  const machine = run(initial, 'machine');
  const humanSet = pathSet(human);
  const machineSet = pathSet(machine);

  assert.equal(human.finalStateHash, machine.finalStateHash);
  assert.equal(human.finalState.pathSourceHash, machine.finalState.pathSourceHash);
  assert.equal(human.finalState.pathFlowSourceHash, machine.finalState.pathFlowSourceHash);
  assert.equal(humanSet.pathSetHash, machineSet.pathSetHash);
  assert.equal(human.finalState.pathSourceHash, initialPathHash);
  assert.deepEqual(human.finalState.paths, paths);
  assert.deepEqual(machine.finalState.paths, paths);
  assert.equal(humanSet.derived, true);
  assert.equal(humanSet.rebuildable, true);
  assert.ok(humanSet.maxDisplacement > 0);
  assertPathMetadataPreserved(paths, humanSet.paths);
});

test('zero amplitude is an exact derived no-op while retaining independent lineage', () => {
  const paths = electricDonor({ seed: 44, branchCount: 4 });
  const result = run(makePathFlowDisplacementState(paths, {
    id: 'guided',
    amplitude: 0,
    flow: { id: 'zero-flow', mode: 'gradient', strength: 1.5 },
    field: { id: 'zero-field', seed: 2026, frequency: 7 },
  }));
  const guided = pathSet(result);

  assert.deepEqual(guided.paths, paths);
  assert.equal(guided.maxDisplacement, 0);
  assert.equal(guided.pathSourceHash, hashValue(paths));
  assert.equal(guided.displacementSourceHash, result.finalState.pathFlowSourceHash);
  assert.equal(guided.flowSourceHash, result.finalState.flowSourceHash);
});

test('one path-flow contract handles diagonal and near-vertical electric donors without absorbing electric meaning', () => {
  const diagonal = electricDonor({
    seed: 73,
    source: { x: 0.08, y: 0.72 },
    target: { x: 0.92, y: 0.24 },
  });
  const vertical = electricDonor({
    seed: 73,
    source: { x: 0.48, y: 0.08 },
    target: { x: 0.53, y: 0.92 },
  });
  const common = {
    id: 'guided',
    amplitude: 0.06,
    endpointEnvelope: true,
    flow: { id: 'shared-flow', mode: 'tangent', strength: 0.95 },
    field: { id: 'shared-field', seed: 5150, frequency: 4.25, octaves: 6, gain: 0.57 },
  };
  const a = pathSet(run(makePathFlowDisplacementState(diagonal, common)));
  const b = pathSet(run(makePathFlowDisplacementState(vertical, common)));

  assert.equal(a.pathCount, diagonal.length);
  assert.equal(b.pathCount, vertical.length);
  assert.ok(a.maxDisplacement > 0);
  assert.ok(b.maxDisplacement > 0);
  assert.notEqual(a.pathSetHash, b.pathSetHash);
  assertPathMetadataPreserved(diagonal, a.paths);
  assertPathMetadataPreserved(vertical, b.paths);

  for (const [base, derived] of [[diagonal, a.paths], [vertical, b.paths]]) {
    for (let i = 0; i < base.length; i += 1) {
      assert.deepEqual(derived[i].points[0], base[i].points[0]);
      assert.deepEqual(derived[i].points.at(-1), base[i].points.at(-1));
    }
  }
});

test('gradient and tangent flow produce distinct derived geometry from the same retained path and scalar truth', () => {
  const paths = electricDonor({ seed: 1776 });
  const common = {
    id: 'guided',
    amplitude: 0.09,
    endpointEnvelope: true,
    field: { id: 'same-field', seed: 123, frequency: 6.5, octaves: 4, lacunarity: 2.2, gain: 0.48 },
  };
  const gradient = run(makePathFlowDisplacementState(paths, {
    ...common,
    flow: { id: 'gradient-flow', mode: 'gradient', strength: 1.2, sampleStep: 0.01 },
  }));
  const tangent = run(makePathFlowDisplacementState(paths, {
    ...common,
    flow: { id: 'tangent-flow', mode: 'tangent', strength: 1.2, sampleStep: 0.01 },
  }));

  assert.equal(gradient.finalState.pathSourceHash, tangent.finalState.pathSourceHash);
  assert.equal(gradient.finalState.fieldSourceHash, tangent.finalState.fieldSourceHash);
  assert.notEqual(gradient.finalState.flowSourceHash, tangent.finalState.flowSourceHash);
  assert.notDeepEqual(pathSet(gradient).paths, pathSet(tangent).paths);
  assert.deepEqual(gradient.finalState.paths, paths);
  assert.deepEqual(tangent.finalState.paths, paths);
});

test('endpoint envelope is an explicit neutral topology-preservation control', () => {
  const paths = [{
    id: 'simple-path',
    role: 'generic',
    points: [
      { x: 0.12, y: 0.16, tag: 'start' },
      { x: 0.42, y: 0.56, tag: 'middle' },
      { x: 0.88, y: 0.81, tag: 'end' },
    ],
  }];
  const common = {
    id: 'guided',
    amplitude: 0.12,
    flow: { id: 'endpoint-flow', mode: 'gradient', strength: 1.4 },
    field: { id: 'endpoint-field', seed: 777, frequency: 3.75 },
  };
  const pinned = pathSet(run(makePathFlowDisplacementState(paths, { ...common, endpointEnvelope: true })));
  const unpinned = pathSet(run(makePathFlowDisplacementState(paths, { ...common, endpointEnvelope: false })));

  assert.deepEqual(pinned.paths[0].points[0], paths[0].points[0]);
  assert.deepEqual(pinned.paths[0].points.at(-1), paths[0].points.at(-1));
  assert.notDeepEqual(pinned.paths[0].points[1], paths[0].points[1]);
  assert.notDeepEqual(unpinned.paths[0].points, pinned.paths[0].points);
  assert.equal(unpinned.paths[0].points[0].tag, 'start');
  assert.equal(unpinned.paths[0].points.at(-1).tag, 'end');
});

test('lineage drift, malformed sources and oversized derived path sets fail explicitly', () => {
  const paths = electricDonor({ seed: 1234, branchCount: 5 });
  const normalized = normalizePathFlowDisplacementHand.execute(makePathFlowDisplacementState(paths, {
    id: 'guided',
    amplitude: 0.05,
    flow: { id: 'lineage-flow', mode: 'tangent' },
    field: { id: 'lineage-field', seed: 321 },
  }), {}).state;

  const pathDrift = structuredClone(normalized);
  pathDrift.paths[0].points[1].x = Number((pathDrift.paths[0].points[1].x + 0.01).toFixed(6));
  assert.throws(() => buildFlowGuidedPathSetHand.execute(pathDrift, {}), /path flow retained path state hash mismatch/);

  const fieldDrift = structuredClone(normalized);
  fieldDrift.fieldSource.frequency += 0.25;
  assert.throws(() => buildFlowGuidedPathSetHand.execute(fieldDrift, {}), /path flow scalar source state hash mismatch/);

  const flowDrift = structuredClone(normalized);
  flowDrift.flowSource.strength += 0.25;
  assert.throws(() => buildFlowGuidedPathSetHand.execute(flowDrift, {}), /path flow vector source state hash mismatch/);

  const sourceDrift = structuredClone(normalized);
  sourceDrift.pathFlowSource.amplitude += 0.01;
  assert.throws(() => buildFlowGuidedPathSetHand.execute(sourceDrift, {}), /path flow displacement source state hash mismatch/);

  assert.throws(
    () => run(makePathFlowDisplacementState([{ id: 'broken', points: [{ x: 0.5, y: 0.5 }] }])),
    /requires at least two points/,
  );
  assert.throws(
    () => run(makePathFlowDisplacementState(paths, { amplitude: 0.51 })),
    /pathFlowRequest\.amplitude must be within \[0,0.5\]/,
  );
  assert.throws(
    () => run(makePathFlowDisplacementState(paths, { endpointEnvelope: 'yes' })),
    /pathFlowRequest\.endpointEnvelope must be boolean/,
  );

  const totalPoints = paths.reduce((sum, path) => sum + path.points.length, 0);
  assert.ok(totalPoints > 4);
  assert.throws(
    () => run(makePathFlowDisplacementState(paths), 'test', graphWithPointBudget(4)),
    new RegExp(`pathFlow point budget exceeded: ${totalPoints} > 4`),
  );
});
