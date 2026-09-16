import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph, hashValue } from '../src/hand-runtime.mjs';
import { sampleFbmSource } from '../src/field-operators.mjs';
import {
  DOMAIN_WARP_GRAPH,
  DOMAIN_WARP_HANDS,
  buildDomainWarpGridHand,
  makeDomainWarpState,
  normalizeDomainWarpRequestHand,
  sampleDomainWarpSource,
} from '../src/field-domain-warp-operators.mjs';

const registry = createHandRegistry(DOMAIN_WARP_HANDS);

function graphWithGrid(width, height, maxCells = 16384) {
  return {
    ...DOMAIN_WARP_GRAPH,
    stages: [
      DOMAIN_WARP_GRAPH.stages[0],
      {
        id: 'build-domain-warp-grid',
        hand: 'fx.field.domain-warp-grid-build',
        params: { width, height, maxCells },
      },
    ],
  };
}

function run(state, graph = DOMAIN_WARP_GRAPH, callerKind = 'test') {
  return executeHandGraph({ registry, graph, initialState: state, context: { callerKind } });
}

function warpGrid(result, id) {
  return result.finalState.domainWarpFields[id];
}

test('domain warp is deterministic, caller-neutral and keeps bounded derived state', () => {
  const state = makeDomainWarpState({
    id: 'neutral-warp',
    amplitude: 0.18,
    field: { id: 'base-shape', seed: 90210, frequency: 4.5, octaves: 5, lacunarity: 2.15, gain: 0.57 },
    flowField: { id: 'flow-shape', seed: 4404, frequency: 2.25, octaves: 4, lacunarity: 2.1, gain: 0.52 },
    flow: { id: 'neutral-flow', mode: 'tangent', sampleStep: 0.01, strength: 1.4 },
  });
  const human = run(state, DOMAIN_WARP_GRAPH, 'human');
  const machine = run(state, DOMAIN_WARP_GRAPH, 'machine');
  const humanGrid = warpGrid(human, 'neutral-warp');
  const machineGrid = warpGrid(machine, 'neutral-warp');

  assert.equal(human.finalStateHash, machine.finalStateHash);
  assert.equal(human.finalState.fieldSourceHash, machine.finalState.fieldSourceHash);
  assert.equal(human.finalState.flowFieldSourceHash, machine.finalState.flowFieldSourceHash);
  assert.equal(human.finalState.flowSourceHash, machine.finalState.flowSourceHash);
  assert.equal(human.finalState.warpSourceHash, machine.finalState.warpSourceHash);
  assert.equal(humanGrid.fieldHash, machineGrid.fieldHash);
  assert.equal(humanGrid.values.length, 48 * 32);
  assert.equal(humanGrid.derived, true);
  assert.equal(humanGrid.rebuildable, true);
  assert.ok(humanGrid.values.every((value) => Number.isFinite(value) && value >= 0 && value <= 1));
  assert.ok(humanGrid.maxDisplacement <= Math.SQRT2 * 0.18 + 0.00001);
});

test('continuous source truth is independent from rebuildable domain-warp grid resolution', () => {
  const state = makeDomainWarpState({
    id: 'resolution-warp',
    amplitude: 0.14,
    field: { id: 'resolution-base', seed: 404, frequency: 2.75, octaves: 6, lacunarity: 1.9, gain: 0.61 },
    flowField: { id: 'resolution-flow-field', seed: 707, frequency: 5.25, octaves: 3, lacunarity: 2.4, gain: 0.47 },
    flow: { id: 'resolution-flow', mode: 'gradient', sampleStep: 0.02, strength: 0.8 },
  });
  const low = run(state, graphWithGrid(20, 12)).finalState;
  const high = run(state, graphWithGrid(80, 48)).finalState;
  const lowGrid = low.domainWarpFields['resolution-warp'];
  const highGrid = high.domainWarpFields['resolution-warp'];

  assert.equal(low.fieldSourceHash, high.fieldSourceHash);
  assert.equal(low.flowFieldSourceHash, high.flowFieldSourceHash);
  assert.equal(low.flowSourceHash, high.flowSourceHash);
  assert.equal(low.warpSourceHash, high.warpSourceHash);
  assert.deepEqual(low.warpSource, high.warpSource);
  assert.notEqual(lowGrid.fieldHash, highGrid.fieldHash);

  const probes = [[0, 0], [0.17, 0.83], [0.5, 0.5], [0.91, 0.23], [1, 1]];
  for (const [u, v] of probes) {
    assert.deepEqual(
      sampleDomainWarpSource(low.fieldSource, low.flowFieldSource, low.flowSource, low.warpSource, u, v),
      sampleDomainWarpSource(high.fieldSource, high.flowFieldSource, high.flowSource, high.warpSource, u, v),
    );
  }
});

test('zero amplitude is an exact no-op against retained base scalar truth', () => {
  const finalState = run(makeDomainWarpState({
    id: 'zero-warp',
    amplitude: 0,
    field: { id: 'zero-base', seed: 77, frequency: 6, octaves: 4 },
    flowField: { id: 'zero-driver', seed: 88, frequency: 9, octaves: 5 },
    flow: { id: 'zero-flow', mode: 'tangent', strength: 1.5 },
  }), graphWithGrid(8, 8)).finalState;

  for (const [u, v] of [[0.11, 0.19], [0.5, 0.5], [0.83, 0.27], [1, 1]]) {
    const warped = sampleDomainWarpSource(
      finalState.fieldSource,
      finalState.flowFieldSource,
      finalState.flowSource,
      finalState.warpSource,
      u,
      v,
    );
    assert.equal(warped.value, sampleFbmSource(finalState.fieldSource, u, v));
    assert.equal(warped.warpedU, Number(u.toFixed(6)));
    assert.equal(warped.warpedV, Number(v.toFixed(6)));
    assert.equal(warped.displacementX, 0);
    assert.equal(warped.displacementY, 0);
  }
});

test('gradient and tangent flow produce different warp realizations over the same retained scalar sources', () => {
  const common = {
    amplitude: 0.2,
    field: { id: 'shared-base', seed: 73, frequency: 5.5, octaves: 4, lacunarity: 2.1, gain: 0.52 },
    flowField: { id: 'shared-driver', seed: 111, frequency: 3.3, octaves: 5, lacunarity: 1.9, gain: 0.61 },
  };
  const gradient = run(makeDomainWarpState({ ...common, id: 'gradient-warp', flow: { id: 'shared-flow', mode: 'gradient', strength: 0.9 } })).finalState;
  const tangent = run(makeDomainWarpState({ ...common, id: 'tangent-warp', flow: { id: 'shared-flow', mode: 'tangent', strength: 0.9 } })).finalState;

  assert.equal(gradient.fieldSourceHash, tangent.fieldSourceHash);
  assert.equal(gradient.flowFieldSourceHash, tangent.flowFieldSourceHash);
  assert.notEqual(gradient.flowSourceHash, tangent.flowSourceHash);
  assert.notDeepEqual(
    gradient.domainWarpFields['gradient-warp'].values.slice(0, 128),
    tangent.domainWarpFields['tangent-warp'].values.slice(0, 128),
  );
});

test('one neutral warp contract supports broad displacement and fine breakup-like distortion', () => {
  const broad = run(makeDomainWarpState({
    id: 'broad-warp',
    amplitude: 0.24,
    field: { id: 'broad-base', seed: 5150, frequency: 2.2, octaves: 5 },
    flowField: { id: 'broad-driver', seed: 81, frequency: 1.25, octaves: 5, lacunarity: 1.8, gain: 0.68 },
    flow: { id: 'broad-flow', mode: 'tangent', strength: 0.7 },
  })).finalState.domainWarpFields['broad-warp'];

  const detailed = run(makeDomainWarpState({
    id: 'fine-warp',
    amplitude: 0.07,
    field: { id: 'fine-base', seed: 5150, frequency: 2.2, octaves: 5 },
    flowField: { id: 'fine-driver', seed: 81, frequency: 11, octaves: 3, lacunarity: 2.8, gain: 0.32 },
    flow: { id: 'fine-flow', mode: 'gradient', strength: 1.3 },
  })).finalState.domainWarpFields['fine-warp'];

  assert.notEqual(broad.fieldHash, detailed.fieldHash);
  assert.notDeepEqual(broad.values.slice(0, 128), detailed.values.slice(0, 128));
  assert.ok(broad.maxDisplacement > 0);
  assert.ok(detailed.maxDisplacement > 0);
});

test('lineage drift, invalid controls and oversized derived working sets fail explicitly', () => {
  const normalized = normalizeDomainWarpRequestHand.execute(makeDomainWarpState({
    id: 'lineage-warp',
    field: { id: 'lineage-base', seed: 1234 },
    flowField: { id: 'lineage-driver', seed: 5678 },
    flow: { id: 'lineage-flow', mode: 'tangent' },
  }), {}).state;

  const baseDrift = structuredClone(normalized);
  baseDrift.fieldSource.frequency += 0.25;
  assert.throws(() => buildDomainWarpGridHand.execute(baseDrift, {}), /domain warp base source state hash mismatch/);

  const flowScalarDrift = structuredClone(normalized);
  flowScalarDrift.flowFieldSource.frequency += 0.25;
  assert.throws(() => buildDomainWarpGridHand.execute(flowScalarDrift, {}), /domain warp flow scalar source state hash mismatch/);

  const flowDrift = structuredClone(normalized);
  flowDrift.flowSource.strength += 0.25;
  assert.notEqual(hashValue(flowDrift.flowSource), flowDrift.flowSourceHash);
  assert.throws(() => buildDomainWarpGridHand.execute(flowDrift, {}), /domain warp flow source state hash mismatch/);

  const warpDrift = structuredClone(normalized);
  warpDrift.warpSource.amplitude += 0.01;
  assert.notEqual(hashValue(warpDrift.warpSource), warpDrift.warpSourceHash);
  assert.throws(() => buildDomainWarpGridHand.execute(warpDrift, {}), /domain warp source state hash mismatch/);

  assert.throws(() => run(makeDomainWarpState({ id: 'bad-amplitude', amplitude: 0.51 })), /warpRequest\.amplitude must be within/);
  assert.throws(() => run(makeDomainWarpState({ id: 'bad-flow-mode', flow: { mode: 'curl' } })), /flowRequest\.mode must be one of gradient, tangent/);
  assert.throws(
    () => run(makeDomainWarpState({ id: 'cell-budget' }), graphWithGrid(100, 100, 4096)),
    /domainWarp cell budget exceeded: 10000 > 4096/,
  );
});
