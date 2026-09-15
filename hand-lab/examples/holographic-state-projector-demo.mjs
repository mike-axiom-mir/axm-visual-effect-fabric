import { mkdir, writeFile } from 'node:fs/promises';
import { createHandRegistry, executeHandGraph } from '../src/hand-runtime.mjs';
import {
  HOLOGRAPHIC_STATE_PROJECTOR_HANDS,
  HOLOGRAPHIC_STATE_PROJECTOR_GRAPH,
  makeHolographicFormState,
  makeAiForm,
  makeGlobeForm,
  makeRoverForm,
} from '../src/holographic-state-projector.mjs';

const registry=createHandRegistry(HOLOGRAPHIC_STATE_PROJECTOR_HANDS);
const forms=[makeAiForm(),makeGlobeForm(),makeRoverForm()];
const out=new URL('../out/',import.meta.url);await mkdir(out,{recursive:true});
const cards=[];const evidence=[];
for(const form of forms){const run=executeHandGraph({registry,graph:HOLOGRAPHIC_STATE_PROJECTOR_GRAPH,initialState:makeHolographicFormState(form,20260915),context:{callerKind:'deterministic-program'}});const r=run.finalState.realizations.holographicStateProjector;const name=`holographic-state-${form.id}.html`;await writeFile(new URL(name,out),r.content);cards.push(`<a href="${name}"><strong>${form.id}</strong><span>${r.pointCount} samples</span></a>`);evidence.push({id:form.id,finalStateHash:run.finalStateHash,canonicalFormHash:r.canonicalFormHash,sampleFieldHash:r.sampleFieldHash,pointCount:r.pointCount})}
const hub=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AXM Holographic State Projector</title><style>body{margin:0;background:#02050b;color:#dff;font:15px ui-monospace,monospace;display:grid;place-items:center;min-height:100vh}.wrap{width:min(92vw,760px)}h1{font-size:20px;letter-spacing:.08em}p{color:#8bd}a{display:flex;justify-content:space-between;padding:18px;margin:12px 0;border:1px solid #38dbe455;text-decoration:none;color:#bff;background:#06202855}span{color:#7ad}</style><div class="wrap"><h1>HOLOGRAPHIC STATE PROJECTOR v0.1</h1><p>One projector, three unrelated canonical forms. Form state is truth; point/splat hologram is disposable expression.</p>${cards.join('')}</div>`;await writeFile(new URL('holographic-state-projector.html',out),hub);await writeFile(new URL('holographic-state-projector-evidence.json',out),JSON.stringify(evidence,null,2)+'\n');console.log(`HOLOGRAPHIC_STATE_PROJECTOR_OK forms=${forms.length} points=${evidence.map(x=>x.pointCount).join(',')}`);
