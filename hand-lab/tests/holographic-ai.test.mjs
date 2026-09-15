import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph, resumeHandGraph } from '../src/hand-runtime.mjs';
import { HOLOGRAPHIC_AI_HANDS, HOLOGRAPHIC_AI_GRAPH, makeHolographicAiInitialState } from '../src/holographic-ai-hands.mjs';

const registry=createHandRegistry(HOLOGRAPHIC_AI_HANDS);

test('holographic AI is deterministic and caller-neutral',()=>{
  const initial=makeHolographicAiInitialState(444,'idle');
  const human=executeHandGraph({registry,graph:HOLOGRAPHIC_AI_GRAPH,initialState:initial,context:{callerKind:'human-ui'}});
  const ai=executeHandGraph({registry,graph:HOLOGRAPHIC_AI_GRAPH,initialState:initial,context:{callerKind:'ai-agent'}});
  const mirror=executeHandGraph({registry,graph:HOLOGRAPHIC_AI_GRAPH,initialState:initial,context:{callerKind:'mirror-deterministic'}});
  assert.equal(human.finalStateHash,ai.finalStateHash);
  assert.equal(ai.finalStateHash,mirror.finalStateHash);
});

test('body is original editable procedural state',()=>{
  const run=executeHandGraph({registry,graph:HOLOGRAPHIC_AI_GRAPH,initialState:makeHolographicAiInitialState(77,'listen')});
  assert.equal(run.finalState.ai.designOrigin,'procedural-self-made');
  assert.equal(run.finalState.ai.silhouette,'asymmetric-raised-hand-guide');
  assert.ok(run.finalState.ai.fragments.length>=16);
  assert.ok(run.finalState.particles.length>=12);
  assert.equal(run.finalState.effect.activeState,'listen');
});

test('semantic change replays only descendants',()=>{
  const run=executeHandGraph({registry,graph:HOLOGRAPHIC_AI_GRAPH,initialState:makeHolographicAiInitialState(88,'idle')});
  const checkpoint=run.checkpoints.find(row=>row.stageId==='body-fragments');
  assert.ok(checkpoint);
  const resumed=resumeHandGraph({
    registry,
    graph:HOLOGRAPHIC_AI_GRAPH,
    checkpoint,
    edits:[{op:'set',path:['effect','requestedState'],value:'speak'}],
    context:{callerKind:'deterministic-program'},
  });
  assert.deepEqual(resumed.executedStageIds,['semantic-behavior','projection-motion','realize-ai']);
  assert.equal(resumed.finalState.effect.activeState,'speak');
  assert.notEqual(resumed.finalStateHash,run.finalStateHash);
});

test('realization is procedural animated WebGL, not an image asset',()=>{
  const run=executeHandGraph({registry,graph:HOLOGRAPHIC_AI_GRAPH,initialState:makeHolographicAiInitialState(99,'idle')});
  const html=run.finalState.realizations.holographicAi.content;
  assert.match(html,/getContext\('webgl2'/);
  assert.match(html,/sdCapsule/);
  assert.match(html,/requestAnimationFrame/);
  assert.match(html,/STATE: IDLE/);
  assert.doesNotMatch(html,/<img\b/i);
});
