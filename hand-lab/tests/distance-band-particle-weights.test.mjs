import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph, hashValue } from '../src/hand-runtime.mjs';
import {
  buildDistanceBandParticleWeightSetHand,
  CELLULAR_DISTANCE_BAND_PARTICLE_WEIGHT_GRAPH,
  CELLULAR_DISTANCE_BAND_PARTICLE_WEIGHT_HANDS,
  DISTANCE_BAND_PARTICLE_WEIGHT_GRAPH,
  DISTANCE_BAND_PARTICLE_WEIGHT_HANDS,
  makeCellularDistanceBandParticleWeightState,
  makeDistanceBandParticleWeightState,
} from '../src/distance-band-particle-weights.mjs';

const registry = createHandRegistry(DISTANCE_BAND_PARTICLE_WEIGHT_HANDS);
const cellularRegistry = createHandRegistry(CELLULAR_DISTANCE_BAND_PARTICLE_WEIGHT_HANDS);

const particles = [
  { id: 'p0', x: 0.1, y: 0.15, tag: 'kept-as-source-metadata' },
  { id: 'p1', x: 0.32, y: 0.72 },
  { id: 'p2', x: 0.55, y: 0.5 },
  { id: 'p3', x: 0.82, y: 0.24 },
  { id: 'p4', x: 0.92, y: 0.88 },
];

function graphWithResolution(graph, width, height, maxParticles = 4096, maxBandCells = 4096, maxComparisons = 8388608) {
  return {
    ...graph,
    stages: graph.stages.map((stage) => {
      if (stage.hand === 'fx.field.coverage-mask-grid-build') {
        return { ...stage, params: { width, height, maxCells: 16384 } };
      }
      if (stage.hand === 'fx.field.mask-distance-grid-build') {
        return { ...stage, params: { maxCells: maxBandCells, maxComparisons } };
      }
      if (stage.hand === 'fx.field.mask-distance-band-grid-build') {
        return { ...stage, params: { maxCells: maxBandCells, maxComparisons } };
      }
      if (stage.hand === 'fx.particle.distance-band-weight-build') {
        return { ...stage, params: { maxParticles, maxBandCells, maxComparisons } };
      }
      return stage;
    }),
  };
}

function run(state, graph = DISTANCE_BAND_PARTICLE_WEIGHT_GRAPH, callerKind = 'test') {
  return executeHandGraph({ registry, graph, initialState: state, context: { callerKind } });
}

function runCellular(state, graph = CELLULAR_DISTANCE_BAND_PARTICLE_WEIGHT_GRAPH, callerKind = 'test') {
  return executeHandGraph({ registry: cellularRegistry, graph, initialState: state, context: { callerKind } });
}

function weightedSet(result, id = 'weighted') {
  return result.finalState.bandWeightedParticleSets[id];
}

function bandGridHashPayload(grid) {
  return {
    schema: grid.schema,
    bandSourceHash: grid.bandSourceHash,
    distanceSourceHash: grid.distanceSourceHash,
    distanceGridHash: grid.distanceGridHash,
    width: grid.width,
    height: grid.height,
    values: grid.values,
  };
}

test('distance-band particle weighting is deterministic and caller-neutral without rewriting source particles', () => {
  const state = makeDistanceBandParticleWeightState(particles, {
    field: { id: 'weight-field', seed: 4401, frequency: 4.7, octaves: 5, gain: 0.56 },
    mask: { id: 'weight-mask', threshold: 0.5, softness: 0.07 },
    distance: { id: 'distance', isoLevel: 0.5 },
    band: { id: 'band', innerWidth: 0.08, outerWidth: 0.12, softness: 0.03 },
    weight: { id: 'weighted', exponent: 1.25 },
  });
  const graph = graphWithResolution(DISTANCE_BAND_PARTICLE_WEIGHT_GRAPH, 22, 16);
  const human = run(state, graph, 'human');
  const machine = run(state, graph, 'machine');
  const humanSet = weightedSet(human);
  const machineSet = weightedSet(machine);

  assert.equal(human.finalStateHash, machine.finalStateHash);
  assert.equal(human.finalState.particleSourceHash, machine.finalState.particleSourceHash);
  assert.equal(human.finalState.distanceBandSourceHash, machine.finalState.distanceBandSourceHash);
  assert.equal(human.finalState.bandParticleWeightSourceHash, machine.finalState.bandParticleWeightSourceHash);
  assert.equal(humanSet.weightedSetHash, machineSet.weightedSetHash);
  assert.deepEqual(human.finalState.particles, particles);
  assert.equal(humanSet.particleCount, particles.length);
  assert.equal(humanSet.derived, true);
  assert.equal(humanSet.rebuildable, true);
  assert.ok(humanSet.samples.every((sample) => sample.weight >= 0 && sample.weight <= 1));
  assert.equal(human.finalState.particles[0].tag, 'kept-as-source-metadata');
});

test('weight exponent changes derived weights while scalar, mask, distance, band, and particle source truth stay fixed', () => {
  const base = {
    field: { id: 'exp-field', seed: 801, frequency: 4.4, octaves: 4, gain: 0.55 },
    mask: { id: 'exp-mask', threshold: 0.5, softness: 0.08 },
    distance: { id: 'distance', isoLevel: 0.5 },
    band: { id: 'band', innerWidth: 0.1, outerWidth: 0.14, softness: 0.04 },
  };
  const graph = graphWithResolution(DISTANCE_BAND_PARTICLE_WEIGHT_GRAPH, 24, 18);
  const linear = run(makeDistanceBandParticleWeightState(particles, {
    ...base,
    weight: { id: 'weighted', exponent: 1 },
  }), graph).finalState;
  const focused = run(makeDistanceBandParticleWeightState(particles, {
    ...base,
    weight: { id: 'weighted', exponent: 2 },
  }), graph).finalState;

  assert.equal(linear.fieldSourceHash, focused.fieldSourceHash);
  assert.equal(linear.coverageMaskSourceHash, focused.coverageMaskSourceHash);
  assert.equal(linear.maskDistanceSourceHash, focused.maskDistanceSourceHash);
  assert.equal(linear.distanceBandSourceHash, focused.distanceBandSourceHash);
  assert.equal(linear.particleSourceHash, focused.particleSourceHash);
  assert.notEqual(linear.bandParticleWeightSourceHash, focused.bandParticleWeightSourceHash);
  const a = linear.bandWeightedParticleSets.weighted.samples;
  const b = focused.bandWeightedParticleSets.weighted.samples;
  assert.ok(b.every((sample, index) => sample.weight <= a[index].weight));
  assert.ok(b.some((sample, index) => sample.weight !== a[index].weight));
});

test('sampling resolution remains derived and rebuildable rather than entering the retained particle-weight source', () => {
  const state = makeDistanceBandParticleWeightState(particles, {
    field: { id: 'resolution-field', seed: 177, frequency: 5.1, octaves: 5, gain: 0.58 },
    mask: { id: 'resolution-mask', threshold: 0.49, softness: 0.08 },
    distance: { id: 'distance', isoLevel: 0.5 },
    band: { id: 'band', innerWidth: 0.09, outerWidth: 0.13, softness: 0.03 },
    weight: { id: 'weighted', exponent: 1.4 },
  });
  const low = run(state, graphWithResolution(DISTANCE_BAND_PARTICLE_WEIGHT_GRAPH, 12, 10)).finalState;
  const high = run(state, graphWithResolution(DISTANCE_BAND_PARTICLE_WEIGHT_GRAPH, 30, 22)).finalState;

  assert.equal(low.particleSourceHash, high.particleSourceHash);
  assert.equal(low.distanceBandSourceHash, high.distanceBandSourceHash);
  assert.equal(low.bandParticleWeightSourceHash, high.bandParticleWeightSourceHash);
  assert.deepEqual(low.bandParticleWeightSource, high.bandParticleWeightSource);
  assert.notEqual(low.distanceBandGrids.band.bandGridHash, high.distanceBandGrids.band.bandGridHash);
  assert.notEqual(low.bandWeightedParticleSets.weighted.weightedSetHash, high.bandWeightedParticleSets.weighted.weightedSetHash);
});

test('the same particle weighting contract works over materially different fBm and cellular distance-band donors', () => {
  const shared = {
    mask: { id: 'shared-mask', threshold: 0.5, softness: 0.07 },
    distance: { id: 'distance', isoLevel: 0.5 },
    band: { id: 'band', innerWidth: 0.1, outerWidth: 0.15, softness: 0.03 },
    weight: { id: 'weighted', exponent: 1.3 },
  };
  const graph = graphWithResolution(DISTANCE_BAND_PARTICLE_WEIGHT_GRAPH, 20, 14);
  const cellularGraph = graphWithResolution(CELLULAR_DISTANCE_BAND_PARTICLE_WEIGHT_GRAPH, 20, 14);
  const fbm = run(makeDistanceBandParticleWeightState(particles, {
    ...shared,
    field: { id: 'shared-field', seed: 222, frequency: 4.6, octaves: 4, gain: 0.55 },
  }), graph).finalState;
  const cellular = runCellular(makeCellularDistanceBandParticleWeightState(particles, {
    ...shared,
    field: { id: 'shared-field', seed: 222, frequency: 4.6, jitter: 0.9, valueMode: 'distance' },
  }), cellularGraph).finalState;

  assert.equal(fbm.bandParticleWeightSource.weightTransform, cellular.bandParticleWeightSource.weightTransform);
  assert.equal(fbm.bandParticleWeightSource.exponent, cellular.bandParticleWeightSource.exponent);
  assert.equal(fbm.particleSourceHash, cellular.particleSourceHash);
  assert.notEqual(fbm.distanceBandSourceHash, cellular.distanceBandSourceHash);
  assert.notEqual(fbm.bandWeightedParticleSets.weighted.weightedSetHash, cellular.bandWeightedParticleSets.weighted.weightedSetHash);
});

test('self-consistent derived band-grid tampering is rejected by a source-truth rebuild before particle weights are emitted', () => {
  const result = run(makeDistanceBandParticleWeightState(particles, {
    field: { id: 'truth-field', seed: 7331, frequency: 5.1 },
    mask: { id: 'truth-mask', threshold: 0.5, softness: 0.08 },
    distance: { id: 'distance', isoLevel: 0.5 },
    band: { id: 'band', innerWidth: 0.08, outerWidth: 0.12, softness: 0.03 },
    weight: { id: 'weighted', exponent: 1 },
  }), graphWithResolution(DISTANCE_BAND_PARTICLE_WEIGHT_GRAPH, 16, 12));
  const tampered = structuredClone(result.finalState);
  const grid = tampered.distanceBandGrids.band;
  grid.values[0] = grid.values[0] > 0.5 ? 0.25 : 0.75;
  grid.bandGridHash = hashValue(bandGridHashPayload(grid));

  assert.throws(
    () => buildDistanceBandParticleWeightSetHand.execute(tampered, {
      maxParticles: 4096,
      maxBandCells: 4096,
      maxComparisons: 8388608,
    }),
    /distance-band particle grid differs from source-truth rebuild/,
  );
});

test('semantic weight-source tampering, invalid particles, and explicit work budgets fail instead of silently degrading', () => {
  assert.throws(
    () => run(makeDistanceBandParticleWeightState([{ id: 'bad', x: 1.2, y: 0.5 }], {
      weight: { id: 'weighted' },
    }), graphWithResolution(DISTANCE_BAND_PARTICLE_WEIGHT_GRAPH, 12, 10)),
    /particle bad\.x must be within \[0,1\]/,
  );

  const valid = run(makeDistanceBandParticleWeightState(particles, {
    field: { id: 'budget-field', seed: 42, frequency: 4.2 },
    mask: { id: 'budget-mask', threshold: 0.5, softness: 0.08 },
    distance: { id: 'distance', isoLevel: 0.5 },
    band: { id: 'band', innerWidth: 0.08, outerWidth: 0.12, softness: 0.03 },
    weight: { id: 'weighted', exponent: 1 },
  }), graphWithResolution(DISTANCE_BAND_PARTICLE_WEIGHT_GRAPH, 18, 14)).finalState;

  const semanticTamper = structuredClone(valid);
  semanticTamper.bandParticleWeightSource.weightTransform = 'pretend-compatible-weighting';
  semanticTamper.bandParticleWeightSourceHash = hashValue(semanticTamper.bandParticleWeightSource);
  assert.throws(
    () => buildDistanceBandParticleWeightSetHand.execute(semanticTamper, {}),
    /unsupported distance-band particle weight transform/,
  );

  assert.throws(
    () => buildDistanceBandParticleWeightSetHand.execute(valid, {
      maxParticles: 4,
      maxBandCells: 4096,
      maxComparisons: 8388608,
    }),
    /distanceBandParticle particle budget exceeded: 5 > 4/,
  );
  assert.throws(
    () => buildDistanceBandParticleWeightSetHand.execute(valid, {
      maxParticles: 4096,
      maxBandCells: 16,
      maxComparisons: 8388608,
    }),
    /distanceBandParticle band cell budget exceeded: 252 > 16/,
  );
});
