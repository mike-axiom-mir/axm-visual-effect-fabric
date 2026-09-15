import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph, resumeHandGraph, hashValue } from '../src/hand-runtime.mjs';
import {
  HOLOGRAPHIC_AI_STATE_NATIVE_HANDS,
  HOLOGRAPHIC_AI_STATE_NATIVE_GRAPH,
  makeHolographicAiInitialState,
} from '../src/holographic-ai-state-native.mjs';

const registry = createHandRegistry(HOLOGRAPHIC_AI_STATE_NATIVE_HANDS);

test('state-native holographic AI remains deterministic and caller-neutral', () => {
  const initial = makeHolographicAiInitialState(444, 'idle');
  const human = executeHandGraph({ registry, graph: HOLOGRAPHIC_AI_STATE_NATIVE_GRAPH, initialState: initial, context: { callerKind: 'human-ui' } });
  const mirror = executeHandGraph({ registry, graph: HOLOGRAPHIC_AI_STATE_NATIVE_GRAPH, initialState: initial, context: { callerKind: 'mirror-deterministic' } });
  assert.equal(human.finalStateHash, mirror.finalStateHash);
  assert.equal(human.finalState.realizations.holographicAiStateNative.derivedFromStateHash, mirror.finalState.realizations.holographicAiStateNative.derivedFromStateHash);
});

test('state-native realization keeps canonical state separate from rebuildable GPU working set', () => {
  const run = executeHandGraph({ registry, graph: HOLOGRAPHIC_AI_STATE_NATIVE_GRAPH, initialState: makeHolographicAiInitialState(77, 'listen') });
  const realization = run.finalState.realizations.holographicAiStateNative;
  assert.equal(realization.renderer, 'axm.vfx.state-native-points/v0.1');
  assert.equal(realization.workingSet.canonicalStateRetained, true);
  assert.equal(realization.workingSet.derivedGpuDataRebuildable, true);
  assert.equal(realization.workingSet.bodyBufferBuildPolicy, 'once-per-body-hash');
  assert.equal(realization.workingSet.behaviorDeltaPolicy, 'uniform-only');
  assert.ok(realization.workingSet.pointCount > 2000);
  assert.ok(realization.workingSet.essentialPointCount < realization.workingSet.pointCount);
  assert.ok(realization.workingSet.modeledBufferBytes < 300000);
});

test('behavior state change keeps anatomy checkpoint and replays only behavior descendants', () => {
  const run = executeHandGraph({ registry, graph: HOLOGRAPHIC_AI_STATE_NATIVE_GRAPH, initialState: makeHolographicAiInitialState(88, 'idle') });
  const checkpoint = run.checkpoints.find(row => row.stageId === 'body-fragments');
  assert.ok(checkpoint);
  const anatomyHash = hashValue({
    head: checkpoint.state.ai.head,
    torso: checkpoint.state.ai.torso,
    pelvis: checkpoint.state.ai.pelvis,
    arms: checkpoint.state.ai.arms,
    legs: checkpoint.state.ai.legs,
    fragments: checkpoint.state.ai.fragments,
  });
  const resumed = resumeHandGraph({
    registry,
    graph: HOLOGRAPHIC_AI_STATE_NATIVE_GRAPH,
    checkpoint,
    edits: [{ op: 'set', path: ['effect', 'requestedState'], value: 'speak' }],
    context: { callerKind: 'deterministic-program' },
  });
  assert.deepEqual(resumed.executedStageIds, ['semantic-behavior', 'projection-motion', 'realize-ai-state-native']);
  assert.equal(resumed.finalState.effect.activeState, 'speak');
  assert.equal(hashValue({
    head: resumed.finalState.ai.head,
    torso: resumed.finalState.ai.torso,
    pelvis: resumed.finalState.ai.pelvis,
    arms: resumed.finalState.ai.arms,
    legs: resumed.finalState.ai.legs,
    fragments: resumed.finalState.ai.fragments,
  }), anatomyHash);
});

test('default state-native HTML uses a persistent GPU buffer and adaptive derived working set instead of ray marching', () => {
  const run = executeHandGraph({ registry, graph: HOLOGRAPHIC_AI_STATE_NATIVE_GRAPH, initialState: makeHolographicAiInitialState(99, 'idle') });
  const html = run.finalState.realizations.holographicAiStateNative.content;
  assert.match(html, /g\.bufferData\(g\.ARRAY_BUFFER,packed,g\.STATIC_DRAW\)/);
  assert.match(html, /applyStateDelta/);
  assert.match(html, /g\.drawArrays\(g\.POINTS,0,drawCount\)/);
  assert.match(html, /qualityLevels=\[\.5,\.68,\.82,1\.0\]/);
  assert.match(html, /visibilitychange/);
  assert.match(html, /bodyBufferBuilds=1/);
  assert.doesNotMatch(html, /sdCapsule/);
  assert.doesNotMatch(html, /for\(int i=0;i<92/);
});
