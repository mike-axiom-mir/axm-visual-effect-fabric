import { deepClone, hashValue } from './hand-runtime.mjs';
import {
  makeScalarFieldState,
  normalizeScalarFieldRequestHand,
  sampleFbmSource,
} from './field-operators.mjs';

const round6 = (value) => Number(Number(value).toFixed(6));
const SUPPORTED_FLOW_MODES = Object.freeze(['gradient', 'tangent']);

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

function normalizeScalarInput(request) {
  if (!request || typeof request !== 'object') throw new Error('flow field requires fieldRequest state');
  const normalized = normalizeScalarFieldRequestHand.execute({
    schema: 'axm.effect-work-state/v0.1',
    fieldRequest: deepClone(request),
    scalarFields: {},
  }, {});
  return {
    source: normalized.state.fieldSource,
    sourceHash: normalized.state.fieldSourceHash,
  };
}

function validateFlowLineage(fieldSource, flowSource) {
  if (!fieldSource || fieldSource.schema !== 'axm.scalar-field-source/v0.1') {
    throw new Error('flow field requires normalized scalar field source');
  }
  if (!flowSource || flowSource.schema !== 'axm.vector-flow-source/v0.1') {
    throw new Error('flow field requires normalized flow source');
  }
  const liveFieldHash = hashValue(fieldSource);
  if (liveFieldHash !== flowSource.scalarSource.sourceHash) {
    throw new Error('flow scalar source hash mismatch');
  }
}

export function sampleFlowFieldSource(fieldSource, flowSource, u, v) {
  validateFlowLineage(fieldSource, flowSource);
  const sampleU = normalizedCoordinate(u, 'sample.u');
  const sampleV = normalizedCoordinate(v, 'sample.v');
  const step = flowSource.sampleStep;

  const left = Math.max(0, sampleU - step);
  const right = Math.min(1, sampleU + step);
  const bottom = Math.max(0, sampleV - step);
  const top = Math.min(1, sampleV + step);

  const dx = (sampleFbmSource(fieldSource, right, sampleV) - sampleFbmSource(fieldSource, left, sampleV)) / (right - left);
  const dy = (sampleFbmSource(fieldSource, sampleU, top) - sampleFbmSource(fieldSource, sampleU, bottom)) / (top - bottom);

  const basisX = flowSource.mode === 'tangent' ? -dy : dx;
  const basisY = flowSource.mode === 'tangent' ? dx : dy;
  const rawMagnitude = Math.hypot(basisX, basisY);
  if (rawMagnitude <= 1e-12 || flowSource.strength === 0) {
    return { x: 0, y: 0, magnitude: 0 };
  }

  const magnitude = Math.min(1, rawMagnitude * flowSource.strength);
  return {
    x: round6((basisX / rawMagnitude) * magnitude),
    y: round6((basisY / rawMagnitude) * magnitude),
    magnitude: round6(magnitude),
  };
}

export function sampleVectorFieldGrid(field, u, v) {
  if (!field || field.schema !== 'axm.vector-flow-grid/v0.1') {
    throw new Error('sampleVectorFieldGrid requires vector flow grid');
  }
  if (!Array.isArray(field.vectors) || field.vectors.length !== field.width * field.height * 2) {
    throw new Error('vector flow grid has invalid vector payload');
  }
  const x = normalizedCoordinate(u, 'sample.u') * (field.width - 1);
  const y = normalizedCoordinate(v, 'sample.v') * (field.height - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(field.width - 1, x0 + 1);
  const y1 = Math.min(field.height - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const at = (gx, gy, component) => field.vectors[(gy * field.width + gx) * 2 + component];
  const interpolate = (component) => {
    const upper = at(x0, y0, component) + (at(x1, y0, component) - at(x0, y0, component)) * tx;
    const lower = at(x0, y1, component) + (at(x1, y1, component) - at(x0, y1, component)) * tx;
    return upper + (lower - upper) * ty;
  };
  const vx = round6(interpolate(0));
  const vy = round6(interpolate(1));
  return {
    x: vx,
    y: vy,
    magnitude: round6(Math.min(1, Math.hypot(vx, vy))),
  };
}

export const normalizeFlowFieldRequestHand = hand('fx.field.flow-source-normalize', (state) => {
  const next = deepClone(state);
  const request = next.flowRequest;
  if (!request || typeof request !== 'object') throw new Error('flow field requires flowRequest state');
  const id = String(request.id ?? 'flow-field').trim();
  if (!id) throw new Error('flowRequest.id must be non-empty');
  const mode = String(request.mode ?? 'gradient').trim();
  if (!SUPPORTED_FLOW_MODES.includes(mode)) {
    throw new Error(`flowRequest.mode must be one of ${SUPPORTED_FLOW_MODES.join(', ')}`);
  }

  const scalar = normalizeScalarInput(next.fieldRequest);
  next.fieldSource = scalar.source;
  next.fieldSourceHash = scalar.sourceHash;
  next.flowSource = {
    schema: 'axm.vector-flow-source/v0.1',
    id,
    algorithm: 'finite-difference-scalar-flow2d',
    mode,
    scalarSource: {
      id: scalar.source.id,
      sourceHash: scalar.sourceHash,
    },
    sampleStep: round6(bounded(request.sampleStep ?? 0.015625, 0.0005, 0.25, 'flowRequest.sampleStep')),
    strength: round6(bounded(request.strength ?? 1, 0, 16, 'flowRequest.strength')),
  };
  next.flowSourceHash = hashValue(next.flowSource);

  return {
    state: next,
    evidence: {
      flowSourceHash: next.flowSourceHash,
      scalarSourceHash: next.fieldSourceHash,
      mode,
      sampleStep: next.flowSource.sampleStep,
      strength: next.flowSource.strength,
    },
  };
}, 'Derive a renderer-neutral continuous 2D vector-flow source from retained scalar-field truth without choosing a grid resolution.');

export const buildFlowFieldGridHand = hand('fx.field.flow-grid-build', (state, params = {}) => {
  const next = deepClone(state);
  if (!next.fieldSource || !next.fieldSourceHash) throw new Error('flow-grid-build requires normalized scalar source');
  if (!next.flowSource || !next.flowSourceHash) throw new Error('flow-grid-build requires normalized flow source');
  if (hashValue(next.fieldSource) !== next.fieldSourceHash) throw new Error('flow scalar source state hash mismatch');
  if (hashValue(next.flowSource) !== next.flowSourceHash) throw new Error('flow source state hash mismatch');
  validateFlowLineage(next.fieldSource, next.flowSource);

  const width = boundedInteger(params.width ?? 48, 4, 128, 'flowField.width');
  const height = boundedInteger(params.height ?? 32, 4, 128, 'flowField.height');
  const maxCells = boundedInteger(params.maxCells ?? 16384, 16, 16384, 'flowField.maxCells');
  if (width * height > maxCells) {
    throw new Error(`flowField cell budget exceeded: ${width * height} > ${maxCells}`);
  }

  const vectors = [];
  let minMagnitude = Infinity;
  let maxMagnitude = -Infinity;
  let magnitudeSum = 0;
  for (let y = 0; y < height; y += 1) {
    const v = y / (height - 1);
    for (let x = 0; x < width; x += 1) {
      const u = x / (width - 1);
      const vector = sampleFlowFieldSource(next.fieldSource, next.flowSource, u, v);
      vectors.push(vector.x, vector.y);
      minMagnitude = Math.min(minMagnitude, vector.magnitude);
      maxMagnitude = Math.max(maxMagnitude, vector.magnitude);
      magnitudeSum += vector.magnitude;
    }
  }

  const grid = {
    schema: 'axm.vector-flow-grid/v0.1',
    flowSourceHash: next.flowSourceHash,
    scalarSourceHash: next.fieldSourceHash,
    width,
    height,
    vectors,
    minMagnitude: round6(minMagnitude),
    maxMagnitude: round6(maxMagnitude),
    meanMagnitude: round6(magnitudeSum / (width * height)),
    derived: true,
    rebuildable: true,
  };
  grid.fieldHash = hashValue({
    schema: grid.schema,
    flowSourceHash: grid.flowSourceHash,
    scalarSourceHash: grid.scalarSourceHash,
    width: grid.width,
    height: grid.height,
    vectors: grid.vectors,
  });

  next.vectorFields ??= {};
  next.vectorFields[next.flowSource.id] = grid;

  return {
    state: next,
    evidence: {
      flowSourceHash: next.flowSourceHash,
      scalarSourceHash: next.fieldSourceHash,
      fieldHash: grid.fieldHash,
      width,
      height,
      cells: width * height,
      vectorComponents: vectors.length,
      minMagnitude: grid.minMagnitude,
      maxMagnitude: grid.maxMagnitude,
      meanMagnitude: grid.meanMagnitude,
    },
  };
}, 'Sample a bounded rebuildable vector-flow grid from continuous scalar-field truth while keeping working resolution derived.');

export const FIELD_FLOW_HANDS = [
  normalizeFlowFieldRequestHand,
  buildFlowFieldGridHand,
];

export const FIELD_FLOW_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.field.flow2d',
  version: '0.1.0',
  stages: [
    { id: 'normalize-flow-source', hand: 'fx.field.flow-source-normalize', params: {} },
    { id: 'build-flow-grid', hand: 'fx.field.flow-grid-build', params: { width: 48, height: 32, maxCells: 16384 } },
  ],
});

export function makeFieldFlowState(options = {}) {
  return {
    schema: 'axm.effect-work-state/v0.1',
    fieldRequest: makeScalarFieldState(options.field ?? {}).fieldRequest,
    flowRequest: {
      id: options.id ?? 'flow-field',
      mode: options.mode ?? 'gradient',
      sampleStep: options.sampleStep ?? 0.015625,
      strength: options.strength ?? 1,
    },
    vectorFields: {},
  };
}
