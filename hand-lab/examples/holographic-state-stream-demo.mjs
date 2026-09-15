import { mkdir, writeFile } from 'node:fs/promises';
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

function fieldFromForm(form){const registry=createHandRegistry(HOLOGRAPHIC_STATE_PROJECTOR_HANDS);const run=executeHandGraph({registry,graph:HOLOGRAPHIC_STATE_PROJECTOR_GRAPH,initialState:makeHolographicFormState(form,20260915),context:{callerKind:'deterministic-program'}});const field=run.finalState.sampleField;field.id=form.id;return field}
function helixField(){const points=[];for(let i=0;i<900;i++){const t=i/899,a=t*Math.PI*12,y=-.78+t*1.56;for(const side of[-1,1])points.push(Math.cos(a)*.31*side,y,Math.sin(a)*.31*side,2,2,t,.86+.14*Math.sin(a*2))}return{id:'raw-double-helix',sourceKind:'external-arbitrary-samples',sourceDigest:'raw-helix-proof-v1',style:{pattern:'waves',amount:.2,scale:8},stride:7,points}}

const out=new URL('../out/',import.meta.url);await mkdir(out,{recursive:true});
const directRegistry=createHandRegistry(DIRECT_SAMPLE_PROJECTOR_HANDS);const directRun=executeHandGraph({registry:directRegistry,graph:DIRECT_SAMPLE_PROJECTOR_GRAPH,initialState:makeDirectSampleState(helixField(),20260915),context:{callerKind:'holodeck-adapter'}});await writeFile(new URL('holographic-state-raw-helix.html',out),directRun.finalState.realizations.holographicStateProjector.content);
const ai=fieldFromForm(makeAiForm()),globe=fieldFromForm(makeGlobeForm());const morphRegistry=createHandRegistry(HOLOGRAPHIC_STATE_MORPH_HANDS);const morphRun=executeHandGraph({registry:morphRegistry,graph:HOLOGRAPHIC_STATE_MORPH_GRAPH,initialState:makeMorphState(ai,globe,20260915),context:{callerKind:'deterministic-program'}});await writeFile(new URL('holographic-state-ai-to-globe.html',out),morphRun.finalState.realizations.holographicStateMorph.content);
const evidence={direct:{sourceKind:directRun.finalState.form.sourceKind,sourceDigest:directRun.finalState.form.sourceDigest,pointCount:directRun.finalState.sampleField.pointCount,finalStateHash:directRun.finalStateHash},morph:{sourceId:morphRun.finalState.morphField.sourceId,targetId:morphRun.finalState.morphField.targetId,count:morphRun.finalState.morphField.count,pairing:morphRun.finalState.morphField.pairing,finalStateHash:morphRun.finalStateHash}};await writeFile(new URL('holographic-state-stream-evidence.json',out),JSON.stringify(evidence,null,2)+'\n');
const hub=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AXM Holographic State Stream v0.2</title><style>body{margin:0;background:#02050b;color:#dff;font:15px ui-monospace,monospace;display:grid;place-items:center;min-height:100vh}.w{width:min(92vw,760px)}h1{font-size:20px}p{color:#8bd}a{display:block;padding:18px;margin:12px 0;border:1px solid #38dbe455;color:#bff;text-decoration:none;background:#06202855}</style><div class="w"><h1>HOLOGRAPHIC STATE PROJECTOR v0.2</h1><p>Arbitrary sample-field admission + deterministic state morphing. The projector no longer depends on the primitive form vocabulary.</p><a href="holographic-state-raw-helix.html">Raw external sample field — double helix</a><a href="holographic-state-ai-to-globe.html">State morph — guide AI ↔ strategy globe</a></div>`;await writeFile(new URL('holographic-state-stream.html',out),hub);console.log(`HOLOGRAPHIC_STATE_STREAM_OK raw=${directRun.finalState.sampleField.pointCount} morph=${morphRun.finalState.morphField.count}`);
