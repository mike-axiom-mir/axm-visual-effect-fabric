import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph, hashValue } from '../src/hand-runtime.mjs';
import {
  CONTOUR_FIELD2D_HANDS,
  CONTOUR_FIELD2D_GRAPH,
  normalizeContourSourceHand,
  buildContourSegmentSetHand,
  realizeContourStaticSvgHand,
  makeContourFieldState,
} from '../src/contour-field2d.mjs';
import { normalizeScalarFieldRequestHand } from '../src/field-operators.mjs';

const registry = createHandRegistry(CONTOUR_FIELD2D_HANDS);

function initial(overrides = {}) {
  const state = makeContourFieldState({
    fieldId: 'fixture-field',
    id: 'fixture-contours',
    seed: 2468,
    frequency: 3.25,
    octaves: 4,
    levels: [0.35, 0.5, 0.65],
    ...overrides,
  });
  state.consumerMetadata = { untouched: true, label: 'neutral-fixture' };
  return state;
}

function run(state, callerKind = 'human') {
  return executeHandGraph({ registry, graph: CONTOUR_FIELD2D_GRAPH, initialState: state, context: { callerKind } });
}

function normalize(state) {
  const field = normalizeScalarFieldRequestHand.execute(state, {}, {}).state;
  return normalizeContourSourceHand.execute(field, {}, {}).state;
}

test('human and machine callers produce identical retained sources, contour segments and SVG', () => {
  const human = run(initial(), 'human');
  const machine = run(initial(), 'machine');
  assert.equal(human.finalState.fieldSourceHash, machine.finalState.fieldSourceHash);
  assert.equal(human.finalState.contourSourceHash, machine.finalState.contourSourceHash);
  assert.equal(human.finalState.contourSegmentSets['fixture-contours'].segmentSetHash, machine.finalState.contourSegmentSets['fixture-contours'].segmentSetHash);
  assert.equal(human.finalState.realizations.contourStaticSvg.content, machine.finalState.realizations.contourStaticSvg.content);
  assert.deepEqual(human.finalState.consumerMetadata, initial().consumerMetadata);
});

test('working-set resolution and renderer controls remain derived instead of rewriting source truth', () => {
  const normalized = normalize(initial());
  const fieldHash = normalized.fieldSourceHash;
  const sourceHash = normalized.contourSourceHash;
  const sourceSnapshot = structuredClone(normalized.contourSource);

  const coarse = buildContourSegmentSetHand.execute(normalized, { columns: 12, rows: 8, maxCellLevelProbes: 4096, maxSegments: 4096 }, {}).state;
  const dense = buildContourSegmentSetHand.execute(normalized, { columns: 48, rows: 32, maxCellLevelProbes: 8192, maxSegments: 8192 }, {}).state;
  assert.equal(coarse.fieldSourceHash, fieldHash);
  assert.equal(dense.fieldSourceHash, fieldHash);
  assert.equal(coarse.contourSourceHash, sourceHash);
  assert.equal(dense.contourSourceHash, sourceHash);
  assert.deepEqual(coarse.contourSource, sourceSnapshot);
  assert.notEqual(coarse.contourSegmentSets['fixture-contours'].segmentSetHash, dense.contourSegmentSets['fixture-contours'].segmentSetHash);

  const a = realizeContourStaticSvgHand.execute(coarse, { width: 320, height: 240, strokeWidth: 0.5, opacity: 0.4 }, {}).state;
  const b = realizeContourStaticSvgHand.execute(coarse, { width: 900, height: 500, strokeWidth: 3, opacity: 1 }, {}).state;
  assert.equal(a.contourSourceHash, b.contourSourceHash);
  assert.equal(a.contourSegmentSets['fixture-contours'].segmentSetHash, b.contourSegmentSets['fixture-contours'].segmentSetHash);
  assert.notEqual(a.realizations.contourStaticSvg.content, b.realizations.contourStaticSvg.content);
});

test('contour levels change retained treatment without rewriting scalar-field truth', () => {
  const lowMidHigh = run(initial({ levels: [0.3, 0.5, 0.7] }));
  const middleBand = run(initial({ levels: [0.42, 0.58] }));
  assert.equal(lowMidHigh.finalState.fieldSourceHash, middleBand.finalState.fieldSourceHash);
  assert.notEqual(lowMidHigh.finalState.contourSourceHash, middleBand.finalState.contourSourceHash);
  assert.notEqual(lowMidHigh.finalState.contourSegmentSets['fixture-contours'].segmentSetHash, middleBand.finalState.contourSegmentSets['fixture-contours'].segmentSetHash);
  assert.notEqual(lowMidHigh.finalState.realizations.contourStaticSvg.content, middleBand.finalState.realizations.contourStaticSvg.content);
});

test('materially different scalar fields remain distinct under the same contour contract', () => {
  const broad = run(initial({ seed: 7, frequency: 1.25, octaves: 2 }));
  const busy = run(initial({ seed: 9001, frequency: 9, octaves: 6 }));
  assert.notEqual(broad.finalState.fieldSourceHash, busy.finalState.fieldSourceHash);
  assert.notEqual(broad.finalState.contourSourceHash, busy.finalState.contourSourceHash);
  assert.notEqual(broad.finalState.contourSegmentSets['fixture-contours'].segmentSetHash, busy.finalState.contourSegmentSets['fixture-contours'].segmentSetHash);
  assert.notEqual(broad.finalState.realizations.contourStaticSvg.content, busy.finalState.realizations.contourStaticSvg.content);
});

test('derived contour endpoints remain bounded and segments retain exact level and cell identity', () => {
  const result = run(initial());
  const segmentSet = result.finalState.contourSegmentSets['fixture-contours'];
  assert.ok(segmentSet.segmentCount > 0);
  for (const segment of segmentSet.segments) {
    assert.ok(Number.isInteger(segment.levelIndex));
    assert.equal(segment.level, result.finalState.contourSource.levels[segment.levelIndex]);
    assert.ok(Number.isInteger(segment.column) && segment.column >= 0 && segment.column < segmentSet.columns);
    assert.ok(Number.isInteger(segment.row) && segment.row >= 0 && segment.row < segmentSet.rows);
    for (const point of [segment.start, segment.end]) {
      assert.equal(point.length, 2);
      assert.ok(point[0] >= 0 && point[0] <= 1);
      assert.ok(point[1] >= 0 && point[1] <= 1);
    }
    assert.ok(segment.length >= 0);
  }
});

test('field, treatment and derived-segment lineage drift are rejected before realization', () => {
  const normalized = normalize(initial());
  const built = buildContourSegmentSetHand.execute(normalized, { columns: 12, rows: 8, maxSegments: 4096 }, {}).state;

  const fieldDrift = structuredClone(built);
  fieldDrift.fieldSource.frequency = 9;
  assert.throws(() => realizeContourStaticSvgHand.execute(fieldDrift, {}, {}), /scalar field source hash mismatch/);

  const sourceDrift = structuredClone(built);
  sourceDrift.contourSource.levels[0] = 0.2;
  assert.throws(() => realizeContourStaticSvgHand.execute(sourceDrift, {}, {}), /contour source hash mismatch/);

  const segmentDrift = structuredClone(built);
  segmentDrift.contourSegmentSets['fixture-contours'].segments[0].start[0] += 0.01;
  assert.throws(() => realizeContourStaticSvgHand.execute(segmentDrift, {}, {}), /contour segment set hash mismatch/);
});

test('invalid contour controls and structural budgets fail loudly', () => {
  const field = normalizeScalarFieldRequestHand.execute(initial(), {}, {}).state;

  const repeated = structuredClone(field);
  repeated.contourRequest.levels = [0.5, 0.5];
  assert.throws(() => normalizeContourSourceHand.execute(repeated, {}, {}), /strictly increasing/);

  const unsorted = structuredClone(field);
  unsorted.contourRequest.levels = [0.7, 0.3];
  assert.throws(() => normalizeContourSourceHand.execute(unsorted, {}, {}), /strictly increasing/);

  const outOfRange = structuredClone(field);
  outOfRange.contourRequest.levels = [0, 0.5];
  assert.throws(() => normalizeContourSourceHand.execute(outOfRange, {}, {}), /within \[0.01,0.99\]/);

  const normalized = normalize(initial());
  assert.throws(() => buildContourSegmentSetHand.execute(normalized, { columns: 256, rows: 256, maxCellLevelProbes: 65536 }, {}), /probe budget exceeded/);
  assert.throws(() => buildContourSegmentSetHand.execute(normalized, { columns: 257, rows: 8 }, {}), /within \[2,256\]/);
  assert.throws(() => buildContourSegmentSetHand.execute(normalized, { columns: 8, rows: 8, maxSegments: 32769 }, {}), /within \[1,32768\]/);
});

test('artifact hash binds exact SVG to field, treatment and contour-segment lineage', () => {
  const result = run(initial());
  const realization = result.finalState.realizations.contourStaticSvg;
  const segmentSet = result.finalState.contourSegmentSets['fixture-contours'];
  assert.equal(result.checkpoints.at(-1).evidence.artifactHash, hashValue(realization.content));
  assert.equal(realization.artifactHash, hashValue(realization.content));
  assert.equal(realization.fieldSourceHash, result.finalState.fieldSourceHash);
  assert.equal(realization.sourceHash, result.finalState.contourSourceHash);
  assert.equal(realization.segmentSetHash, segmentSet.segmentSetHash);
  assert.equal(segmentSet.cellLevelProbes, 48 * 32 * 3);
  assert.ok(segmentSet.segmentCount > 0 && segmentSet.segmentCount <= 32768);
  assert.match(realization.content, /<svg/);
  assert.match(realization.content, /data-level=/);
});
