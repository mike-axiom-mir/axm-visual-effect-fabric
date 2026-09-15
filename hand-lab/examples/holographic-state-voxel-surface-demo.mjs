import { mkdir, writeFile } from 'node:fs/promises';
import { createHandRegistry, executeHandGraph } from '../src/hand-runtime.mjs';
import {
  HOLOGRAPHIC_VOXEL_SURFACE_HANDS,
  HOLOGRAPHIC_VOXEL_SURFACE_GRAPH,
  makeHolographicFormState,
  makeAiForm,
  makeGlobeForm,
  makeRoverForm,
} from '../src/holographic-state-voxel-surface.mjs';

const registry=createHandRegistry(HOLOGRAPHIC_VOXEL_SURFACE_HANDS);
const forms=[makeAiForm(),makeGlobeForm(),makeRoverForm()];
const out=new URL('../out/',import.meta.url);await mkdir(out,{recursive:true});
const cards=[],evidence=[];
for(const form of forms){
  const run=executeHandGraph({registry,graph:HOLOGRAPHIC_VOXEL_SURFACE_GRAPH,initialState:makeHolographicFormState(form,20260915),context:{callerKind:'deterministic-program'}});
  const r=run.finalState.realizations.holographicVoxelSurface;
  const name=`holographic-voxel-surface-${form.id}.html`;await writeFile(new URL(name,out),r.content);
  cards.push(`<a href="${name}"><strong>${form.id}</strong><span>${r.triangleCount} tris</span></a>`);
  evidence.push({id:form.id,finalStateHash:run.finalStateHash,canonicalFormHash:r.canonicalFormHash,voxelDigest:r.voxelDigest,meshDigest:r.meshDigest,triangleCount:r.triangleCount,workingSet:r.workingSet});
}
const hub=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AXM 3D Holographic Surface</title><style>body{margin:0;background:#010309;color:#dff;font:15px ui-monospace,monospace;display:grid;place-items:center;min-height:100vh}.wrap{width:min(92vw,760px)}h1{font-size:20px;letter-spacing:.08em}p{color:#8bd}a{display:flex;justify-content:space-between;padding:18px;margin:12px 0;border:1px solid #38dbe455;text-decoration:none;color:#bff;background:#06202855}span{color:#7ad}</style><div class="wrap"><h1>3D HOLOGRAPHIC SURFACE v0.6</h1><p>Sample state becomes a derived voxel density and then a real triangle shell. The triangle mesh is disposable render state; canonical form remains truth.</p>${cards.join('')}</div>`;
await writeFile(new URL('holographic-voxel-surface.html',out),hub);
await writeFile(new URL('holographic-voxel-surface-evidence.json',out),JSON.stringify(evidence,null,2)+'\n');
console.log(`HOLOGRAPHIC_VOXEL_SURFACE_OK forms=${forms.length} triangles=${evidence.map(x=>x.triangleCount).join(',')}`);
