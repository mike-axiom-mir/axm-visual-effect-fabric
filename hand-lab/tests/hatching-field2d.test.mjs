import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph, hashValue } from '../src/hand-runtime.mjs';
import {
  HATCHING_FIELD2D_HANDS,
  HATCHING_FIELD2D_GRAPH,
  normalizeHatchingSourceHand,
  buildHatchingStrokeSetHand,
  realizeHatchingStaticSvgHand,
  makeHatchingFieldState,
} from '../src/hatching-field2d.mjs';
import { normalizeFlowFieldRequestHand } from '../src/field-flow-operators.mjs';

const registry = createHandRegistry(HATCHING_FIELD2D_HANDS);

function initial(overrides = {}) {
  const state = makeHatchingFieldState({
    fieldId: 'fixture-field',
    flowId: 'fixture-flow',
    id: 'fixture-hatching',
    seed: 2468,
    frequency: 3.25,
    octaves: 4,
    flowMode: 'tangent',
    minLengthCell: 0.12,
    maxLengthCell: 0.88,
    ...overrides,
  });
  state.consumerMetadata = { untouched: true, label: 'neutral-fixture' };
  return state;
}

function run(state, callerKind = 'human') {
  return executeHandGraph({ registry, graph: HATCHING_FIELD2D_GRAPH, initialState: state, context: { callerKind } });
}

function normalize(state) {
  const flow = normalizeFlowFieldRequestHand.execute(state, {}, {}).state;
  return normalizeHatchingSourceHand.execute(flow, {}, {}).state;
}

test('human and machine callers produce identical retained sources, strokes and SVG', () => {
  const human = run(initial(), 'human');
  const machine = run(initial(), 'machine');
  assert.equal(human.finalState.fieldSourceHash, machine.finalState.fieldSourceHash);
  assert.equal(human.finalState.flowSourceHash, machine.finalState.flowSourceHash);
  assert.equal(human.finalState.hatchingSourceHash, machine.finalState.hatchingSourceHash);
  assert.equal(human.finalState.hatchingStrokeSets['fixture-hatching'].strokeSetHash, machine.finalState.hatchingStrokeSets['fixture-hatching'].strokeSetHash);
  assert.equal(human.finalState.realizations.hatchingStaticSvg.content, machine.finalState.realizations.hatchingStaticSvg.content);
  assert.deepEqual(human.finalState.consumerMetadata, initial().consumerMetadata);
});

test('sampling density and renderer controls stay derived instead of rewriting source truth', () => {
  const normalized = normalize(initial());
  const fieldHash = normalized.fieldSourceHash;
  const flowHash = normalized.flowSourceHash;
  const hatchingHash = normalized.hatchingSourceHash;
  const sourceSnapshot = structuredClone(normalized.hatchingSource);

  const coarse = buildHatchingStrokeSetHand.execute(normalized, { columns: 12, rows: 8, maxStrokes: 4096 }, {}).state;
  const dense = buildHatchingStrokeSetHand.execute(normalized, { columns: 64, rows: 40, maxStrokes: 4096 }, {}).state;
  assert.equal(coarse.fieldSourceHash, fieldHash);
  assert.equal(dense.fieldSourceHash, fieldHash);
  assert.equal(coarse.flowSourceHash, flowHash);
  assert.equal(dense.flowSourceHash, flowHash);
  assert.equal(coarse.hatchingSourceHash, hatchingHash);
  assert.equal(dense.hatchingSourceHash, hatchingHash);
  assert.deepEqual(coarse.hatchingSource, sourceSnapshot);
  assert.notEqual(coarse.hatchingStrokeSets['fixture-hatching'].strokeSetHash, dense.hatchingStrokeSets['fixture-hatching'].strokeSetHash);

  const a = realizeHatchingStaticSvgHand.execute(coarse, { width: 320, height: 240, opacity: 0.45, strokeWidthPx: 0.75 }, {}).state;
  const b = realizeHatchingStaticSvgHand.execute(coarse, { width: 900, height: 500, opacity: 1, strokeWidthPx: 2 }, {}).state;
  assert.equal(a.hatchingSourceHash, b.hatchingSourceHash);
  assert.equal(a.hatchingStrokeSets['fixture-hatching'].strokeSetHash, b.hatchingStrokeSets['fixture-hatching'].strokeSetHash);
  assert.notEqual(a.realizations.hatchingStaticSvg.content, b.realizations.hatchingStaticSvg.content);
});

test('gradient and tangent flow reuse the same scalar truth but create different stroke direction', () => {
  const gradient = run(initial({ flowMode: 'gradient' }));
  const tangent = run(initial({ flowMode: 'tangent' }));
  assert.equal(gradient.finalState.fieldSourceHash, tangent.finalState.fieldSourceHash);
  assert.notEqual(gradient.finalState.flowSourceHash, tangent.finalState.flowSourceHash);
  assert.notEqual(gradient.finalState.hatchingSourceHash, tangent.finalState.hatchingSourceHash);
  assert.notEqual(gradient.finalState.hatchingStrokeSets['fixture-hatching'].strokeSetHash, tangent.finalState.hatchingStrokeSets['fixture-hatching'].strokeSetHash);
  assert.notEqual(gradient.finalState.realizations.hatchingStaticSvg.content, tangent.finalState.realizations.hatchingStaticSvg.content);

  const gradientDirections = gradient.finalState.hatchingStrokeSets['fixture-hatching'].strokes.slice(0, 32).map((stroke) => stroke.direction);
  const tangentDirections = tangent.finalState.hatchingStrokeSets['fixture-hatching'].strokes.slice(0, 32).map((stroke) => stroke.direction);
  assert.notDeepEqual(gradientDirections, tangentDirections);
});

test('normal and inverted value mapping preserve flow lineage but produce different stroke lengths', () => {
  const normal = run(initial({ valueMode: 'normal' }));
  const inverted = run(initial({ valueMode: 'invert' }));
  assert.equal(normal.finalState.fieldSourceHash, inverted.finalState.fieldSourceHash);
  assert.equal(normal.finalState.flowSourceHash, inverted.finalState.flowSourceHash);
  assert.notEqual(normal.finalState.hatchingSourceHash, inverted.finalState.hatchingSourceHash);
  assert.notEqual(normal.finalState.hatchingStrokeSets['fixture-hatching'].strokeSetHash, inverted.finalState.hatchingStrokeSets['fixture-hatching'].strokeSetHash);
  const a = normal.finalState.hatchingStrokeSets['fixture-hatching'].strokes;
  const b = inverted.finalState.hatchingStrokeSets['fixture-hatching'].strokes;
  assert.ok(a.some((stroke, index) => stroke.lengthCell !== b[index].lengthCell));
  assert.deepEqual(a.map((stroke) => stroke.direction), b.map((stroke) => stroke.direction));
});

test('materially different scalar-field forms remain distinct under the same hatching contract', () => {
  const soft = run(initial({ seed: 7, frequency: 1.25, octaves: 2 }));
  const busy = run(initial({ seed: 9001, frequency: 9, octaves: 6 }));
  assert.notEqual(soft.finalState.fieldSourceHash, busy.finalState.fieldSourceHash);
  assert.notEqual(soft.finalState.flowSourceHash, busy.finalState.flowSourceHash);
  assert.notEqual(soft.finalState.hatchingStrokeSets['fixture-hatching'].strokeSetHash, busy.finalState.hatchingStrokeSets['fixture-hatching'].strokeSetHash);
  assert.notEqual(soft.finalState.realizations.hatchingStaticSvg.content, busy.finalState.realizations.hatchingStaticSvg.content);
});

test('field, flow, treatment and derived-stroke lineage drift are rejected before realization', () => {
  const normalized = normalize(initial());
  const built = buildHatchingStrokeSetHand.execute(normalized, { columns: 12, rows: 8 }, {}).state;

  const fieldDrift = structuredClone(built);
  fieldDrift.fieldSource.frequency = 9;
  assert.throws(() => realizeHatchingStaticSvgHand.execute(fieldDrift, {}, {}), /scalar field source hash mismatch/);

  const flowDrift = structuredClone(built);
  flowDrift.flowSource.strength = 3;
  assert.throws(() => realizeHatchingStaticSvgHand.execute(flowDrift, {}, {}), /vector flow source hash mismatch/);

  const sourceDrift = structuredClone(built);
  sourceDrift.hatchingSource.responsePower = 3;
  assert.throws(() => realizeHatchingStaticSvgHand.execute(sourceDrift, {}, {}), /hatching source hash mismatch/);

  const strokeDrift = structuredClone(built);
  strokeDrift.hatchingStrokeSets['fixture-hatching'].strokes[0].to[0] += 0.01;
  assert.throws(() => realizeHatchingStaticSvgHand.execute(strokeDrift, {}, {}), /hatching stroke set hash mismatch/);
});

test('invalid treatment controls and working-set overflow fail loudly', () => {
  const flow = normalizeFlowFieldRequestHand.execute(initial(), {}, {}).state;
  const badMode = structuredClone(flow);
  badMode.hatchingRequest.valueMode = 'posterize';
  assert.throws(() => normalizeHatchingSourceHand.execute(badMode, {}, {}), /normal or invert/);

  const badRange = structuredClone(flow);
  badRange.hatchingRequest.minLengthCell = 0.8;
  badRange.hatchingRequest.maxLengthCell = 0.2;
  assert.throws(() => normalizeHatchingSourceHand.execute(badRange, {}, {}), />= minLengthCell/);

  const normalized = normalize(initial());
  assert.throws(() => buildHatchingStrokeSetHand.execute(normalized, { columns: 128, rows: 128, maxStrokes: 4096 }, {}), /stroke budget exceeded/);
  assert.throws(() => buildHatchingStrokeSetHand.execute(normalized, { columns: 257, rows: 8 }, {}), /within \[2,256\]/);
  assert.throws(() => buildHatchingStrokeSetHand.execute(normalized, { columns: 8, rows: 8, maxStrokes: 16385 }, {}), /within \[4,16384\]/);
});

test('artifact hash binds exact SVG content to field, flow, treatment and stroke-set lineage', () => {
  const result = run(initial());
  const realization = result.finalState.realizations.hatchingStaticSvg;
  const strokeSet = result.finalState.hatchingStrokeSets['fixture-hatching'];
  assert.equal(result.checkpoints.at(-1).evidence.artifactHash, hashValue(realization.content));
  assert.equal(realization.artifactHash, hashValue(realization.content));
  assert.equal(realization.fieldSourceHash, result.finalState.fieldSourceHash);
  assert.equal(realization.flowSourceHash, result.finalState.flowSourceHash);
  assert.equal(realization.sourceHash, result.finalState.hatchingSourceHash);
  assert.equal(realization.strokeSetHash, strokeSet.strokeSetHash);
  assert.equal(strokeSet.strokeCount, 48 * 32);
  assert.match(realization.content, /<svg/);
  assert.match(realization.content, /data-stroke="0"/);
});
