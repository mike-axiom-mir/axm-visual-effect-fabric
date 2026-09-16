import { deepClone, hashValue } from './hand-runtime.mjs';
import {
  voxelDensityHand,
  voxelSurfaceMeshHand,
  voxelSurfaceWebglHand,
  makeHolographicFormState,
  makeAiForm,
  makeGlobeForm,
  makeRoverForm,
} from './holographic-state-voxel-surface.mjs';
import { normalizeFormHand, sampleFormHand, creativeFieldHand } from './holographic-state-projector.mjs';

const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,Number(v)));
const round6=v=>Number(Number(v).toFixed(6));
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const scale=(v,s)=>[v[0]*s,v[1]*s,v[2]*s];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function normalize(v){const l=Math.hypot(v[0],v[1],v[2])||1;return[v[0]/l,v[1]/l,v[2]/l]}
function hand(id,execute,description){return Object.freeze({schema:'axm.hand/v0.1',id,version:'0.7.0',deterministic:true,callerNeutral:true,network:'forbidden',description,execute})}
function key3(v){return `${round6(v[0])},${round6(v[1])},${round6(v[2])}`}

function buildTopology(mesh){
  const groupByKey=new Map(),groups=[],vertexGroup=[];
  for(let i=0;i<mesh.vertices.length;i+=3){
    const p=[mesh.vertices[i],mesh.vertices[i+1],mesh.vertices[i+2]],key=key3(p);
    let gi=groupByKey.get(key);
    if(gi===undefined){gi=groups.length;groupByKey.set(key,gi);groups.push({p,neighbors:new Set(),normal:[0,0,0],samples:0});}
    vertexGroup.push(gi);
    const n=[mesh.normals[i],mesh.normals[i+1],mesh.normals[i+2]];
    groups[gi].normal=add(groups[gi].normal,n);groups[gi].samples++;
  }
  for(const g of groups)g.normal=normalize(g.normal);
  for(let i=0;i<vertexGroup.length;i+=3){
    const a=vertexGroup[i],b=vertexGroup[i+1],c=vertexGroup[i+2];
    if(a!==b){groups[a].neighbors.add(b);groups[b].neighbors.add(a)}
    if(b!==c){groups[b].neighbors.add(c);groups[c].neighbors.add(b)}
    if(c!==a){groups[c].neighbors.add(a);groups[a].neighbors.add(c)}
  }
  return{groups,vertexGroup};
}

function recomputeNormals(positions,vertexGroup){
  const accum=positions.map(()=>[0,0,0]);
  for(let i=0;i<vertexGroup.length;i+=3){
    const a=vertexGroup[i],b=vertexGroup[i+1],c=vertexGroup[i+2];
    const fn=normalize(cross(sub(positions[b],positions[a]),sub(positions[c],positions[a])));
    accum[a]=add(accum[a],fn);accum[b]=add(accum[b],fn);accum[c]=add(accum[c],fn);
  }
  return accum.map(normalize);
}

export const featurePreservingRefineHand=hand('fx.hologram.feature-preserving-surface-refine',(state,params)=>{
  const next=deepClone(state),mesh=next.surfaceMesh;
  if(!mesh?.vertices?.length||!mesh?.normals?.length)throw new Error('feature-preserving refine requires surfaceMesh');
  const {groups,vertexGroup}=buildTopology(mesh),iterations=Math.round(clamp(params.iterations??2,1,4));
  const lambda=clamp(params.lambda??.18,.03,.35),preserve=clamp(params.featurePreserve??.72,.3,.95);
  const span=next.voxelField.bounds.min.map((v,i)=>next.voxelField.bounds.max[i]-v);
  const voxelStep=Math.max(...span)/(next.voxelField.resolution-1),maxMove=voxelStep*clamp(params.maxMoveVoxels??.22,.05,.45);
  let positions=groups.map(g=>g.p.slice()),normals=groups.map(g=>g.normal.slice()),totalMove=0,maxObserved=0,moved=0;
  for(let it=0;it<iterations;it++){
    const out=positions.map(p=>p.slice());
    for(let gi=0;gi<groups.length;gi++){
      const neighbors=[...groups[gi].neighbors];if(neighbors.length<2)continue;
      let centroid=[0,0,0],neighborNormal=[0,0,0];
      for(const ni of neighbors){centroid=add(centroid,positions[ni]);neighborNormal=add(neighborNormal,normals[ni]);}
      centroid=scale(centroid,1/neighbors.length);neighborNormal=normalize(neighborNormal);
      const alignment=Math.abs(dot(normals[gi],neighborNormal));
      const smoothWeight=clamp((alignment-preserve)/(1-preserve),0,1);
      let delta=scale(sub(centroid,positions[gi]),lambda*smoothWeight),len=Math.hypot(...delta);
      if(len>maxMove)delta=scale(delta,maxMove/len);
      len=Math.hypot(...delta);
      if(len>1e-9){out[gi]=add(positions[gi],delta);totalMove+=len;maxObserved=Math.max(maxObserved,len);moved++;}
    }
    positions=out;normals=recomputeNormals(positions,vertexGroup);
  }
  const vertices=[],outNormals=[];
  for(const gi of vertexGroup){vertices.push(...positions[gi].map(round6));outNormals.push(...normals[gi].map(round6));}
  const parentMeshDigest=mesh.digest;
  next.surfaceMesh={...mesh,schema:'axm.holographic-triangle-surface/v0.2',method:'marching-tetrahedra-plus-feature-preserving-refine',parentMeshDigest,vertices,normals:outNormals,refinement:{iterations,lambda:round6(lambda),featurePreserve:round6(preserve),maxMove:round6(maxMove),uniqueVertices:groups.length,movedSamples:moved,meanAppliedMove:round6(moved?totalMove/moved:0),maxAppliedMove:round6(maxObserved)}};
  next.surfaceMesh.digest=hashValue({parentMeshDigest,vertices,outNormals,refinement:next.surfaceMesh.refinement});
  return{state:next,evidence:{triangleCount:next.surfaceMesh.triangleCount,uniqueVertices:groups.length,parentMeshDigest,refinedMeshDigest:next.surfaceMesh.digest,meanAppliedMove:next.surfaceMesh.refinement.meanAppliedMove,maxAppliedMove:next.surfaceMesh.refinement.maxAppliedMove}};
},'Smooth a derived triangle shell only where neighboring surface normals agree, limiting displacement so major feature boundaries are not indiscriminately melted away.');

export const refinedVoxelSurfaceWebglHand=hand('fx.hologram.voxel-surface-refined-webgl',(state,params,context)=>{
  const result=voxelSurfaceWebglHand.execute(state,params,context),next=result.state;
  const r=next.realizations.holographicVoxelSurface;
  r.renderer='axm.vfx.holographic-voxel-surface/v0.7';
  r.content=r.content.replace('AXM Holographic Voxel Surface','AXM Refined Holographic Voxel Surface').replace('AXM // 3D HOLOGRAPHIC SURFACE //','AXM // REFINED 3D HOLOGRAPHIC SURFACE //');
  r.refinement=deepClone(next.surfaceMesh.refinement);
  r.meshDigest=next.surfaceMesh.digest;
  return{state:next,evidence:{...result.evidence,renderer:r.renderer,refinement:deepClone(r.refinement)}};
},'Render the feature-preserved refined 3D shell through the existing cheap triangle hologram realization.');

export const HOLOGRAPHIC_VOXEL_REFINE_HANDS=[normalizeFormHand,sampleFormHand,creativeFieldHand,voxelDensityHand,voxelSurfaceMeshHand,featurePreservingRefineHand,refinedVoxelSurfaceWebglHand];
export const HOLOGRAPHIC_VOXEL_REFINE_GRAPH=Object.freeze({schema:'axm.hand-graph/v0.1',id:'fx.holographic-voxel-surface-refined',version:'0.7.0',stages:[
  {id:'normalize-form',hand:'fx.hologram.form-normalize',params:{}},
  {id:'sample-form',hand:'fx.hologram.form-sample',params:{}},
  {id:'creative-field',hand:'fx.hologram.creative-field',params:{}},
  {id:'voxel-density',hand:'fx.hologram.voxel-density',params:{resolution:22,kernel:1.9,iso:.16}},
  {id:'surface-mesh',hand:'fx.hologram.voxel-surface-mesh',params:{maxTriangles:28000}},
  {id:'feature-refine',hand:'fx.hologram.feature-preserving-surface-refine',params:{iterations:2,lambda:.18,featurePreserve:.72,maxMoveVoxels:.22}},
  {id:'realize-refined',hand:'fx.hologram.voxel-surface-refined-webgl',params:{}},
]});

export {makeHolographicFormState,makeAiForm,makeGlobeForm,makeRoverForm};
