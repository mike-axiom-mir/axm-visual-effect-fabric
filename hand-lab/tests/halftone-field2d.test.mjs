import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph, hashValue } from '../src/hand-runtime.mjs';
import {
  HALFTONE_FIELD2D_HANDS,
  HALFTONE_FIELD2D_GRAPH,
  normalizeHalftoneSourceHand,
  buildHalftoneDotSetHand,
  realizeHalftoneStaticSvgHand,
  makeHalftoneFieldState,
} from '../src/halftone-field2d.mjs';
import { normalizeScalarFieldRequestHand } from '../src/field-operators.mjs';

const registry = createHandRegistry(HALFTONE_FIELD2D_HANDS);

function initial(overrides = {}) {
  const state = makeHalftoneFieldState({
    fieldId: 'fixture-field',
    id: 'fixture-halftone',
    seed: 2468,
    frequency: 3.25,
    octaves: 4,
    minRadiusCell: 0.04,
    maxRadiusCell: 0.45,
    ...overrides,
  });
  state.consumerMetadata = { untouched: true, label: 'neutral-fixture' };
  return state;
}

function run(state, callerKind = 'human') {
  return executeHandGraph({ registry, graph: HALFTONE_FIELD2D_GRAPH, initialState: state, context: { callerKind } });
}

function normalize(state) {
  const field = normalizeScalarFieldRequestHand.execute(state, {}, {}).state;
  return normalizeHalftoneSourceHand.execute(field, {}, {}).state;
}

test('human and machine callers produce identical retained sources, dots and SVG', () => {
  const human = run(initial(), 'human');
  const machine = run(initial(), 'machine');
  assert.equal(human.finalState.fieldSourceHash, machine.finalState.fieldSourceHash);
  assert.equal(human.finalState.halftoneSourceHash, machine.finalState.halftoneSourceHash);
  assert.equal(human.finalState.halftoneDotSets['fixture-halftone'].dotSetHash, machine.finalState.halftoneDotSets['fixture-halftone'].dotSetHash);
  assert.equal(human.finalState.realizations.halftoneStaticSvg.content, machine.finalState.realizations.halftoneStaticSvg.content);
  assert.deepEqual(human.finalState.consumerMetadata, initial().consumerMetadata);
});

test('sampling density and renderer controls stay derived instead of rewriting source truth', () => {
  const normalized = normalize(initial());
  const fieldHash = normalized.fieldSourceHash;
  const halftoneHash = normalized.halftoneSourceHash;
  const sourceSnapshot = structuredClone(normalized.halftoneSource);

  const coarse = buildHalftoneDotSetHand.execute(normalized, { columns: 12, rows: 8, maxDots: 4096 }, {}).state;
  const dense = buildHalftoneDotSetHand.execute(normalized, { columns: 64, rows: 40, maxDots: 4096 }, {}).state;
  assert.equal(coarse.fieldSourceHash, fieldHash);
  assert.equal(dense.fieldSourceHash, fieldHash);
  assert.equal(coarse.halftoneSourceHash, halftoneHash);
  assert.equal(dense.halftoneSourceHash, halftoneHash);
  assert.deepEqual(coarse.halftoneSource, sourceSnapshot);
  assert.notEqual(coarse.halftoneDotSets['fixture-halftone'].dotSetHash, dense.halftoneDotSets['fixture-halftone'].dotSetHash);

  const a = realizeHalftoneStaticSvgHand.execute(coarse, { width: 320, height: 240, opacity: 0.5 }, {}).state;
  const b = realizeHalftoneStaticSvgHand.execute(coarse, { width: 900, height: 500, opacity: 1 }, {}).state;
  assert.equal(a.halftoneSourceHash, b.halftoneSourceHash);
  assert.equal(a.halftoneDotSets['fixture-halftone'].dotSetHash, b.halftoneDotSets['fixture-halftone'].dotSetHash);
  assert.notEqual(a.realizations.halftoneStaticSvg.content, b.realizations.halftoneStaticSvg.content);
});

test('normal and inverted value mapping preserve field lineage but produce different treatment geometry', () => {
  const normal = run(initial({ valueMode: 'normal' }));
  const inverted = run(initial({ valueMode: 'invert' }));
  assert.equal(normal.finalState.fieldSourceHash, inverted.finalState.fieldSourceHash);
  assert.notEqual(normal.finalState.halftoneSourceHash, inverted.finalState.halftoneSourceHash);
  assert.notEqual(normal.finalState.halftoneDotSets['fixture-halftone'].dotSetHash, inverted.finalState.halftoneDotSets['fixture-halftone'].dotSetHash);
  assert.notEqual(normal.finalState.realizations.halftoneStaticSvg.content, inverted.finalState.realizations.halftoneStaticSvg.content);

  const a = normal.finalState.halftoneDotSets['fixture-halftone'].dots[0];
  const b = inverted.finalState.halftoneDotSets['fixture-halftone'].dots[0];
  assert.equal(a.fieldValue, b.fieldValue);
  assert.notEqual(a.radiusCell, b.radiusCell);
});

test('materially different scalar-field forms remain distinct under the same neutral treatment contract', () => {
  const soft = run(initial({ seed: 7, frequency: 1.25, octaves: 2 }));
  const busy = run(initial({ seed: 9001, frequency: 9, octaves: 6 }));
  assert.notEqual(soft.finalState.fieldSourceHash, busy.finalState.fieldSourceHash);
  assert.notEqual(soft.finalState.halftoneDotSets['fixture-halftone'].dotSetHash, busy.finalState.halftoneDotSets['fixture-halftone'].dotSetHash);
  assert.notEqual(soft.finalState.realizations.halftoneStaticSvg.content, busy.finalState.realizations.halftoneStaticSvg.content);
});

test('field, treatment and derived-dot lineage drift are rejected before realization', () => {
  const normalized = normalize(initial());
  const built = buildHalftoneDotSetHand.execute(normalized, { columns: 12, rows: 8 }, {}).state;

  const fieldDrift = structuredClone(built);
  fieldDrift.fieldSource.frequency = 9;
  assert.throws(() => realizeHalftoneStaticSvgHand.execute(fieldDrift, {}, {}), /scalar field source hash mismatch/);

  const sourceDrift = structuredClone(built);
  sourceDrift.halftoneSource.responsePower = 3;
  assert.throws(() => realizeHalftoneStaticSvgHand.execute(sourceDrift, {}, {}), /halftone source hash mismatch/);

  const dotDrift = structuredClone(built);
  dotDrift.halftoneDotSets['fixture-halftone'].dots[0].radiusCell = 0.5;
  assert.throws(() => realizeHalftoneStaticSvgHand.execute(dotDrift, {}, {}), /halftone dot set hash mismatch/);
});

test('invalid treatment controls and working-set overflow fail loudly', () => {
  const field = normalizeScalarFieldRequestHand.execute(initial(), {}, {}).state;
  const badMode = structuredClone(field);
  badMode.halftoneRequest.valueMode = 'posterize';
  assert.throws(() => normalizeHalftoneSourceHand.execute(badMode, {}, {}), /normal or invert/);

  const badRange = structuredClone(field);
  badRange.halftoneRequest.minRadiusCell = 0.4;
  badRange.halftoneRequest.maxRadiusCell = 0.2;
  assert.throws(() => normalizeHalftoneSourceHand.execute(badRange, {}, {}), />= minRadiusCell/);

  const normalized = normalize(initial());
  assert.throws(() => buildHalftoneDotSetHand.execute(normalized, { columns: 128, rows: 128, maxDots: 4096 }, {}), /dot budget exceeded/);
  assert.throws(() => buildHalftoneDotSetHand.execute(normalized, { columns: 257, rows: 8 }, {}), /within \[2,256\]/);
  assert.throws(() => buildHalftoneDotSetHand.execute(normalized, { columns: 8, rows: 8, maxDots: 16385 }, {}), /within \[4,16384\]/);
});

test('artifact hash binds exact SVG content to retained field, treatment and dot-set lineage', () => {
  const result = run(initial());
  const realization = result.finalState.realizations.halftoneStaticSvg;
  const dotSet = result.finalState.halftoneDotSets['fixture-halftone'];
  assert.equal(result.checkpoints.at(-1).evidence.artifactHash, hashValue(realization.content));
  assert.equal(realization.artifactHash, hashValue(realization.content));
  assert.equal(realization.fieldSourceHash, result.finalState.fieldSourceHash);
  assert.equal(realization.sourceHash, result.finalState.halftoneSourceHash);
  assert.equal(realization.dotSetHash, dotSet.dotSetHash);
  assert.equal(dotSet.dotCount, 48 * 32);
  assert.match(realization.content, /<svg/);
  assert.match(realization.content, /data-dot="0"/);
});
