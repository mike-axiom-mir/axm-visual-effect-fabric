import { deepClone, hashValue } from './hand-runtime.mjs';
import {
  buildCoverageMaskGridHand,
  CELLULAR_COVERAGE_MASK_HANDS,
  COVERAGE_MASK_HANDS,
  makeCellularCoverageMaskState,
  makeCoverageMaskState,
} from './field-mask-operators.mjs';

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

function maskHashPayload(mask) {
  return {
    schema: mask.schema,
    fieldSourceHash: mask.fieldSourceHash,
    maskSourceHash: mask.maskSourceHash,
    width: mask.width,
    height: mask.height,
    values: mask.values,
  };
}

function validateCoverageMaskSource(source) {
  if (!source || source.schema !== 'axm.coverage-mask-source/v0.1') {
    throw new Error('mask distance requires normalized coverage mask source');
  }
  if (!String(source.id ?? '').trim()) throw new Error('coverage mask source id must be non-empty');
  if (!String(source.fieldSourceHash ?? '').trim()) throw new Error('coverage mask source field hash must be non-empty');
  return source;
}

function validateCoverageGrid(mask) {
  if (!mask || mask.schema !== 'axm.coverage-mask-grid/v0.1') {
    throw new Error('mask distance requires coverage mask grid');
  }
  const width = boundedInteger(mask.width, 2, 128, 'coverageMask.width');
  const height = boundedInteger(mask.height, 2, 128, 'coverageMask.height');
  if (!Array.isArray(mask.values) || mask.values.length !== width * height) {
    throw new Error('coverage mask grid value count mismatch');
  }
  for (const [index, value] of mask.values.entries()) {
    bounded(value, 0, 1, `coverageMask.values[${index}]`);
  }
  if (hashValue(maskHashPayload(mask)) !== mask.maskHash) {
    throw new Error('coverage mask grid hash mismatch');
  }
  return { width, height, cells: width * height };
}

function distanceCore(mask, isoLevel) {
  const { width, height, cells } = validateCoverageGrid(mask);
  const inside = [];
  const outside = [];
  for (let index = 0; index < cells; index += 1) {
    const point = { index, x: index % width, y: Math.floor(index / width) };
    if (mask.values[index] >= isoLevel) inside.push(point);
    else outside.push(point);
  }

  const comparisonCount = inside.length > 0 && outside.length > 0
    ? 2 * inside.length * outside.length
    : 0;

  const values = new Array(cells);
  let min = Infinity;
  let max = -Infinity;
  let maxAbs = 0;

  for (let index = 0; index < cells; index += 1) {
    const x = index % width;
    const y = Math.floor(index / width);
    const isInside = mask.values[index] >= isoLevel;
    const targets = isInside ? outside : inside;
    let distance = DOMAIN_DIAGONAL;

    if (targets.length > 0) {
      let bestSquared = Infinity;
      for (const target of targets) {
        const dx = (x - target.x) / (width - 1);
        const dy = (y - target.y) / (height - 1);
        const squared = dx * dx + dy * dy;
        if (squared < bestSquared) bestSquared = squared;
      }
      distance = Math.sqrt(bestSquared);
    }

    const signed = round6(isInside ? distance : -distance);
    values[index] = signed;
    min = Math.min(min, signed);
    max = Math.max(max, signed);
    maxAbs = Math.max(maxAbs, Math.abs(signed));
  }

  return {
    width,
    height,
    cells,
    values,
    insideCells: inside.length,
    outsideCells: outside.length,
    comparisonCount,
    min: round6(min),
    max: round6(max),
    maxAbs: round6(maxAbs),
  };
}

export function computeSignedMaskDistanceGrid(mask, isoLevel = 0.5) {
  const level = round6(bounded(isoLevel, 0, 1, 'maskDistance.isoLevel'));
  return distanceCore(mask, level);
}

export function sampleSignedMaskDistanceGrid(grid, u, v) {
  if (!grid || grid.schema !== 'axm.signed-mask-distance-grid/v0.1') {
    throw new Error('sampleSignedMaskDistanceGrid requires signed mask distance grid');
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

export const normalizeMaskDistanceRequestHand = hand('fx.field.mask-distance-source-normalize', (state) => {
  const next = deepClone(state);
  const request = next.maskDistanceRequest;
  if (!request || typeof request !== 'object') throw new Error('mask distance requires maskDistanceRequest state');
  validateCoverageMaskSource(next.coverageMaskSource);
  if (hashValue(next.coverageMaskSource) !== next.coverageMaskSourceHash) {
    throw new Error('mask distance coverage source state hash mismatch');
  }

  const id = String(request.id ?? 'mask-distance').trim();
  if (!id) throw new Error('maskDistanceRequest.id must be non-empty');
  const maskId = String(request.maskId ?? next.coverageMaskSource.id).trim();
  if (!maskId) throw new Error('maskDistanceRequest.maskId must be non-empty');
  if (maskId !== next.coverageMaskSource.id) {
    throw new Error('mask distance request must reference the active retained coverage mask source');
  }

  next.maskDistanceSource = {
    schema: 'axm.mask-distance-source/v0.1',
    id,
    maskId,
    maskSourceHash: next.coverageMaskSourceHash,
    algorithm: 'exact-opposite-cell-center-euclidean2d-v0.1',
    metric: 'euclidean-normalized-domain',
    isoLevel: round6(bounded(request.isoLevel ?? 0.5, 0, 1, 'maskDistanceRequest.isoLevel')),
    signConvention: 'coverage-gte-iso-positive',
    noOppositeClassDistance: DOMAIN_DIAGONAL,
  };
  next.maskDistanceSourceHash = hashValue(next.maskDistanceSource);

  return {
    state: next,
    evidence: {
      coverageMaskSourceHash: next.coverageMaskSourceHash,
      maskDistanceSourceHash: next.maskDistanceSourceHash,
      maskId,
      isoLevel: next.maskDistanceSource.isoLevel,
      algorithm: next.maskDistanceSource.algorithm,
    },
  };
}, 'Bind a renderer-neutral signed-distance transform contract to one retained coverage-mask source without retaining sampling resolution as source truth.');

export const buildSignedMaskDistanceGridHand = hand('fx.field.mask-distance-grid-build', (state, params = {}) => {
  const next = deepClone(state);
  if (!next.maskDistanceSource || !next.maskDistanceSourceHash) {
    throw new Error('mask-distance-grid-build requires normalized mask distance source');
  }
  if (hashValue(next.maskDistanceSource) !== next.maskDistanceSourceHash) {
    throw new Error('mask distance source state hash mismatch');
  }
  validateCoverageMaskSource(next.coverageMaskSource);
  if (hashValue(next.coverageMaskSource) !== next.coverageMaskSourceHash) {
    throw new Error('mask distance coverage source state hash mismatch');
  }
  if (next.maskDistanceSource.maskSourceHash !== next.coverageMaskSourceHash) {
    throw new Error('mask distance retained coverage source hash mismatch');
  }

  const mask = next.coverageMasks?.[next.maskDistanceSource.maskId];
  const maskStats = validateCoverageGrid(mask);
  if (mask.maskSourceHash !== next.coverageMaskSourceHash) {
    throw new Error('mask distance coverage grid lineage mismatch');
  }
  if (mask.fieldSourceHash !== next.coverageMaskSource.fieldSourceHash) {
    throw new Error('mask distance coverage grid field lineage mismatch');
  }

  const maxCells = boundedInteger(params.maxCells ?? HARD_MAX_CELLS, 16, HARD_MAX_CELLS, 'maskDistance.maxCells');
  if (maskStats.cells > maxCells) {
    throw new Error(`maskDistance cell budget exceeded: ${maskStats.cells} > ${maxCells}`);
  }

  const rebuilt = buildCoverageMaskGridHand.execute(next, {
    width: maskStats.width,
    height: maskStats.height,
    maxCells: maskStats.cells,
  }).state.coverageMasks[next.maskDistanceSource.maskId];
  if (!rebuilt || rebuilt.maskHash !== mask.maskHash) {
    throw new Error('mask distance coverage grid differs from source-truth rebuild');
  }

  const computed = distanceCore(mask, next.maskDistanceSource.isoLevel);
  const maxComparisons = boundedInteger(
    params.maxComparisons ?? HARD_MAX_COMPARISONS,
    0,
    HARD_MAX_COMPARISONS,
    'maskDistance.maxComparisons',
  );
  if (computed.comparisonCount > maxComparisons) {
    throw new Error(`maskDistance comparison budget exceeded: ${computed.comparisonCount} > ${maxComparisons}`);
  }

  const grid = {
    schema: 'axm.signed-mask-distance-grid/v0.1',
    distanceSourceHash: next.maskDistanceSourceHash,
    maskSourceHash: next.coverageMaskSourceHash,
    maskHash: mask.maskHash,
    width: computed.width,
    height: computed.height,
    values: computed.values,
    min: computed.min,
    max: computed.max,
    maxAbs: computed.maxAbs,
    insideCells: computed.insideCells,
    outsideCells: computed.outsideCells,
    comparisonCount: computed.comparisonCount,
    derived: true,
    rebuildable: true,
  };
  grid.distanceGridHash = hashValue({
    schema: grid.schema,
    distanceSourceHash: grid.distanceSourceHash,
    maskSourceHash: grid.maskSourceHash,
    maskHash: grid.maskHash,
    width: grid.width,
    height: grid.height,
    values: grid.values,
  });

  next.signedMaskDistanceGrids ??= {};
  next.signedMaskDistanceGrids[next.maskDistanceSource.id] = grid;

  return {
    state: next,
    evidence: {
      coverageMaskSourceHash: next.coverageMaskSourceHash,
      maskHash: mask.maskHash,
      maskDistanceSourceHash: next.maskDistanceSourceHash,
      distanceGridHash: grid.distanceGridHash,
      width: grid.width,
      height: grid.height,
      cells: maskStats.cells,
      insideCells: grid.insideCells,
      outsideCells: grid.outsideCells,
      comparisons: grid.comparisonCount,
      maxCells,
      maxComparisons,
    },
  };
}, 'Build a bounded rebuildable signed distance grid from a source-truth-verified coverage mask while keeping the retained mask transfer canonical and the sampling grid derived.');

export const MASK_DISTANCE_FIELD_HANDS = [
  ...COVERAGE_MASK_HANDS,
  normalizeMaskDistanceRequestHand,
  buildSignedMaskDistanceGridHand,
];

export const CELLULAR_MASK_DISTANCE_FIELD_HANDS = [
  ...CELLULAR_COVERAGE_MASK_HANDS,
  normalizeMaskDistanceRequestHand,
  buildSignedMaskDistanceGridHand,
];

export const MASK_DISTANCE_FIELD_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.field.mask-distance2d',
  version: '0.1.0',
  stages: [
    { id: 'normalize-field-source', hand: 'fx.field.fbm-source-normalize', params: {} },
    { id: 'normalize-mask-source', hand: 'fx.field.coverage-mask-source-normalize', params: {} },
    { id: 'build-mask-grid', hand: 'fx.field.coverage-mask-grid-build', params: { width: 48, height: 32, maxCells: 16384 } },
    { id: 'normalize-mask-distance-source', hand: 'fx.field.mask-distance-source-normalize', params: {} },
    { id: 'build-mask-distance-grid', hand: 'fx.field.mask-distance-grid-build', params: { maxCells: 4096, maxComparisons: 8388608 } },
  ],
});

export const CELLULAR_MASK_DISTANCE_FIELD_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.field.mask-distance2d-cellular',
  version: '0.1.0',
  stages: [
    { id: 'normalize-cellular-source', hand: 'fx.field.cellular-source-normalize', params: {} },
    { id: 'normalize-mask-source', hand: 'fx.field.coverage-mask-source-normalize', params: {} },
    { id: 'build-mask-grid', hand: 'fx.field.coverage-mask-grid-build', params: { width: 48, height: 32, maxCells: 16384 } },
    { id: 'normalize-mask-distance-source', hand: 'fx.field.mask-distance-source-normalize', params: {} },
    { id: 'build-mask-distance-grid', hand: 'fx.field.mask-distance-grid-build', params: { maxCells: 4096, maxComparisons: 8388608 } },
  ],
});

export function makeMaskDistanceState(options = {}) {
  const state = makeCoverageMaskState(options);
  const distance = options.distance ?? {};
  return {
    ...state,
    maskDistanceRequest: {
      id: distance.id ?? 'mask-distance',
      maskId: distance.maskId ?? state.maskRequest.id,
      isoLevel: distance.isoLevel ?? 0.5,
    },
    signedMaskDistanceGrids: {},
  };
}

export function makeCellularMaskDistanceState(options = {}) {
  const state = makeCellularCoverageMaskState(options);
  const distance = options.distance ?? {};
  return {
    ...state,
    maskDistanceRequest: {
      id: distance.id ?? 'mask-distance',
      maskId: distance.maskId ?? state.maskRequest.id,
      isoLevel: distance.isoLevel ?? 0.5,
    },
    signedMaskDistanceGrids: {},
  };
}
