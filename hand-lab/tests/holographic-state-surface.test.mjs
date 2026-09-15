import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph, hashValue } from '../src/hand-runtime.mjs';
import {
  HOLOGRAPHIC_STATE_SURFACE_HANDS,
  HOLOGRAPHIC_STATE_SURFACE_GRAPH,
  makeHolographicFormState,
  makeAiForm,
  makeGlobeForm,
  makeRoverForm,
} from '../src/holographic-state-surface.mjs';

const registry=createHandRegistry(HOLOGRAPHIC_STATE_SURFACE_HANDS);
function run(form,callerKind='deterministic-program'){
  return executeHandGraph({registry,graph:HOLOGRAPHIC_STATE_SURFACE_GRAPH,initialState:makeHolographicFormState(form,20260915),context:{callerKind}});
}

test('surface reconstruction remains deterministic and caller-neutral',()=>{
  const human=run(makeAiForm(),'human-ui');
  const mirror=run(makeAiForm(),'mirror-deterministic');
  assert.equal(human.finalStateHash,mirror.finalStateHash);
  assert.equal(human.finalState.realizations.holographicStateSurface.derivedFromStateHash,mirror.finalState.realizations.holographicStateSurface.derivedFromStateHash);
});

test('surface field is derived from sample state without replacing canonical form truth',()=>{
  const result=run(makeRoverForm());
  const s=result.finalState;
  assert.equal(s.surfaceField.schema,'axm.holographic-surface-field/v0.1');
  assert.equal(s.surfaceField.method,'screen-space-density-reconstruction');
  assert.equal(s.surfaceField.derived,true);
  assert.equal(s.surfaceField.rebuildable,true);
  assert.equal(s.surfaceField.sourceSampleFieldHash,hashValue(s.sampleField));
  assert.equal(s.realizations.holographicStateSurface.canonicalFormHash,s.sampleField.canonicalFormHash);
  assert.equal(s.realizations.holographicStateSurface.workingSet.canonicalFormRetained,true);
  assert.equal(s.realizations.holographicStateSurface.workingSet.gpuDensityTextureDisposable,true);
});

test('one reconstructed surface renderer handles AI, globe, rover and explicit point forms',()=>{
  const explicit={id:'raw-wave-form',style:{pattern:'none'},primitives:[{type:'points',points:Array.from({length:180},(_,i)=>{const t=i/179*Math.PI*4;return [Math.cos(t)*.38,(i/179-.5)*1.1,Math.sin(t)*.16,2,0,i/179,1]})}]};
  const outputs=[makeAiForm(),makeGlobeForm(),makeRoverForm(),explicit].map(form=>run(form).finalState.realizations.holographicStateSurface);
  assert.deepEqual(outputs.map(x=>x.renderer),Array(4).fill('axm.vfx.holographic-state-surface/v0.5'));
  assert.ok(outputs.every(x=>x.pointCount>0));
  assert.equal(new Set(outputs.map(x=>x.canonicalFormHash)).size,4);
});

test('browser realization reconstructs density into a shell instead of presenting points as the final body',()=>{
  const result=run(makeAiForm());
  const html=result.finalState.realizations.holographicStateSurface.content;
  assert.match(html,/createFramebuffer\(\)/);
  assert.match(html,/RGBA8/);
  assert.match(html,/framebufferTexture2D/);
  assert.match(html,/screen-space density\/depth\/role/);
  assert.match(html,/g\.drawArrays\(g\.POINTS,0,/);
  assert.match(html,/g\.drawArrays\(g\.TRIANGLES,0,3\)/);
  assert.match(html,/smoothstep/);
  assert.match(html,/DENSITY → SHELL → LIGHT/);
  assert.doesNotMatch(html,/scanWave/);
  assert.doesNotMatch(html,/descending/i);
});
