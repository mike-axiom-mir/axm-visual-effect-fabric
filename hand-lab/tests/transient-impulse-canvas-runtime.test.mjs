import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createHandRegistry, executeHandGraph } from '../src/hand-runtime.mjs';
import { makeTransientImpulseState } from '../src/transient-impulse-hands.mjs';
import {
  TRANSIENT_IMPULSE_CANVAS_GRAPH,
  TRANSIENT_IMPULSE_CANVAS_HANDS,
} from '../src/transient-impulse-canvas.mjs';

const registry = createHandRegistry(TRANSIENT_IMPULSE_CANVAS_HANDS);

function buildRealization() {
  const run = executeHandGraph({
    registry,
    graph: TRANSIENT_IMPULSE_CANVAS_GRAPH,
    initialState: makeTransientImpulseState({
      id: 'canvas-runtime-proof',
      seed: 62026,
      duration: 0.7,
      origin: [0.46, 0.54],
      direction: [0.94, -0.21],
      energy: 1.16,
      radius: 0.3,
      controls: {
        symmetry: 0.24,
        directionality: 0.9,
        fragmentation: 0.68,
        ringWeight: 0.82,
        spokeWeight: 1.05,
      },
    }),
    context: { callerKind: 'runtime-proof' },
  });
  return { run, realization: run.finalState.realizations.transientImpulseCanvas2d };
}

function inlineScript(html) {
  const match = String(html).match(/<script>([\s\S]*?)<\/script>/i);
  assert.ok(match, 'generated Canvas2D artifact must contain one executable inline script');
  return match[1];
}

function makeCanvasHarness({ contextAvailable = true } = {}) {
  const calls = [];
  const context = {
    fillRect(...args) { calls.push(['fillRect', ...args]); },
    save() { calls.push(['save']); },
    restore() { calls.push(['restore']); },
    translate(...args) { calls.push(['translate', ...args]); },
    rotate(...args) { calls.push(['rotate', ...args]); },
    beginPath() { calls.push(['beginPath']); },
    ellipse(...args) { calls.push(['ellipse', ...args]); },
    stroke() { calls.push(['stroke']); },
    moveTo(...args) { calls.push(['moveTo', ...args]); },
    lineTo(...args) { calls.push(['lineTo', ...args]); },
    arc(...args) { calls.push(['arc', ...args]); },
    fill() { calls.push(['fill']); },
  };

  const canvas = {
    getContext(kind, options) {
      calls.push(['getContext', kind, options]);
      return contextAvailable ? context : null;
    },
  };

  const frameTimes = [0, 350, 1000];
  let frameIndex = 0;
  const sandbox = {
    document: {
      querySelector(selector) {
        calls.push(['querySelector', selector]);
        return canvas;
      },
    },
    performance: { now: () => 0 },
    requestAnimationFrame(callback) {
      if (frameIndex >= frameTimes.length) {
        throw new Error('generated one-shot renderer scheduled beyond bounded proof frames');
      }
      const timestamp = frameTimes[frameIndex];
      frameIndex += 1;
      callback(timestamp);
      return frameIndex;
    },
  };

  return {
    calls,
    sandbox,
    get frameCount() { return frameIndex; },
  };
}

test('generated Canvas2D HTML executes its one-shot renderer against the expected drawing interface', () => {
  const { run, realization } = buildRealization();
  const harness = makeCanvasHarness();
  const script = inlineScript(realization.content);

  vm.runInNewContext(script, harness.sandbox, { timeout: 1000 });

  assert.equal(realization.canonicalEventHash, run.finalState.eventCanonicalHash);
  assert.equal(realization.fieldGeometryHash, run.finalState.impulseField.geometryHash);
  assert.equal(realization.workingSet.rendererStateDisposable, true);
  assert.equal(harness.frameCount, 3);
  assert.ok(harness.calls.some(([name, selector]) => name === 'querySelector' && selector === '#c'));
  assert.ok(harness.calls.some(([name, kind]) => name === 'getContext' && kind === '2d'));
  assert.ok(harness.calls.some(([name]) => name === 'fillRect'));
  assert.ok(harness.calls.some(([name]) => name === 'ellipse'));
  assert.ok(harness.calls.some(([name]) => name === 'lineTo'));
  assert.ok(harness.calls.some(([name]) => name === 'arc'));
  assert.ok(harness.calls.some(([name]) => name === 'fill'));
});

test('generated Canvas2D HTML fails explicitly when the 2D context is unavailable', () => {
  const { realization } = buildRealization();
  const harness = makeCanvasHarness({ contextAvailable: false });
  const script = inlineScript(realization.content);

  assert.throws(
    () => vm.runInNewContext(script, harness.sandbox, { timeout: 1000 }),
    /Canvas2D required/,
  );
  assert.equal(harness.frameCount, 0);
});
