import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph, hashValue } from '../src/hand-runtime.mjs';
import {
  PATH_SWEEP_PROPAGATION_STATIC_SVG_HANDS,
  makePathSweepPropagationStaticSvgGraph,
  makePathSweepPropagationStaticSvgState,
  realizePathSweepPropagationStaticSvgHand,
} from '../src/path-sweep-propagation-static-svg.mjs';

const registry = createHandRegistry(PATH_SWEEP_PROPAGATION_STATIC_SVG_HANDS);

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
  return makePathSweepPropagationStaticSvgState(paths, {
    sweepId: 'sweep',
    propagationId: 'front',
    halfWidth: options.halfWidth ?? 0.02,
    direction: options.direction ?? 'forward',
    frontSoftness: options.frontSoftness ?? 0,
  });
}

function run(paths = genericPaths, params = {}, callerKind = 'test') {
  return executeHandGraph({
    registry,
    graph: makePathSweepPropagationStaticSvgGraph(params),
    initialState: initial(paths, params),
    context: { callerKind },
  });
}

function realization(result) {
  return result.finalState.realizations.pathSweepPropagationStaticSvg;
}

function weightSet(state) {
  return state.pathSweepPropagationWeightSets[`${state.pathSweepFrameSource.id}::${state.propagationFrontSource.id}`];
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

test('human and machine callers produce the same replaceable sweep-propagation SVG without rewriting retained truth', () => {
  const human = run(genericPaths, { phase: 0.45, frontSoftness: 0.15 }, 'human');
  const machine = run(genericPaths, { phase: 0.45, frontSoftness: 0.15 }, 'machine');
  const humanSvg = realization(human);
  const machineSvg = realization(machine);

  assert.equal(human.finalStateHash, machine.finalStateHash);
  assert.equal(humanSvg.contentHash, machineSvg.contentHash);
  assert.equal(humanSvg.derivedFromStateHash, machineSvg.derivedFromStateHash);
  assert.deepEqual(human.finalState.paths, genericPaths);
  assert.equal(humanSvg.derived, true);
  assert.equal(humanSvg.replaceable, true);
  assert.equal(humanSvg.rendererMapping.materialAuthority, 'none');
  assert.equal(humanSvg.rendererMapping.consumerAuthority, 'none');
  assert.equal(realizePathSweepPropagationStaticSvgHand.callerNeutral, true);
});

test('neutral vertex weights become flat per-segment SVG opacity and full weight remains a local renderer no-op', () => {
  const line = [{
    id: 'line',
    points: [{ x: 0, y: 0.5 }, { x: 0.1, y: 0.5 }, { x: 1, y: 0.5 }],
  }];
  const early = realization(run(line, { phase: 0.25, frontSoftness: 0 }));
  const polygons = [...early.content.matchAll(/<polygon [^>]*\/>/g)].map((match) => match[0]);

  assert.equal(polygons.length, 4);
  assert.doesNotMatch(polygons[0], / opacity=/);
  assert.doesNotMatch(polygons[1], / opacity=/);
  assert.match(polygons[2], / opacity="0.5"/);
  assert.match(polygons[3], / opacity="0.5"/);
  assert.equal(early.rendererMapping.segmentWeight, 'mean-adjacent-source-point-weight');
  assert.equal(early.rendererMapping.interpolationAuthority, 'renderer-local-flat-segment-only');

  const complete = realization(run(line, { phase: 1, frontSoftness: 0.25 }));
  for (const polygon of [...complete.content.matchAll(/<polygon [^>]*\/>/g)].map((match) => match[0])) {
    assert.doesNotMatch(polygon, / opacity=/);
  }
});

test('multiple paths stay disconnected, materially different geometry changes output, and source ids are escaped', () => {
  const multi = [
    { id: 'straight<&"', points: [{ x: 0.1, y: 0.2 }, { x: 0.5, y: 0.2 }, { x: 0.9, y: 0.2 }] },
    { id: 'turning', points: [{ x: 0.15, y: 0.8 }, { x: 0.45, y: 0.55 }, { x: 0.8, y: 0.75 }] },
  ];
  const result = run(multi, { phase: 0.55, frontSoftness: 0.1 });
  const svg = realization(result);

  assert.equal(svg.segmentCount, 4);
  assert.equal(svg.triangleCount, 8);
  assert.equal((svg.content.match(/<polygon /g) ?? []).length, 8);
  assert.equal((svg.content.match(/data-segment-index="0"/g) ?? []).length, 4);
  assert.match(svg.content, /data-path-id="straight&lt;&amp;&quot;"/);

  const allStraight = run([
    { id: 'straight-a', points: [{ x: 0.1, y: 0.2 }, { x: 0.5, y: 0.2 }, { x: 0.9, y: 0.2 }] },
    { id: 'straight-b', points: [{ x: 0.15, y: 0.8 }, { x: 0.45, y: 0.8 }, { x: 0.8, y: 0.8 }] },
  ], { phase: 0.55, frontSoftness: 0.1 });
  assert.notEqual(svg.contentHash, realization(allStraight).contentHash);
});

test('phase remains derived-only: changing it changes disposable SVG expression while retained sources and indexed geometry stay fixed', () => {
  const early = run(genericPaths, { phase: 0.2, frontSoftness: 0.15 });
  const late = run(genericPaths, { phase: 0.8, frontSoftness: 0.15 });
  const earlySvg = realization(early);
  const lateSvg = realization(late);

  assert.notEqual(earlySvg.contentHash, lateSvg.contentHash);
  assert.equal(early.finalState.pathSourceHash, late.finalState.pathSourceHash);
  assert.equal(early.finalState.pathSweepFrameSourceHash, late.finalState.pathSweepFrameSourceHash);
  assert.equal(early.finalState.pathSweepIndexedStripSets.sweep.indexedStripSetHash, late.finalState.pathSweepIndexedStripSets.sweep.indexedStripSetHash);
  assert.equal(early.finalState.propagationFrontSourceHash, late.finalState.propagationFrontSourceHash);
  assert.notEqual(weightSet(early.finalState).weightSetHash, weightSet(late.finalState).weightSetHash);
});

test('renderer controls remain disposable and do not alter verified geometry, propagation, or neutral weight state', () => {
  const built = run(genericPaths, { phase: 0.5, frontSoftness: 0.2 });
  const base = built.finalState;
  const baseWeightHash = weightSet(base).weightSetHash;
  const compact = realizePathSweepPropagationStaticSvgHand.execute(base, { width: 320, height: 240, padding: 8, fillOpacity: 0.5 }, {}).state;
  const large = realizePathSweepPropagationStaticSvgHand.execute(base, { width: 900, height: 600, padding: 40, fillOpacity: 1 }, {}).state;

  assert.notEqual(compact.realizations.pathSweepPropagationStaticSvg.contentHash, large.realizations.pathSweepPropagationStaticSvg.contentHash);
  assert.equal(weightSet(compact).weightSetHash, baseWeightHash);
  assert.equal(weightSet(large).weightSetHash, baseWeightHash);
  assert.equal(compact.pathSourceHash, large.pathSourceHash);
  assert.equal(compact.propagationFrontSourceHash, large.propagationFrontSourceHash);
});

test('self-consistently rehashed weight tampering and forged propagation semantics are rejected before rendering', () => {
  const result = run(genericPaths, { phase: 0.5, frontSoftness: 0.2 });

  const tampered = structuredClone(result.finalState);
  const set = weightSet(tampered);
  set.paths[0].vertices[0].weight = 0.123456;
  set.weightSetHash = hashValue(weightSetHashPayload(set));
  assert.throws(
    () => realizePathSweepPropagationStaticSvgHand.execute(tampered, {}, {}),
    /does not rebuild from verified strip and propagation truth/,
  );

  const forged = structuredClone(result.finalState);
  forged.propagationFrontSource.outputRange = '[-1,1]';
  forged.propagationFrontSourceHash = hashValue(forged.propagationFrontSource);
  assert.throws(
    () => realizePathSweepPropagationStaticSvgHand.execute(forged, {}, {}),
    /propagation front source output range is invalid/,
  );
});

test('retained-source drift and renderer work-budget violations fail explicitly without gaining canonical authority', () => {
  const line = [{
    id: 'line',
    points: [{ x: 0.1, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.9, y: 0.5 }],
  }];
  const result = run(line, { phase: 0.5 });
  const state = result.finalState;

  assert.throws(
    () => realizePathSweepPropagationStaticSvgHand.execute(state, { maxSegments: 1 }, {}),
    /segment budget exceeded: 2 > 1/,
  );
  assert.throws(
    () => realizePathSweepPropagationStaticSvgHand.execute(state, { maxOutputPoints: 6 }, {}),
    /output-point budget exceeded: 12 > 6/,
  );
  assert.throws(
    () => realizePathSweepPropagationStaticSvgHand.execute(state, { width: 5000 }, {}),
    /width must be an integer within \[64,4096\]/,
  );

  const drifted = structuredClone(state);
  drifted.paths[0].points[1].x = 0.55;
  assert.throws(
    () => realizePathSweepPropagationStaticSvgHand.execute(drifted, {}, {}),
    /retained path state hash mismatch/,
  );
  assert.equal(realization(result).rendererMapping.canonicalAuthority, 'none');
});
