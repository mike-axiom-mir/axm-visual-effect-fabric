import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph, resumeHandGraph, hashValue } from '../src/hand-runtime.mjs';
import {
  TRANSIENT_IMPULSE_GRAPH,
  TRANSIENT_IMPULSE_HANDS,
  makeTransientImpulseState,
} from '../src/transient-impulse-hands.mjs';
import {
  TRANSIENT_IMPULSE_CANVAS_GRAPH,
  TRANSIENT_IMPULSE_CANVAS_HANDS,
} from '../src/transient-impulse-canvas.mjs';

const svgRegistry = createHandRegistry(TRANSIENT_IMPULSE_HANDS);
const canvasRegistry = createHandRegistry(TRANSIENT_IMPULSE_CANVAS_HANDS);

function run(registry, graph, state, callerKind = 'test') {
  return executeHandGraph({ registry, graph, initialState: state, context: { callerKind } });
}

test('SVG and Canvas2D consume the same canonical event, field and envelope', () => {
  const state = makeTransientImpulseState({
    id: 'renderer-parity',
    seed: 424242,
    origin: [0.44, 0.56],
    direction: [0.9, -0.25],
    energy: 1.12,
    radius: 0.3,
    controls: { symmetry: 0.22, directionality: 0.91, fragmentation: 0.73, ringWeight: 0.72, spokeWeight: 1.08 },
  });
  const svg = run(svgRegistry, TRANSIENT_IMPULSE_GRAPH, state, 'human').finalState;
  const canvas = run(canvasRegistry, TRANSIENT_IMPULSE_CANVAS_GRAPH, state, 'machine').finalState;

  assert.equal(canvas.eventCanonicalHash, svg.eventCanonicalHash);
  assert.equal(canvas.impulseField.geometryHash, svg.impulseField.geometryHash);
  assert.deepEqual(canvas.impulseEnvelope, svg.impulseEnvelope);
  assert.equal(
    canvas.realizations.transientImpulseCanvas2d.derivedFromStateHash,
    svg.realizations.transientImpulseSvg.derivedFromStateHash,
  );
  assert.equal(canvas.realizations.transientImpulseCanvas2d.canonicalEventHash, canvas.eventCanonicalHash);
  assert.equal(canvas.realizations.transientImpulseCanvas2d.fieldGeometryHash, canvas.impulseField.geometryHash);
  assert.equal(canvas.realizations.transientImpulseCanvas2d.workingSet.rendererStateDisposable, true);
});

test('Canvas2D renderer is deterministic and is not an SVG wrapper', () => {
  const state = makeTransientImpulseState({ id: 'canvas-neutral', seed: 81 });
  const human = run(canvasRegistry, TRANSIENT_IMPULSE_CANVAS_GRAPH, state, 'human');
  const machine = run(canvasRegistry, TRANSIENT_IMPULSE_CANVAS_GRAPH, state, 'machine');
  const realization = human.finalState.realizations.transientImpulseCanvas2d;

  assert.equal(human.finalStateHash, machine.finalStateHash);
  assert.equal(realization.renderer, 'axm.vfx.transient-impulse-canvas2d/v0.1');
  assert.match(realization.content, /<canvas/);
  assert.match(realization.content, /getContext\('2d'/);
  assert.match(realization.content, /requestAnimationFrame/);
  assert.doesNotMatch(realization.content, /<svg/);
});

test('Canvas2D realization can replay from the shared envelope checkpoint without changing source truth', () => {
  const original = run(
    canvasRegistry,
    TRANSIENT_IMPULSE_CANVAS_GRAPH,
    makeTransientImpulseState({ id: 'canvas-style-replay', seed: 191 }),
    'human',
  );
  const checkpoint = original.checkpoints.find((item) => item.stageId === 'temporal-envelope');
  assert.ok(checkpoint);

  const resumed = resumeHandGraph({
    registry: canvasRegistry,
    graph: TRANSIENT_IMPULSE_CANVAS_GRAPH,
    checkpoint,
    edits: [
      { op: 'set', path: ['effect', 'tint'], value: [0.95, 0.16, 0.48] },
      { op: 'set', path: ['effect', 'accent'], value: [0.2, 0.95, 1] },
    ],
    context: { callerKind: 'machine' },
  });

  assert.deepEqual(resumed.executedStageIds, ['realize-canvas2d']);
  assert.equal(resumed.finalState.eventCanonicalHash, original.finalState.eventCanonicalHash);
  assert.equal(resumed.finalState.impulseField.geometryHash, original.finalState.impulseField.geometryHash);
  assert.equal(hashValue(resumed.finalState.impulseEnvelope), hashValue(original.finalState.impulseEnvelope));
  assert.notEqual(
    resumed.finalState.realizations.transientImpulseCanvas2d.content,
    original.finalState.realizations.transientImpulseCanvas2d.content,
  );
});

test('Canvas2D renderer preserves the same bounded field ceilings for materially different forms', () => {
  const directional = run(canvasRegistry, TRANSIENT_IMPULSE_CANVAS_GRAPH, makeTransientImpulseState({
    id: 'canvas-directional', seed: 9, direction: [1, 0], controls: { symmetry: 0.08, directionality: 1, fragmentation: 0.9, ringWeight: 0.55, spokeWeight: 1.3 },
  })).finalState;
  const symmetric = run(canvasRegistry, TRANSIENT_IMPULSE_CANVAS_GRAPH, makeTransientImpulseState({
    id: 'canvas-symmetric', seed: 9, direction: [0, -1], controls: { symmetry: 1, directionality: 0.1, fragmentation: 0.02, ringWeight: 1.25, spokeWeight: 0.35 },
  })).finalState;

  assert.notEqual(directional.impulseField.geometryHash, symmetric.impulseField.geometryHash);
  for (const state of [directional, symmetric]) {
    assert.ok(state.impulseField.counts.rings <= 8);
    assert.ok(state.impulseField.counts.spokes <= 18);
    assert.ok(state.impulseField.counts.fragments <= 42);
    assert.equal(state.impulseEnvelope.samples.length, 17);
  }
});
