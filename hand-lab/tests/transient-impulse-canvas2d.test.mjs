import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph, resumeHandGraph } from '../src/hand-runtime.mjs';
import {
  TRANSIENT_IMPULSE_GRAPH,
  TRANSIENT_IMPULSE_HANDS,
  makeTransientImpulseState,
} from '../src/transient-impulse-hands.mjs';
import {
  TRANSIENT_IMPULSE_CANVAS2D_GRAPH,
  TRANSIENT_IMPULSE_CANVAS2D_HANDS,
  impulseCanvas2dHand,
} from '../src/transient-impulse-canvas2d.mjs';

const svgRegistry = createHandRegistry(TRANSIENT_IMPULSE_HANDS);
const canvasRegistry = createHandRegistry(TRANSIENT_IMPULSE_CANVAS2D_HANDS);

function runSvg(state, callerKind = 'test') {
  return executeHandGraph({
    registry: svgRegistry,
    graph: TRANSIENT_IMPULSE_GRAPH,
    initialState: state,
    context: { callerKind },
  });
}

function runCanvas(state, callerKind = 'test') {
  return executeHandGraph({
    registry: canvasRegistry,
    graph: TRANSIENT_IMPULSE_CANVAS2D_GRAPH,
    initialState: state,
    context: { callerKind },
  });
}

function makeMockCanvasContext() {
  const calls = [];
  return {
    calls,
    save() { calls.push(['save']); },
    restore() { calls.push(['restore']); },
    fillRect(...args) { calls.push(['fillRect', ...args]); },
    beginPath() { calls.push(['beginPath']); },
    ellipse(...args) { calls.push(['ellipse', ...args]); },
    stroke() { calls.push(['stroke']); },
    moveTo(...args) { calls.push(['moveTo', ...args]); },
    lineTo(...args) { calls.push(['lineTo', ...args]); },
    arc(...args) { calls.push(['arc', ...args]); },
    fill() { calls.push(['fill']); },
  };
}

test('SVG and Canvas2D realizations preserve the same canonical event and derived core field', () => {
  const initial = makeTransientImpulseState({
    id: 'renderer-parity',
    seed: 8817,
    origin: [0.37, 0.62],
    direction: [0.92, -0.18],
    energy: 1.22,
    controls: {
      symmetry: 0.31,
      directionality: 0.87,
      fragmentation: 0.63,
      ringWeight: 0.9,
      spokeWeight: 1.04,
    },
  });

  const svg = runSvg(initial).finalState;
  const canvas = runCanvas(initial).finalState;
  const realization = canvas.realizations.transientImpulseCanvas2d;

  assert.equal(canvas.eventCanonicalHash, svg.eventCanonicalHash);
  assert.equal(canvas.impulseField.geometryHash, svg.impulseField.geometryHash);
  assert.deepEqual(canvas.impulseField.geometry, svg.impulseField.geometry);
  assert.deepEqual(canvas.impulseEnvelope, svg.impulseEnvelope);
  assert.equal(realization.derivedFromStateHash, svg.realizations.transientImpulseSvg.derivedFromStateHash);
  assert.equal(realization.canonicalEventHash, canvas.eventCanonicalHash);
  assert.equal(realization.fieldGeometryHash, canvas.impulseField.geometryHash);
  assert.equal(realization.renderer, 'axm.vfx.transient-impulse-canvas2d/v0.1');
  assert.equal(realization.mediaType, 'application/javascript');

  const expectedOperations = canvas.impulseField.counts.rings
    + canvas.impulseField.counts.spokes
    + canvas.impulseField.counts.fragments
    + 1;
  assert.equal(realization.operationCount, expectedOperations);
  assert.ok(realization.operationCount <= 69);
  assert.match(realization.content, /export function render/);
  assert.match(realization.content, /ctx\.ellipse/);
  assert.match(realization.content, /ctx\.lineTo/);
  assert.match(realization.content, /ctx\.arc/);
});

test('Canvas2D realization is deterministic and caller-neutral', () => {
  const initial = makeTransientImpulseState({ id: 'canvas-neutral', seed: 5150 });
  const human = runCanvas(initial, 'human');
  const machine = runCanvas(initial, 'machine');

  assert.equal(human.finalStateHash, machine.finalStateHash);
  assert.equal(
    human.finalState.realizations.transientImpulseCanvas2d.modelHash,
    machine.finalState.realizations.transientImpulseCanvas2d.modelHash,
  );
  assert.equal(
    human.finalState.realizations.transientImpulseCanvas2d.content,
    machine.finalState.realizations.transientImpulseCanvas2d.content,
  );
});

test('generated Canvas2D program parses and executes against the expected drawing interface', async () => {
  const finalState = runCanvas(makeTransientImpulseState({ id: 'canvas-program', seed: 412 })).finalState;
  const realization = finalState.realizations.transientImpulseCanvas2d;
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(realization.content).toString('base64')}`;
  const program = await import(moduleUrl);
  const ctx = makeMockCanvasContext();
  const sample = program.render(ctx, realization.oneShotDuration * 0.35);

  assert.equal(program.getModel().canonicalEventHash, finalState.eventCanonicalHash);
  assert.equal(program.getModel().fieldGeometryHash, finalState.impulseField.geometryHash);
  assert.equal(sample.operationCount, realization.operationCount);
  assert.equal(Number.isFinite(sample.intensity), true);
  assert.equal(Number.isFinite(sample.expansion), true);
  assert.ok(ctx.calls.some(([name]) => name === 'fillRect'));
  assert.ok(ctx.calls.some(([name]) => name === 'ellipse'));
  assert.ok(ctx.calls.some(([name]) => name === 'stroke'));
});

test('Canvas2D style replay starts after the envelope and does not rewrite canonical effect state', () => {
  const initial = makeTransientImpulseState({ id: 'canvas-style-replay', seed: 404 });
  const original = runCanvas(initial, 'human');
  const checkpoint = original.checkpoints.find((item) => item.stageId === 'temporal-envelope');
  assert.ok(checkpoint);

  const resumed = resumeHandGraph({
    registry: canvasRegistry,
    graph: TRANSIENT_IMPULSE_CANVAS2D_GRAPH,
    checkpoint,
    edits: [
      { op: 'set', path: ['effect', 'tint'], value: [0.95, 0.14, 0.36] },
      { op: 'set', path: ['effect', 'accent'], value: [0.2, 0.88, 1] },
    ],
    context: { callerKind: 'machine' },
  });

  assert.deepEqual(resumed.executedStageIds, ['realize-canvas2d']);
  assert.equal(resumed.finalState.eventCanonicalHash, original.finalState.eventCanonicalHash);
  assert.equal(resumed.finalState.impulseField.geometryHash, original.finalState.impulseField.geometryHash);
  assert.notEqual(
    resumed.finalState.realizations.transientImpulseCanvas2d.modelHash,
    original.finalState.realizations.transientImpulseCanvas2d.modelHash,
  );
  assert.notEqual(
    resumed.finalState.realizations.transientImpulseCanvas2d.content,
    original.finalState.realizations.transientImpulseCanvas2d.content,
  );
});

test('Canvas2D realization rejects missing prerequisites and non-finite viewport claims', () => {
  assert.throws(
    () => impulseCanvas2dHand.execute({ realizations: {} }, {}),
    /requires impulse field \+ envelope/,
  );

  const finalState = runCanvas(makeTransientImpulseState({ id: 'canvas-boundary', seed: 72 })).finalState;
  assert.throws(
    () => impulseCanvas2dHand.execute(finalState, { width: Infinity, height: 600 }),
    /canvas2d\.width must be finite/,
  );
});
