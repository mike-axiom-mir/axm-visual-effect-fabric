import { deepClone, hashValue } from './hand-runtime.mjs';
import {
  makeScalarFieldState,
  normalizeScalarFieldRequestHand,
  sampleFbmSource,
} from './field-operators.mjs';

const round6 = (value) => Number(Number(value).toFixed(6));
const SUPPORTED_OPERATIONS = Object.freeze(['min', 'max', 'multiply', 'add-clamp']);

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

function normalizeInputField(request, label) {
  if (!request || typeof request !== 'object') throw new Error(`${label} requires a field request`);
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

export function applyScalarComposition(operation, inputA, inputB) {
  const a = bounded(inputA, 0, 1, 'composition.inputA');
  const b = bounded(inputB, 0, 1, 'composition.inputB');
  if (!SUPPORTED_OPERATIONS.includes(operation)) {
    throw new Error(`composition.operation must be one of ${SUPPORTED_OPERATIONS.join(', ')}`);
  }
  if (operation === 'min') return round6(Math.min(a, b));
  if (operation === 'max') return round6(Math.max(a, b));
  if (operation === 'multiply') return round6(a * b);
  return round6(Math.min(1, a + b));
}

export function sampleComposedFieldSource(sourceA, sourceB, compositionSource, u, v) {
  if (!sourceA || sourceA.schema !== 'axm.scalar-field-source/v0.1') {
    throw new Error('sampleComposedFieldSource requires normalized sourceA');
  }
  if (!sourceB || sourceB.schema !== 'axm.scalar-field-source/v0.1') {
    throw new Error('sampleComposedFieldSource requires normalized sourceB');
  }
  if (!compositionSource || compositionSource.schema !== 'axm.scalar-field-composition-source/v0.1') {
    throw new Error('sampleComposedFieldSource requires normalized composition source');
  }
  if (hashValue(sourceA) !== compositionSource.inputA.sourceHash) {
    throw new Error('composition source inputA hash mismatch');
  }
  if (hashValue(sourceB) !== compositionSource.inputB.sourceHash) {
    throw new Error('composition source inputB hash mismatch');
  }
  return applyScalarComposition(
    compositionSource.operation,
    sampleFbmSource(sourceA, u, v),
    sampleFbmSource(sourceB, u, v),
  );
}

export function sampleComposedFieldGrid(field, u, v) {
  if (!field || field.schema !== 'axm.scalar-field-composed-grid/v0.1') {
    throw new Error('sampleComposedFieldGrid requires composed scalar field grid');
  }
  const x = bounded(u, 0, 1, 'sample.u') * (field.width - 1);
  const y = bounded(v, 0, 1, 'sample.v') * (field.height - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(field.width - 1, x0 + 1);
  const y1 = Math.min(field.height - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const at = (gx, gy) => field.values[gy * field.width + gx];
  const top = at(x0, y0) + (at(x1, y0) - at(x0, y0)) * tx;
  const bottom = at(x0, y1) + (at(x1, y1) - at(x0, y1)) * tx;
  return round6(top + (bottom - top) * ty);
}

export const normalizeFieldCompositionRequestHand = hand('fx.field.composition-source-normalize', (state) => {
  const next = deepClone(state);
  const request = next.compositionRequest;
  if (!request || typeof request !== 'object') throw new Error('field composition requires compositionRequest state');
  const id = String(request.id ?? 'composed-field').trim();
  if (!id) throw new Error('compositionRequest.id must be non-empty');
  const operation = String(request.operation ?? 'multiply').trim();
  if (!SUPPORTED_OPERATIONS.includes(operation)) {
    throw new Error(`compositionRequest.operation must be one of ${SUPPORTED_OPERATIONS.join(', ')}`);
  }

  const inputA = normalizeInputField(next.fieldARequest, 'fieldARequest');
  const inputB = normalizeInputField(next.fieldBRequest, 'fieldBRequest');

  next.fieldSources = {
    a: inputA.source,
    b: inputB.source,
  };
  next.fieldSourceHashes = {
    a: inputA.sourceHash,
    b: inputB.sourceHash,
  };
  next.fieldCompositionSource = {
    schema: 'axm.scalar-field-composition-source/v0.1',
    id,
    operation,
    inputA: {
      id: inputA.source.id,
      sourceHash: inputA.sourceHash,
    },
    inputB: {
      id: inputB.source.id,
      sourceHash: inputB.sourceHash,
    },
  };
  next.fieldCompositionSourceHash = hashValue(next.fieldCompositionSource);

  return {
    state: next,
    evidence: {
      fieldCompositionSourceHash: next.fieldCompositionSourceHash,
      operation,
      inputAHash: inputA.sourceHash,
      inputBHash: inputB.sourceHash,
    },
  };
}, 'Normalize two continuous scalar-field sources plus a consumer-neutral composition operation without choosing a grid resolution.');

export const buildComposedFieldGridHand = hand('fx.field.composed-grid-build', (state, params = {}) => {
  const next = deepClone(state);
  if (!next.fieldSources?.a || !next.fieldSources?.b || !next.fieldSourceHashes) {
    throw new Error('composed-grid-build requires normalized input field sources');
  }
  if (!next.fieldCompositionSource || !next.fieldCompositionSourceHash) {
    throw new Error('composed-grid-build requires normalized composition source');
  }
  if (next.fieldCompositionSource.inputA.sourceHash !== next.fieldSourceHashes.a) {
    throw new Error('composition inputA lineage mismatch');
  }
  if (next.fieldCompositionSource.inputB.sourceHash !== next.fieldSourceHashes.b) {
    throw new Error('composition inputB lineage mismatch');
  }

  const width = boundedInteger(params.width ?? 48, 4, 128, 'composedField.width');
  const height = boundedInteger(params.height ?? 32, 4, 128, 'composedField.height');
  const maxCells = boundedInteger(params.maxCells ?? 16384, 16, 16384, 'composedField.maxCells');
  if (width * height > maxCells) {
    throw new Error(`composedField cell budget exceeded: ${width * height} > ${maxCells}`);
  }

  const values = [];
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (let y = 0; y < height; y += 1) {
    const v = y / (height - 1);
    for (let x = 0; x < width; x += 1) {
      const u = x / (width - 1);
      const value = sampleComposedFieldSource(
        next.fieldSources.a,
        next.fieldSources.b,
        next.fieldCompositionSource,
        u,
        v,
      );
      values.push(value);
      min = Math.min(min, value);
      max = Math.max(max, value);
      sum += value;
    }
  }

  const grid = {
    schema: 'axm.scalar-field-composed-grid/v0.1',
    compositionSourceHash: next.fieldCompositionSourceHash,
    inputAHash: next.fieldSourceHashes.a,
    inputBHash: next.fieldSourceHashes.b,
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
    compositionSourceHash: grid.compositionSourceHash,
    inputAHash: grid.inputAHash,
    inputBHash: grid.inputBHash,
    width: grid.width,
    height: grid.height,
    values: grid.values,
  });

  next.composedFields ??= {};
  next.composedFields[next.fieldCompositionSource.id] = grid;

  return {
    state: next,
    evidence: {
      fieldCompositionSourceHash: next.fieldCompositionSourceHash,
      fieldHash: grid.fieldHash,
      inputAHash: grid.inputAHash,
      inputBHash: grid.inputBHash,
      width,
      height,
      cells: values.length,
      min: grid.min,
      max: grid.max,
      mean: grid.mean,
    },
  };
}, 'Build a bounded rebuildable scalar grid from two canonical continuous field sources through a neutral composition operation.');

export const FIELD_COMPOSITION_HANDS = [
  normalizeFieldCompositionRequestHand,
  buildComposedFieldGridHand,
];

export const FIELD_COMPOSITION_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.field.compose2d',
  version: '0.1.0',
  stages: [
    { id: 'normalize-composition-source', hand: 'fx.field.composition-source-normalize', params: {} },
    { id: 'build-composed-grid', hand: 'fx.field.composed-grid-build', params: { width: 48, height: 32, maxCells: 16384 } },
  ],
});

export function makeFieldCompositionState(options = {}) {
  const fieldA = makeScalarFieldState(options.a ?? {}).fieldRequest;
  const fieldB = makeScalarFieldState(options.b ?? {}).fieldRequest;
  return {
    schema: 'axm.effect-work-state/v0.1',
    fieldARequest: fieldA,
    fieldBRequest: fieldB,
    compositionRequest: {
      id: options.id ?? 'composed-field',
      operation: options.operation ?? 'multiply',
    },
    composedFields: {},
  };
}
