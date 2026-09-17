import { deepClone, hashValue } from './hand-runtime.mjs';
import {
  buildDistanceBandParticleWeightSetHand,
  CELLULAR_DISTANCE_BAND_PARTICLE_WEIGHT_GRAPH,
  CELLULAR_DISTANCE_BAND_PARTICLE_WEIGHT_HANDS,
  DISTANCE_BAND_PARTICLE_WEIGHT_GRAPH,
  DISTANCE_BAND_PARTICLE_WEIGHT_HANDS,
  makeCellularDistanceBandParticleWeightState,
  makeDistanceBandParticleWeightState,
} from './distance-band-particle-weights.mjs';

const HARD_MAX_PARTICLES = 4096;
const HARD_MAX_BAND_CELLS = 4096;
const HARD_MAX_COMPARISONS = 8388608;
const round3 = (value) => Number(Number(value).toFixed(3));
const round6 = (value) => Number(Number(value).toFixed(6));

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

function escapeAttribute(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function hexColor(value, label) {
  const color = String(value ?? '').trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
    throw new Error(`${label} must be a six-digit hex color`);
  }
  return color.toLowerCase();
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

function validateSelectedWeightedSet(next, selected) {
  if (!selected || selected.schema !== 'axm.distance-band-particle-weight-set/v0.1') {
    throw new Error('distance-band particle SVG requires a derived particle weight set');
  }
  const particleCount = boundedInteger(selected.particleCount, 1, HARD_MAX_PARTICLES, 'weightedSet.particleCount');
  if (!Array.isArray(selected.samples) || selected.samples.length !== particleCount) {
    throw new Error('distance-band particle SVG weighted-set cardinality mismatch');
  }
  if (hashValue(weightedSetHashPayload(selected)) !== selected.weightedSetHash) {
    throw new Error('distance-band particle SVG selected weighted-set hash mismatch');
  }
  if (hashValue(next.particles) !== next.particleSourceHash) {
    throw new Error('distance-band particle SVG retained particle hash mismatch');
  }
  if (hashValue(next.distanceBandSource) !== next.distanceBandSourceHash) {
    throw new Error('distance-band particle SVG retained band source hash mismatch');
  }
  if (hashValue(next.bandParticleWeightSource) !== next.bandParticleWeightSourceHash) {
    throw new Error('distance-band particle SVG retained weight source hash mismatch');
  }
  if (selected.weightSourceHash !== next.bandParticleWeightSourceHash) {
    throw new Error('distance-band particle SVG weight-source lineage mismatch');
  }
  if (selected.particleSourceHash !== next.particleSourceHash) {
    throw new Error('distance-band particle SVG particle lineage mismatch');
  }
  if (selected.distanceBandSourceHash !== next.distanceBandSourceHash) {
    throw new Error('distance-band particle SVG distance-band lineage mismatch');
  }
  if (next.bandParticleWeightSource.particleSourceHash !== next.particleSourceHash) {
    throw new Error('distance-band particle SVG retained particle-source lineage mismatch');
  }
  if (next.bandParticleWeightSource.distanceBandSourceHash !== next.distanceBandSourceHash) {
    throw new Error('distance-band particle SVG retained band-source lineage mismatch');
  }
  if (next.bandParticleWeightSource.particleCount !== particleCount || next.particles.length !== particleCount) {
    throw new Error('distance-band particle SVG retained particle cardinality mismatch');
  }

  let minWeight = Infinity;
  let maxWeight = -Infinity;
  let sumWeight = 0;
  let zeroWeightCount = 0;
  let fullWeightCount = 0;
  for (let index = 0; index < particleCount; index += 1) {
    const particle = next.particles[index];
    const sample = selected.samples[index];
    if (!sample || String(sample.particleId) !== String(particle.id)) {
      throw new Error(`distance-band particle SVG particle identity mismatch at index ${index}`);
    }
    const x = bounded(sample.x, 0, 1, `weightedSet.samples[${index}].x`);
    const y = bounded(sample.y, 0, 1, `weightedSet.samples[${index}].y`);
    const weight = bounded(sample.weight, 0, 1, `weightedSet.samples[${index}].weight`);
    if (round6(particle.x) !== round6(x) || round6(particle.y) !== round6(y)) {
      throw new Error(`distance-band particle SVG particle coordinate mismatch at index ${index}`);
    }
    minWeight = Math.min(minWeight, weight);
    maxWeight = Math.max(maxWeight, weight);
    sumWeight += weight;
    if (weight === 0) zeroWeightCount += 1;
    if (weight === 1) fullWeightCount += 1;
  }
  const meanWeight = round6(sumWeight / particleCount);
  if (
    round6(selected.minWeight) !== round6(minWeight)
    || round6(selected.maxWeight) !== round6(maxWeight)
    || round6(selected.meanWeight) !== meanWeight
    || selected.zeroWeightCount !== zeroWeightCount
    || selected.fullWeightCount !== fullWeightCount
  ) {
    throw new Error('distance-band particle SVG weighted-set summary mismatch');
  }
  return { particleCount };
}

function project(sample, width, height, padding) {
  return {
    x: round3(padding + Number(sample.x) * (width - padding * 2)),
    y: round3(padding + Number(sample.y) * (height - padding * 2)),
  };
}

function svgNumber(value) {
  return Number(value).toFixed(3).replace(/\.000$/, '');
}

function lerp(min, max, t) {
  return min + (max - min) * t;
}

export const distanceBandParticleStaticSvgHand = hand('fx.particle.distance-band-weighted-static-svg-realize', (state, params = {}) => {
  const next = deepClone(state);
  if (!next.bandParticleWeightSourceHash || !next.particleSourceHash || !next.distanceBandSourceHash) {
    throw new Error('distance-band particle SVG requires normalized retained source lineage');
  }
  const selectionId = next.bandParticleWeightSource?.id;
  if (!selectionId) throw new Error('distance-band particle SVG requires particle weight source id');
  const selected = next.bandWeightedParticleSets?.[selectionId];
  if (!selected) throw new Error(`distance-band particle SVG requires weighted particle set ${selectionId}`);
  const selectedStats = validateSelectedWeightedSet(next, selected);

  const width = boundedInteger(params.width ?? 640, 64, 4096, 'distanceBandParticleSvg.width');
  const height = boundedInteger(params.height ?? 420, 64, 4096, 'distanceBandParticleSvg.height');
  const padding = bounded(params.padding ?? 20, 0, 512, 'distanceBandParticleSvg.padding');
  if (padding * 2 >= Math.min(width, height)) {
    throw new Error('distanceBandParticleSvg.padding must leave a positive drawable area');
  }
  const minRadius = bounded(params.minRadius ?? 1.2, 0.25, 32, 'distanceBandParticleSvg.minRadius');
  const maxRadius = bounded(params.maxRadius ?? 5.2, 0.25, 32, 'distanceBandParticleSvg.maxRadius');
  if (maxRadius < minRadius) throw new Error('distanceBandParticleSvg.maxRadius must be >= minRadius');
  const minOpacity = bounded(params.minOpacity ?? 0.08, 0, 1, 'distanceBandParticleSvg.minOpacity');
  const maxOpacity = bounded(params.maxOpacity ?? 0.94, 0, 1, 'distanceBandParticleSvg.maxOpacity');
  if (maxOpacity < minOpacity) throw new Error('distanceBandParticleSvg.maxOpacity must be >= minOpacity');
  const pointColor = hexColor(params.pointColor ?? '#69d7ff', 'distanceBandParticleSvg.pointColor');
  const backgroundColor = hexColor(params.backgroundColor ?? '#071018', 'distanceBandParticleSvg.backgroundColor');
  const maxParticles = boundedInteger(params.maxParticles ?? HARD_MAX_PARTICLES, 1, HARD_MAX_PARTICLES, 'distanceBandParticleSvg.maxParticles');
  const maxBandCells = boundedInteger(params.maxBandCells ?? HARD_MAX_BAND_CELLS, 16, HARD_MAX_BAND_CELLS, 'distanceBandParticleSvg.maxBandCells');
  const maxComparisons = boundedInteger(params.maxComparisons ?? HARD_MAX_COMPARISONS, 0, HARD_MAX_COMPARISONS, 'distanceBandParticleSvg.maxComparisons');
  if (selectedStats.particleCount > maxParticles) {
    throw new Error(`distanceBandParticleSvg particle budget exceeded: ${selectedStats.particleCount} > ${maxParticles}`);
  }

  const rebuilt = buildDistanceBandParticleWeightSetHand.execute(next, {
    maxParticles,
    maxBandCells,
    maxComparisons,
  }).state;
  const rebuiltSelected = rebuilt.bandWeightedParticleSets?.[selectionId];
  if (!rebuiltSelected || rebuiltSelected.weightedSetHash !== selected.weightedSetHash) {
    throw new Error('distance-band particle SVG weighted set differs from source-truth rebuild');
  }

  const pointMarkup = selected.samples.map((sample) => {
    const p = project(sample, width, height, padding);
    const radius = round3(lerp(minRadius, maxRadius, sample.weight));
    const opacity = round3(lerp(minOpacity, maxOpacity, sample.weight));
    return `<circle data-particle-id="${escapeAttribute(sample.particleId)}" data-weight="${svgNumber(sample.weight)}" cx="${svgNumber(p.x)}" cy="${svgNumber(p.y)}" r="${svgNumber(radius)}" fill="${pointColor}" fill-opacity="${svgNumber(opacity)}"/>`;
  }).join('');

  const content = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" data-renderer="axm.vfx.distance-band-particle-static-svg/v0.1" data-weighted-set-hash="${escapeAttribute(selected.weightedSetHash)}"><title>AXM derived distance-band particle weight inspection</title><rect width="100%" height="100%" fill="${backgroundColor}"/><g data-layer="weighted-particles">${pointMarkup}</g></svg>`;
  const artifactHash = hashValue(content);
  const realization = {
    mediaType: 'image/svg+xml',
    renderer: 'axm.vfx.distance-band-particle-static-svg/v0.1',
    derivedFromWeightedSetHash: selected.weightedSetHash,
    particleSourceHash: next.particleSourceHash,
    distanceBandSourceHash: next.distanceBandSourceHash,
    particleWeightSourceHash: next.bandParticleWeightSourceHash,
    bandGridHash: selected.bandGridHash,
    particleCount: selected.particleCount,
    width,
    height,
    padding,
    minRadius,
    maxRadius,
    minOpacity,
    maxOpacity,
    pointColor,
    backgroundColor,
    artifactHash,
    content,
  };
  next.realizations ??= {};
  next.realizations.distanceBandParticleStaticSvg = realization;

  return {
    state: next,
    evidence: {
      renderer: realization.renderer,
      bytes: Buffer.byteLength(content),
      artifactHash,
      derivedFromWeightedSetHash: realization.derivedFromWeightedSetHash,
      particleSourceHash: realization.particleSourceHash,
      distanceBandSourceHash: realization.distanceBandSourceHash,
      particleWeightSourceHash: realization.particleWeightSourceHash,
      bandGridHash: realization.bandGridHash,
      particleCount: realization.particleCount,
      width,
      height,
      maxParticles,
      maxBandCells,
      maxComparisons,
      truthRebuildComparisons: rebuilt.signedMaskDistanceGrids?.[next.distanceBandSource.distanceId]?.comparisonCount ?? null,
      visualInspection: 'NOT_TESTED',
      performanceMeasurement: 'NOT_TESTED',
    },
  };
}, 'Render one bounded deterministic SVG inspection realization of source-truth-verified neutral distance-band particle weights. Radius, opacity, color and viewport stay disposable renderer controls and do not gain canonical particle meaning.');

export const DISTANCE_BAND_PARTICLE_STATIC_SVG_HANDS = [
  ...DISTANCE_BAND_PARTICLE_WEIGHT_HANDS,
  distanceBandParticleStaticSvgHand,
];

export const CELLULAR_DISTANCE_BAND_PARTICLE_STATIC_SVG_HANDS = [
  ...CELLULAR_DISTANCE_BAND_PARTICLE_WEIGHT_HANDS,
  distanceBandParticleStaticSvgHand,
];

export const DISTANCE_BAND_PARTICLE_STATIC_SVG_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.particle.distance-band-weighted-static-svg',
  version: '0.1.0',
  stages: [
    ...DISTANCE_BAND_PARTICLE_WEIGHT_GRAPH.stages,
    {
      id: 'realize-distance-band-particle-static-svg',
      hand: 'fx.particle.distance-band-weighted-static-svg-realize',
      params: {
        width: 640,
        height: 420,
        padding: 20,
        minRadius: 1.2,
        maxRadius: 5.2,
        minOpacity: 0.08,
        maxOpacity: 0.94,
        pointColor: '#69d7ff',
        backgroundColor: '#071018',
        maxParticles: 4096,
        maxBandCells: 4096,
        maxComparisons: 8388608,
      },
    },
  ],
});

export const CELLULAR_DISTANCE_BAND_PARTICLE_STATIC_SVG_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.particle.distance-band-weighted-static-svg-cellular',
  version: '0.1.0',
  stages: [
    ...CELLULAR_DISTANCE_BAND_PARTICLE_WEIGHT_GRAPH.stages,
    {
      id: 'realize-distance-band-particle-static-svg',
      hand: 'fx.particle.distance-band-weighted-static-svg-realize',
      params: {
        width: 640,
        height: 420,
        padding: 20,
        minRadius: 1.2,
        maxRadius: 5.2,
        minOpacity: 0.08,
        maxOpacity: 0.94,
        pointColor: '#69d7ff',
        backgroundColor: '#071018',
        maxParticles: 4096,
        maxBandCells: 4096,
        maxComparisons: 8388608,
      },
    },
  ],
});

export function makeDistanceBandParticleStaticSvgState(particles, options = {}) {
  return makeDistanceBandParticleWeightState(particles, options);
}

export function makeCellularDistanceBandParticleStaticSvgState(particles, options = {}) {
  return makeCellularDistanceBandParticleWeightState(particles, options);
}
