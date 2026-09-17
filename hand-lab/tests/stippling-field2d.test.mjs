import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph, hashValue } from '../src/hand-runtime.mjs';
import {
  STIPPLING_FIELD2D_HANDS,
  STIPPLING_FIELD2D_GRAPH,
  normalizeStipplingSourceHand,
  buildStipplingPointSetHand,
  realizeStipplingStaticSvgHand,
  makeStipplingFieldState,
} from '../src/stippling-field2d.mjs';
import { normalizeScalarFieldRequestHand } from '../src/field-operators.mjs';

const registry = createHandRegistry(STIPPLING_FIELD2D_HANDS);

function initial(overrides = {}) {
  const state = makeStipplingFieldState({
    fieldId: 'fixture-field',
    id: 'fixture-stippling',
    seed: 2468,
    frequency: 3.25,
    octaves: 4,
    patternSeed: 13579,
    minDensity: 0.08,
    maxDensity: 0.92,
    jitterCell: 0.42,
    radiusCell: 0.12,
    ...overrides,
  });
  state.consumerMetadata = { untouched: true, label: 'neutral-fixture' };
  return state;
}

function run(state, callerKind = 'human') {
  return executeHandGraph({ registry, graph: STIPPLING_FIELD2D_GRAPH, initialState: state, context: { callerKind } });
}

function normalize(state) {
  const field = normalizeScalarFieldRequestHand.execute(state, {}, {}).state;
  return normalizeStipplingSourceHand.execute(field, {}, {}).state;
}

test('human and machine callers produce identical retained sources, point sets and SVG', () => {
  const human = run(initial(), 'human');
  const machine = run(initial(), 'machine');
  assert.equal(human.finalState.fieldSourceHash, machine.finalState.fieldSourceHash);
  assert.equal(human.finalState.stipplingSourceHash, machine.finalState.stipplingSourceHash);
  assert.equal(human.finalState.stipplingPointSets['fixture-stippling'].pointSetHash, machine.finalState.stipplingPointSets['fixture-stippling'].pointSetHash);
  assert.equal(human.finalState.realizations.stipplingStaticSvg.content, machine.finalState.realizations.stipplingStaticSvg.content);
  assert.deepEqual(human.finalState.consumerMetadata, initial().consumerMetadata);
});

test('working-set density and renderer controls remain derived instead of rewriting source truth', () => {
  const normalized = normalize(initial());
  const fieldHash = normalized.fieldSourceHash;
  const sourceHash = normalized.stipplingSourceHash;
  const sourceSnapshot = structuredClone(normalized.stipplingSource);

  const coarse = buildStipplingPointSetHand.execute(normalized, { columns: 12, rows: 8, candidatesPerCell: 1, maxCandidates: 4096 }, {}).state;
  const dense = buildStipplingPointSetHand.execute(normalized, { columns: 48, rows: 32, candidatesPerCell: 3, maxCandidates: 8192 }, {}).state;
  assert.equal(coarse.fieldSourceHash, fieldHash);
  assert.equal(dense.fieldSourceHash, fieldHash);
  assert.equal(coarse.stipplingSourceHash, sourceHash);
  assert.equal(dense.stipplingSourceHash, sourceHash);
  assert.deepEqual(coarse.stipplingSource, sourceSnapshot);
  assert.notEqual(coarse.stipplingPointSets['fixture-stippling'].pointSetHash, dense.stipplingPointSets['fixture-stippling'].pointSetHash);

  const a = realizeStipplingStaticSvgHand.execute(coarse, { width: 320, height: 240, opacity: 0.4 }, {}).state;
  const b = realizeStipplingStaticSvgHand.execute(coarse, { width: 900, height: 500, opacity: 1 }, {}).state;
  assert.equal(a.stipplingSourceHash, b.stipplingSourceHash);
  assert.equal(a.stipplingPointSets['fixture-stippling'].pointSetHash, b.stipplingPointSets['fixture-stippling'].pointSetHash);
  assert.notEqual(a.realizations.stipplingStaticSvg.content, b.realizations.stipplingStaticSvg.content);
});

test('pattern seed changes placement without changing retained scalar-field truth', () => {
  const a = run(initial({ patternSeed: 1 }));
  const b = run(initial({ patternSeed: 2 }));
  assert.equal(a.finalState.fieldSourceHash, b.finalState.fieldSourceHash);
  assert.notEqual(a.finalState.stipplingSourceHash, b.finalState.stipplingSourceHash);
  assert.notEqual(a.finalState.stipplingPointSets['fixture-stippling'].pointSetHash, b.finalState.stipplingPointSets['fixture-stippling'].pointSetHash);
  assert.notDeepEqual(
    a.finalState.stipplingPointSets['fixture-stippling'].points.slice(0, 24).map((point) => point.position),
    b.finalState.stipplingPointSets['fixture-stippling'].points.slice(0, 24).map((point) => point.position),
  );
});

test('normal and inverted value mapping preserve field lineage but redistribute accepted points', () => {
  const normal = run(initial({ valueMode: 'normal' }));
  const inverted = run(initial({ valueMode: 'invert' }));
  assert.equal(normal.finalState.fieldSourceHash, inverted.finalState.fieldSourceHash);
  assert.notEqual(normal.finalState.stipplingSourceHash, inverted.finalState.stipplingSourceHash);
  assert.notEqual(normal.finalState.stipplingPointSets['fixture-stippling'].pointSetHash, inverted.finalState.stipplingPointSets['fixture-stippling'].pointSetHash);
  assert.notDeepEqual(
    normal.finalState.stipplingPointSets['fixture-stippling'].points.map((point) => point.candidateIndex),
    inverted.finalState.stipplingPointSets['fixture-stippling'].points.map((point) => point.candidateIndex),
  );
});

test('materially different scalar fields remain distinct under the same stippling contract', () => {
  const soft = run(initial({ seed: 7, frequency: 1.25, octaves: 2 }));
  const busy = run(initial({ seed: 9001, frequency: 9, octaves: 6 }));
  assert.notEqual(soft.finalState.fieldSourceHash, busy.finalState.fieldSourceHash);
  assert.notEqual(soft.finalState.stipplingSourceHash, busy.finalState.stipplingSourceHash);
  assert.notEqual(soft.finalState.stipplingPointSets['fixture-stippling'].pointSetHash, busy.finalState.stipplingPointSets['fixture-stippling'].pointSetHash);
  assert.notEqual(soft.finalState.realizations.stipplingStaticSvg.content, busy.finalState.realizations.stipplingStaticSvg.content);
});

test('field, treatment and derived-point lineage drift are rejected before realization', () => {
  const normalized = normalize(initial());
  const built = buildStipplingPointSetHand.execute(normalized, { columns: 12, rows: 8, candidatesPerCell: 2 }, {}).state;

  const fieldDrift = structuredClone(built);
  fieldDrift.fieldSource.frequency = 9;
  assert.throws(() => realizeStipplingStaticSvgHand.execute(fieldDrift, {}, {}), /scalar field source hash mismatch/);

  const sourceDrift = structuredClone(built);
  sourceDrift.stipplingSource.responsePower = 3;
  assert.throws(() => realizeStipplingStaticSvgHand.execute(sourceDrift, {}, {}), /stippling source hash mismatch/);

  const pointDrift = structuredClone(built);
  pointDrift.stipplingPointSets['fixture-stippling'].points[0].position[0] += 0.01;
  assert.throws(() => realizeStipplingStaticSvgHand.execute(pointDrift, {}, {}), /stippling point set hash mismatch/);
});

test('invalid treatment controls and candidate budgets fail loudly', () => {
  const field = normalizeScalarFieldRequestHand.execute(initial(), {}, {}).state;
  const badMode = structuredClone(field);
  badMode.stipplingRequest.valueMode = 'posterize';
  assert.throws(() => normalizeStipplingSourceHand.execute(badMode, {}, {}), /normal or invert/);

  const badRange = structuredClone(field);
  badRange.stipplingRequest.minDensity = 0.9;
  badRange.stipplingRequest.maxDensity = 0.2;
  assert.throws(() => normalizeStipplingSourceHand.execute(badRange, {}, {}), />= minDensity/);

  const normalized = normalize(initial());
  assert.throws(() => buildStipplingPointSetHand.execute(normalized, { columns: 128, rows: 128, candidatesPerCell: 2, maxCandidates: 16384 }, {}), /candidate budget exceeded/);
  assert.throws(() => buildStipplingPointSetHand.execute(normalized, { columns: 257, rows: 8 }, {}), /within \[2,256\]/);
  assert.throws(() => buildStipplingPointSetHand.execute(normalized, { columns: 8, rows: 8, candidatesPerCell: 5 }, {}), /within \[1,4\]/);
  assert.throws(() => buildStipplingPointSetHand.execute(normalized, { columns: 8, rows: 8, maxCandidates: 16385 }, {}), /within \[4,16384\]/);
});

test('artifact hash binds exact SVG to field, treatment and point-set lineage', () => {
  const result = run(initial());
  const realization = result.finalState.realizations.stipplingStaticSvg;
  const pointSet = result.finalState.stipplingPointSets['fixture-stippling'];
  assert.equal(result.checkpoints.at(-1).evidence.artifactHash, hashValue(realization.content));
  assert.equal(realization.artifactHash, hashValue(realization.content));
  assert.equal(realization.fieldSourceHash, result.finalState.fieldSourceHash);
  assert.equal(realization.sourceHash, result.finalState.stipplingSourceHash);
  assert.equal(realization.pointSetHash, pointSet.pointSetHash);
  assert.equal(pointSet.candidateCount, 40 * 28 * 2);
  assert.ok(pointSet.pointCount > 0 && pointSet.pointCount < pointSet.candidateCount);
  assert.match(realization.content, /<svg/);
  assert.match(realization.content, /data-candidate=/);
});
