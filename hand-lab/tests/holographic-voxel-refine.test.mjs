import test from 'node:test';
import assert from 'node:assert/strict';
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
function run(form,callerKind='deterministic-program'){
  return executeHandGraph({registry,graph:HOLOGRAPHIC_VOXEL_REFINE_GRAPH,initialState:makeHolographicFormState(form,20260916),context:{callerKind}});
}

test('refined voxel surface remains deterministic and caller-neutral',()=>{
  const human=run(makeAiForm(),'human-ui'),mirror=run(makeAiForm(),'mirror-deterministic');
  assert.equal(human.finalStateHash,mirror.finalStateHash);
  assert.equal(human.finalState.surfaceMesh.digest,mirror.finalState.surfaceMesh.digest);
});

test('refinement preserves canonical/sample/voxel lineage and triangle count',()=>{
  const result=run(makeRoverForm()),s=result.finalState,mesh=s.surfaceMesh;
  assert.equal(mesh.schema,'axm.holographic-triangle-surface/v0.2');
  assert.equal(mesh.method,'marching-tetrahedra-plus-feature-preserving-refine');
  assert.match(mesh.parentMeshDigest,/^[0-9a-f]{64}$/);
  assert.equal(mesh.sourceVoxelDigest,s.voxelField.digest);
  assert.equal(s.realizations.holographicVoxelSurface.canonicalFormHash,s.sampleField.canonicalFormHash);
  assert.equal(s.realizations.holographicVoxelSurface.meshDigest,mesh.digest);
  assert.equal(s.realizations.holographicVoxelSurface.refinement.featurePreserve,.72);
  assert.ok(mesh.refinement.maxAppliedMove<=mesh.refinement.maxMove+1e-6);
  assert.ok(mesh.refinement.uniqueVertices>0);
});

test('one refinement graph handles materially different forms without consumer-specific renderer logic',()=>{
  const results=[makeAiForm(),makeGlobeForm(),makeRoverForm()].map(f=>run(f).finalState);
  assert.ok(results.every(s=>s.realizations.holographicVoxelSurface.renderer==='axm.vfx.holographic-voxel-surface/v0.7'));
  assert.ok(results.every(s=>s.surfaceMesh.triangleCount>0));
  assert.ok(results.every(s=>s.surfaceMesh.refinement.maxAppliedMove<=s.surfaceMesh.refinement.maxMove+1e-6));
  assert.equal(new Set(results.map(s=>s.surfaceMesh.digest)).size,3);
});

test('runtime stays a static triangle renderer rather than reintroducing raymarch or scan sweep',()=>{
  const html=run(makeAiForm()).finalState.realizations.holographicVoxelSurface.content;
  assert.match(html,/g\.bufferData\(g\.ARRAY_BUFFER,data,g\.STATIC_DRAW\)/);
  assert.match(html,/g\.drawArrays\(g\.TRIANGLES/);
  assert.match(html,/REFINED 3D HOLOGRAPHIC SURFACE/);
  assert.doesNotMatch(html,/for\(int i=.*ray/i);
  assert.doesNotMatch(html,/scanWave/);
});
