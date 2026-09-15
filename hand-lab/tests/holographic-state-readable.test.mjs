import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph } from '../src/hand-runtime.mjs';
import {
  HOLOGRAPHIC_STATE_READABLE_HANDS,
  HOLOGRAPHIC_STATE_READABLE_GRAPH,
  makeHolographicFormState,
  makeAiForm,
  makeGlobeForm,
  makeRoverForm,
} from '../src/holographic-state-readable.mjs';

const registry=createHandRegistry(HOLOGRAPHIC_STATE_READABLE_HANDS);
function run(form,callerKind='deterministic-program'){
  return executeHandGraph({registry,graph:HOLOGRAPHIC_STATE_READABLE_GRAPH,initialState:makeHolographicFormState(form,20260915),context:{callerKind}});
}

test('readable projection stays deterministic and caller-neutral',()=>{
  const human=run(makeRoverForm(),'human-ui');
  const mirror=run(makeRoverForm(),'mirror-deterministic');
  assert.equal(human.finalStateHash,mirror.finalStateHash);
});

test('visibility fit expands compact forms without changing canonical form hash',()=>{
  const rover=run(makeRoverForm());
  const globe=run(makeGlobeForm());
  for(const result of [rover,globe]){
    const r=result.finalState.realizations.holographicStateReadable;
    assert.ok(r.visibility.fitScale>1);
    assert.ok(r.visibility.pointBoost>=1.2);
    assert.ok(r.visibility.exposure>=1);
    assert.equal(r.visibility.mobileLegibility,true);
    assert.equal(r.visibility.twoPassGlow,true);
    assert.equal(r.canonicalFormHash,result.finalState.sampleField.canonicalFormHash);
  }
});

test('default readable HTML uses auto-fit, two-pass glow, and stronger mobile backing without scan bar',()=>{
  const result=run(makeAiForm());
  const html=result.finalState.realizations.holographicStateReadable.content;
  assert.match(html,/AUTO-FIT/);
  assert.match(html,/u?L/);
  assert.match(html,/g\.drawArrays\(g\.POINTS/);
  assert.match(html,/devicePixelRatio/);
  assert.match(html,/1\.35/);
  assert.doesNotMatch(html,/scanWave/);
  assert.doesNotMatch(html,/fract\(time\*\.115\)/);
});

test('same readable renderer handles AI globe and rover',()=>{
  const outputs=[makeAiForm(),makeGlobeForm(),makeRoverForm()].map(form=>run(form).finalState.realizations.holographicStateReadable);
  assert.deepEqual(outputs.map(x=>x.renderer),Array(3).fill('axm.vfx.holographic-state-readable/v0.3'));
  assert.ok(new Set(outputs.map(x=>x.canonicalFormHash)).size===3);
});
