import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph, hashValue } from '../src/hand-runtime.mjs';
import {
  bandCoverageFromSignedDistance,
  buildMaskDistanceBandGridHand,
  CELLULAR_MASK_DISTANCE_BAND_GRAPH,
  CELLULAR_MASK_DISTANCE_BAND_HANDS,
  makeCellularMaskDistanceBandState,
  makeMaskDistanceBandState,
  MASK_DISTANCE_BAND_GRAPH,
  MASK_DISTANCE_BAND_HANDS,
  sampleMaskDistanceBandGrid,
} from '../src/mask-distance-band2d.mjs';

const registry = createHandRegistry(MASK_DISTANCE_BAND_HANDS);
const cellularRegistry = createHandRegistry(CELLULAR_MASK_DISTANCE_BAND_HANDS);

function graphWithResolution(graph, width, height, maxCells = 4096, maxComparisons = 8388608) {
  return {
    ...graph,
    stages: graph.stages.map((stage) => {
      if (stage.hand === 'fx.field.coverage-mask-grid-build') {
        return { ...stage, params: { width, height, maxCells: 16384 } };
      }
      if (stage.hand === 'fx.field.mask-distance-grid-build') {
        return { ...stage, params: { maxCells, maxComparisons } };
      }
      if (stage.hand === 'fx.field.mask-distance-band-grid-build') {
        return { ...stage, params: { maxCells, maxComparisons } };
      }
      return stage;
    }),
  };
}

function run(state, graph = MASK_DISTANCE_BAND_GRAPH, callerKind = 'test') {
  return executeHandGraph({ registry, graph, initialState: state, context: { callerKind } });
}

function runCellular(state, graph = CELLULAR_MASK_DISTANCE_BAND_GRAPH, callerKind = 'test') {
  return executeHandGraph({ registry: cellularRegistry, graph, initialState: state, context: { callerKind } });
}

function bandGrid(result, id = 'band') {
  return result.finalState.distanceBandGrids[id];
}

function distanceGridHashPayload(grid) {
  return {
    schema: grid.schema,
    distanceSourceHash: grid.distanceSourceHash,
    maskSourceHash: grid.maskSourceHash,
    maskHash: grid.maskHash,
    width: grid.width,
    height: grid.height,
    values: grid.values,
  };
}

test('mask distance band is deterministic and caller-neutral while upstream retained truth stays unchanged', () => {
  const state = makeMaskDistanceBandState({
    field: { id: 'band-field', seed: 2718, frequency: 4.9, octaves: 5, gain: 0.57 },
    mask: { id: 'band-mask', threshold: 0.5, softness: 0.07 },
    distance: { id: 'distance', isoLevel: 0.5 },
    band: { id: 'band', innerWidth: 0.08, outerWidth: 0.12, softness: 0.03 },
  });
  const graph = graphWithResolution(MASK_DISTANCE_BAND_GRAPH, 20, 14);
  const human = run(state, graph, 'human');
  const machine = run(state, graph, 'machine');
  const humanGrid = bandGrid(human);
  const machineGrid = bandGrid(machine);

  assert.equal(human.finalStateHash, machine.finalStateHash);
  assert.equal(human.finalState.fieldSourceHash, machine.finalState.fieldSourceHash);
  assert.equal(human.finalState.coverageMaskSourceHash, machine.finalState.coverageMaskSourceHash);
  assert.equal(human.finalState.maskDistanceSourceHash, machine.finalState.maskDistanceSourceHash);
  assert.equal(human.finalState.distanceBandSourceHash, machine.finalState.distanceBandSourceHash);
  assert.equal(humanGrid.bandGridHash, machineGrid.bandGridHash);
  assert.equal(humanGrid.distanceSourceHash, human.finalState.maskDistanceSourceHash);
  assert.equal(humanGrid.values.length, 20 * 14);
  assert.equal(humanGrid.derived, true);
  assert.equal(humanGrid.rebuildable, true);
  assert.ok(humanGrid.values.every((value) => value >= 0 && value <= 1));
});

test('inner and outer widths plus smoothstep softness have explicit signed-distance transfer behavior', () => {
  const source = {
    schema: 'axm.mask-distance-band-source/v0.1',
    id: 'transfer',
    distanceId: 'distance',
    distanceSourceHash: 'distance-source-hash',
    transfer: 'signed-distance-inner-outer-band-v0.1',
    signMapping: 'positive-inside-negative-outside',
    innerWidth: 0.2,
    outerWidth: 0.4,
    softness: 0.2,
    softnessProfile: 'smoothstep-outward-v0.1',
  };

  assert.equal(bandCoverageFromSignedDistance(source, 0.1), 1);
  assert.equal(bandCoverageFromSignedDistance(source, -0.3), 1);
  assert.equal(bandCoverageFromSignedDistance(source, 0.3), 0.5);
  assert.equal(bandCoverageFromSignedDistance(source, -0.5), 0.5);
  assert.equal(bandCoverageFromSignedDistance(source, 0.4), 0);
  assert.equal(bandCoverageFromSignedDistance(source, -0.6), 0);
});

test('band treatment can change without rewriting scalar, mask, or signed-distance source truth', () => {
  const base = {
    field: { id: 'treatment-field', seed: 808, frequency: 4.2, octaves: 4, gain: 0.55 },
    mask: { id: 'treatment-mask', threshold: 0.49, softness: 0.08 },
    distance: { id: 'distance', isoLevel: 0.5 },
  };
  const narrow = run(makeMaskDistanceBandState({
    ...base,
    band: { id: 'band', innerWidth: 0.03, outerWidth: 0.04, softness: 0.01 },
  }), graphWithResolution(MASK_DISTANCE_BAND_GRAPH, 24, 16)).finalState;
  const wide = run(makeMaskDistanceBandState({
    ...base,
    band: { id: 'band', innerWidth: 0.14, outerWidth: 0.18, softness: 0.05 },
  }), graphWithResolution(MASK_DISTANCE_BAND_GRAPH, 24, 16)).finalState;

  assert.equal(narrow.fieldSourceHash, wide.fieldSourceHash);
  assert.equal(narrow.coverageMaskSourceHash, wide.coverageMaskSourceHash);
  assert.equal(narrow.maskDistanceSourceHash, wide.maskDistanceSourceHash);
  assert.equal(
    narrow.signedMaskDistanceGrids.distance.distanceGridHash,
    wide.signedMaskDistanceGrids.distance.distanceGridHash,
  );
  assert.notEqual(narrow.distanceBandSourceHash, wide.distanceBandSourceHash);
  assert.notEqual(narrow.distanceBandGrids.band.bandGridHash, wide.distanceBandGrids.band.bandGridHash);
  assert.ok(wide.distanceBandGrids.band.mean > narrow.distanceBandGrids.band.mean);
});

test('sampling resolution stays derived and rebuildable instead of entering retained band truth', () => {
  const state = makeMaskDistanceBandState({
    field: { id: 'resolution-field', seed: 144, frequency: 3.8, octaves: 5, gain: 0.58 },
    mask: { id: 'resolution-mask', threshold: 0.5, softness: 0.09 },
    distance: { id: 'distance', isoLevel: 0.5 },
    band: { id: 'band', innerWidth: 0.09, outerWidth: 0.13, softness: 0.025 },
  });
  const low = run(state, graphWithResolution(MASK_DISTANCE_BAND_GRAPH, 12, 10)).finalState;
  const high = run(state, graphWithResolution(MASK_DISTANCE_BAND_GRAPH, 32, 24)).finalState;

  assert.equal(low.fieldSourceHash, high.fieldSourceHash);
  assert.equal(low.coverageMaskSourceHash, high.coverageMaskSourceHash);
  assert.equal(low.maskDistanceSourceHash, high.maskDistanceSourceHash);
  assert.equal(low.distanceBandSourceHash, high.distanceBandSourceHash);
  assert.deepEqual(low.distanceBandSource, high.distanceBandSource);
  assert.notEqual(low.signedMaskDistanceGrids.distance.distanceGridHash, high.signedMaskDistanceGrids.distance.distanceGridHash);
  assert.notEqual(low.distanceBandGrids.band.bandGridHash, high.distanceBandGrids.band.bandGridHash);
});

test('the same neutral band contract works over materially different fBm and cellular distance families', () => {
  const mask = { id: 'shared-mask', threshold: 0.5, softness: 0.06 };
  const distance = { id: 'distance', isoLevel: 0.5 };
  const band = { id: 'band', innerWidth: 0.1, outerWidth: 0.15, softness: 0.03 };
  const fbm = run(makeMaskDistanceBandState({
    field: { id: 'shared-field', seed: 91, frequency: 4.5, octaves: 4, gain: 0.55 },
    mask,
    distance,
    band,
  }), graphWithResolution(MASK_DISTANCE_BAND_GRAPH, 18, 12)).finalState;
  const cellular = runCellular(makeCellularMaskDistanceBandState({
    field: { id: 'shared-field', seed: 91, frequency: 4.5, jitter: 0.9, valueMode: 'distance' },
    mask,
    distance,
    band,
  }), graphWithResolution(CELLULAR_MASK_DISTANCE_BAND_GRAPH, 18, 12)).finalState;

  assert.equal(fbm.distanceBandSource.transfer, cellular.distanceBandSource.transfer);
  assert.equal(fbm.distanceBandSource.innerWidth, cellular.distanceBandSource.innerWidth);
  assert.equal(fbm.distanceBandSource.outerWidth, cellular.distanceBandSource.outerWidth);
  assert.notEqual(fbm.coverageMaskSource.fieldSourceHash, cellular.coverageMaskSource.fieldSourceHash);
  assert.notEqual(fbm.maskDistanceSourceHash, cellular.maskDistanceSourceHash);
  assert.notEqual(fbm.distanceBandGrids.band.bandGridHash, cellular.distanceBandGrids.band.bandGridHash);
});

test('distance-band grid sampling is deterministic and rejects probes outside the normalized domain', () => {
  const result = run(makeMaskDistanceBandState({
    field: { id: 'sample-field', seed: 5150, frequency: 4.2 },
    mask: { id: 'sample-mask', threshold: 0.5, softness: 0.1 },
    distance: { id: 'distance', isoLevel: 0.5 },
    band: { id: 'band', innerWidth: 0.1, outerWidth: 0.1, softness: 0.03 },
  }), graphWithResolution(MASK_DISTANCE_BAND_GRAPH, 16, 12));
  const grid = bandGrid(result);

  assert.equal(sampleMaskDistanceBandGrid(grid, 0, 0), grid.values[0]);
  assert.equal(sampleMaskDistanceBandGrid(grid, 1, 1), grid.values.at(-1));
  assert.equal(sampleMaskDistanceBandGrid(grid, 0.4, 0.7), sampleMaskDistanceBandGrid(grid, 0.4, 0.7));
  assert.throws(() => sampleMaskDistanceBandGrid(grid, 1.01, 0.5), /sample\.u must be within \[0,1\]/);
});

test('self-consistent derived distance-grid tampering is rejected by rebuilding from retained source truth', () => {
  const result = run(makeMaskDistanceBandState({
    field: { id: 'truth-field', seed: 7331, frequency: 5.1 },
    mask: { id: 'truth-mask', threshold: 0.5, softness: 0.08 },
    distance: { id: 'distance', isoLevel: 0.5 },
    band: { id: 'band', innerWidth: 0.08, outerWidth: 0.12, softness: 0.03 },
  }), graphWithResolution(MASK_DISTANCE_BAND_GRAPH, 16, 12));
  const tampered = structuredClone(result.finalState);
  const grid = tampered.signedMaskDistanceGrids.distance;
  grid.values[0] = grid.values[0] > 0 ? Math.max(0.000001, grid.values[0] / 2) : Math.min(-0.000001, grid.values[0] / 2);
  grid.distanceGridHash = hashValue(distanceGridHashPayload(grid));

  assert.throws(
    () => buildMaskDistanceBandGridHand.execute(tampered, { maxCells: 4096, maxComparisons: 8388608 }),
    /mask distance grid differs from source-truth rebuild/,
  );
});

test('semantic band-source tampering, invalid controls, and structural cell budgets fail explicitly', () => {
  assert.throws(
    () => run(makeMaskDistanceBandState({ band: { id: 'bad-band', innerWidth: 2 } }), graphWithResolution(MASK_DISTANCE_BAND_GRAPH, 12, 10)),
    /distanceBandRequest\.innerWidth must be within/,
  );

  const valid = run(makeMaskDistanceBandState({
    field: { id: 'tamper-field', seed: 12, frequency: 4.1 },
    mask: { id: 'tamper-mask', threshold: 0.5, softness: 0.08 },
    distance: { id: 'distance', isoLevel: 0.5 },
    band: { id: 'band', innerWidth: 0.08, outerWidth: 0.12, softness: 0.03 },
  }), graphWithResolution(MASK_DISTANCE_BAND_GRAPH, 18, 14)).finalState;

  const semanticTamper = structuredClone(valid);
  semanticTamper.distanceBandSource.transfer = 'pretend-compatible-band';
  semanticTamper.distanceBandSourceHash = hashValue(semanticTamper.distanceBandSource);
  assert.throws(
    () => buildMaskDistanceBandGridHand.execute(semanticTamper, {}),
    /unsupported mask distance band transfer/,
  );

  assert.throws(
    () => buildMaskDistanceBandGridHand.execute(valid, { maxCells: 16, maxComparisons: 8388608 }),
    /maskDistanceBand cell budget exceeded: 252 > 16/,
  );
});
