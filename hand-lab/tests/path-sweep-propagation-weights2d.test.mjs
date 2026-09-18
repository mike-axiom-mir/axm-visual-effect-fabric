import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph, hashValue } from '../src/hand-runtime.mjs';
import {
  PATH_SWEEP_PROPAGATION_WEIGHTS_2D_GRAPH,
  PATH_SWEEP_PROPAGATION_WEIGHTS_2D_HANDS,
  buildPathSweepPropagationWeightSetHand,
  makePathSweepPropagationWeightState,
  validatePathSweepPropagationWeightSet,
} from '../src/path-sweep-propagation-weights2d.mjs';

const registry = createHandRegistry(PATH_SWEEP_PROPAGATION_WEIGHTS_2D_HANDS);

function run(state, callerKind = 'test', graph = PATH_SWEEP_PROPAGATION_WEIGHTS_2D_GRAPH) {
  return executeHandGraph({ registry, graph, initialState: state, context: { callerKind } });
}

function weightSet(result, sweepId = 'sweep', propagationId = 'front') {
  return result.finalState.pathSweepPropagationWeightSets[`${sweepId}::${propagationId}`];
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

function weightSetHashPayload(set) {
  return {
    schema: set.schema,
    sweepSourceHash: set.sweepSourceHash,
    pathSourceHash: set.pathSourceHash,
    frameSetHash: set.frameSetHash,
    ribbonSetHash: set.ribbonSetHash,
    indexedStripSetHash: set.indexedStripSetHash,
    propagationSourceHash: set.propagationSourceHash,
    phase: set.phase,
    pathCount: set.pathCount,
    pointCount: set.pointCount,
    vertexCount: set.vertexCount,
    minWeight: set.minWeight,
    maxWeight: set.maxWeight,
    semantics: set.semantics,
    paths: set.paths,
    provenance: set.provenance,
    derived: set.derived,
    rebuildable: set.rebuildable,
  };
}

function graphWithBridgeParams(params) {
  return {
    ...PATH_SWEEP_PROPAGATION_WEIGHTS_2D_GRAPH,
    stages: PATH_SWEEP_PROPAGATION_WEIGHTS_2D_GRAPH.stages.map((stage) => (
      stage.id === 'build-path-sweep-propagation-weight-set'
        ? { ...stage, params: { ...stage.params, ...params } }
        : stage
    )),
  };
}

const genericPaths = [
  {
    id: 'primary',
    points: [
      { x: 0.1, y: 0.2 },
      { x: 0.35, y: 0.2 },
      { x: 0.65, y: 0.45 },
      { x: 0.9, y: 0.7 },
    ],
  },
  {
    id: 'secondary',
    points: [
      { x: 0.2, y: 0.85 },
      { x: 0.45, y: 0.65 },
      { x: 0.75, y: 0.72 },
    ],
  },
];

function initial(paths = genericPaths, options = {}) {
  return makePathSweepPropagationWeightState(paths, {
    sweepId: 'sweep',
    propagationId: 'front',
    halfWidth: options.halfWidth ?? 0.02,
    direction: options.direction ?? 'forward',
    frontSoftness: options.frontSoftness ?? 0,
  });
}

test('propagation vertex weights are deterministic, caller-neutral and preserve both retained donor lineages', () => {
  const human = run(initial(), 'human');
  const machine = run(initial(), 'machine');
  const humanSet = weightSet(human);
  const machineSet = weightSet(machine);

  assert.equal(human.finalStateHash, machine.finalStateHash);
  assert.equal(humanSet.weightSetHash, machineSet.weightSetHash);
  assert.deepEqual(human.finalState.paths, genericPaths);
  assert.equal(humanSet.indexedStripSetHash, human.finalState.pathSweepIndexedStripSets.sweep.indexedStripSetHash);
  assert.equal(humanSet.propagationSourceHash, human.finalState.propagationFrontSourceHash);
  assert.equal(humanSet.derived, true);
  assert.equal(humanSet.rebuildable, true);
  assert.equal(humanSet.semantics.materialAuthority, 'none');
  assert.equal(humanSet.semantics.rendererAuthority, 'none');
  assert.equal(humanSet.semantics.consumerAuthority, 'none');
  assert.equal(validatePathSweepPropagationWeightSet(human.finalState, humanSet), true);
});

test('weights use per-path actual arc length rather than point index and pair left/right vertices at the same source point', () => {
  const paths = [{
    id: 'line',
    points: [{ x: 0, y: 0.5 }, { x: 0.1, y: 0.5 }, { x: 1, y: 0.5 }],
  }];
  const result = run(initial(paths), 'test', graphWithBridgeParams({ phase: 0.25 }));
  const path = weightSet(result).paths[0];

  assert.equal(path.pathLength, 1);
  assert.deepEqual(path.vertices.map((vertex) => vertex.normalizedDistance), [0, 0, 0.1, 0.1, 1, 1]);
  assert.deepEqual(path.vertices.map((vertex) => vertex.weight), [1, 1, 1, 1, 0, 0]);
  assert.equal(path.vertices[2].pointIndex, 1);
  assert.equal(path.vertices[2].side, 'left');
  assert.equal(path.vertices[3].side, 'right');
});

test('independent paths each normalize over their own length without inventing a cross-path relationship', () => {
  const paths = [
    { id: 'long', points: [{ x: 0, y: 0.2 }, { x: 0.25, y: 0.2 }, { x: 1, y: 0.2 }] },
    { id: 'short', points: [{ x: 0, y: 0.8 }, { x: 0.125, y: 0.8 }, { x: 0.5, y: 0.8 }] },
  ];
  const set = weightSet(run(initial(paths), 'test', graphWithBridgeParams({ phase: 0.3 })));

  assert.equal(set.semantics.normalization, 'per-path-total-length');
  assert.equal(set.semantics.crossPathRelationship, 'none');
  assert.deepEqual(set.paths[0].vertices.map((vertex) => vertex.normalizedDistance), [0, 0, 0.25, 0.25, 1, 1]);
  assert.deepEqual(set.paths[1].vertices.map((vertex) => vertex.normalizedDistance), [0, 0, 0.25, 0.25, 1, 1]);
  assert.deepEqual(set.paths[0].vertices.map((vertex) => vertex.weight), set.paths[1].vertices.map((vertex) => vertex.weight));
});

test('phase remains a derived selection while retained geometry and propagation sources stay unchanged', () => {
  const first = run(initial(), 'test', graphWithBridgeParams({ phase: 0.2 }));
  const later = run(initial(), 'test', graphWithBridgeParams({ phase: 0.8 }));
  const firstSet = weightSet(first);
  const laterSet = weightSet(later);

  assert.equal(first.finalState.pathSourceHash, later.finalState.pathSourceHash);
  assert.equal(first.finalState.pathSweepFrameSourceHash, later.finalState.pathSweepFrameSourceHash);
  assert.equal(first.finalState.pathSweepIndexedStripSets.sweep.indexedStripSetHash, later.finalState.pathSweepIndexedStripSets.sweep.indexedStripSetHash);
  assert.equal(first.finalState.propagationFrontSourceHash, later.finalState.propagationFrontSourceHash);
  assert.notEqual(firstSet.weightSetHash, laterSet.weightSetHash);
  assert.notDeepEqual(firstSet.paths, laterSet.paths);
  assert.equal(firstSet.semantics.phaseSelection, 'derived-only');
});

test('self-consistently rehashed indexed-strip tampering is rejected before propagation attributes are derived', () => {
  const result = run(initial());
  const tamperedState = structuredClone(result.finalState);
  const tampered = tamperedState.pathSweepIndexedStripSets.sweep;
  tampered.paths[0].vertices[2].x += 0.01;
  tampered.indexedStripSetHash = hashValue(indexedSetHashPayload(tampered));

  assert.throws(
    () => buildPathSweepPropagationWeightSetHand.execute(tamperedState, { phase: 0.5 }),
    /does not rebuild from verified ribbon truth/,
  );
});

test('self-consistently rehashed weight tampering and semantic forgery cannot become verified effect truth', () => {
  const result = run(initial());

  const tampered = structuredClone(weightSet(result));
  tampered.paths[0].vertices[0].weight = 0.25;
  tampered.weightSetHash = hashValue(weightSetHashPayload(tampered));
  assert.throws(
    () => validatePathSweepPropagationWeightSet(result.finalState, tampered),
    /does not rebuild from verified strip and propagation truth/,
  );

  const forged = structuredClone(weightSet(result));
  forged.semantics.materialAuthority = 'emission';
  forged.weightSetHash = hashValue(weightSetHashPayload(forged));
  assert.throws(
    () => validatePathSweepPropagationWeightSet(result.finalState, forged),
    /semantic materialAuthority is invalid/,
  );
});

test('missing derivation, retained-source drift, forged propagation semantics and excessive vertex work fail explicitly', () => {
  const result = run(initial());

  const missing = structuredClone(result.finalState);
  delete missing.pathSweepIndexedStripSets.sweep;
  assert.throws(
    () => buildPathSweepPropagationWeightSetHand.execute(missing, {}),
    /require derived indexed strip set for source: sweep/,
  );

  const pathDrift = structuredClone(result.finalState);
  pathDrift.paths[0].points[1].x = 0.36;
  assert.throws(
    () => buildPathSweepPropagationWeightSetHand.execute(pathDrift, {}),
    /retained path state hash mismatch/,
  );

  const forgedPropagation = structuredClone(result.finalState);
  forgedPropagation.propagationFrontSource.outputRange = '[-1,1]';
  forgedPropagation.propagationFrontSourceHash = hashValue(forgedPropagation.propagationFrontSource);
  assert.throws(
    () => buildPathSweepPropagationWeightSetHand.execute(forgedPropagation, {}),
    /propagation front source output range is invalid/,
  );

  const threePointLine = [{ id: 'line', points: [{ x: 0, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 1, y: 0.5 }] }];
  assert.throws(
    () => run(initial(threePointLine), 'test', graphWithBridgeParams({ maxVertices: 4 })),
    /path sweep propagation vertex budget exceeded: 6 > 4/,
  );
});
