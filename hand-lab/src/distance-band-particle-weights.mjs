import { deepClone, hashValue } from './hand-runtime.mjs';
import {
  buildMaskDistanceBandGridHand,
  CELLULAR_MASK_DISTANCE_BAND_GRAPH,
  CELLULAR_MASK_DISTANCE_BAND_HANDS,
  makeCellularMaskDistanceBandState,
  makeMaskDistanceBandState,
  MASK_DISTANCE_BAND_GRAPH,
  MASK_DISTANCE_BAND_HANDS,
  sampleMaskDistanceBandGrid,
} from './mask-distance-band2d.mjs';

const round6 = (value) => Number(Number(value).toFixed(6));
const HARD_MAX_PARTICLES = 4096;
const HARD_MAX_BAND_CELLS = 4096;
const HARD_MAX_COMPARISONS = 8388608;

function hand(id, execute, description) {
  return Object.freeze({
    schema: 'axm.hand/v0.1',
    id,
    version: '0.1.0',
    deterministic: true,
    callerNeutral: true,
    network: 'forbidden',
    description,
    execute,
  });
}

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be finite`);
  return number;
}

function bounded(value, min, max, label) {
  const number = finite(value, label);
  if (number < min || number > max) throw new Error(`${label} must be within [${min},${max}]`);
  return number;
}

function boundedInteger(value, min, max, label) {
  const number = finite(value, label);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(`${label} must be an integer within [${min},${max}]`);
  }
  return number;
}

function validateParticles(particles) {
  if (!Array.isArray(particles) || particles.length === 0) {
    throw new Error('distance-band particle weighting requires a non-empty particles array');
  }
  const ids = new Set();
  for (const [index, particle] of particles.entries()) {
    if (!particle || typeof particle !== 'object') {
      throw new Error(`particles[${index}] must be an object`);
    }
    const id = String(particle.id ?? '').trim();
    if (!id) throw new Error(`particles[${index}].id must be non-empty`);
    if (ids.has(id)) throw new Error(`duplicate particle id: ${id}`);
    ids.add(id);
    bounded(particle.x, 0, 1, `particle ${id}.x`);
    bounded(particle.y, 0, 1, `particle ${id}.y`);
  }
  return { particleCount: particles.length };
}

function validateBandSource(source) {
  if (!source || source.schema !== 'axm.mask-distance-band-source/v0.1') {
    throw new Error('distance-band particle weighting requires normalized distance band source');
  }
  if (source.transfer !== 'signed-distance-inner-outer-band-v0.1') {
    throw new Error('unsupported mask distance band transfer');
  }
  if (source.signMapping !== 'positive-inside-negative-outside') {
    throw new Error('unsupported mask distance band sign mapping');
  }
  if (source.softnessProfile !== 'smoothstep-outward-v0.1') {
    throw new Error('unsupported mask distance band softness profile');
  }
  if (!String(source.id ?? '').trim()) throw new Error('distance band source id must be non-empty');
  return source;
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

function validateBandGrid(grid) {
  if (!grid || grid.schema !== 'axm.distance-band-grid/v0.1') {
    throw new Error('distance-band particle weighting requires distance band grid');
  }
  const width = boundedInteger(grid.width, 2, 128, 'distanceBandGrid.width');
  const height = boundedInteger(grid.height, 2, 128, 'distanceBandGrid.height');
  const cells = width * height;
  if (!Array.isArray(grid.values) || grid.values.length !== cells) {
    throw new Error('distance band grid value count mismatch');
  }
  for (const [index, value] of grid.values.entries()) {
    bounded(value, 0, 1, `distanceBandGrid.values[${index}]`);
  }
  if (hashValue(bandGridHashPayload(grid)) !== grid.bandGridHash) {
    throw new Error('distance band grid hash mismatch');
  }
  return { width, height, cells };
}

function validateWeightSource(source) {
  if (!source || source.schema !== 'axm.distance-band-particle-weight-source/v0.1') {
    throw new Error('distance-band particle weighting requires normalized weight source');
  }
  if (source.weightTransform !== 'band-coverage-power-v0.1') {
    throw new Error('unsupported distance-band particle weight transform');
  }
  if (!String(source.id ?? '').trim()) throw new Error('distance-band particle weight source id must be non-empty');
  if (!String(source.bandId ?? '').trim()) throw new Error('distance-band particle weight bandId must be non-empty');
  if (!String(source.particleSourceHash ?? '').trim()) {
    throw new Error('distance-band particle weight particle source hash must be non-empty');
  }
  if (!String(source.distanceBandSourceHash ?? '').trim()) {
    throw new Error('distance-band particle weight band source hash must be non-empty');
  }
  boundedInteger(source.particleCount, 1, HARD_MAX_PARTICLES, 'distanceBandParticleWeightSource.particleCount');
  bounded(source.exponent, 0.125, 8, 'distanceBandParticleWeightSource.exponent');
  return source;
}

function weightedSetHashPayload(set) {
  return {
    schema: set.schema,
    weightSourceHash: set.weightSourceHash,
    particleSourceHash: set.particleSourceHash,
    distanceBandSourceHash: set.distanceBandSourceHash,
    bandGridHash: set.bandGridHash,
    particleCount: set.particleCount,
    samples: set.samples,
  };
}

export const normalizeDistanceBandParticleWeightHand = hand('fx.particle.distance-band-weight-source-normalize', (state) => {
  const next = deepClone(state);
  const request = next.bandParticleWeightRequest;
  if (!request || typeof request !== 'object') {
    throw new Error('distance-band particle weighting requires bandParticleWeightRequest state');
  }
  const particleStats = validateParticles(next.particles);
  validateBandSource(next.distanceBandSource);
  if (hashValue(next.distanceBandSource) !== next.distanceBandSourceHash) {
    throw new Error('distance band source state hash mismatch');
  }

  const id = String(request.id ?? 'band-weighted-particles').trim();
  if (!id) throw new Error('bandParticleWeightRequest.id must be non-empty');
  const bandId = String(request.bandId ?? next.distanceBandSource.id).trim();
  if (!bandId) throw new Error('bandParticleWeightRequest.bandId must be non-empty');
  if (bandId !== next.distanceBandSource.id) {
    throw new Error('distance-band particle weighting must reference the active retained distance band source');
  }

  next.particleSourceHash = hashValue(next.particles);
  next.bandParticleWeightSource = {
    schema: 'axm.distance-band-particle-weight-source/v0.1',
    id,
    particleSourceHash: next.particleSourceHash,
    particleCount: particleStats.particleCount,
    bandId,
    distanceBandSourceHash: next.distanceBandSourceHash,
    weightTransform: 'band-coverage-power-v0.1',
    exponent: round6(bounded(request.exponent ?? 1, 0.125, 8, 'bandParticleWeightRequest.exponent')),
  };
  validateWeightSource(next.bandParticleWeightSource);
  next.bandParticleWeightSourceHash = hashValue(next.bandParticleWeightSource);

  return {
    state: next,
    evidence: {
      particleSourceHash: next.particleSourceHash,
      distanceBandSourceHash: next.distanceBandSourceHash,
      bandParticleWeightSourceHash: next.bandParticleWeightSourceHash,
      particleCount: particleStats.particleCount,
      bandId,
      exponent: next.bandParticleWeightSource.exponent,
    },
  };
}, 'Bind one renderer-neutral particle point set to retained distance-band coverage truth without rewriting source particles or assigning opacity, size, color, emission, or gameplay meaning.');

export const buildDistanceBandParticleWeightSetHand = hand('fx.particle.distance-band-weight-build', (state, params = {}) => {
  const next = deepClone(state);
  const particleStats = validateParticles(next.particles);
  validateBandSource(next.distanceBandSource);
  validateWeightSource(next.bandParticleWeightSource);

  if (hashValue(next.particles) !== next.particleSourceHash) {
    throw new Error('distance-band particle retained particle state hash mismatch');
  }
  if (hashValue(next.distanceBandSource) !== next.distanceBandSourceHash) {
    throw new Error('distance band source state hash mismatch');
  }
  if (hashValue(next.bandParticleWeightSource) !== next.bandParticleWeightSourceHash) {
    throw new Error('distance-band particle weight source state hash mismatch');
  }
  if (particleStats.particleCount !== next.bandParticleWeightSource.particleCount) {
    throw new Error('distance-band particle retained particle cardinality mismatch');
  }
  if (next.bandParticleWeightSource.particleSourceHash !== next.particleSourceHash) {
    throw new Error('distance-band particle retained particle hash lineage mismatch');
  }
  if (next.bandParticleWeightSource.distanceBandSourceHash !== next.distanceBandSourceHash) {
    throw new Error('distance-band particle retained band source hash mismatch');
  }
  if (next.bandParticleWeightSource.bandId !== next.distanceBandSource.id) {
    throw new Error('distance-band particle retained band id mismatch');
  }

  const bandGrid = next.distanceBandGrids?.[next.bandParticleWeightSource.bandId];
  const bandStats = validateBandGrid(bandGrid);
  if (bandGrid.bandSourceHash !== next.distanceBandSourceHash) {
    throw new Error('distance-band particle band grid lineage mismatch');
  }

  const maxParticles = boundedInteger(
    params.maxParticles ?? HARD_MAX_PARTICLES,
    1,
    HARD_MAX_PARTICLES,
    'distanceBandParticle.maxParticles',
  );
  if (particleStats.particleCount > maxParticles) {
    throw new Error(`distanceBandParticle particle budget exceeded: ${particleStats.particleCount} > ${maxParticles}`);
  }
  const maxBandCells = boundedInteger(
    params.maxBandCells ?? HARD_MAX_BAND_CELLS,
    16,
    HARD_MAX_BAND_CELLS,
    'distanceBandParticle.maxBandCells',
  );
  if (bandStats.cells > maxBandCells) {
    throw new Error(`distanceBandParticle band cell budget exceeded: ${bandStats.cells} > ${maxBandCells}`);
  }
  const maxComparisons = boundedInteger(
    params.maxComparisons ?? HARD_MAX_COMPARISONS,
    0,
    HARD_MAX_COMPARISONS,
    'distanceBandParticle.maxComparisons',
  );

  const rebuiltState = buildMaskDistanceBandGridHand.execute(next, {
    maxCells: maxBandCells,
    maxComparisons,
  }).state;
  const rebuiltBandGrid = rebuiltState.distanceBandGrids?.[next.bandParticleWeightSource.bandId];
  if (!rebuiltBandGrid || rebuiltBandGrid.bandGridHash !== bandGrid.bandGridHash) {
    throw new Error('distance-band particle grid differs from source-truth rebuild');
  }

  const exponent = next.bandParticleWeightSource.exponent;
  let minWeight = Infinity;
  let maxWeight = -Infinity;
  let sumWeight = 0;
  let zeroWeightCount = 0;
  let fullWeightCount = 0;
  const samples = next.particles.map((particle) => {
    const coverage = sampleMaskDistanceBandGrid(bandGrid, particle.x, particle.y);
    const weight = round6(Math.pow(coverage, exponent));
    minWeight = Math.min(minWeight, weight);
    maxWeight = Math.max(maxWeight, weight);
    sumWeight += weight;
    if (weight === 0) zeroWeightCount += 1;
    if (weight === 1) fullWeightCount += 1;
    return {
      particleId: String(particle.id),
      x: round6(particle.x),
      y: round6(particle.y),
      weight,
    };
  });

  const weightedSet = {
    schema: 'axm.distance-band-particle-weight-set/v0.1',
    weightSourceHash: next.bandParticleWeightSourceHash,
    particleSourceHash: next.particleSourceHash,
    distanceBandSourceHash: next.distanceBandSourceHash,
    bandGridHash: bandGrid.bandGridHash,
    particleCount: particleStats.particleCount,
    samples,
    minWeight: round6(minWeight),
    maxWeight: round6(maxWeight),
    meanWeight: round6(sumWeight / samples.length),
    zeroWeightCount,
    fullWeightCount,
    derived: true,
    rebuildable: true,
  };
  weightedSet.weightedSetHash = hashValue(weightedSetHashPayload(weightedSet));

  next.bandWeightedParticleSets ??= {};
  next.bandWeightedParticleSets[next.bandParticleWeightSource.id] = weightedSet;

  return {
    state: next,
    evidence: {
      particleSourceHash: next.particleSourceHash,
      distanceBandSourceHash: next.distanceBandSourceHash,
      bandGridHash: bandGrid.bandGridHash,
      bandParticleWeightSourceHash: next.bandParticleWeightSourceHash,
      weightedSetHash: weightedSet.weightedSetHash,
      particleCount: weightedSet.particleCount,
      minWeight: weightedSet.minWeight,
      maxWeight: weightedSet.maxWeight,
      meanWeight: weightedSet.meanWeight,
      zeroWeightCount,
      fullWeightCount,
      weightSamples: weightedSet.particleCount,
      truthRebuildComparisons: rebuiltBandGrid ? rebuiltState.signedMaskDistanceGrids?.[next.distanceBandSource.distanceId]?.comparisonCount ?? null : null,
      maxParticles,
      maxBandCells,
      maxComparisons,
    },
  };
}, 'Build one bounded rebuildable renderer-neutral particle weight set by sampling a source-truth-verified distance band at retained source particle positions.');

export const DISTANCE_BAND_PARTICLE_WEIGHT_HANDS = [
  ...MASK_DISTANCE_BAND_HANDS,
  normalizeDistanceBandParticleWeightHand,
  buildDistanceBandParticleWeightSetHand,
];

export const CELLULAR_DISTANCE_BAND_PARTICLE_WEIGHT_HANDS = [
  ...CELLULAR_MASK_DISTANCE_BAND_HANDS,
  normalizeDistanceBandParticleWeightHand,
  buildDistanceBandParticleWeightSetHand,
];

export const DISTANCE_BAND_PARTICLE_WEIGHT_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.particle.distance-band-weight2d',
  version: '0.1.0',
  stages: [
    ...MASK_DISTANCE_BAND_GRAPH.stages,
    { id: 'normalize-distance-band-particle-weight-source', hand: 'fx.particle.distance-band-weight-source-normalize', params: {} },
    { id: 'build-distance-band-particle-weights', hand: 'fx.particle.distance-band-weight-build', params: { maxParticles: 4096, maxBandCells: 4096, maxComparisons: 8388608 } },
  ],
});

export const CELLULAR_DISTANCE_BAND_PARTICLE_WEIGHT_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.particle.distance-band-weight2d-cellular',
  version: '0.1.0',
  stages: [
    ...CELLULAR_MASK_DISTANCE_BAND_GRAPH.stages,
    { id: 'normalize-distance-band-particle-weight-source', hand: 'fx.particle.distance-band-weight-source-normalize', params: {} },
    { id: 'build-distance-band-particle-weights', hand: 'fx.particle.distance-band-weight-build', params: { maxParticles: 4096, maxBandCells: 4096, maxComparisons: 8388608 } },
  ],
});

function bandOptions(options = {}) {
  return {
    field: deepClone(options.field ?? {}),
    mask: deepClone(options.mask ?? {}),
    distance: { id: 'distance', ...(deepClone(options.distance ?? {})) },
    band: { id: 'band', ...(deepClone(options.band ?? {})) },
  };
}

export function makeDistanceBandParticleWeightState(particles, options = {}) {
  const resolved = bandOptions(options);
  const state = makeMaskDistanceBandState(resolved);
  return {
    ...state,
    particles: deepClone(particles),
    bandParticleWeightRequest: {
      id: options.weight?.id ?? 'band-weighted-particles',
      bandId: options.weight?.bandId ?? resolved.band.id,
      exponent: options.weight?.exponent ?? 1,
    },
    bandWeightedParticleSets: {},
  };
}

export function makeCellularDistanceBandParticleWeightState(particles, options = {}) {
  const resolved = bandOptions(options);
  const state = makeCellularMaskDistanceBandState(resolved);
  return {
    ...state,
    particles: deepClone(particles),
    bandParticleWeightRequest: {
      id: options.weight?.id ?? 'band-weighted-particles',
      bandId: options.weight?.bandId ?? resolved.band.id,
      exponent: options.weight?.exponent ?? 1,
    },
    bandWeightedParticleSets: {},
  };
}
