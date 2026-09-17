import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph, hashValue } from '../src/hand-runtime.mjs';
import { sampleScalarGrid } from '../src/field-operators.mjs';
import {
  CELLULAR_FIELD_GRAPH,
  CELLULAR_FIELD_HANDS,
  buildCellularFieldGridHand,
  makeCellularFieldState,
  normalizeCellularFieldRequestHand,
  sampleCellularFieldSource,
} from '../src/cellular-field2d.mjs';

const registry = createHandRegistry(CELLULAR_FIELD_HANDS);

function graphWithGrid(width, height, maxCells = 16384) {
  return {
    ...CELLULAR_FIELD_GRAPH,
    stages: [
      CELLULAR_FIELD_GRAPH.stages[0],
      {
        id: 'build-cellular-grid',
        hand: 'fx.field.cellular-grid-build',
        params: { width, height, maxCells },
      },
    ],
  };
}

function run(state, graph = CELLULAR_FIELD_GRAPH, callerKind = 'test') {
  return executeHandGraph({ registry, graph, initialState: state, context: { callerKind } });
}

test('cellular field is deterministic and caller-neutral with bounded structural evidence', () => {
  const state = makeCellularFieldState({
    id: 'neutral-cellular',
    seed: 90210,
    frequency: 7.5,
    jitter: 0.8,
    offset: [0.2, -0.3],
  });
  const human = run(state, CELLULAR_FIELD_GRAPH, 'human');
  const machine = run(state, CELLULAR_FIELD_GRAPH, 'machine');
  const field = human.finalState.scalarFields['neutral-cellular'];
  const buildEvidence = human.checkpoints[1].evidence;

  assert.equal(human.finalStateHash, machine.finalStateHash);
  assert.equal(human.finalState.cellularFieldSourceHash, machine.finalState.cellularFieldSourceHash);
  assert.equal(field.fieldHash, machine.finalState.scalarFields['neutral-cellular'].fieldHash);
  assert.equal(field.values.length, 48 * 32);
  assert.equal(field.derived, true);
  assert.equal(field.rebuildable, true);
  assert.ok(field.values.every((value) => Number.isFinite(value) && value >= 0 && value <= 1));
  assert.equal(buildEvidence.featureProbesPerSample, 25);
  assert.equal(buildEvidence.featureProbeCount, 48 * 32 * 25);
  assert.equal(buildEvidence.performanceMeasurement, 'NOT_TESTED');
});

test('canonical cellular source stays unchanged across rebuildable grid resolutions', () => {
  const state = makeCellularFieldState({
    id: 'resolution-proof',
    seed: 404,
    frequency: 5.25,
    jitter: 0.65,
    offset: [-0.2, 0.35],
  });
  const low = run(state, graphWithGrid(20, 12)).finalState;
  const high = run(state, graphWithGrid(80, 48)).finalState;
  const lowField = low.scalarFields['resolution-proof'];
  const highField = high.scalarFields['resolution-proof'];

  assert.equal(low.cellularFieldSourceHash, high.cellularFieldSourceHash);
  assert.deepEqual(low.cellularFieldSource, high.cellularFieldSource);
  assert.notEqual(lowField.fieldHash, highField.fieldHash);
  assert.equal(lowField.sourceHash, low.cellularFieldSourceHash);
  assert.equal(highField.sourceHash, high.cellularFieldSourceHash);

  const probes = [[0, 0], [0.17, 0.83], [0.5, 0.5], [0.91, 0.23], [1, 1]];
  for (const [u, v] of probes) {
    assert.equal(
      sampleCellularFieldSource(low.cellularFieldSource, u, v),
      sampleCellularFieldSource(high.cellularFieldSource, u, v),
    );
  }
});

test('cellular grids remain compatible with the existing generic scalar-grid sampler', () => {
  const final = run(makeCellularFieldState({ id: 'grid-interop', seed: 5150 }), graphWithGrid(5, 5)).finalState;
  const field = final.scalarFields['grid-interop'];

  assert.equal(sampleScalarGrid(field, 0, 0), field.values[0]);
  assert.equal(sampleScalarGrid(field, 1, 1), field.values[field.values.length - 1]);
  assert.equal(sampleScalarGrid(field, 0.5, 0.5), field.values[2 * field.width + 2]);
  assert.equal(field.fieldHash, hashValue({
    schema: field.schema,
    sourceHash: field.sourceHash,
    width: field.width,
    height: field.height,
    values: field.values,
  }));
});

test('zero jitter has predictable centered features and inverse mode only changes value mapping', () => {
  const distance = run(makeCellularFieldState({
    id: 'distance-mode',
    seed: 1,
    frequency: 1,
    jitter: 0,
    valueMode: 'distance',
  })).finalState;
  const inverse = run(makeCellularFieldState({
    id: 'inverse-mode',
    seed: 1,
    frequency: 1,
    jitter: 0,
    valueMode: 'inverse-distance',
  })).finalState;

  assert.equal(sampleCellularFieldSource(distance.cellularFieldSource, 0.5, 0.5), 0);
  assert.equal(sampleCellularFieldSource(distance.cellularFieldSource, 0, 0), 0.5);
  assert.equal(sampleCellularFieldSource(inverse.cellularFieldSource, 0.5, 0.5), 1);
  assert.equal(sampleCellularFieldSource(inverse.cellularFieldSource, 0, 0), 0.5);
  assert.equal(distance.cellularFieldSource.seed, inverse.cellularFieldSource.seed);
  assert.equal(distance.cellularFieldSource.frequency, inverse.cellularFieldSource.frequency);
  assert.equal(distance.cellularFieldSource.jitter, inverse.cellularFieldSource.jitter);
});

test('different seeds and jitter produce materially different bounded fields', () => {
  const first = run(makeCellularFieldState({ id: 'first', seed: 1, frequency: 8, jitter: 1 })).finalState.scalarFields.first;
  const second = run(makeCellularFieldState({ id: 'second', seed: 2, frequency: 8, jitter: 0.25 })).finalState.scalarFields.second;

  assert.notEqual(first.fieldHash, second.fieldHash);
  assert.notDeepEqual(first.values.slice(0, 100), second.values.slice(0, 100));
  assert.ok(first.max > first.min);
  assert.ok(second.max > second.min);
});

test('source drift and self-consistent unsupported algorithm state are rejected before rebuild', () => {
  const normalized = normalizeCellularFieldRequestHand.execute(
    makeCellularFieldState({ id: 'drift-proof', seed: 9 }),
    {},
  ).state;
  normalized.cellularFieldSource.frequency = 12;
  assert.throws(
    () => buildCellularFieldGridHand.execute(normalized, { width: 8, height: 8 }),
    /cellular field source hash mismatch/,
  );

  const selfConsistent = normalizeCellularFieldRequestHand.execute(
    makeCellularFieldState({ id: 'semantic-proof', seed: 11 }),
    {},
  ).state;
  selfConsistent.cellularFieldSource.searchRadius = 1;
  selfConsistent.cellularFieldSourceHash = hashValue(selfConsistent.cellularFieldSource);
  assert.throws(
    () => buildCellularFieldGridHand.execute(selfConsistent, { width: 8, height: 8 }),
    /unsupported cellular field search radius/,
  );
});

test('invalid source parameters, out-of-domain probes and oversized working sets fail explicitly', () => {
  assert.throws(
    () => run(makeCellularFieldState({ jitter: 1.01 })),
    /cellularFieldRequest\.jitter must be within \[0,1\]/,
  );
  assert.throws(
    () => run(makeCellularFieldState({ valueMode: 'edge-gap' })),
    /cellularFieldRequest\.valueMode must be distance or inverse-distance/,
  );
  assert.throws(
    () => run(makeCellularFieldState({ id: 'cell-budget' }), graphWithGrid(100, 100, 4096)),
    /cellularGrid cell budget exceeded: 10000 > 4096/,
  );
  const source = run(makeCellularFieldState({ id: 'probe-domain' })).finalState.cellularFieldSource;
  assert.throws(
    () => sampleCellularFieldSource(source, -0.01, 0.5),
    /sample\.u must be within \[0,1\]/,
  );
});
