import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph, hashValue } from '../src/hand-runtime.mjs';
import {
  buildSignedMaskDistanceGridHand,
  CELLULAR_MASK_DISTANCE_FIELD_GRAPH,
  CELLULAR_MASK_DISTANCE_FIELD_HANDS,
  computeSignedMaskDistanceGrid,
  makeCellularMaskDistanceState,
  makeMaskDistanceState,
  MASK_DISTANCE_FIELD_GRAPH,
  MASK_DISTANCE_FIELD_HANDS,
  sampleSignedMaskDistanceGrid,
} from '../src/mask-distance-field2d.mjs';

const registry = createHandRegistry(MASK_DISTANCE_FIELD_HANDS);
const cellularRegistry = createHandRegistry(CELLULAR_MASK_DISTANCE_FIELD_HANDS);

function graphWithResolution(graph, width, height, maxCells = 4096, maxComparisons = 8388608) {
  return {
    ...graph,
    stages: [
      graph.stages[0],
      graph.stages[1],
      {
        id: 'build-mask-grid',
        hand: 'fx.field.coverage-mask-grid-build',
        params: { width, height, maxCells: 16384 },
      },
      graph.stages[3],
      {
        id: 'build-mask-distance-grid',
        hand: 'fx.field.mask-distance-grid-build',
        params: { maxCells, maxComparisons },
      },
    ],
  };
}

function run(state, graph = MASK_DISTANCE_FIELD_GRAPH, callerKind = 'test') {
  return executeHandGraph({ registry, graph, initialState: state, context: { callerKind } });
}

function runCellular(state, graph = CELLULAR_MASK_DISTANCE_FIELD_GRAPH, callerKind = 'test') {
  return executeHandGraph({ registry: cellularRegistry, graph, initialState: state, context: { callerKind } });
}

function distanceGrid(result, id = 'distance') {
  return result.finalState.signedMaskDistanceGrids[id];
}

function manualMask(values, width, height) {
  const mask = {
    schema: 'axm.coverage-mask-grid/v0.1',
    fieldSourceHash: 'manual-field-source',
    maskSourceHash: 'manual-mask-source',
    width,
    height,
    values,
  };
  mask.maskHash = hashValue({
    schema: mask.schema,
    fieldSourceHash: mask.fieldSourceHash,
    maskSourceHash: mask.maskSourceHash,
    width: mask.width,
    height: mask.height,
    values: mask.values,
  });
  return mask;
}

test('mask distance field is deterministic and caller-neutral while canonical source truth stays retained', () => {
  const state = makeMaskDistanceState({
    field: { id: 'distance-field', seed: 90210, frequency: 5.2, octaves: 5, gain: 0.56, offset: [0.12, -0.31] },
    mask: { id: 'distance-mask', threshold: 0.5, softness: 0.08 },
    distance: { id: 'distance', isoLevel: 0.5 },
  });
  const graph = graphWithResolution(MASK_DISTANCE_FIELD_GRAPH, 20, 14);
  const human = run(state, graph, 'human');
  const machine = run(state, graph, 'machine');
  const humanGrid = distanceGrid(human);
  const machineGrid = distanceGrid(machine);

  assert.equal(human.finalStateHash, machine.finalStateHash);
  assert.equal(human.finalState.fieldSourceHash, machine.finalState.fieldSourceHash);
  assert.equal(human.finalState.coverageMaskSourceHash, machine.finalState.coverageMaskSourceHash);
  assert.equal(human.finalState.maskDistanceSourceHash, machine.finalState.maskDistanceSourceHash);
  assert.equal(humanGrid.distanceGridHash, machineGrid.distanceGridHash);
  assert.equal(humanGrid.distanceSourceHash, human.finalState.maskDistanceSourceHash);
  assert.equal(humanGrid.maskSourceHash, human.finalState.coverageMaskSourceHash);
  assert.equal(humanGrid.values.length, 20 * 14);
  assert.equal(humanGrid.derived, true);
  assert.equal(humanGrid.rebuildable, true);
  assert.ok(humanGrid.values.every((value) => Number.isFinite(value) && Math.abs(value) <= 1.414214));
});

test('signed distance is exact over sampled cell centers with a finite explicit no-boundary policy', () => {
  const oneCenter = manualMask([
    0, 0, 0,
    0, 1, 0,
    0, 0, 0,
  ], 3, 3);
  const computed = computeSignedMaskDistanceGrid(oneCenter, 0.5);

  assert.equal(computed.insideCells, 1);
  assert.equal(computed.outsideCells, 8);
  assert.equal(computed.comparisonCount, 16);
  assert.equal(computed.values[4], 0.5);
  assert.equal(computed.values[1], -0.5);
  assert.equal(computed.values[0], -0.707107);

  const allInside = computeSignedMaskDistanceGrid(manualMask(new Array(9).fill(1), 3, 3), 0.5);
  assert.equal(allInside.insideCells, 9);
  assert.equal(allInside.outsideCells, 0);
  assert.equal(allInside.comparisonCount, 0);
  assert.ok(allInside.values.every((value) => value === 1.414214));
});

test('sampling resolution is rebuildable derived state and does not rewrite the distance source', () => {
  const state = makeMaskDistanceState({
    field: { id: 'resolution-field', seed: 404, frequency: 3.7, octaves: 5, gain: 0.59 },
    mask: { id: 'resolution-mask', threshold: 0.47, softness: 0.1 },
    distance: { id: 'distance', isoLevel: 0.55 },
  });
  const low = run(state, graphWithResolution(MASK_DISTANCE_FIELD_GRAPH, 12, 10)).finalState;
  const high = run(state, graphWithResolution(MASK_DISTANCE_FIELD_GRAPH, 32, 24)).finalState;

  assert.equal(low.fieldSourceHash, high.fieldSourceHash);
  assert.equal(low.coverageMaskSourceHash, high.coverageMaskSourceHash);
  assert.equal(low.maskDistanceSourceHash, high.maskDistanceSourceHash);
  assert.deepEqual(low.maskDistanceSource, high.maskDistanceSource);
  assert.notEqual(low.coverageMasks['resolution-mask'].maskHash, high.coverageMasks['resolution-mask'].maskHash);
  assert.notEqual(low.signedMaskDistanceGrids.distance.distanceGridHash, high.signedMaskDistanceGrids.distance.distanceGridHash);
});

test('the same neutral distance contract works over materially different fBm and cellular mask families', () => {
  const mask = { id: 'shared-mask', threshold: 0.5, softness: 0.06 };
  const distance = { id: 'distance', isoLevel: 0.5 };
  const fbm = run(makeMaskDistanceState({
    field: { id: 'shared-field', seed: 91, frequency: 4.5, octaves: 4, gain: 0.55 },
    mask,
    distance,
  }), graphWithResolution(MASK_DISTANCE_FIELD_GRAPH, 18, 12)).finalState;
  const cellular = runCellular(makeCellularMaskDistanceState({
    field: { id: 'shared-field', seed: 91, frequency: 4.5, jitter: 0.9, valueMode: 'distance' },
    mask,
    distance,
  }), graphWithResolution(CELLULAR_MASK_DISTANCE_FIELD_GRAPH, 18, 12)).finalState;

  assert.equal(fbm.maskDistanceSource.algorithm, cellular.maskDistanceSource.algorithm);
  assert.equal(fbm.maskDistanceSource.isoLevel, cellular.maskDistanceSource.isoLevel);
  assert.notEqual(fbm.coverageMaskSource.fieldSourceHash, cellular.coverageMaskSource.fieldSourceHash);
  assert.notEqual(fbm.signedMaskDistanceGrids.distance.distanceGridHash, cellular.signedMaskDistanceGrids.distance.distanceGridHash);
});

test('distance-grid sampling is deterministic and rejects probes outside the normalized domain', () => {
  const result = run(makeMaskDistanceState({
    field: { id: 'sample-field', seed: 5150, frequency: 4.2 },
    mask: { id: 'sample-mask', threshold: 0.5, softness: 0.1 },
    distance: { id: 'distance', isoLevel: 0.5 },
  }), graphWithResolution(MASK_DISTANCE_FIELD_GRAPH, 16, 12));
  const grid = distanceGrid(result);

  assert.equal(sampleSignedMaskDistanceGrid(grid, 0, 0), grid.values[0]);
  assert.equal(sampleSignedMaskDistanceGrid(grid, 1, 1), grid.values.at(-1));
  assert.equal(sampleSignedMaskDistanceGrid(grid, 0.4, 0.7), sampleSignedMaskDistanceGrid(grid, 0.4, 0.7));
  assert.throws(() => sampleSignedMaskDistanceGrid(grid, -0.01, 0.5), /sample\.u must be within \[0,1\]/);
});

test('self-consistent derived mask tampering is rejected by rebuilding from retained source truth', () => {
  const result = run(makeMaskDistanceState({
    field: { id: 'truth-field', seed: 7331, frequency: 5.1 },
    mask: { id: 'truth-mask', threshold: 0.5, softness: 0.08 },
    distance: { id: 'distance', isoLevel: 0.5 },
  }), graphWithResolution(MASK_DISTANCE_FIELD_GRAPH, 16, 12));
  const tampered = structuredClone(result.finalState);
  const mask = tampered.coverageMasks['truth-mask'];
  mask.values[0] = mask.values[0] >= 0.5 ? 0 : 1;
  mask.maskHash = hashValue({
    schema: mask.schema,
    fieldSourceHash: mask.fieldSourceHash,
    maskSourceHash: mask.maskSourceHash,
    width: mask.width,
    height: mask.height,
    values: mask.values,
  });

  assert.throws(
    () => buildSignedMaskDistanceGridHand.execute(tampered, { maxCells: 4096, maxComparisons: 8388608 }),
    /coverage grid differs from source-truth rebuild/,
  );
});

test('semantic source tampering, invalid controls and structural work-budget overflow fail explicitly', () => {
  assert.throws(
    () => run(makeMaskDistanceState({ distance: { id: 'bad-distance', isoLevel: 1.1 } }), graphWithResolution(MASK_DISTANCE_FIELD_GRAPH, 12, 10)),
    /maskDistanceRequest\.isoLevel must be within \[0,1\]/,
  );

  const valid = run(makeMaskDistanceState({
    field: { id: 'tamper-field', seed: 12, frequency: 4.1 },
    mask: { id: 'tamper-mask', threshold: 0.5, softness: 0.08 },
    distance: { id: 'distance', isoLevel: 0.5 },
  }), graphWithResolution(MASK_DISTANCE_FIELD_GRAPH, 18, 14)).finalState;

  const semanticTamper = structuredClone(valid);
  semanticTamper.maskDistanceSource.algorithm = 'pretend-compatible-distance';
  semanticTamper.maskDistanceSourceHash = hashValue(semanticTamper.maskDistanceSource);
  assert.throws(
    () => buildSignedMaskDistanceGridHand.execute(semanticTamper, {}),
    /unsupported mask distance algorithm/,
  );

  const comparisons = valid.signedMaskDistanceGrids.distance.comparisonCount;
  assert.ok(comparisons > 1);
  assert.throws(
    () => buildSignedMaskDistanceGridHand.execute(valid, { maxCells: 4096, maxComparisons: 1 }),
    new RegExp(`maskDistance comparison budget exceeded: ${comparisons} > 1`),
  );

  assert.throws(
    () => run(
      makeMaskDistanceState({
        field: { id: 'large-field', seed: 99 },
        mask: { id: 'large-mask', threshold: 0.5, softness: 0.08 },
        distance: { id: 'distance', isoLevel: 0.5 },
      }),
      graphWithResolution(MASK_DISTANCE_FIELD_GRAPH, 70, 60, 4096),
    ),
    /maskDistance cell budget exceeded: 4200 > 4096/,
  );
});
