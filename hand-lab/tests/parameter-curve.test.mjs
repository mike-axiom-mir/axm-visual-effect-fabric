import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph, hashValue } from '../src/hand-runtime.mjs';
import {
  PARAMETER_CURVE_GRAPH,
  PARAMETER_CURVE_HANDS,
  buildParameterCurveSamplesHand,
  makeParameterCurveState,
  normalizeParameterCurveHand,
  sampleParameterCurveSource,
} from '../src/parameter-curve.mjs';

const registry = createHandRegistry(PARAMETER_CURVE_HANDS);

function graphWithSamples(sampleCount) {
  return {
    ...PARAMETER_CURVE_GRAPH,
    stages: [
      PARAMETER_CURVE_GRAPH.stages[0],
      { id: 'build-parameter-curve-samples', hand: 'fx.animation.parameter-curve-samples-build', params: { sampleCount } },
    ],
  };
}

function run(state, graph = PARAMETER_CURVE_GRAPH, callerKind = 'test') {
  return executeHandGraph({ registry, graph, initialState: state, context: { callerKind } });
}

function samples(result, id) {
  return result.finalState.parameterCurveSamples[id];
}

test('parameter curve is deterministic, caller-neutral and keeps sample tables derived', () => {
  const state = makeParameterCurveState({
    id: 'neutral-envelope',
    keyframes: [
      { t: 0, value: 0, interpolation: 'smoothstep' },
      { t: 0.18, value: 1, interpolation: 'linear' },
      { t: 0.62, value: 0.72, interpolation: 'smoothstep' },
      { t: 1, value: 0, interpolation: 'linear' },
    ],
  });
  const human = run(state, PARAMETER_CURVE_GRAPH, 'human');
  const machine = run(state, PARAMETER_CURVE_GRAPH, 'machine');
  const humanSamples = samples(human, 'neutral-envelope');

  assert.equal(human.finalStateHash, machine.finalStateHash);
  assert.equal(human.finalState.parameterCurveSourceHash, machine.finalState.parameterCurveSourceHash);
  assert.equal(humanSamples.sampleSetHash, samples(machine, 'neutral-envelope').sampleSetHash);
  assert.equal(humanSamples.derived, true);
  assert.equal(humanSamples.rebuildable, true);
  assert.equal(humanSamples.sampleCount, 129);
  assert.equal(human.finalState.parameterCurveSource.provenance.sourceReuse, 'none');
});

test('canonical curve truth is independent from rebuildable sample density', () => {
  const state = makeParameterCurveState({
    id: 'resolution-independent',
    keyframes: [
      { t: 0, value: -0.5, interpolation: 'linear' },
      { t: 0.25, value: 0.8, interpolation: 'smoothstep' },
      { t: 0.7, value: 0.2, interpolation: 'linear' },
      { t: 1, value: 1, interpolation: 'step' },
    ],
  });
  const low = run(state, graphWithSamples(17)).finalState;
  const high = run(state, graphWithSamples(1025)).finalState;

  assert.equal(low.parameterCurveSourceHash, high.parameterCurveSourceHash);
  assert.deepEqual(low.parameterCurveSource, high.parameterCurveSource);
  assert.notEqual(low.parameterCurveSamples['resolution-independent'].sampleSetHash, high.parameterCurveSamples['resolution-independent'].sampleSetHash);
  for (const t of [0, 0.11, 0.25, 0.43, 0.7, 0.999, 1]) {
    assert.equal(sampleParameterCurveSource(low.parameterCurveSource, t), sampleParameterCurveSource(high.parameterCurveSource, t));
  }
});

test('linear, smoothstep and step interpolation are explicit and exact keyframe hits survive', () => {
  const linear = run(makeParameterCurveState({ id: 'linear', keyframes: [
    { t: 0, value: 0, interpolation: 'linear' },
    { t: 1, value: 1, interpolation: 'linear' },
  ] })).finalState.parameterCurveSource;
  const smooth = run(makeParameterCurveState({ id: 'smooth', keyframes: [
    { t: 0, value: 0, interpolation: 'smoothstep' },
    { t: 1, value: 1, interpolation: 'linear' },
  ] })).finalState.parameterCurveSource;
  const stepped = run(makeParameterCurveState({ id: 'stepped', keyframes: [
    { t: 0, value: 0, interpolation: 'step' },
    { t: 0.5, value: 1, interpolation: 'linear' },
    { t: 1, value: 0, interpolation: 'linear' },
  ] })).finalState.parameterCurveSource;

  assert.equal(sampleParameterCurveSource(linear, 0.25), 0.25);
  assert.equal(sampleParameterCurveSource(smooth, 0.25), 0.15625);
  assert.equal(sampleParameterCurveSource(stepped, 0.25), 0);
  assert.equal(sampleParameterCurveSource(stepped, 0.5), 1);
  assert.equal(sampleParameterCurveSource(stepped, 0.500001), 0.999998);
  assert.equal(sampleParameterCurveSource(linear, 1), 1);
});

test('clamp and loop modes provide different reusable temporal behavior from the same keyframe shape', () => {
  const keyframes = [
    { t: 0, value: 0.2, interpolation: 'smoothstep' },
    { t: 0.4, value: 1, interpolation: 'smoothstep' },
    { t: 1, value: 0.2, interpolation: 'linear' },
  ];
  const clamp = run(makeParameterCurveState({ id: 'clamp-shape', wrapMode: 'clamp', keyframes })).finalState.parameterCurveSource;
  const loop = run(makeParameterCurveState({ id: 'loop-shape', wrapMode: 'loop', keyframes })).finalState.parameterCurveSource;

  assert.equal(sampleParameterCurveSource(clamp, -0.25), 0.2);
  assert.equal(sampleParameterCurveSource(clamp, 1.25), 0.2);
  assert.equal(sampleParameterCurveSource(loop, 1.25), sampleParameterCurveSource(loop, 0.25));
  assert.equal(sampleParameterCurveSource(loop, -0.75), sampleParameterCurveSource(loop, 0.25));
  assert.equal(sampleParameterCurveSource(loop, 1), sampleParameterCurveSource(loop, 0));
  assert.notEqual(hashValue(clamp), hashValue(loop));
});

test('one curve contract supports a one-shot rise/decay envelope and a looping pulse without consumer meaning', () => {
  const oneShot = run(makeParameterCurveState({
    id: 'one-shot-shape',
    wrapMode: 'clamp',
    keyframes: [
      { t: 0, value: 0, interpolation: 'smoothstep' },
      { t: 0.08, value: 1, interpolation: 'linear' },
      { t: 0.35, value: 0.65, interpolation: 'smoothstep' },
      { t: 1, value: 0, interpolation: 'linear' },
    ],
  })).finalState;
  const looped = run(makeParameterCurveState({
    id: 'looping-shape',
    wrapMode: 'loop',
    keyframes: [
      { t: 0, value: 0.25, interpolation: 'smoothstep' },
      { t: 0.5, value: 1, interpolation: 'smoothstep' },
      { t: 1, value: 0.25, interpolation: 'linear' },
    ],
  })).finalState;

  assert.notEqual(oneShot.parameterCurveSourceHash, looped.parameterCurveSourceHash);
  assert.notDeepEqual(oneShot.parameterCurveSamples['one-shot-shape'].samples, looped.parameterCurveSamples['looping-shape'].samples);
  assert.equal(oneShot.parameterCurveSource.domain, 'normalized-time');
  assert.equal(looped.parameterCurveSource.domain, 'normalized-time');
});

test('source drift, malformed keyframes, invalid modes and oversized working sets fail explicitly', () => {
  const normalized = normalizeParameterCurveHand.execute(makeParameterCurveState({ id: 'lineage' }), {}).state;
  const drift = structuredClone(normalized);
  drift.parameterCurveSource.keyframes[1].value = 0.75;
  assert.notEqual(hashValue(drift.parameterCurveSource), drift.parameterCurveSourceHash);
  assert.throws(() => buildParameterCurveSamplesHand.execute(drift, {}), /parameter curve source state hash mismatch/);

  assert.throws(() => run(makeParameterCurveState({ id: 'bad-wrap', wrapMode: 'mirror' })), /wrapMode must be one of clamp, loop/);
  assert.throws(() => run(makeParameterCurveState({ id: 'bad-range', keyframes: [
    { t: 0.1, value: 0 },
    { t: 1, value: 1 },
  ] })), /must span normalized time exactly from 0 to 1/);
  assert.throws(() => run(makeParameterCurveState({ id: 'duplicate-time', keyframes: [
    { t: 0, value: 0 },
    { t: 0.5, value: 1 },
    { t: 0.5, value: 0.2 },
    { t: 1, value: 0 },
  ] })), /keyframe times must be strictly increasing/);
  assert.throws(() => run(makeParameterCurveState({ id: 'bad-interpolation', keyframes: [
    { t: 0, value: 0, interpolation: 'bezier' },
    { t: 1, value: 1 },
  ] })), /interpolation must be one of linear, smoothstep, step/);
  assert.throws(() => run(makeParameterCurveState({ id: 'too-large' }), graphWithSamples(4098)), /sampleCount must be an integer within \[2,4097\]/);
});
