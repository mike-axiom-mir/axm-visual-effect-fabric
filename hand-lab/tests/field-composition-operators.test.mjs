import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph } from '../src/hand-runtime.mjs';
import {
  FIELD_COMPOSITION_GRAPH,
  FIELD_COMPOSITION_HANDS,
  applyScalarComposition,
  makeFieldCompositionState,
  sampleComposedFieldGrid,
  sampleComposedFieldSource,
} from '../src/field-composition-operators.mjs';

const registry = createHandRegistry(FIELD_COMPOSITION_HANDS);

function graphWithGrid(width, height, maxCells = 16384) {
  return {
    ...FIELD_COMPOSITION_GRAPH,
    stages: [
      FIELD_COMPOSITION_GRAPH.stages[0],
      {
        id: 'build-composed-grid',
        hand: 'fx.field.composed-grid-build',
        params: { width, height, maxCells },
      },
    ],
  };
}

function run(state, graph = FIELD_COMPOSITION_GRAPH, callerKind = 'test') {
  return executeHandGraph({ registry, graph, initialState: state, context: { callerKind } });
}

function composedFrom(result, id) {
  return result.finalState.composedFields[id];
}

const sharedInputs = {
  a: {
    id: 'field-a',
    seed: 90210,
    frequency: 2.35,
    octaves: 5,
    lacunarity: 2.1,
    gain: 0.58,
    offset: [0.13, -0.27],
  },
  b: {
    id: 'field-b',
    seed: 8181,
    frequency: 6.4,
    octaves: 3,
    lacunarity: 1.8,
    gain: 0.41,
    offset: [-0.31, 0.22],
  },
};

test('scalar-field composition is deterministic and caller-neutral while retaining both input lineages', () => {
  const state = makeFieldCompositionState({
    ...sharedInputs,
    id: 'neutral-compose',
    operation: 'multiply',
  });
  const human = run(state, FIELD_COMPOSITION_GRAPH, 'human');
  const machine = run(state, FIELD_COMPOSITION_GRAPH, 'machine');
  const humanField = composedFrom(human, 'neutral-compose');
  const machineField = composedFrom(machine, 'neutral-compose');

  assert.equal(human.finalStateHash, machine.finalStateHash);
  assert.equal(human.finalState.fieldCompositionSourceHash, machine.finalState.fieldCompositionSourceHash);
  assert.equal(human.finalState.fieldSourceHashes.a, machine.finalState.fieldSourceHashes.a);
  assert.equal(human.finalState.fieldSourceHashes.b, machine.finalState.fieldSourceHashes.b);
  assert.equal(humanField.fieldHash, machineField.fieldHash);
  assert.equal(humanField.inputAHash, human.finalState.fieldSourceHashes.a);
  assert.equal(humanField.inputBHash, human.finalState.fieldSourceHashes.b);
  assert.equal(human.finalState.fieldCompositionSource.inputA.sourceHash, human.finalState.fieldSourceHashes.a);
  assert.equal(human.finalState.fieldCompositionSource.inputB.sourceHash, human.finalState.fieldSourceHashes.b);
  assert.equal(humanField.values.length, 48 * 32);
  assert.equal(humanField.derived, true);
  assert.equal(humanField.rebuildable, true);
  assert.ok(humanField.values.every((value) => Number.isFinite(value) && value >= 0 && value <= 1));
});

test('canonical input sources and composition stay stable across rebuildable grid resolutions', () => {
  const state = makeFieldCompositionState({
    ...sharedInputs,
    id: 'resolution-compose',
    operation: 'max',
  });
  const low = run(state, graphWithGrid(16, 10)).finalState;
  const high = run(state, graphWithGrid(72, 44)).finalState;
  const lowField = low.composedFields['resolution-compose'];
  const highField = high.composedFields['resolution-compose'];

  assert.deepEqual(low.fieldSources, high.fieldSources);
  assert.deepEqual(low.fieldSourceHashes, high.fieldSourceHashes);
  assert.deepEqual(low.fieldCompositionSource, high.fieldCompositionSource);
  assert.equal(low.fieldCompositionSourceHash, high.fieldCompositionSourceHash);
  assert.notEqual(lowField.fieldHash, highField.fieldHash);

  const probes = [[0, 0], [0.17, 0.83], [0.5, 0.5], [0.91, 0.23], [1, 1]];
  for (const [u, v] of probes) {
    assert.equal(
      sampleComposedFieldSource(low.fieldSources.a, low.fieldSources.b, low.fieldCompositionSource, u, v),
      sampleComposedFieldSource(high.fieldSources.a, high.fieldSources.b, high.fieldCompositionSource, u, v),
    );
  }
});

test('one composition contract supports distinct neutral scalar algebra without changing input source truth', () => {
  const results = new Map();
  for (const operation of ['min', 'max', 'multiply', 'add-clamp']) {
    const state = run(makeFieldCompositionState({
      ...sharedInputs,
      id: `compose-${operation}`,
      operation,
    })).finalState;
    results.set(operation, state);
  }

  const first = results.get('min');
  for (const state of results.values()) {
    assert.equal(state.fieldSourceHashes.a, first.fieldSourceHashes.a);
    assert.equal(state.fieldSourceHashes.b, first.fieldSourceHashes.b);
  }

  const hashes = [...results.values()].map((state) => state.fieldCompositionSourceHash);
  assert.equal(new Set(hashes).size, 4);
  const gridHashes = [...results.entries()].map(([operation, state]) => state.composedFields[`compose-${operation}`].fieldHash);
  assert.equal(new Set(gridHashes).size, 4);

  assert.equal(applyScalarComposition('min', 0.3, 0.8), 0.3);
  assert.equal(applyScalarComposition('max', 0.3, 0.8), 0.8);
  assert.equal(applyScalarComposition('multiply', 0.3, 0.8), 0.24);
  assert.equal(applyScalarComposition('add-clamp', 0.3, 0.8), 1);
  assert.equal(applyScalarComposition('add-clamp', 0.2, 0.3), 0.5);
});

test('retained composed grid can be sampled and rejects out-of-domain probes', () => {
  const state = run(makeFieldCompositionState({
    ...sharedInputs,
    id: 'sample-compose',
    operation: 'multiply',
  }), graphWithGrid(5, 5)).finalState;
  const field = state.composedFields['sample-compose'];

  assert.equal(sampleComposedFieldGrid(field, 0, 0), field.values[0]);
  assert.equal(sampleComposedFieldGrid(field, 1, 1), field.values[field.values.length - 1]);
  assert.equal(sampleComposedFieldGrid(field, 0.5, 0.5), field.values[2 * field.width + 2]);
  assert.throws(() => sampleComposedFieldGrid(field, -0.01, 0.5), /sample\.u must be within \[0,1\]/);
});

test('continuous composition rejects broken input lineage instead of silently sampling changed source state', () => {
  const state = run(makeFieldCompositionState({
    ...sharedInputs,
    id: 'lineage-compose',
    operation: 'max',
  })).finalState;
  const changedA = { ...state.fieldSources.a, seed: state.fieldSources.a.seed + 1 };

  assert.throws(
    () => sampleComposedFieldSource(changedA, state.fieldSources.b, state.fieldCompositionSource, 0.5, 0.5),
    /composition source inputA hash mismatch/,
  );
});

test('invalid composition requests and oversized derived working sets fail explicitly', () => {
  assert.throws(
    () => run(makeFieldCompositionState({ ...sharedInputs, id: 'bad-op', operation: 'subtract' })),
    /compositionRequest\.operation must be one of min, max, multiply, add-clamp/,
  );
  assert.throws(
    () => run(makeFieldCompositionState({
      a: { ...sharedInputs.a, octaves: 9 },
      b: sharedInputs.b,
      id: 'bad-input',
      operation: 'multiply',
    })),
    /fieldRequest\.octaves must be an integer within \[1,8\]/,
  );
  assert.throws(
    () => run(
      makeFieldCompositionState({ ...sharedInputs, id: 'cell-budget', operation: 'multiply' }),
      graphWithGrid(100, 100, 4096),
    ),
    /composedField cell budget exceeded: 10000 > 4096/,
  );
});
