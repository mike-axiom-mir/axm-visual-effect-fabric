import { mkdir, writeFile } from 'node:fs/promises';
import { createHandRegistry, executeHandGraph } from '../src/hand-runtime.mjs';
import {
  HOLOGRAPHIC_STATE_SURFACE_HANDS,
  HOLOGRAPHIC_STATE_SURFACE_GRAPH,
  makeHolographicFormState,
  makeAiForm,
  makeGlobeForm,
  makeRoverForm,
} from '../src/holographic-state-surface.mjs';

const registry=createHandRegistry(HOLOGRAPHIC_STATE_SURFACE_HANDS);
const forms=[makeAiForm(),makeGlobeForm(),makeRoverForm()];
const out=new URL('../out/',import.meta.url);
await mkdir(out,{recursive:true});
const cards=[];
const evidence=[];
for(const form of forms){
  const run=executeHandGraph({registry,graph:HOLOGRAPHIC_STATE_SURFACE_GRAPH,initialState:makeHolographicFormState(form,20260915),context:{callerKind:'deterministic-program'}});
  const r=run.finalState.realizations.holographicStateSurface;
  const name=`holographic-surface-${form.id}.html`;
  await writeFile(new URL(name,out),r.content);
  cards.push(`<a href="${name}"><strong>${form.id}</strong><span>${r.pointCount} state samples → reconstructed shell</span></a>`);
  evidence.push({id:form.id,renderer:r.renderer,finalStateHash:run.finalStateHash,canonicalFormHash:r.canonicalFormHash,sampleFieldHash:r.sampleFieldHash,surfaceField:r.surfaceField,reconstruction:r.reconstruction});
}
const hub=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AXM Holographic Surface Projector</title><style>body{margin:0;background:#010309;color:#dff;font:15px ui-monospace,monospace;display:grid;place-items:center;min-height:100vh}.wrap{width:min(92vw,800px)}h1{font-size:20px;letter-spacing:.07em}p{color:#8bd;line-height:1.55}a{display:flex;justify-content:space-between;gap:24px;padding:18px;margin:12px 0;border:1px solid #38dbe455;text-decoration:none;color:#bff;background:#06202855}span{color:#7ad;text-align:right}</style><div class="wrap"><h1>HOLOGRAPHIC SURFACE PROJECTOR v0.5</h1><p>State points are now internal reconstruction input. A disposable density/depth field resolves them into one continuous translucent projected shell.</p>${cards.join('')}</div>`;
await writeFile(new URL('holographic-state-surface.html',out),hub);
await writeFile(new URL('holographic-state-surface-evidence.json',out),JSON.stringify(evidence,null,2)+'\n');
console.log(`HOLOGRAPHIC_STATE_SURFACE_OK forms=${forms.length} points=${evidence.map(x=>x.surfaceField.sourcePointCount).join(',')}`);
