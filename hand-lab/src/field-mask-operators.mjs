import { deepClone, hashValue } from './hand-runtime.mjs';
import {
  makeScalarFieldState,
  normalizeScalarFieldRequestHand,
  sampleFbmSource,
} from './field-operators.mjs';

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value)));
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

function smoothCoverage(value, threshold, softness) {
  if (softness === 0) return value >= threshold ? 1 : 0;
  const lower = threshold - softness;
  const upper = threshold + softness;
  const t = clamp01((value - lower) / Math.max(1e-9, upper - lower));
  return t * t * (3 - 2 * t);
}

export function coverageFromScalar(maskSource, scalarValue) {
  if (!maskSource || maskSource.schema !== 'axm.coverage-mask-source/v0.1') {
    throw new Error('coverageFromScalar requires normalized coverage mask source');
  }
  const value = bounded(scalarValue, 0, 1, 'scalarValue');
  const coverage = smoothCoverage(value, maskSource.threshold, maskSource.softness);
  return round6(maskSource.invert ? 1 - coverage : coverage);
}

export function sampleCoverageSource(fieldSource, maskSource, u, v) {
  if (!fieldSource || fieldSource.schema !== 'axm.scalar-field-source/v0.1') {
    throw new Error('sampleCoverageSource requires normalized scalar field source');
  }
  if (!maskSource || maskSource.schema !== 'axm.coverage-mask-source/v0.1') {
    throw new Error('sampleCoverageSource requires normalized coverage mask source');
  }
  if (hashValue(fieldSource) !== maskSource.fieldSourceHash) {
    throw new Error('coverage mask source does not match supplied scalar field source');
  }
  return coverageFromScalar(maskSource, sampleFbmSource(fieldSource, u, v));
}

export function sampleCoverageMask(mask, u, v) {
  if (!mask || mask.schema !== 'axm.coverage-mask-grid/v0.1') {
    throw new Error('sampleCoverageMask requires coverage mask grid');
  }
  const x = bounded(u, 0, 1, 'sample.u') * (mask.width - 1);
  const y = bounded(v, 0, 1, 'sample.v') * (mask.height - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(mask.width - 1, x0 + 1);
  const y1 = Math.min(mask.height - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const at = (gx, gy) => mask.values[gy * mask.width + gx];
  const top = at(x0, y0) + (at(x1, y0) - at(x0, y0)) * tx;
  const bottom = at(x0, y1) + (at(x1, y1) - at(x0, y1)) * tx;
  return round6(top + (bottom - top) * ty);
}

export const normalizeCoverageMaskRequestHand = hand('fx.field.coverage-mask-source-normalize', (state) => {
  const next = deepClone(state);
  if (!next.fieldSource || !next.fieldSourceHash) {
    throw new Error('coverage mask normalization requires normalized scalar field source');
  }
  const request = next.maskRequest;
  if (!request || typeof request !== 'object') throw new Error('coverage mask requires maskRequest state');
  const id = String(request.id ?? 'coverage-mask').trim();
  if (!id) throw new Error('maskRequest.id must be non-empty');
  if (request.invert !== undefined && typeof request.invert !== 'boolean') {
    throw new Error('maskRequest.invert must be boolean');
  }

  next.coverageMaskSource = {
    schema: 'axm.coverage-mask-source/v0.1',
    id,
    fieldId: next.fieldSource.id,
    fieldSourceHash: next.fieldSourceHash,
    transfer: 'smooth-threshold',
    threshold: round6(bounded(request.threshold ?? 0.5, 0, 1, 'maskRequest.threshold')),
    softness: round6(bounded(request.softness ?? 0.08, 0, 0.5, 'maskRequest.softness')),
    invert: request.invert ?? false,
  };
  next.coverageMaskSourceHash = hashValue(next.coverageMaskSource);

  return {
    state: next,
    evidence: {
      fieldSourceHash: next.fieldSourceHash,
      coverageMaskSourceHash: next.coverageMaskSourceHash,
      threshold: next.coverageMaskSource.threshold,
      softness: next.coverageMaskSource.softness,
      invert: next.coverageMaskSource.invert,
    },
  };
}, 'Normalize a renderer-neutral coverage-mask transfer over one canonical continuous scalar field source.');

export const buildCoverageMaskGridHand = hand('fx.field.coverage-mask-grid-build', (state, params = {}) => {
  const next = deepClone(state);
  if (!next.fieldSource || !next.fieldSourceHash) throw new Error('coverage-mask-grid-build requires normalized field source');
  if (!next.coverageMaskSource || !next.coverageMaskSourceHash) {
    throw new Error('coverage-mask-grid-build requires normalized coverage mask source');
  }
  if (next.coverageMaskSource.fieldSourceHash !== next.fieldSourceHash) {
    throw new Error('coverage mask source field hash mismatch');
  }

  const width = boundedInteger(params.width ?? 48, 4, 128, 'coverageMask.width');
  const height = boundedInteger(params.height ?? 32, 4, 128, 'coverageMask.height');
  const maxCells = boundedInteger(params.maxCells ?? 16384, 16, 16384, 'coverageMask.maxCells');
  if (width * height > maxCells) {
    throw new Error(`coverageMask cell budget exceeded: ${width * height} > ${maxCells}`);
  }

  const values = [];
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let opaqueCells = 0;
  let transparentCells = 0;

  for (let y = 0; y < height; y += 1) {
    const v = y / (height - 1);
    for (let x = 0; x < width; x += 1) {
      const u = x / (width - 1);
      const value = sampleCoverageSource(next.fieldSource, next.coverageMaskSource, u, v);
      values.push(value);
      min = Math.min(min, value);
      max = Math.max(max, value);
      sum += value;
      if (value === 1) opaqueCells += 1;
      if (value === 0) transparentCells += 1;
    }
  }

  const grid = {
    schema: 'axm.coverage-mask-grid/v0.1',
    fieldSourceHash: next.fieldSourceHash,
    maskSourceHash: next.coverageMaskSourceHash,
    width,
    height,
    values,
    min: round6(min),
    max: round6(max),
    mean: round6(sum / values.length),
    opaqueCells,
    transparentCells,
    derived: true,
    rebuildable: true,
  };
  grid.maskHash = hashValue({
    schema: grid.schema,
    fieldSourceHash: grid.fieldSourceHash,
    maskSourceHash: grid.maskSourceHash,
    width: grid.width,
    height: grid.height,
    values: grid.values,
  });

  next.coverageMasks ??= {};
  next.coverageMasks[next.coverageMaskSource.id] = grid;

  return {
    state: next,
    evidence: {
      fieldSourceHash: next.fieldSourceHash,
      coverageMaskSourceHash: next.coverageMaskSourceHash,
      maskHash: grid.maskHash,
      width,
      height,
      cells: values.length,
      min: grid.min,
      max: grid.max,
      mean: grid.mean,
      opaqueCells,
      transparentCells,
    },
  };
}, 'Build a bounded rebuildable coverage grid from a continuous scalar field plus canonical mask transfer without assigning consumer meaning.');

export const COVERAGE_MASK_HANDS = [
  normalizeScalarFieldRequestHand,
  normalizeCoverageMaskRequestHand,
  buildCoverageMaskGridHand,
];

export const COVERAGE_MASK_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.field.coverage-mask2d',
  version: '0.1.0',
  stages: [
    { id: 'normalize-field-source', hand: 'fx.field.fbm-source-normalize', params: {} },
    { id: 'normalize-mask-source', hand: 'fx.field.coverage-mask-source-normalize', params: {} },
    { id: 'build-mask-grid', hand: 'fx.field.coverage-mask-grid-build', params: { width: 48, height: 32, maxCells: 16384 } },
  ],
});

export function makeCoverageMaskState(options = {}) {
  const fieldState = makeScalarFieldState(options.field ?? {});
  const mask = options.mask ?? {};
  return {
    ...fieldState,
    maskRequest: {
      id: mask.id ?? 'coverage-mask',
      threshold: mask.threshold ?? 0.5,
      softness: mask.softness ?? 0.08,
      invert: mask.invert ?? false,
    },
    coverageMasks: {},
  };
}
