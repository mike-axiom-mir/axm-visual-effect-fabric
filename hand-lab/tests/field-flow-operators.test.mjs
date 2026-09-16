import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph, hashValue } from '../src/hand-runtime.mjs';
import {
  FIELD_FLOW_GRAPH,
  FIELD_FLOW_HANDS,
  buildFlowFieldGridHand,
  makeFieldFlowState,
  normalizeFlowFieldRequestHand,
  sampleFlowFieldSource,
  sampleVectorFieldGrid,
} from '../src/field-flow-operators.mjs';

const registry = createHandRegistry(FIELD_FLOW_HANDS);

function graphWithGrid(width, height, maxCells = 16384) {
  return {
    ...FIELD_FLOW_GRAPH,
    stages: [
      FIELD_FLOW_GRAPH.stages[0],
      {
        id: 'build-flow-grid',
        hand: 'fx.field.flow-grid-build',
        params: { width, height, maxCells },
      },
    ],
  };
}

function run(state, graph = FIELD_FLOW_GRAPH, callerKind = 'test') {
  return executeHandGraph({ registry, graph, initialState: state, context: { callerKind } });
}

function flowGrid(result, id) {
  return result.finalState.vectorFields[id];
}

test('vector flow field is deterministic, caller-neutral and bounded', () => {
  const state = makeFieldFlowState({
    id: 'neutral-flow',
    mode: 'tangent',
    sampleStep: 0.01,
    strength: 1.4,
    field: {
      id: 'neutral-source',
      seed: 90210,
      frequency: 4.5,
      octaves: 5,
      lacunarity: 2.15,
      gain: 0.57,
      offset: [0.25, -0.4],
    },
  });
  const human = run(state, FIELD_FLOW_GRAPH, 'human');
  const machine = run(state, FIELD_FLOW_GRAPH, 'machine');
  const humanGrid = flowGrid(human, 'neutral-flow');
  const machineGrid = flowGrid(machine, 'neutral-flow');

  assert.equal(human.finalStateHash, machine.finalStateHash);
  assert.equal(human.finalState.fieldSourceHash, machine.finalState.fieldSourceHash);
  assert.equal(human.finalState.flowSourceHash, machine.finalState.flowSourceHash);
  assert.equal(humanGrid.fieldHash, machineGrid.fieldHash);
  assert.equal(humanGrid.vectors.length, 48 * 32 * 2);
  assert.equal(humanGrid.derived, true);
  assert.equal(humanGrid.rebuildable, true);
  assert.ok(humanGrid.vectors.every((value) => Number.isFinite(value) && value >= -1 && value <= 1));
  assert.ok(humanGrid.minMagnitude >= 0 && humanGrid.maxMagnitude <= 1);
});

test('continuous scalar and flow source truth are independent from rebuildable grid resolution', () => {
  const state = makeFieldFlowState({
    id: 'resolution-flow',
    mode: 'gradient',
    sampleStep: 0.02,
    strength: 0.8,
    field: {
      id: 'resolution-source',
      seed: 404,
      frequency: 2.75,
      octaves: 6,
      lacunarity: 1.9,
      gain: 0.61,
      offset: [-0.2, 0.35],
    },
  });
  const low = run(state, graphWithGrid(20, 12)).finalState;
  const high = run(state, graphWithGrid(80, 48)).finalState;
  const lowGrid = low.vectorFields['resolution-flow'];
  const highGrid = high.vectorFields['resolution-flow'];

  assert.equal(low.fieldSourceHash, high.fieldSourceHash);
  assert.equal(low.flowSourceHash, high.flowSourceHash);
  assert.deepEqual(low.fieldSource, high.fieldSource);
  assert.deepEqual(low.flowSource, high.flowSource);
  assert.notEqual(lowGrid.fieldHash, highGrid.fieldHash);
  assert.equal(lowGrid.scalarSourceHash, low.fieldSourceHash);
  assert.equal(highGrid.scalarSourceHash, high.fieldSourceHash);

  const probes = [[0, 0], [0.17, 0.83], [0.5, 0.5], [0.91, 0.23], [1, 1]];
  for (const [u, v] of probes) {
    assert.deepEqual(
      sampleFlowFieldSource(low.fieldSource, low.flowSource, u, v),
      sampleFlowFieldSource(high.fieldSource, high.flowSource, u, v),
    );
  }
});

test('gradient and tangent modes derive different neutral directions from the same scalar truth', () => {
  const common = {
    sampleStep: 0.0125,
    strength: 0.9,
    field: {
      id: 'shared-source',
      seed: 73,
      frequency: 5.5,
      octaves: 4,
      lacunarity: 2.1,
      gain: 0.52,
      offset: [0.15, -0.1],
    },
  };
  const gradient = run(makeFieldFlowState({ ...common, id: 'gradient-flow', mode: 'gradient' })).finalState;
  const tangent = run(makeFieldFlowState({ ...common, id: 'tangent-flow', mode: 'tangent' })).finalState;

  assert.equal(gradient.fieldSourceHash, tangent.fieldSourceHash);
  assert.notEqual(gradient.flowSourceHash, tangent.flowSourceHash);

  const probes = [[0.2, 0.2], [0.4, 0.7], [0.5, 0.5], [0.8, 0.3]];
  let challenged = 0;
  for (const [u, v] of probes) {
    const a = sampleFlowFieldSource(gradient.fieldSource, gradient.flowSource, u, v);
    const b = sampleFlowFieldSource(tangent.fieldSource, tangent.flowSource, u, v);
    if (a.magnitude > 0.0001) {
      challenged += 1;
      assert.equal(a.magnitude, b.magnitude);
      assert.ok(Math.abs(a.x * b.x + a.y * b.y) < 0.00001);
    }
  }
  assert.ok(challenged >= 2);
});

test('one flow contract supports broad drift and fine turbulence-like guidance without consumer meaning', () => {
  const broad = run(makeFieldFlowState({
    id: 'broad-drift',
    mode: 'tangent',
    strength: 0.7,
    field: { id: 'broad-source', seed: 77, frequency: 1.25, octaves: 5, lacunarity: 1.8, gain: 0.68 },
  })).finalState.vectorFields['broad-drift'];

  const detailed = run(makeFieldFlowState({
    id: 'fine-guidance',
    mode: 'gradient',
    strength: 1.3,
    field: { id: 'fine-source', seed: 77, frequency: 11, octaves: 3, lacunarity: 2.8, gain: 0.32 },
  })).finalState.vectorFields['fine-guidance'];

  assert.notEqual(broad.fieldHash, detailed.fieldHash);
  assert.notDeepEqual(broad.vectors.slice(0, 128), detailed.vectors.slice(0, 128));
  assert.ok(broad.maxMagnitude > broad.minMagnitude);
  assert.ok(detailed.maxMagnitude > detailed.minMagnitude);
});

test('retained vector-grid sampler interpolates derived state and rejects invalid probes', () => {
  const state = run(makeFieldFlowState({ id: 'sample-flow', field: { id: 'sample-source', seed: 5150 } }), graphWithGrid(5, 5)).finalState;
  const field = state.vectorFields['sample-flow'];

  assert.deepEqual(sampleVectorFieldGrid(field, 0, 0), {
    x: field.vectors[0],
    y: field.vectors[1],
    magnitude: Number(Math.min(1, Math.hypot(field.vectors[0], field.vectors[1])).toFixed(6)),
  });
  assert.throws(() => sampleVectorFieldGrid(field, -0.01, 0.5), /sample\.u must be within \[0,1\]/);
  assert.throws(() => sampleFlowFieldSource(state.fieldSource, state.flowSource, 0.5, 1.01), /sample\.v must be within \[0,1\]/);
});

test('lineage drift, invalid controls and oversized derived working sets fail explicitly', () => {
  const normalized = normalizeFlowFieldRequestHand.execute(makeFieldFlowState({
    id: 'lineage-flow',
    field: { id: 'lineage-source', seed: 1234 },
  }), {}).state;
  const scalarDrift = structuredClone(normalized);
  scalarDrift.fieldSource.frequency += 0.25;
  assert.throws(() => buildFlowFieldGridHand.execute(scalarDrift, {}), /flow scalar source state hash mismatch/);

  const flowDrift = structuredClone(normalized);
  flowDrift.flowSource.strength += 0.25;
  assert.notEqual(hashValue(flowDrift.flowSource), flowDrift.flowSourceHash);
  assert.throws(() => buildFlowFieldGridHand.execute(flowDrift, {}), /flow source state hash mismatch/);

  assert.throws(() => run(makeFieldFlowState({ id: 'bad-mode', mode: 'curl' })), /flowRequest\.mode must be one of gradient, tangent/);
  assert.throws(() => run(makeFieldFlowState({ id: 'bad-step', sampleStep: 0 })), /flowRequest\.sampleStep must be within/);
  assert.throws(() => run(makeFieldFlowState({ id: 'bad-strength', strength: 17 })), /flowRequest\.strength must be within/);
  assert.throws(
    () => run(makeFieldFlowState({ id: 'cell-budget' }), graphWithGrid(100, 100, 4096)),
    /flowField cell budget exceeded: 10000 > 4096/,
  );
});
