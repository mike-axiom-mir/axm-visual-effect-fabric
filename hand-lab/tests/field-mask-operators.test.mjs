import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph, hashValue } from '../src/hand-runtime.mjs';
import {
  CELLULAR_COVERAGE_MASK_GRAPH,
  CELLULAR_COVERAGE_MASK_HANDS,
  COVERAGE_MASK_GRAPH,
  COVERAGE_MASK_HANDS,
  coverageFromScalar,
  makeCellularCoverageMaskState,
  makeCoverageMaskState,
  normalizeCoverageMaskRequestHand,
  sampleCoverageMask,
  sampleCoverageSource,
} from '../src/field-mask-operators.mjs';

const registry = createHandRegistry(COVERAGE_MASK_HANDS);
const cellularRegistry = createHandRegistry(CELLULAR_COVERAGE_MASK_HANDS);

function graphWithGrid(width, height, maxCells = 16384) {
  return {
    ...COVERAGE_MASK_GRAPH,
    stages: [
      COVERAGE_MASK_GRAPH.stages[0],
      COVERAGE_MASK_GRAPH.stages[1],
      {
        id: 'build-mask-grid',
        hand: 'fx.field.coverage-mask-grid-build',
        params: { width, height, maxCells },
      },
    ],
  };
}

function cellularGraphWithGrid(width, height, maxCells = 16384) {
  return {
    ...CELLULAR_COVERAGE_MASK_GRAPH,
    stages: [
      CELLULAR_COVERAGE_MASK_GRAPH.stages[0],
      CELLULAR_COVERAGE_MASK_GRAPH.stages[1],
      {
        id: 'build-mask-grid',
        hand: 'fx.field.coverage-mask-grid-build',
        params: { width, height, maxCells },
      },
    ],
  };
}

function run(state, graph = COVERAGE_MASK_GRAPH, callerKind = 'test') {
  return executeHandGraph({ registry, graph, initialState: state, context: { callerKind } });
}

function runCellular(state, graph = CELLULAR_COVERAGE_MASK_GRAPH, callerKind = 'test') {
  return executeHandGraph({ registry: cellularRegistry, graph, initialState: state, context: { callerKind } });
}

function maskFrom(result, id) {
  return result.finalState.coverageMasks[id];
}

test('coverage mask is deterministic and caller-neutral while retaining source lineage', () => {
  const state = makeCoverageMaskState({
    field: {
      id: 'neutral-field',
      seed: 90210,
      frequency: 5.25,
      octaves: 5,
      lacunarity: 2.1,
      gain: 0.56,
      offset: [0.18, -0.37],
    },
    mask: { id: 'neutral-mask', threshold: 0.54, softness: 0.11 },
  });
  const human = run(state, COVERAGE_MASK_GRAPH, 'human');
  const machine = run(state, COVERAGE_MASK_GRAPH, 'machine');
  const humanMask = maskFrom(human, 'neutral-mask');
  const machineMask = maskFrom(machine, 'neutral-mask');

  assert.equal(human.finalStateHash, machine.finalStateHash);
  assert.equal(human.finalState.fieldSourceHash, machine.finalState.fieldSourceHash);
  assert.equal(human.finalState.coverageMaskSourceHash, machine.finalState.coverageMaskSourceHash);
  assert.equal(humanMask.maskHash, machineMask.maskHash);
  assert.equal(humanMask.fieldSourceHash, human.finalState.fieldSourceHash);
  assert.equal(humanMask.maskSourceHash, human.finalState.coverageMaskSourceHash);
  assert.equal(humanMask.values.length, 48 * 32);
  assert.equal(humanMask.derived, true);
  assert.equal(humanMask.rebuildable, true);
  assert.ok(humanMask.values.every((value) => Number.isFinite(value) && value >= 0 && value <= 1));
});

test('canonical field and mask transfer stay stable across rebuildable mask resolutions', () => {
  const state = makeCoverageMaskState({
    field: { id: 'resolution-field', seed: 404, frequency: 3.2, octaves: 6, gain: 0.61 },
    mask: { id: 'resolution-mask', threshold: 0.47, softness: 0.09 },
  });
  const low = run(state, graphWithGrid(16, 10)).finalState;
  const high = run(state, graphWithGrid(72, 44)).finalState;
  const lowMask = low.coverageMasks['resolution-mask'];
  const highMask = high.coverageMasks['resolution-mask'];

  assert.equal(low.fieldSourceHash, high.fieldSourceHash);
  assert.equal(low.coverageMaskSourceHash, high.coverageMaskSourceHash);
  assert.deepEqual(low.coverageMaskSource, high.coverageMaskSource);
  assert.notEqual(lowMask.maskHash, highMask.maskHash);

  const probes = [[0, 0], [0.17, 0.83], [0.5, 0.5], [0.91, 0.23], [1, 1]];
  for (const [u, v] of probes) {
    assert.equal(
      sampleCoverageSource(low.fieldSource, low.coverageMaskSource, u, v),
      sampleCoverageSource(high.fieldSource, high.coverageMaskSource, u, v),
    );
  }
});

test('one coverage transfer supports materially different soft and hard/inverted contexts', () => {
  const soft = run(makeCoverageMaskState({
    field: { id: 'shared-shape', seed: 77, frequency: 2.2, octaves: 5, gain: 0.64 },
    mask: { id: 'soft-mask', threshold: 0.42, softness: 0.2, invert: false },
  })).finalState;
  const hardInverted = run(makeCoverageMaskState({
    field: { id: 'shared-shape', seed: 77, frequency: 2.2, octaves: 5, gain: 0.64 },
    mask: { id: 'hard-mask', threshold: 0.62, softness: 0, invert: true },
  })).finalState;

  const softMask = soft.coverageMasks['soft-mask'];
  const hardMask = hardInverted.coverageMasks['hard-mask'];
  assert.equal(soft.fieldSourceHash, hardInverted.fieldSourceHash);
  assert.notEqual(soft.coverageMaskSourceHash, hardInverted.coverageMaskSourceHash);
  assert.notEqual(softMask.maskHash, hardMask.maskHash);
  assert.ok(softMask.values.some((value) => value > 0 && value < 1));
  assert.ok(hardMask.values.every((value) => value === 0 || value === 1));
  assert.ok(softMask.max > softMask.min);
  assert.ok(hardMask.max >= hardMask.min);
});

test('coverage transfer has explicit threshold, softness and invert behavior', () => {
  const base = run(makeCoverageMaskState({
    field: { id: 'transfer-field', seed: 12 },
    mask: { id: 'transfer-mask', threshold: 0.5, softness: 0.1, invert: false },
  })).finalState.coverageMaskSource;
  const inverted = { ...base, invert: true };

  assert.equal(coverageFromScalar(base, 0.2), 0);
  assert.equal(coverageFromScalar(base, 0.8), 1);
  assert.equal(coverageFromScalar(base, 0.5), 0.5);
  assert.equal(coverageFromScalar(inverted, 0.2), 1);
  assert.equal(coverageFromScalar(inverted, 0.8), 0);
  assert.equal(coverageFromScalar(inverted, 0.5), 0.5);
});

test('retained coverage grid can be sampled and rejects out-of-domain probes', () => {
  const state = run(makeCoverageMaskState({
    field: { id: 'sample-field', seed: 5150 },
    mask: { id: 'sample-mask', threshold: 0.5, softness: 0.12 },
  }), graphWithGrid(5, 5)).finalState;
  const mask = state.coverageMasks['sample-mask'];

  assert.equal(sampleCoverageMask(mask, 0, 0), mask.values[0]);
  assert.equal(sampleCoverageMask(mask, 1, 1), mask.values[mask.values.length - 1]);
  assert.equal(sampleCoverageMask(mask, 0.5, 0.5), mask.values[2 * mask.width + 2]);
  assert.throws(() => sampleCoverageMask(mask, -0.01, 0.5), /sample\.u must be within \[0,1\]/);
});

test('invalid mask parameters and oversized derived working sets fail explicitly', () => {
  assert.throws(
    () => run(makeCoverageMaskState({ mask: { id: 'bad-threshold', threshold: 1.1 } })),
    /maskRequest\.threshold must be within \[0,1\]/,
  );
  assert.throws(
    () => run(makeCoverageMaskState({ mask: { id: 'bad-softness', softness: 0.51 } })),
    /maskRequest\.softness must be within \[0,0.5\]/,
  );
  assert.throws(
    () => run(makeCoverageMaskState({ mask: { id: 'bad-invert', invert: 'yes' } })),
    /maskRequest\.invert must be boolean/,
  );
  assert.throws(
    () => run(makeCoverageMaskState({ mask: { id: 'cell-budget' } }), graphWithGrid(100, 100, 4096)),
    /coverageMask cell budget exceeded: 10000 > 4096/,
  );
});

test('the same coverage-mask Hands consume cellular sources deterministically for human and machine callers', () => {
  const state = makeCellularCoverageMaskState({
    field: {
      id: 'cellular-neutral-field',
      seed: 7331,
      frequency: 7.25,
      jitter: 0.83,
      offset: [0.2, -0.35],
      valueMode: 'inverse-distance',
    },
    mask: { id: 'cellular-neutral-mask', threshold: 0.58, softness: 0.07 },
  });
  const human = runCellular(state, CELLULAR_COVERAGE_MASK_GRAPH, 'human');
  const machine = runCellular(state, CELLULAR_COVERAGE_MASK_GRAPH, 'machine');
  const humanMask = maskFrom(human, 'cellular-neutral-mask');

  assert.equal(human.finalStateHash, machine.finalStateHash);
  assert.equal(human.finalState.cellularFieldSourceHash, machine.finalState.cellularFieldSourceHash);
  assert.equal(human.finalState.coverageMaskSourceHash, machine.finalState.coverageMaskSourceHash);
  assert.equal(human.finalState.coverageMaskSource.fieldSourceHash, human.finalState.cellularFieldSourceHash);
  assert.equal(humanMask.fieldSourceHash, human.finalState.cellularFieldSourceHash);
  assert.equal(humanMask.maskHash, maskFrom(machine, 'cellular-neutral-mask').maskHash);
  assert.ok(humanMask.values.some((value) => value > 0 && value < 1));
  assert.equal(
    sampleCoverageSource(human.finalState.cellularFieldSource, human.finalState.coverageMaskSource, 0.37, 0.61),
    sampleCoverageSource(machine.finalState.cellularFieldSource, machine.finalState.coverageMaskSource, 0.37, 0.61),
  );
});

test('cellular source truth and the canonical mask transfer stay stable across derived resolutions', () => {
  const state = makeCellularCoverageMaskState({
    field: { id: 'cellular-resolution', seed: 222, frequency: 5.5, jitter: 0.6, valueMode: 'distance' },
    mask: { id: 'cellular-resolution-mask', threshold: 0.36, softness: 0.14, invert: true },
  });
  const low = runCellular(state, cellularGraphWithGrid(12, 9)).finalState;
  const high = runCellular(state, cellularGraphWithGrid(64, 40)).finalState;

  assert.equal(low.cellularFieldSourceHash, high.cellularFieldSourceHash);
  assert.equal(low.coverageMaskSourceHash, high.coverageMaskSourceHash);
  assert.deepEqual(low.coverageMaskSource, high.coverageMaskSource);
  assert.notEqual(low.coverageMasks['cellular-resolution-mask'].maskHash, high.coverageMasks['cellular-resolution-mask'].maskHash);
});

test('one coverage contract stays source-honest across materially different fBm and cellular families', () => {
  const mask = { id: 'cross-family-mask', threshold: 0.5, softness: 0.1, invert: false };
  const fbm = run(makeCoverageMaskState({
    field: { id: 'cross-family-field', seed: 91, frequency: 4.5, octaves: 4, gain: 0.55 },
    mask,
  })).finalState;
  const cellular = runCellular(makeCellularCoverageMaskState({
    field: { id: 'cross-family-field', seed: 91, frequency: 4.5, jitter: 0.9, valueMode: 'distance' },
    mask,
  })).finalState;

  assert.equal(fbm.coverageMaskSource.transfer, cellular.coverageMaskSource.transfer);
  assert.equal(fbm.coverageMaskSource.threshold, cellular.coverageMaskSource.threshold);
  assert.equal(fbm.coverageMaskSource.softness, cellular.coverageMaskSource.softness);
  assert.notEqual(fbm.coverageMaskSource.fieldSourceHash, cellular.coverageMaskSource.fieldSourceHash);
  assert.notEqual(fbm.coverageMasks['cross-family-mask'].maskHash, cellular.coverageMasks['cross-family-mask'].maskHash);
});

test('multiple retained scalar sources require explicit selection and self-consistent cellular semantic tampering is rejected', () => {
  const fbm = run(makeCoverageMaskState({
    field: { id: 'dual-fbm', seed: 7 },
    mask: { id: 'dual-mask', threshold: 0.5, softness: 0.08 },
  })).finalState;
  const cellular = runCellular(makeCellularCoverageMaskState({
    field: { id: 'dual-cellular', seed: 8, jitter: 0.75 },
    mask: { id: 'cellular-mask', threshold: 0.5, softness: 0.08 },
  })).finalState;
  const dual = {
    ...fbm,
    cellularFieldSource: cellular.cellularFieldSource,
    cellularFieldSourceHash: cellular.cellularFieldSourceHash,
    maskRequest: { id: 'dual-mask', threshold: 0.5, softness: 0.08 },
  };

  assert.throws(
    () => normalizeCoverageMaskRequestHand.execute(dual),
    /found multiple scalar sources; set maskRequest\.fieldSourceKind explicitly/,
  );
  const selected = normalizeCoverageMaskRequestHand.execute({
    ...dual,
    maskRequest: { ...dual.maskRequest, fieldSourceKind: 'cellular' },
  }).state;
  assert.equal(selected.coverageMaskSource.fieldSourceHash, cellular.cellularFieldSourceHash);
  assert.equal(selected.coverageMaskSource.fieldId, cellular.cellularFieldSource.id);

  const tampered = structuredClone(cellular);
  tampered.cellularFieldSource.algorithm = 'pretend-compatible-cellular';
  tampered.cellularFieldSourceHash = hashValue(tampered.cellularFieldSource);
  tampered.maskRequest = { id: 'tampered-mask', fieldSourceKind: 'cellular', threshold: 0.5, softness: 0.08 };
  assert.throws(
    () => normalizeCoverageMaskRequestHand.execute(tampered),
    /unsupported cellular field algorithm/,
  );
});
