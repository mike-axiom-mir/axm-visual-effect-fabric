import { mkdir, writeFile } from 'node:fs/promises';
import { createHandRegistry, executeHandGraph } from '../src/hand-runtime.mjs';
import {
  HOLOGRAPHIC_VOXEL_REFINE_HANDS,
  HOLOGRAPHIC_VOXEL_REFINE_GRAPH,
  makeHolographicFormState,
  makeAiForm,
  makeGlobeForm,
  makeRoverForm,
} from '../src/holographic-state-voxel-refine.mjs';

const registry=createHandRegistry(HOLOGRAPHIC_VOXEL_REFINE_HANDS);
const forms=[makeAiForm(),makeGlobeForm(),makeRoverForm()];
const out=new URL('../out/',import.meta.url);await mkdir(out,{recursive:true});
const cards=[],evidence=[];
for(const form of forms){
  const run=executeHandGraph({registry,graph:HOLOGRAPHIC_VOXEL_REFINE_GRAPH,initialState:makeHolographicFormState(form,20260916),context:{callerKind:'deterministic-program'}});
  const r=run.finalState.realizations.holographicVoxelSurface,ref=run.finalState.surfaceMesh.refinement;
  const name=`holographic-voxel-refined-${form.id}.html`;await writeFile(new URL(name,out),r.content);
  cards.push(`<a href="${name}"><strong>${form.id}</strong><span>${r.triangleCount} tris · max move ${ref.maxAppliedMove}</span></a>`);
  evidence.push({id:form.id,finalStateHash:run.finalStateHash,canonicalFormHash:r.canonicalFormHash,voxelDigest:r.voxelDigest,parentMeshDigest:run.finalState.surfaceMesh.parentMeshDigest,meshDigest:r.meshDigest,triangleCount:r.triangleCount,refinement:ref,workingSet:r.workingSet});
}
const hub=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AXM Refined 3D Holographic Surface</title><style>body{margin:0;background:#010309;color:#dff;font:15px ui-monospace,monospace;display:grid;place-items:center;min-height:100vh}.wrap{width:min(92vw,760px)}h1{font-size:20px;letter-spacing:.08em}p{color:#8bd}a{display:flex;justify-content:space-between;padding:18px;margin:12px 0;border:1px solid #38dbe455;text-decoration:none;color:#bff;background:#06202855}span{color:#7ad}</style><div class="wrap"><h1>REFINED 3D HOLOGRAPHIC SURFACE v0.7</h1><p>Bounded normal-aware refinement smooths agreeing surface regions while limiting movement near stronger feature changes. Canonical form and the v0.6 reconstruction lineage remain preserved.</p>${cards.join('')}</div>`;
await writeFile(new URL('holographic-voxel-refined.html',out),hub);
await writeFile(new URL('holographic-voxel-refined-evidence.json',out),JSON.stringify(evidence,null,2)+'\n');
console.log(`HOLOGRAPHIC_VOXEL_REFINE_OK forms=${forms.length} triangles=${evidence.map(x=>x.triangleCount).join(',')}`);
