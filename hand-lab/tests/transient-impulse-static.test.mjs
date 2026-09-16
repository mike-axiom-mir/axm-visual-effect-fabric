import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph } from '../src/hand-runtime.mjs';
import {
  TRANSIENT_IMPULSE_GRAPH,
  TRANSIENT_IMPULSE_HANDS,
  makeTransientImpulseState,
} from '../src/transient-impulse-hands.mjs';
import {
  TRANSIENT_IMPULSE_STATIC_GRAPH,
  TRANSIENT_IMPULSE_STATIC_HANDS,
  impulseStaticSvgHand,
} from '../src/transient-impulse-static.mjs';

const animatedRegistry = createHandRegistry(TRANSIENT_IMPULSE_HANDS);
const staticRegistry = createHandRegistry(TRANSIENT_IMPULSE_STATIC_HANDS);

function run(registry, graph, state, callerKind = 'test') {
  return executeHandGraph({ registry, graph, initialState: state, context: { callerKind } });
}

function peakSample(envelope) {
  return envelope.samples.reduce((peak, sample) => sample.intensity > peak.intensity ? sample : peak);
}

test('static fallback preserves canonical event, field geometry and temporal envelope', () => {
  const state = makeTransientImpulseState({
    id: 'static-parity',
    seed: 20260916,
    origin: [0.43, 0.58],
    direction: [0.91, -0.22],
    energy: 1.14,
    radius: 0.31,
    controls: {
      symmetry: 0.18,
      directionality: 0.94,
      fragmentation: 0.7,
      ringWeight: 0.74,
      spokeWeight: 1.08,
    },
  });

  const animated = run(animatedRegistry, TRANSIENT_IMPULSE_GRAPH, state, 'human').finalState;
  const reduced = run(staticRegistry, TRANSIENT_IMPULSE_STATIC_GRAPH, state, 'machine').finalState;
  const realization = reduced.realizations.transientImpulseStaticSvg;

  assert.equal(reduced.eventCanonicalHash, animated.eventCanonicalHash);
  assert.equal(reduced.impulseField.geometryHash, animated.impulseField.geometryHash);
  assert.deepEqual(reduced.impulseEnvelope, animated.impulseEnvelope);
  assert.equal(realization.canonicalEventHash, reduced.eventCanonicalHash);
  assert.equal(realization.fieldGeometryHash, reduced.impulseField.geometryHash);
  assert.equal(realization.motion.mode, 'static');
  assert.equal(realization.motion.source, 'temporal-envelope-peak');
});

test('static fallback is deterministic, caller-neutral and contains no animation machinery', () => {
  const state = makeTransientImpulseState({ id: 'static-neutral', seed: 144 });
  const human = run(staticRegistry, TRANSIENT_IMPULSE_STATIC_GRAPH, state, 'human');
  const machine = run(staticRegistry, TRANSIENT_IMPULSE_STATIC_GRAPH, state, 'machine');
  const realization = human.finalState.realizations.transientImpulseStaticSvg;

  assert.equal(human.finalStateHash, machine.finalStateHash);
  assert.equal(realization.renderer, 'axm.vfx.transient-impulse-static-svg/v0.1');
  assert.match(realization.content, /TRANSIENT IMPULSE \/\/ STATIC/);
  assert.match(realization.content, /<ellipse/);
  assert.match(realization.content, /<line/);
  assert.match(realization.content, /<circle/);
  assert.doesNotMatch(realization.content, /<animate\b/i);
  assert.doesNotMatch(realization.content, /<script\b/i);
  assert.doesNotMatch(realization.content, /requestAnimationFrame/);
});

test('static fallback samples a deterministic retained envelope peak rather than inventing new timing state', () => {
  const runResult = run(
    staticRegistry,
    TRANSIENT_IMPULSE_STATIC_GRAPH,
    makeTransientImpulseState({ id: 'static-peak', seed: 901 }),
  );
  const peak = peakSample(runResult.finalState.impulseEnvelope);
  const motion = runResult.finalState.realizations.transientImpulseStaticSvg.motion;

  assert.equal(motion.sampleT, peak.t);
  assert.equal(motion.intensity, peak.intensity);
  assert.equal(motion.expansion, peak.expansion);
  assert.ok(motion.intensity > 0);
  assert.ok(motion.expansion > 0 && motion.expansion <= 1);
});

test('one static renderer handles materially different directional and symmetric forms', () => {
  const directional = run(staticRegistry, TRANSIENT_IMPULSE_STATIC_GRAPH, makeTransientImpulseState({
    id: 'static-directional',
    seed: 11,
    direction: [1, 0.12],
    controls: { symmetry: 0.08, directionality: 1, fragmentation: 0.88, ringWeight: 0.6, spokeWeight: 1.2 },
  })).finalState;
  const symmetric = run(staticRegistry, TRANSIENT_IMPULSE_STATIC_GRAPH, makeTransientImpulseState({
    id: 'static-symmetric',
    seed: 11,
    direction: [0, -1],
    controls: { symmetry: 1, directionality: 0.1, fragmentation: 0.02, ringWeight: 1.25, spokeWeight: 0.35 },
  })).finalState;

  assert.notEqual(directional.impulseField.geometryHash, symmetric.impulseField.geometryHash);
  assert.notEqual(
    directional.realizations.transientImpulseStaticSvg.content,
    symmetric.realizations.transientImpulseStaticSvg.content,
  );
  assert.ok(directional.impulseField.counts.fragments > symmetric.impulseField.counts.fragments);
  assert.equal(directional.realizations.transientImpulseStaticSvg.motion.mode, 'static');
  assert.equal(symmetric.realizations.transientImpulseStaticSvg.motion.mode, 'static');
});

test('static realization fails explicitly without derived field and envelope prerequisites', () => {
  const state = makeTransientImpulseState({ id: 'static-missing-prerequisite' });
  assert.throws(
    () => impulseStaticSvgHand.execute(state, {}, { callerKind: 'test' }),
    /static-svg-realize requires impulse field \+ envelope/,
  );
});
