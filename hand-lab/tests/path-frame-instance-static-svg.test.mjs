import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph, hashValue } from '../src/hand-runtime.mjs';
import { makePathSweepFrameState } from '../src/path-sweep-frame2d.mjs';
import {
  PATH_FRAME_INSTANCE_STATIC_SVG_HANDS,
  makePathFrameInstanceStaticSvgGraph,
  realizePathFrameInstancesStaticSvgHand,
} from '../src/path-frame-instance-static-svg.mjs';

const registry = createHandRegistry(PATH_FRAME_INSTANCE_STATIC_SVG_HANDS);
const arrowPrototype = [
  { x: -1, y: -0.45 },
  { x: 1, y: 0 },
  { x: -1, y: 0.45 },
];
const fixtureProvenance = 'AXM hand-lab authored test fixture';

function options(overrides = {}) {
  return {
    prototypeId: 'neutral-arrow-polyline',
    prototypePoints: arrowPrototype,
    prototypeProvenance: fixtureProvenance,
    width: 320,
    height: 240,
    padding: 20,
    markerSize: 8,
    ...overrides,
  };
}

function run(state, callerKind = 'test', overrides = {}) {
  return executeHandGraph({
    registry,
    graph: makePathFrameInstanceStaticSvgGraph(options(overrides)),
    initialState: state,
    context: { callerKind },
  });
}

function realization(result) {
  return result.finalState.realizations.pathFrameInstancesStaticSvg;
}

function instanceSet(result, id = 'sweep') {
  return result.finalState.pathFrameInstanceTransformSets[id];
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

const genericPaths = [
  {
    id: 'primary',
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

test('path-frame instance SVG is deterministic and caller-neutral while retained geometry truth stays unchanged', () => {
  const initial = makePathSweepFrameState(genericPaths, { id: 'sweep', halfWidth: 0.025 });
  const human = run(initial, 'human');
  const machine = run(initial, 'machine');
  const humanSvg = realization(human);
  const machineSvg = realization(machine);

  assert.equal(human.finalStateHash, machine.finalStateHash);
  assert.equal(humanSvg.content, machineSvg.content);
  assert.equal(humanSvg.contentHash, machineSvg.contentHash);
  assert.deepEqual(human.finalState.paths, genericPaths);
  assert.equal(humanSvg.pathSourceHash, human.finalState.pathSourceHash);
  assert.equal(humanSvg.sweepSourceHash, human.finalState.pathSweepFrameSourceHash);
  assert.equal(humanSvg.instanceSetHash, instanceSet(human).instanceSetHash);
  assert.equal(humanSvg.derived, true);
  assert.equal(humanSvg.replaceable, true);
  assert.equal(humanSvg.prototype.rendererOnly, true);
  assert.equal(humanSvg.prototype.canonical, false);
  assert.equal(humanSvg.prototype.provenanceStatus, 'CALLER_DECLARED_NOT_VERIFIED_BY_HAND');
});

test('renderer expresses verified horizontal and vertical bases with the same external local polyline', () => {
  const paths = [
    { id: 'horizontal', points: [{ x: 0.1, y: 0.25 }, { x: 0.9, y: 0.25 }] },
    { id: 'vertical', points: [{ x: 0.7, y: 0.1 }, { x: 0.7, y: 0.9 }] },
  ];
  const result = run(
    makePathSweepFrameState(paths, { id: 'sweep', halfWidth: 0.04 }),
    'test',
    {
      width: 200,
      height: 200,
      padding: 20,
      markerSize: 10,
      prototypePoints: [{ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0.5 }],
    },
  );
  const content = realization(result).content;

  assert.match(content, /data-path-id="horizontal" data-frame-index="0" points="26,60 46,60 36,65"/);
  assert.match(content, /data-path-id="vertical" data-frame-index="0" points="132,26 132,46 127,36"/);
});

test('prototype and renderer controls stay disposable while canonical and instance lineages remain identical', () => {
  const initial = makePathSweepFrameState(genericPaths, { id: 'sweep', halfWidth: 0.02 });
  const arrow = run(initial, 'test', { markerSize: 6 });
  const chevron = run(initial, 'test', {
    markerSize: 11,
    prototypeId: 'neutral-chevron',
    prototypePoints: [{ x: -1, y: -0.5 }, { x: 0, y: 0 }, { x: -1, y: 0.5 }],
  });
  const arrowSvg = realization(arrow);
  const chevronSvg = realization(chevron);

  assert.equal(arrow.finalState.pathSourceHash, chevron.finalState.pathSourceHash);
  assert.equal(arrow.finalState.pathSweepFrameSourceHash, chevron.finalState.pathSweepFrameSourceHash);
  assert.equal(instanceSet(arrow).instanceSetHash, instanceSet(chevron).instanceSetHash);
  assert.notEqual(arrowSvg.prototype.prototypeHash, chevronSvg.prototype.prototypeHash);
  assert.notEqual(arrowSvg.contentHash, chevronSvg.contentHash);
  assert.equal(arrowSvg.rendererMapping.canonicalAuthority, 'none');
  assert.equal(arrowSvg.rendererMapping.prototypeBinding, 'renderer-only-external');
});

test('self-consistently rehashed derived instance tampering is rejected before SVG realization', () => {
  const result = run(makePathSweepFrameState(genericPaths, { id: 'sweep', halfWidth: 0.02 }));
  const tamperedState = structuredClone(result.finalState);
  delete tamperedState.realizations.pathFrameInstancesStaticSvg;
  const tampered = tamperedState.pathFrameInstanceTransformSets.sweep;
  tampered.paths[0].instances[1].basisX.x = 0.123456;
  tampered.instanceSetHash = hashValue(instanceSetHashPayload(tampered));

  assert.throws(
    () => realizePathFrameInstancesStaticSvgHand.execute(tamperedState, options()),
    /does not rebuild from verified frame truth/,
  );
});

test('retained path drift is rejected even when a previously derived instance set is present', () => {
  const result = run(makePathSweepFrameState(genericPaths, { id: 'sweep', halfWidth: 0.02 }));
  const drift = structuredClone(result.finalState);
  delete drift.realizations.pathFrameInstancesStaticSvg;
  drift.paths[0].points[1].x = 0.41;

  assert.throws(
    () => realizePathFrameInstancesStaticSvgHand.execute(drift, options()),
    /retained path state hash mismatch/,
  );
});

test('prototype identity, provenance and bounded local geometry are explicit renderer requirements', () => {
  const result = run(makePathSweepFrameState(genericPaths, { id: 'sweep' }));
  const state = result.finalState;

  assert.throws(
    () => realizePathFrameInstancesStaticSvgHand.execute(state, { ...options(), prototypeId: '' }),
    /prototypeId must be a non-empty string/,
  );
  assert.throws(
    () => realizePathFrameInstancesStaticSvgHand.execute(state, { ...options(), prototypeProvenance: '' }),
    /prototypeProvenance must be a non-empty string/,
  );
  assert.throws(
    () => realizePathFrameInstancesStaticSvgHand.execute(state, { ...options(), prototypePoints: [{ x: 0, y: 0 }] }),
    /prototypePoints must contain 2\.\.32 points/,
  );
  assert.throws(
    () => realizePathFrameInstancesStaticSvgHand.execute(state, {
      ...options(),
      prototypePoints: [{ x: -5, y: 0 }, { x: 1, y: 0 }],
    }),
    /prototypePoints\[0\]\.x must be within \[-4,4\]/,
  );
});

test('renderer work budgets fail explicitly before unbounded SVG point expansion', () => {
  const result = run(makePathSweepFrameState(genericPaths, { id: 'sweep' }));
  const state = result.finalState;

  assert.throws(
    () => realizePathFrameInstancesStaticSvgHand.execute(state, options({ maxInstances: 2 })),
    /path frame instance budget exceeded: 7 > 2/,
  );
  assert.throws(
    () => realizePathFrameInstancesStaticSvgHand.execute(state, options({ maxOutputPoints: 20 })),
    /path frame instance SVG output-point budget exceeded: 21 > 20/,
  );
});
