import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph } from '../src/hand-runtime.mjs';
import {
  HOLOGRAPHIC_STATE_PROJECTOR_HANDS,
  HOLOGRAPHIC_STATE_PROJECTOR_GRAPH,
  makeHolographicFormState,
  makeAiForm,
  makeGlobeForm,
} from '../src/holographic-state-projector.mjs';
import {
  DIRECT_SAMPLE_PROJECTOR_HANDS,
  DIRECT_SAMPLE_PROJECTOR_GRAPH,
  HOLOGRAPHIC_STATE_MORPH_HANDS,
  HOLOGRAPHIC_STATE_MORPH_GRAPH,
  makeDirectSampleState,
  makeMorphState,
} from '../src/holographic-state-stream.mjs';

function fieldFromForm(form){const r=createHandRegistry(HOLOGRAPHIC_STATE_PROJECTOR_HANDS);return executeHandGraph({registry:r,graph:HOLOGRAPHIC_STATE_PROJECTOR_GRAPH,initialState:makeHolographicFormState(form,20260915)}).finalState.sampleField}
function helixField(){const points=[];for(let i=0;i<720;i++){const t=i/719,a=t*Math.PI*10,y=-.75+t*1.5;for(const side of[-1,1]){points.push(Math.cos(a)*.3*side,y,Math.sin(a)*.3*side,2,2,t,1)}}return{id:'raw-double-helix',sourceKind:'external-arbitrary-samples',sourceDigest:'raw-helix-proof-v1',style:{pattern:'waves',amount:.22,scale:8},stride:7,points}}

test('direct sample projector accepts arbitrary external packed 3D state',()=>{const registry=createHandRegistry(DIRECT_SAMPLE_PROJECTOR_HANDS);const run=executeHandGraph({registry,graph:DIRECT_SAMPLE_PROJECTOR_GRAPH,initialState:makeDirectSampleState(helixField()),context:{callerKind:'holodeck-adapter'}});assert.equal(run.finalState.form.sourceKind,'external-arbitrary-samples');assert.equal(run.finalState.sampleField.canonicalFormHash,'raw-helix-proof-v1');assert.equal(run.finalState.sampleField.pointCount,1440);assert.match(run.finalState.realizations.holographicStateProjector.content,/raw-double-helix/)});

test('direct sample projection is caller neutral',()=>{const initial=makeDirectSampleState(helixField());const registry=createHandRegistry(DIRECT_SAMPLE_PROJECTOR_HANDS);const a=executeHandGraph({registry,graph:DIRECT_SAMPLE_PROJECTOR_GRAPH,initialState:initial,context:{callerKind:'human-ui'}});const b=executeHandGraph({registry,graph:DIRECT_SAMPLE_PROJECTOR_GRAPH,initialState:initial,context:{callerKind:'mirror-deterministic'}});assert.equal(a.finalStateHash,b.finalStateHash)});

test('same morph graph pairs unrelated AI and globe state deterministically',()=>{const ai=fieldFromForm(makeAiForm()),globe=fieldFromForm(makeGlobeForm());ai.id='guide-ai';globe.id='strategy-globe';const registry=createHandRegistry(HOLOGRAPHIC_STATE_MORPH_HANDS);const one=executeHandGraph({registry,graph:HOLOGRAPHIC_STATE_MORPH_GRAPH,initialState:makeMorphState(ai,globe,77)});const two=executeHandGraph({registry,graph:HOLOGRAPHIC_STATE_MORPH_GRAPH,initialState:makeMorphState(ai,globe,77)});assert.equal(one.finalStateHash,two.finalStateHash);assert.equal(one.finalState.morphField.sourceId,'guide-ai');assert.equal(one.finalState.morphField.targetId,'strategy-globe');assert.ok(one.finalState.morphField.count>=Math.max(ai.pointCount,globe.pointCount))});

test('morph renderer uses one persistent GPU working set and has no descending scan bar',()=>{const ai=fieldFromForm(makeAiForm()),globe=fieldFromForm(makeGlobeForm());ai.id='guide-ai';globe.id='strategy-globe';const registry=createHandRegistry(HOLOGRAPHIC_STATE_MORPH_HANDS);const run=executeHandGraph({registry,graph:HOLOGRAPHIC_STATE_MORPH_GRAPH,initialState:makeMorphState(ai,globe)});const html=run.finalState.realizations.holographicStateMorph.content;assert.match(html,/g\.bufferData\(g\.ARRAY_BUFFER,data,g\.STATIC_DRAW\)/);assert.match(html,/mix\(A0,A1,e\)/);assert.match(html,/click = freeze\/resume morph/);assert.doesNotMatch(html,/scanWave|fract\(time\*\.115\)/)});
