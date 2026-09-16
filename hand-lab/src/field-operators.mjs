import { deepClone, hashValue } from './hand-runtime.mjs';

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

function normalizeOffset(value) {
  if (!Array.isArray(value) || value.length < 2) throw new Error('fieldRequest.offset must be [x,y]');
  return [
    round6(bounded(value[0], -1024, 1024, 'fieldRequest.offset[0]')),
    round6(bounded(value[1], -1024, 1024, 'fieldRequest.offset[1]')),
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

function latticeValue(seed, x, y) {
  const xi = Math.trunc(x) | 0;
  const yi = Math.trunc(y) | 0;
  const mixed = mix32((seed >>> 0) ^ Math.imul(xi, 0x9e3779b1) ^ Math.imul(yi, 0x85ebca77));
  return mixed / 4294967295;
}

function smoothstep(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function valueNoise2d(seed, x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const tx = smoothstep(x - x0);
  const ty = smoothstep(y - y0);
  const a = lerp(latticeValue(seed, x0, y0), latticeValue(seed, x1, y0), tx);
  const b = lerp(latticeValue(seed, x0, y1), latticeValue(seed, x1, y1), tx);
  return lerp(a, b, ty);
}

export function sampleFbmSource(source, u, v) {
  if (!source || source.schema !== 'axm.scalar-field-source/v0.1') {
    throw new Error('sampleFbmSource requires normalized scalar field source');
  }
  const x = finite(u, 'sample.u') * source.frequency + source.offset[0];
  const y = finite(v, 'sample.v') * source.frequency + source.offset[1];
  let amplitude = 1;
  let frequencyScale = 1;
  let total = 0;
  let amplitudeTotal = 0;

  for (let octave = 0; octave < source.octaves; octave += 1) {
    const octaveSeed = mix32(source.seed ^ Math.imul(octave + 1, 0x27d4eb2d));
    total += valueNoise2d(octaveSeed, x * frequencyScale, y * frequencyScale) * amplitude;
    amplitudeTotal += amplitude;
    amplitude *= source.gain;
    frequencyScale *= source.lacunarity;
  }

  return round6(amplitudeTotal > 0 ? total / amplitudeTotal : 0);
}

export function sampleScalarGrid(field, u, v) {
  if (!field || field.schema !== 'axm.scalar-field-grid/v0.1') {
    throw new Error('sampleScalarGrid requires scalar field grid');
  }
  const x = clamp01(finite(u, 'sample.u')) * (field.width - 1);
  const y = clamp01(finite(v, 'sample.v')) * (field.height - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(field.width - 1, x0 + 1);
  const y1 = Math.min(field.height - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const at = (gx, gy) => field.values[gy * field.width + gx];
  return round6(lerp(lerp(at(x0, y0), at(x1, y0), tx), lerp(at(x0, y1), at(x1, y1), tx), ty));
}

export const normalizeScalarFieldRequestHand = hand('fx.field.fbm-source-normalize', (state) => {
  const next = deepClone(state);
  const request = next.fieldRequest;
  if (!request || typeof request !== 'object') throw new Error('fBm field requires fieldRequest state');

  next.fieldSource = {
    schema: 'axm.scalar-field-source/v0.1',
    id: String(request.id ?? 'scalar-field'),
    algorithm: 'fbm-value-noise-2d',
    seed: Math.trunc(bounded(request.seed ?? 1, 0, 4294967295, 'fieldRequest.seed')) >>> 0,
    frequency: round6(bounded(request.frequency ?? 3, 0.125, 64, 'fieldRequest.frequency')),
    octaves: boundedInteger(request.octaves ?? 4, 1, 8, 'fieldRequest.octaves'),
    lacunarity: round6(bounded(request.lacunarity ?? 2, 1, 4, 'fieldRequest.lacunarity')),
    gain: round6(bounded(request.gain ?? 0.5, 0.05, 0.95, 'fieldRequest.gain')),
    offset: normalizeOffset(request.offset ?? [0, 0]),
  };
  next.fieldSourceHash = hashValue(next.fieldSource);

  return {
    state: next,
    evidence: {
      fieldSourceHash: next.fieldSourceHash,
      algorithm: next.fieldSource.algorithm,
      octaves: next.fieldSource.octaves,
    },
  };
}, 'Normalize a renderer-neutral continuous 2D fBm scalar-field source without choosing a grid resolution.');

export const buildScalarFieldGridHand = hand('fx.field.fbm-grid-build', (state, params = {}) => {
  const next = deepClone(state);
  if (!next.fieldSource || !next.fieldSourceHash) throw new Error('fbm-grid-build requires normalized field source');

  const width = boundedInteger(params.width ?? 48, 4, 128, 'fieldGrid.width');
  const height = boundedInteger(params.height ?? 32, 4, 128, 'fieldGrid.height');
  const maxCells = boundedInteger(params.maxCells ?? 16384, 16, 16384, 'fieldGrid.maxCells');
  if (width * height > maxCells) throw new Error(`fieldGrid cell budget exceeded: ${width * height} > ${maxCells}`);

  const values = [];
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (let y = 0; y < height; y += 1) {
    const v = height === 1 ? 0 : y / (height - 1);
    for (let x = 0; x < width; x += 1) {
      const u = width === 1 ? 0 : x / (width - 1);
      const value = sampleFbmSource(next.fieldSource, u, v);
      values.push(value);
      min = Math.min(min, value);
      max = Math.max(max, value);
      sum += value;
    }
  }

  const grid = {
    schema: 'axm.scalar-field-grid/v0.1',
    sourceHash: next.fieldSourceHash,
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
  next.scalarFields[next.fieldSource.id] = grid;

  return {
    state: next,
    evidence: {
      fieldSourceHash: next.fieldSourceHash,
      fieldHash: grid.fieldHash,
      width,
      height,
      cells: values.length,
      min: grid.min,
      max: grid.max,
      mean: grid.mean,
    },
  };
}, 'Sample a bounded rebuildable grid from a continuous fBm source while keeping resolution out of canonical source truth.');

export const SCALAR_FIELD_HANDS = [
  normalizeScalarFieldRequestHand,
  buildScalarFieldGridHand,
];

export const SCALAR_FIELD_FBM_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.field.fbm2d',
  version: '0.1.0',
  stages: [
    { id: 'normalize-field-source', hand: 'fx.field.fbm-source-normalize', params: {} },
    { id: 'build-field-grid', hand: 'fx.field.fbm-grid-build', params: { width: 48, height: 32, maxCells: 16384 } },
  ],
});

export function makeScalarFieldState(options = {}) {
  return {
    schema: 'axm.effect-work-state/v0.1',
    fieldRequest: {
      id: options.id ?? 'scalar-field',
      seed: options.seed ?? 1337,
      frequency: options.frequency ?? 3,
      octaves: options.octaves ?? 4,
      lacunarity: options.lacunarity ?? 2,
      gain: options.gain ?? 0.5,
      offset: options.offset ?? [0, 0],
    },
    scalarFields: {},
  };
}
