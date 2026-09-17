import { deepClone, hashValue } from './hand-runtime.mjs';

const HARD_MAX_AXIS = 128;
const HARD_MAX_CELLS = 16384;
const SEARCH_RADIUS = 2;
const FEATURE_PROBES_PER_SAMPLE = (SEARCH_RADIUS * 2 + 1) ** 2;
const SQRT2 = Math.sqrt(2);
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

function normalizedCoordinate(value, label) {
  return bounded(value, 0, 1, label);
}

function normalizeOffset(value) {
  if (!Array.isArray(value) || value.length < 2) throw new Error('cellularFieldRequest.offset must be [x,y]');
  return [
    round6(bounded(value[0], -1024, 1024, 'cellularFieldRequest.offset[0]')),
    round6(bounded(value[1], -1024, 1024, 'cellularFieldRequest.offset[1]')),
  ];
}

function mix32(value) {
  let x = value >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

function unitHash(seed, x, y, salt) {
  const xi = Math.trunc(x) | 0;
  const yi = Math.trunc(y) | 0;
  const mixed = mix32(
    (seed >>> 0)
    ^ Math.imul(xi, 0x9e3779b1)
    ^ Math.imul(yi, 0x85ebca77)
    ^ salt,
  );
  return mixed / 4294967296;
}

function featurePoint(source, cellX, cellY) {
  const rx = unitHash(source.seed, cellX, cellY, 0x68bc21eb);
  const ry = unitHash(source.seed, cellX, cellY, 0x02e5be93);
  return [
    cellX + 0.5 + (rx - 0.5) * source.jitter,
    cellY + 0.5 + (ry - 0.5) * source.jitter,
  ];
}

function validateSource(source) {
  if (!source || source.schema !== 'axm.cellular-field-source/v0.1') {
    throw new Error('sampleCellularFieldSource requires normalized cellular field source');
  }
  if (source.algorithm !== 'nearest-feature-cellular2d-radius2-v0.1') {
    throw new Error('unsupported cellular field algorithm');
  }
  if (source.searchRadius !== SEARCH_RADIUS) throw new Error('unsupported cellular field search radius');
  if (!['distance', 'inverse-distance'].includes(source.valueMode)) {
    throw new Error('unsupported cellular field value mode');
  }
}

export function sampleCellularFieldSource(source, u, v) {
  validateSource(source);
  const x = normalizedCoordinate(u, 'sample.u') * source.frequency + source.offset[0];
  const y = normalizedCoordinate(v, 'sample.v') * source.frequency + source.offset[1];
  const cellX = Math.floor(x);
  const cellY = Math.floor(y);
  let nearest = Infinity;

  for (let offsetY = -SEARCH_RADIUS; offsetY <= SEARCH_RADIUS; offsetY += 1) {
    for (let offsetX = -SEARCH_RADIUS; offsetX <= SEARCH_RADIUS; offsetX += 1) {
      const [featureX, featureY] = featurePoint(source, cellX + offsetX, cellY + offsetY);
      nearest = Math.min(nearest, Math.hypot(x - featureX, y - featureY));
    }
  }

  const distance = round6(clamp01(nearest / SQRT2));
  return source.valueMode === 'inverse-distance' ? round6(1 - distance) : distance;
}

export const normalizeCellularFieldRequestHand = hand('fx.field.cellular-source-normalize', (state) => {
  const next = deepClone(state);
  const request = next.cellularFieldRequest;
  if (!request || typeof request !== 'object') throw new Error('cellular field requires cellularFieldRequest state');
  const id = String(request.id ?? 'cellular-field').trim();
  if (!id || id.length > 96) throw new Error('cellularFieldRequest.id must be non-empty and <= 96 characters');
  const valueMode = request.valueMode ?? 'distance';
  if (!['distance', 'inverse-distance'].includes(valueMode)) {
    throw new Error('cellularFieldRequest.valueMode must be distance or inverse-distance');
  }

  next.cellularFieldSource = {
    schema: 'axm.cellular-field-source/v0.1',
    id,
    algorithm: 'nearest-feature-cellular2d-radius2-v0.1',
    seed: boundedInteger(request.seed ?? 1, 0, 4294967295, 'cellularFieldRequest.seed') >>> 0,
    frequency: round6(bounded(request.frequency ?? 6, 0.5, 64, 'cellularFieldRequest.frequency')),
    jitter: round6(bounded(request.jitter ?? 1, 0, 1, 'cellularFieldRequest.jitter')),
    offset: normalizeOffset(request.offset ?? [0, 0]),
    valueMode,
    searchRadius: SEARCH_RADIUS,
  };
  next.cellularFieldSourceHash = hashValue(next.cellularFieldSource);

  return {
    state: next,
    evidence: {
      cellularFieldSourceHash: next.cellularFieldSourceHash,
      algorithm: next.cellularFieldSource.algorithm,
      valueMode,
      featureProbesPerSample: FEATURE_PROBES_PER_SAMPLE,
      sourceCodeReuse: 'AXM hand-runtime hashValue only; cellular sampling implementation authored in this repository',
    },
  };
}, 'Normalize a renderer-neutral deterministic nearest-feature cellular scalar-field source without choosing a grid resolution.');

export const buildCellularFieldGridHand = hand('fx.field.cellular-grid-build', (state, params = {}) => {
  const next = deepClone(state);
  if (!next.cellularFieldSource || !next.cellularFieldSourceHash) {
    throw new Error('cellular-grid-build requires normalized cellular field source');
  }
  if (hashValue(next.cellularFieldSource) !== next.cellularFieldSourceHash) {
    throw new Error('cellular field source hash mismatch');
  }
  validateSource(next.cellularFieldSource);

  const width = boundedInteger(params.width ?? 48, 4, HARD_MAX_AXIS, 'cellularGrid.width');
  const height = boundedInteger(params.height ?? 32, 4, HARD_MAX_AXIS, 'cellularGrid.height');
  const maxCells = boundedInteger(params.maxCells ?? HARD_MAX_CELLS, 16, HARD_MAX_CELLS, 'cellularGrid.maxCells');
  const cells = width * height;
  if (cells > maxCells) throw new Error(`cellularGrid cell budget exceeded: ${cells} > ${maxCells}`);

  const values = [];
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (let y = 0; y < height; y += 1) {
    const v = y / (height - 1);
    for (let x = 0; x < width; x += 1) {
      const u = x / (width - 1);
      const value = sampleCellularFieldSource(next.cellularFieldSource, u, v);
      values.push(value);
      min = Math.min(min, value);
      max = Math.max(max, value);
      sum += value;
    }
  }

  const grid = {
    schema: 'axm.scalar-field-grid/v0.1',
    sourceHash: next.cellularFieldSourceHash,
    width,
    height,
    values,
    min: round6(min),
    max: round6(max),
    mean: round6(sum / values.length),
    derived: true,
    rebuildable: true,
  };
  grid.fieldHash = hashValue({
    schema: grid.schema,
    sourceHash: grid.sourceHash,
    width: grid.width,
    height: grid.height,
    values: grid.values,
  });

  next.scalarFields ??= {};
  next.scalarFields[next.cellularFieldSource.id] = grid;

  return {
    state: next,
    evidence: {
      cellularFieldSourceHash: next.cellularFieldSourceHash,
      fieldHash: grid.fieldHash,
      width,
      height,
      cells,
      min: grid.min,
      max: grid.max,
      mean: grid.mean,
      featureProbesPerSample: FEATURE_PROBES_PER_SAMPLE,
      featureProbeCount: cells * FEATURE_PROBES_PER_SAMPLE,
      maxCells,
      hardMaxCells: HARD_MAX_CELLS,
      performanceMeasurement: 'NOT_TESTED',
    },
  };
}, 'Sample a bounded rebuildable scalar grid from retained cellular source truth while keeping grid resolution out of canonical state.');

export const CELLULAR_FIELD_HANDS = [
  normalizeCellularFieldRequestHand,
  buildCellularFieldGridHand,
];

export const CELLULAR_FIELD_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.field.cellular-nearest2d',
  version: '0.1.0',
  stages: [
    { id: 'normalize-cellular-source', hand: 'fx.field.cellular-source-normalize', params: {} },
    { id: 'build-cellular-grid', hand: 'fx.field.cellular-grid-build', params: { width: 48, height: 32, maxCells: HARD_MAX_CELLS } },
  ],
});

export function makeCellularFieldState(options = {}) {
  return {
    schema: 'axm.effect-work-state/v0.1',
    cellularFieldRequest: {
      id: options.id ?? 'cellular-field',
      seed: options.seed ?? 7331,
      frequency: options.frequency ?? 6,
      jitter: options.jitter ?? 1,
      offset: deepClone(options.offset ?? [0, 0]),
      valueMode: options.valueMode ?? 'distance',
    },
    scalarFields: {},
  };
}
