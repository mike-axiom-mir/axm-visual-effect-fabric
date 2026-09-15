import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph, hashValue } from '../src/hand-runtime.mjs';
import {
  HOLOGRAPHIC_VOXEL_SURFACE_HANDS,
  HOLOGRAPHIC_VOXEL_SURFACE_GRAPH,
  makeHolographicFormState,
  makeAiForm,
  makeGlobeForm,
  makeRoverForm,
} from '../src/holographic-state-voxel-surface.mjs';

const registry=createHandRegistry(HOLOGRAPHIC_VOXEL_SURFACE_HANDS);
function run(form,callerKind='deterministic-program'){
  return executeHandGraph({registry,graph:HOLOGRAPHIC_VOXEL_SURFACE_GRAPH,initialState:makeHolographicFormState(form,20260915),context:{callerKind}});
}

test('3D voxel surface remains deterministic and caller-neutral',()=>{
  const human=run(makeAiForm(),'human-ui');
  const mirror=run(makeAiForm(),'mirror-deterministic');
  assert.equal(human.finalStateHash,mirror.finalStateHash);
  assert.equal(human.finalState.surfaceMesh.digest,mirror.finalState.surfaceMesh.digest);
});

test('voxel density and triangle mesh are derived rebuildable state under canonical form truth',()=>{
  const result=run(makeRoverForm()),s=result.finalState,r=s.realizations.holographicVoxelSurface;
  assert.equal(s.voxelField.schema,'axm.holographic-voxel-density/v0.1');
  assert.equal(s.voxelField.derived,true);
  assert.equal(s.voxelField.rebuildable,true);
  assert.equal(s.voxelField.sourceSampleFieldHash,hashValue(s.sampleField));
  assert.equal(s.surfaceMesh.schema,'axm.holographic-triangle-surface/v0.1');
  assert.equal(s.surfaceMesh.method,'marching-tetrahedra-over-derived-voxel-density');
  assert.ok(s.surfaceMesh.triangleCount>100);
  assert.equal(r.canonicalFormHash,s.sampleField.canonicalFormHash);
  assert.equal(r.workingSet.triangleMeshDerived,true);
  assert.equal(r.workingSet.gpuTriangleBufferDisposable,true);
});

test('one real 3D surface renderer handles AI, globe, rover, and explicit point state',()=>{
  const explicit={id:'raw-helix-surface',style:{pattern:'none'},primitives:[{type:'points',points:Array.from({length:220},(_,i)=>{const t=i/219*Math.PI*5;return [Math.cos(t)*.32,(i/219-.5)*1.05,Math.sin(t)*.18,2,0,i/219,1]})}]};
  const outputs=[makeAiForm(),makeGlobeForm(),makeRoverForm(),explicit].map(form=>run(form).finalState.realizations.holographicVoxelSurface);
  assert.deepEqual(outputs.map(x=>x.renderer),Array(4).fill('axm.vfx.holographic-voxel-surface/v0.6'));
  assert.ok(outputs.every(x=>x.triangleCount>0));
  assert.equal(new Set(outputs.map(x=>x.meshDigest)).size,4);
});

test('browser realization renders retained geometry as triangles with actual depth/parallax',()=>{
  const result=run(makeAiForm()),html=result.finalState.realizations.holographicVoxelSurface.content;
  assert.match(html,/g\.drawArrays\(g\.TRIANGLES/);
  assert.match(html,/g\.enable\(g\.DEPTH_TEST\)/);
  assert.match(html,/aNormal/);
  assert.match(html,/fres/);
  assert.match(html,/touchmove/);
  assert.doesNotMatch(html,/for\(int i=0;i<92/);
  assert.doesNotMatch(html,/scanWave/);
});
