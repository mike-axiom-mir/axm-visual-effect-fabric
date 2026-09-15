import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph, hashValue, resumeHandGraph } from '../src/hand-runtime.mjs';
import { HOLOGRAM_HANDS, HOLOGRAPHIC_PANEL_GRAPH, makeHologramInitialState } from '../src/hologram-hands.mjs';

const registry = createHandRegistry(HOLOGRAM_HANDS);

test('hologram is deterministic and caller-neutral', () => {
  const initial = makeHologramInitialState(4444, 'stable');
  const human = executeHandGraph({ registry, graph: HOLOGRAPHIC_PANEL_GRAPH, initialState: initial, context: { callerKind: 'human-ui' } });
  const ai = executeHandGraph({ registry, graph: HOLOGRAPHIC_PANEL_GRAPH, initialState: initial, context: { callerKind: 'ai-agent' } });
  const mirror = executeHandGraph({ registry, graph: HOLOGRAPHIC_PANEL_GRAPH, initialState: initial, context: { callerKind: 'mirror-deterministic' } });

  assert.equal(human.finalStateHash, ai.finalStateHash);
  assert.equal(ai.finalStateHash, mirror.finalStateHash);
  assert.equal(human.checkpoints.length, 9);
});

test('mid-process edits replay downstream only', () => {
  const original = executeHandGraph({
    registry,
    graph: HOLOGRAPHIC_PANEL_GRAPH,
    initialState: makeHologramInitialState(91, 'stable'),
  });
  const checkpoint = original.checkpoints.find((row) => row.stageId === 'interference');
  assert.ok(checkpoint);
  const checkpointHashBefore = hashValue(checkpoint.state);

  const resumed = resumeHandGraph({
    registry,
    graph: HOLOGRAPHIC_PANEL_GRAPH,
    checkpoint,
    edits: [
      { op: 'set', path: ['effect', 'requestedState'], value: 'focus' },
      { op: 'set', path: ['effect', 'controls', 'glowScale'], value: 1.28 },
      { op: 'set', path: ['fields', 'interference', 'bands', 0, 'intensity'], value: 0.72 },
    ],
  });

  assert.equal(hashValue(checkpoint.state), checkpointHashBefore);
  assert.deepEqual(resumed.executedStageIds, ['emission', 'semantic-state', 'motion-envelope', 'svg-preview', 'html-demo']);
  assert.equal(resumed.finalState.effect.activeState, 'focus');
  assert.equal(resumed.finalState.effect.controls.glowScale, 1.28);
  assert.notEqual(resumed.finalStateHash, original.finalStateHash);
});

test('canonical hologram state stays editable and previews are derived', () => {
  const run = executeHandGraph({
    registry,
    graph: HOLOGRAPHIC_PANEL_GRAPH,
    initialState: makeHologramInitialState(77, 'materialize'),
  });

  assert.equal(run.finalState.geometry.depthSlices.length, 7);
  assert.equal(run.finalState.fields.scanlines.length, 42);
  assert.equal(run.finalState.fields.interference.bands.length, 9);
  assert.deepEqual(
    run.finalState.layers.map((row) => row.role),
    ['translucent-core', 'edge-emission', 'soft-bloom', 'depth-projection'],
  );
  assert.equal(run.finalState.motion.reveal.length, 4);
  assert.match(run.finalState.realizations.svgPreview.content, /AXM \/\/ HOLOGRAPHIC SURFACE/);
  assert.match(run.finalState.realizations.htmlDemo.content, /MATERIALIZE/);
  assert.match(run.finalState.realizations.htmlDemo.content, /prefers-reduced-motion/);
  assert.equal(
    run.finalState.realizations.svgPreview.derivedFromStateHash,
    run.finalState.realizations.htmlDemo.derivedFromStateHash,
  );
});

test('semantic states visibly differ without changing geometry', () => {
  const stable = executeHandGraph({
    registry,
    graph: HOLOGRAPHIC_PANEL_GRAPH,
    initialState: makeHologramInitialState(123, 'stable'),
  });
  const alert = executeHandGraph({
    registry,
    graph: HOLOGRAPHIC_PANEL_GRAPH,
    initialState: makeHologramInitialState(123, 'alert'),
  });

  assert.deepEqual(stable.finalState.geometry, alert.finalState.geometry);
  assert.notDeepEqual(stable.finalState.effect.profile, alert.finalState.effect.profile);
  assert.notEqual(stable.finalState.realizations.svgPreview.content, alert.finalState.realizations.svgPreview.content);
});
