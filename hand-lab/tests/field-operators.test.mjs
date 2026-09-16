import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph } from '../src/hand-runtime.mjs';
import {
  SCALAR_FIELD_FBM_GRAPH,
  SCALAR_FIELD_HANDS,
  makeScalarFieldState,
  sampleFbmSource,
  sampleScalarGrid,
} from '../src/field-operators.mjs';

const registry = createHandRegistry(SCALAR_FIELD_HANDS);

function graphWithGrid(width, height, maxCells = 16384) {
  return {
    ...SCALAR_FIELD_FBM_GRAPH,
    stages: [
      SCALAR_FIELD_FBM_GRAPH.stages[0],
      {
        id: 'build-field-grid',
        hand: 'fx.field.fbm-grid-build',
        params: { width, height, maxCells },
      },
    ],
  };
}

function run(state, graph = SCALAR_FIELD_FBM_GRAPH, callerKind = 'test') {
  return executeHandGraph({ registry, graph, initialState: state, context: { callerKind } });
}

function fieldFrom(runResult, id) {
  return runResult.finalState.scalarFields[id];
}

test('fBm scalar field is deterministic and caller-neutral', () => {
  const state = makeScalarFieldState({
    id: 'neutral-field',
    seed: 90210,
    frequency: 4.5,
    octaves: 5,
    lacunarity: 2.15,
    gain: 0.57,
    offset: [0.25, -0.4],
  });
  const human = run(state, SCALAR_FIELD_FBM_GRAPH, 'human');
  const machine = run(state, SCALAR_FIELD_FBM_GRAPH, 'machine');
  const humanField = fieldFrom(human, 'neutral-field');
  const machineField = fieldFrom(machine, 'neutral-field');

  assert.equal(human.finalStateHash, machine.finalStateHash);
  assert.equal(human.finalState.fieldSourceHash, machine.finalState.fieldSourceHash);
  assert.equal(humanField.fieldHash, machineField.fieldHash);
  assert.equal(humanField.values.length, 48 * 32);
  assert.equal(humanField.derived, true);
  assert.equal(humanField.rebuildable, true);
  assert.ok(humanField.values.every((value) => Number.isFinite(value) && value >= 0 && value <= 1));
});

test('continuous source truth is independent from rebuildable grid resolution', () => {
  const state = makeScalarFieldState({
    id: 'resolution-proof',
    seed: 404,
    frequency: 2.75,
    octaves: 6,
    lacunarity: 1.9,
    gain: 0.61,
    offset: [-0.2, 0.35],
  });
  const low = run(state, graphWithGrid(20, 12)).finalState;
  const high = run(state, graphWithGrid(80, 48)).finalState;
  const lowField = low.scalarFields['resolution-proof'];
  const highField = high.scalarFields['resolution-proof'];

  assert.equal(low.fieldSourceHash, high.fieldSourceHash);
  assert.deepEqual(low.fieldSource, high.fieldSource);
  assert.notEqual(lowField.fieldHash, highField.fieldHash);
  assert.equal(lowField.sourceHash, low.fieldSourceHash);
  assert.equal(highField.sourceHash, high.fieldSourceHash);

  const probes = [[0, 0], [0.17, 0.83], [0.5, 0.5], [0.91, 0.23], [1, 1]];
  for (const [u, v] of probes) {
    assert.equal(sampleFbmSource(low.fieldSource, u, v), sampleFbmSource(high.fieldSource, u, v));
  }
});

test('one field operator supports materially different low-frequency and detailed contexts', () => {
  const ambient = run(makeScalarFieldState({
    id: 'ambient-context',
    seed: 77,
    frequency: 1.25,
    octaves: 5,
    lacunarity: 1.8,
    gain: 0.68,
  })).finalState.scalarFields['ambient-context'];

  const breakup = run(makeScalarFieldState({
    id: 'breakup-context',
    seed: 77,
    frequency: 11,
    octaves: 3,
    lacunarity: 2.8,
    gain: 0.32,
  })).finalState.scalarFields['breakup-context'];

  assert.notEqual(ambient.fieldHash, breakup.fieldHash);
  assert.notDeepEqual(ambient.values.slice(0, 64), breakup.values.slice(0, 64));
  assert.ok(ambient.max > ambient.min);
  assert.ok(breakup.max > breakup.min);
  assert.ok(ambient.mean >= 0 && ambient.mean <= 1);
  assert.ok(breakup.mean >= 0 && breakup.mean <= 1);
});

test('grid sampler interpolates retained field state and rejects out-of-domain probes', () => {
  const state = run(makeScalarFieldState({ id: 'sample-proof', seed: 5150 }), graphWithGrid(5, 5)).finalState;
  const field = state.scalarFields['sample-proof'];

  assert.equal(sampleScalarGrid(field, 0, 0), field.values[0]);
  assert.equal(sampleScalarGrid(field, 1, 1), field.values[field.values.length - 1]);
  assert.equal(sampleScalarGrid(field, 0.5, 0.5), field.values[2 * field.width + 2]);
  assert.throws(() => sampleScalarGrid(field, -0.01, 0.5), /sample\.u must be within \[0,1\]/);
  assert.throws(() => sampleFbmSource(state.fieldSource, 0.5, 1.01), /sample\.v must be within \[0,1\]/);
});

test('invalid source parameters and oversized derived working sets fail explicitly', () => {
  assert.throws(
    () => run(makeScalarFieldState({ id: 'bad-octaves', octaves: 9 })),
    /fieldRequest\.octaves must be an integer within \[1,8\]/,
  );
  assert.throws(
    () => run(makeScalarFieldState({ id: 'fractional-seed', seed: 4.5 })),
    /fieldRequest\.seed must be an integer/,
  );
  assert.throws(
    () => run(makeScalarFieldState({ id: 'cell-budget' }), graphWithGrid(100, 100, 4096)),
    /fieldGrid cell budget exceeded: 10000 > 4096/,
  );
});
