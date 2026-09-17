import { deepClone, hashValue } from './hand-runtime.mjs';
import {
  buildSignedMaskDistanceGridHand,
  CELLULAR_MASK_DISTANCE_FIELD_HANDS,
  makeCellularMaskDistanceState,
  makeMaskDistanceState,
  MASK_DISTANCE_FIELD_HANDS,
} from './mask-distance-field2d.mjs';

const round6 = (value) => Number(Number(value).toFixed(6));
const DOMAIN_DIAGONAL = round6(Math.sqrt(2));
const HARD_MAX_CELLS = 4096;
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

function smoothstep01(value) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
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

function validateDistanceSource(source) {
  if (!source || source.schema !== 'axm.mask-distance-source/v0.1') {
    throw new Error('distance band requires normalized mask distance source');
  }
  if (source.algorithm !== 'exact-opposite-cell-center-euclidean2d-v0.1') {
    throw new Error('unsupported mask distance algorithm');
  }
  if (source.metric !== 'euclidean-normalized-domain') {
    throw new Error('unsupported mask distance metric');
  }
  if (source.signConvention !== 'coverage-gte-iso-positive') {
    throw new Error('unsupported mask distance sign convention');
  }
  if (source.noOppositeClassDistance !== DOMAIN_DIAGONAL) {
    throw new Error('unsupported mask distance no-opposite-class policy');
  }
  bounded(source.isoLevel, 0, 1, 'maskDistanceSource.isoLevel');
  if (!String(source.id ?? '').trim()) throw new Error('mask distance source id must be non-empty');
  return source;
}

function validateDistanceGrid(grid) {
  if (!grid || grid.schema !== 'axm.signed-mask-distance-grid/v0.1') {
    throw new Error('distance band requires signed mask distance grid');
  }
  const width = boundedInteger(grid.width, 2, 128, 'maskDistanceGrid.width');
  const height = boundedInteger(grid.height, 2, 128, 'maskDistanceGrid.height');
  if (!Array.isArray(grid.values) || grid.values.length !== width * height) {
    throw new Error('mask distance grid value count mismatch');
  }
  for (const [index, value] of grid.values.entries()) {
    bounded(value, -DOMAIN_DIAGONAL, DOMAIN_DIAGONAL, `maskDistanceGrid.values[${index}]`);
  }
  if (hashValue(distanceGridHashPayload(grid)) !== grid.distanceGridHash) {
    throw new Error('mask distance grid hash mismatch');
  }
  return { width, height, cells: width * height };
}

function validateDistanceBandSource(source) {
  if (!source || source.schema !== 'axm.mask-distance-band-source/v0.1') {
    throw new Error('distance band requires normalized band source');
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
  if (!String(source.id ?? '').trim()) throw new Error('mask distance band source id must be non-empty');
  if (!String(source.distanceId ?? '').trim()) throw new Error('mask distance band distanceId must be non-empty');
  if (!String(source.distanceSourceHash ?? '').trim()) throw new Error('mask distance band distance hash must be non-empty');
  bounded(source.innerWidth, 0, DOMAIN_DIAGONAL, 'maskDistanceBandSource.innerWidth');
  bounded(source.outerWidth, 0, DOMAIN_DIAGONAL, 'maskDistanceBandSource.outerWidth');
  bounded(source.softness, 0, DOMAIN_DIAGONAL, 'maskDistanceBandSource.softness');
  return source;
}

export function bandCoverageFromSignedDistance(source, signedDistance) {
  validateDistanceBandSource(source);
  const distance = bounded(signedDistance, -DOMAIN_DIAGONAL, DOMAIN_DIAGONAL, 'signedDistance');
  const width = distance >= 0 ? source.innerWidth : source.outerWidth;
  const magnitude = Math.abs(distance);
  if (magnitude <= width) return 1;
  if (source.softness === 0 || magnitude >= width + source.softness) return 0;
  const t = (magnitude - width) / source.softness;
  return round6(1 - smoothstep01(t));
}

export function sampleMaskDistanceBandGrid(grid, u, v) {
  if (!grid || grid.schema !== 'axm.distance-band-grid/v0.1') {
    throw new Error('sampleMaskDistanceBandGrid requires distance band grid');
  }
  const x = bounded(u, 0, 1, 'sample.u') * (grid.width - 1);
  const y = bounded(v, 0, 1, 'sample.v') * (grid.height - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(grid.width - 1, x0 + 1);
  const y1 = Math.min(grid.height - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const at = (gx, gy) => grid.values[gy * grid.width + gx];
  const top = at(x0, y0) + (at(x1, y0) - at(x0, y0)) * tx;
  const bottom = at(x0, y1) + (at(x1, y1) - at(x0, y1)) * tx;
  return round6(top + (bottom - top) * ty);
}

export const normalizeMaskDistanceBandRequestHand = hand('fx.field.mask-distance-band-source-normalize', (state) => {
  const next = deepClone(state);
  const request = next.distanceBandRequest;
  if (!request || typeof request !== 'object') throw new Error('distance band requires distanceBandRequest state');
  validateDistanceSource(next.maskDistanceSource);
  if (hashValue(next.maskDistanceSource) !== next.maskDistanceSourceHash) {
    throw new Error('mask distance source state hash mismatch');
  }

  const id = String(request.id ?? 'distance-band').trim();
  if (!id) throw new Error('distanceBandRequest.id must be non-empty');
  const distanceId = String(request.distanceId ?? next.maskDistanceSource.id).trim();
  if (!distanceId) throw new Error('distanceBandRequest.distanceId must be non-empty');
  if (distanceId !== next.maskDistanceSource.id) {
    throw new Error('distance band request must reference the active retained mask distance source');
  }

  next.distanceBandSource = {
    schema: 'axm.mask-distance-band-source/v0.1',
    id,
    distanceId,
    distanceSourceHash: next.maskDistanceSourceHash,
    transfer: 'signed-distance-inner-outer-band-v0.1',
    signMapping: 'positive-inside-negative-outside',
    innerWidth: round6(bounded(request.innerWidth ?? 0.06, 0, DOMAIN_DIAGONAL, 'distanceBandRequest.innerWidth')),
    outerWidth: round6(bounded(request.outerWidth ?? 0.06, 0, DOMAIN_DIAGONAL, 'distanceBandRequest.outerWidth')),
    softness: round6(bounded(request.softness ?? 0.02, 0, DOMAIN_DIAGONAL, 'distanceBandRequest.softness')),
    softnessProfile: 'smoothstep-outward-v0.1',
  };
  validateDistanceBandSource(next.distanceBandSource);
  next.distanceBandSourceHash = hashValue(next.distanceBandSource);

  return {
    state: next,
    evidence: {
      maskDistanceSourceHash: next.maskDistanceSourceHash,
      distanceBandSourceHash: next.distanceBandSourceHash,
      distanceId,
      innerWidth: next.distanceBandSource.innerWidth,
      outerWidth: next.distanceBandSource.outerWidth,
      softness: next.distanceBandSource.softness,
    },
  };
}, 'Bind one consumer-neutral inner/outer band transfer to retained signed-distance truth without retaining sampling resolution or renderer meaning.');

export const buildMaskDistanceBandGridHand = hand('fx.field.mask-distance-band-grid-build', (state, params = {}) => {
  const next = deepClone(state);
  if (!next.distanceBandSource || !next.distanceBandSourceHash) {
    throw new Error('mask-distance-band-grid-build requires normalized distance band source');
  }
  validateDistanceBandSource(next.distanceBandSource);
  if (hashValue(next.distanceBandSource) !== next.distanceBandSourceHash) {
    throw new Error('mask distance band source state hash mismatch');
  }
  validateDistanceSource(next.maskDistanceSource);
  if (hashValue(next.maskDistanceSource) !== next.maskDistanceSourceHash) {
    throw new Error('mask distance source state hash mismatch');
  }
  if (next.distanceBandSource.distanceSourceHash !== next.maskDistanceSourceHash) {
    throw new Error('distance band retained mask distance source hash mismatch');
  }
  if (next.distanceBandSource.distanceId !== next.maskDistanceSource.id) {
    throw new Error('distance band retained distance id mismatch');
  }

  const distanceGrid = next.signedMaskDistanceGrids?.[next.distanceBandSource.distanceId];
  const distanceStats = validateDistanceGrid(distanceGrid);
  if (distanceGrid.distanceSourceHash !== next.maskDistanceSourceHash) {
    throw new Error('distance band grid lineage mismatch');
  }

  const maxCells = boundedInteger(params.maxCells ?? HARD_MAX_CELLS, 16, HARD_MAX_CELLS, 'maskDistanceBand.maxCells');
  if (distanceStats.cells > maxCells) {
    throw new Error(`maskDistanceBand cell budget exceeded: ${distanceStats.cells} > ${maxCells}`);
  }
  const maxComparisons = boundedInteger(
    params.maxComparisons ?? HARD_MAX_COMPARISONS,
    0,
    HARD_MAX_COMPARISONS,
    'maskDistanceBand.maxComparisons',
  );

  const rebuiltState = buildSignedMaskDistanceGridHand.execute(next, {
    maxCells,
    maxComparisons,
  }).state;
  const rebuiltDistanceGrid = rebuiltState.signedMaskDistanceGrids?.[next.distanceBandSource.distanceId];
  if (!rebuiltDistanceGrid || rebuiltDistanceGrid.distanceGridHash !== distanceGrid.distanceGridHash) {
    throw new Error('distance band mask distance grid differs from source-truth rebuild');
  }

  const values = distanceGrid.values.map((value) => bandCoverageFromSignedDistance(next.distanceBandSource, value));
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let fullCells = 0;
  let zeroCells = 0;
  for (const value of values) {
    min = Math.min(min, value);
    max = Math.max(max, value);
    sum += value;
    if (value === 1) fullCells += 1;
    if (value === 0) zeroCells += 1;
  }

  const grid = {
    schema: 'axm.distance-band-grid/v0.1',
    bandSourceHash: next.distanceBandSourceHash,
    distanceSourceHash: next.maskDistanceSourceHash,
    distanceGridHash: distanceGrid.distanceGridHash,
    width: distanceStats.width,
    height: distanceStats.height,
    values,
    min: round6(min),
    max: round6(max),
    mean: round6(sum / values.length),
    fullCells,
    zeroCells,
    derived: true,
    rebuildable: true,
  };
  grid.bandGridHash = hashValue(bandGridHashPayload(grid));

  next.distanceBandGrids ??= {};
  next.distanceBandGrids[next.distanceBandSource.id] = grid;

  return {
    state: next,
    evidence: {
      maskDistanceSourceHash: next.maskDistanceSourceHash,
      distanceGridHash: distanceGrid.distanceGridHash,
      distanceBandSourceHash: next.distanceBandSourceHash,
      bandGridHash: grid.bandGridHash,
      width: grid.width,
      height: grid.height,
      cells: distanceStats.cells,
      fullCells,
      zeroCells,
      mean: grid.mean,
      bandTransferOperations: distanceStats.cells,
      truthRebuildComparisons: rebuiltDistanceGrid.comparisonCount,
      maxCells,
      maxComparisons,
    },
  };
}, 'Build one bounded rebuildable inner/outer coverage band from source-truth-verified signed-distance state while keeping the retained distance and band contracts canonical.');

export const MASK_DISTANCE_BAND_HANDS = [
  ...MASK_DISTANCE_FIELD_HANDS,
  normalizeMaskDistanceBandRequestHand,
  buildMaskDistanceBandGridHand,
];

export const CELLULAR_MASK_DISTANCE_BAND_HANDS = [
  ...CELLULAR_MASK_DISTANCE_FIELD_HANDS,
  normalizeMaskDistanceBandRequestHand,
  buildMaskDistanceBandGridHand,
];

export const MASK_DISTANCE_BAND_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.field.mask-distance-band2d',
  version: '0.1.0',
  stages: [
    { id: 'normalize-field-source', hand: 'fx.field.fbm-source-normalize', params: {} },
    { id: 'normalize-mask-source', hand: 'fx.field.coverage-mask-source-normalize', params: {} },
    { id: 'build-mask-grid', hand: 'fx.field.coverage-mask-grid-build', params: { width: 48, height: 32, maxCells: 16384 } },
    { id: 'normalize-mask-distance-source', hand: 'fx.field.mask-distance-source-normalize', params: {} },
    { id: 'build-mask-distance-grid', hand: 'fx.field.mask-distance-grid-build', params: { maxCells: 4096, maxComparisons: 8388608 } },
    { id: 'normalize-distance-band-source', hand: 'fx.field.mask-distance-band-source-normalize', params: {} },
    { id: 'build-distance-band-grid', hand: 'fx.field.mask-distance-band-grid-build', params: { maxCells: 4096, maxComparisons: 8388608 } },
  ],
});

export const CELLULAR_MASK_DISTANCE_BAND_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.field.mask-distance-band2d-cellular',
  version: '0.1.0',
  stages: [
    { id: 'normalize-cellular-source', hand: 'fx.field.cellular-source-normalize', params: {} },
    { id: 'normalize-mask-source', hand: 'fx.field.coverage-mask-source-normalize', params: {} },
    { id: 'build-mask-grid', hand: 'fx.field.coverage-mask-grid-build', params: { width: 48, height: 32, maxCells: 16384 } },
    { id: 'normalize-mask-distance-source', hand: 'fx.field.mask-distance-source-normalize', params: {} },
    { id: 'build-mask-distance-grid', hand: 'fx.field.mask-distance-grid-build', params: { maxCells: 4096, maxComparisons: 8388608 } },
    { id: 'normalize-distance-band-source', hand: 'fx.field.mask-distance-band-source-normalize', params: {} },
    { id: 'build-distance-band-grid', hand: 'fx.field.mask-distance-band-grid-build', params: { maxCells: 4096, maxComparisons: 8388608 } },
  ],
});

export function makeMaskDistanceBandState(options = {}) {
  const state = makeMaskDistanceState(options);
  const band = options.band ?? {};
  return {
    ...state,
    distanceBandRequest: {
      id: band.id ?? 'distance-band',
      distanceId: band.distanceId ?? state.maskDistanceRequest.id,
      innerWidth: band.innerWidth ?? 0.06,
      outerWidth: band.outerWidth ?? 0.06,
      softness: band.softness ?? 0.02,
    },
    distanceBandGrids: {},
  };
}

export function makeCellularMaskDistanceBandState(options = {}) {
  const state = makeCellularMaskDistanceState(options);
  const band = options.band ?? {};
  return {
    ...state,
    distanceBandRequest: {
      id: band.id ?? 'distance-band',
      distanceId: band.distanceId ?? state.maskDistanceRequest.id,
      innerWidth: band.innerWidth ?? 0.06,
      outerWidth: band.outerWidth ?? 0.06,
      softness: band.softness ?? 0.02,
    },
    distanceBandGrids: {},
  };
}
