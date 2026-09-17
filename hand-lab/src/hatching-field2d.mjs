import { deepClone, hashValue } from './hand-runtime.mjs';
import { sampleFbmSource } from './field-operators.mjs';
import { normalizeFlowFieldRequestHand, sampleFlowFieldSource } from './field-flow-operators.mjs';

const HARD_MAX_STROKES = 16384;
const HARD_MAX_AXIS = 256;
const EPSILON = 1e-6;
const TAU = Math.PI * 2;
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

function validateFlowSources(next) {
  if (!next.fieldSource || !next.fieldSourceHash) throw new Error('hatching treatment requires normalized scalar field source');
  if (!next.flowSource || !next.flowSourceHash) throw new Error('hatching treatment requires normalized vector flow source');
  if (hashValue(next.fieldSource) !== next.fieldSourceHash) throw new Error('scalar field source hash mismatch');
  if (hashValue(next.flowSource) !== next.flowSourceHash) throw new Error('vector flow source hash mismatch');
  if (next.flowSource.scalarSource?.sourceHash !== next.fieldSourceHash) throw new Error('vector flow scalar lineage mismatch');
}

function validateHatchingSource(next) {
  validateFlowSources(next);
  const source = next.hatchingSource;
  if (!source || source.schema !== 'axm.hatching-source2d/v0.1' || !next.hatchingSourceHash) {
    throw new Error('hatching treatment requires normalized hatching source');
  }
  if (hashValue(source) !== next.hatchingSourceHash) throw new Error('hatching source hash mismatch');
  if (source.fieldSourceHash !== next.fieldSourceHash) throw new Error('hatching source field lineage mismatch');
  if (source.flowSourceHash !== next.flowSourceHash) throw new Error('hatching source flow lineage mismatch');
}

function strokeSetHashPayload(strokeSet) {
  return {
    schema: strokeSet.schema,
    sourceHash: strokeSet.sourceHash,
    fieldSourceHash: strokeSet.fieldSourceHash,
    flowSourceHash: strokeSet.flowSourceHash,
    columns: strokeSet.columns,
    rows: strokeSet.rows,
    strokeCount: strokeSet.strokeCount,
    strokes: strokeSet.strokes,
  };
}

function mappedValue(source, fieldValue) {
  const value = source.valueMode === 'invert' ? 1 - fieldValue : fieldValue;
  return Math.max(0, Math.min(1, value));
}

function expectedLengthCell(source, fieldValue) {
  const shaped = mappedValue(source, fieldValue) ** source.responsePower;
  return round6(source.minLengthCell + (source.maxLengthCell - source.minLengthCell) * shaped);
}

function expectedDirection(source, fieldSource, flowSource, u, v) {
  const flow = sampleFlowFieldSource(fieldSource, flowSource, u, v);
  const vectorMagnitude = Math.hypot(flow.x, flow.y);
  if (vectorMagnitude > EPSILON && flow.magnitude > EPSILON) {
    return {
      direction: [round6(flow.x / vectorMagnitude), round6(flow.y / vectorMagnitude)],
      flowMagnitude: flow.magnitude,
    };
  }
  const radians = source.fallbackAngleTurns * TAU;
  return {
    direction: [round6(Math.cos(radians)), round6(Math.sin(radians))],
    flowMagnitude: 0,
  };
}

function expectedStroke(next, index, column, row, columns, rows) {
  const center = [round6((column + 0.5) / columns), round6((row + 0.5) / rows)];
  const fieldValue = sampleFbmSource(next.fieldSource, center[0], center[1]);
  const { direction, flowMagnitude } = expectedDirection(next.hatchingSource, next.fieldSource, next.flowSource, center[0], center[1]);
  const lengthCell = expectedLengthCell(next.hatchingSource, fieldValue);
  const cellScale = Math.min(1 / columns, 1 / rows);
  const halfLength = (lengthCell * cellScale) / 2;
  return {
    index,
    column,
    row,
    center,
    fieldValue,
    flowMagnitude,
    direction,
    lengthCell,
    from: [
      round6(center[0] - direction[0] * halfLength),
      round6(center[1] - direction[1] * halfLength),
    ],
    to: [
      round6(center[0] + direction[0] * halfLength),
      round6(center[1] + direction[1] * halfLength),
    ],
  };
}

function nearlyEqual(a, b) {
  return Math.abs(a - b) <= EPSILON;
}

function validateStrokeSet(next, strokeSet) {
  validateHatchingSource(next);
  if (!strokeSet || strokeSet.schema !== 'axm.hatching-stroke-set2d/v0.1') throw new Error('hatching realization requires derived stroke set');
  if (strokeSet.sourceHash !== next.hatchingSourceHash) throw new Error('hatching stroke set source lineage mismatch');
  if (strokeSet.fieldSourceHash !== next.fieldSourceHash) throw new Error('hatching stroke set field lineage mismatch');
  if (strokeSet.flowSourceHash !== next.flowSourceHash) throw new Error('hatching stroke set flow lineage mismatch');
  if (strokeSet.derived !== true || strokeSet.rebuildable !== true) throw new Error('hatching stroke set must remain derived and rebuildable');
  if (!Array.isArray(strokeSet.strokes) || strokeSet.strokes.length !== strokeSet.strokeCount || strokeSet.strokeCount !== strokeSet.columns * strokeSet.rows) {
    throw new Error('hatching stroke set cardinality mismatch');
  }
  if (hashValue(strokeSetHashPayload(strokeSet)) !== strokeSet.strokeSetHash) throw new Error('hatching stroke set hash mismatch');

  for (let index = 0; index < strokeSet.strokes.length; index += 1) {
    const stroke = strokeSet.strokes[index];
    if (!stroke || stroke.index !== index) throw new Error(`hatching stroke ${index} identity mismatch`);
    const column = index % strokeSet.columns;
    const row = Math.floor(index / strokeSet.columns);
    if (stroke.column !== column || stroke.row !== row) throw new Error(`hatching stroke ${index} grid identity mismatch`);
    const expected = expectedStroke(next, index, column, row, strokeSet.columns, strokeSet.rows);
    if (!Array.isArray(stroke.center) || stroke.center.length !== 2 || !nearlyEqual(stroke.center[0], expected.center[0]) || !nearlyEqual(stroke.center[1], expected.center[1])) {
      throw new Error(`hatching stroke ${index} center mismatch`);
    }
    if (!nearlyEqual(stroke.fieldValue, expected.fieldValue)) throw new Error(`hatching stroke ${index} field sample mismatch`);
    if (!nearlyEqual(stroke.flowMagnitude, expected.flowMagnitude)) throw new Error(`hatching stroke ${index} flow magnitude mismatch`);
    if (!Array.isArray(stroke.direction) || stroke.direction.length !== 2 || !nearlyEqual(stroke.direction[0], expected.direction[0]) || !nearlyEqual(stroke.direction[1], expected.direction[1])) {
      throw new Error(`hatching stroke ${index} direction mismatch`);
    }
    if (!nearlyEqual(stroke.lengthCell, expected.lengthCell)) throw new Error(`hatching stroke ${index} length mismatch`);
    if (!Array.isArray(stroke.from) || !Array.isArray(stroke.to) || stroke.from.length !== 2 || stroke.to.length !== 2
      || !nearlyEqual(stroke.from[0], expected.from[0]) || !nearlyEqual(stroke.from[1], expected.from[1])
      || !nearlyEqual(stroke.to[0], expected.to[0]) || !nearlyEqual(stroke.to[1], expected.to[1])) {
      throw new Error(`hatching stroke ${index} endpoint mismatch`);
    }
  }
}

export const normalizeHatchingSourceHand = hand('fx.stylize.hatching2d-source-normalize', (state) => {
  const next = deepClone(state);
  validateFlowSources(next);
  const request = next.hatchingRequest;
  if (!request || typeof request !== 'object') throw new Error('hatching treatment requires hatchingRequest state');

  const id = String(request.id ?? 'hatching').trim();
  if (!id || id.length > 96) throw new Error('hatchingRequest.id must be non-empty and <= 96 characters');
  const valueMode = request.valueMode ?? 'normal';
  if (!['normal', 'invert'].includes(valueMode)) throw new Error('hatchingRequest.valueMode must be normal or invert');
  const minLengthCell = round6(bounded(request.minLengthCell ?? 0.15, 0, 0.95, 'hatchingRequest.minLengthCell'));
  const maxLengthCell = round6(bounded(request.maxLengthCell ?? 0.85, 0, 0.95, 'hatchingRequest.maxLengthCell'));
  if (maxLengthCell < minLengthCell) throw new Error('hatchingRequest.maxLengthCell must be >= minLengthCell');

  next.hatchingSource = {
    schema: 'axm.hatching-source2d/v0.1',
    id,
    fieldSourceHash: next.fieldSourceHash,
    flowSourceHash: next.flowSourceHash,
    valueMode,
    minLengthCell,
    maxLengthCell,
    responsePower: round6(bounded(request.responsePower ?? 1, 0.25, 4, 'hatchingRequest.responsePower')),
    fallbackAngleTurns: round6(bounded(request.fallbackAngleTurns ?? 0, -1, 1, 'hatchingRequest.fallbackAngleTurns')),
  };
  next.hatchingSourceHash = hashValue(next.hatchingSource);

  return {
    state: next,
    evidence: {
      fieldSourceHash: next.fieldSourceHash,
      flowSourceHash: next.flowSourceHash,
      hatchingSourceHash: next.hatchingSourceHash,
      valueMode,
      sourceCodeReuse: 'none',
    },
  };
}, 'Normalize a consumer-neutral hatching treatment source that retains scalar-field and vector-flow lineage while leaving stroke density and renderer controls derived.');

export const buildHatchingStrokeSetHand = hand('fx.stylize.hatching2d-stroke-set-build', (state, params = {}) => {
  const next = deepClone(state);
  validateHatchingSource(next);
  const columns = boundedInteger(params.columns ?? 48, 2, HARD_MAX_AXIS, 'hatchingStrokeSet.columns');
  const rows = boundedInteger(params.rows ?? 32, 2, HARD_MAX_AXIS, 'hatchingStrokeSet.rows');
  const maxStrokes = boundedInteger(params.maxStrokes ?? HARD_MAX_STROKES, 4, HARD_MAX_STROKES, 'hatchingStrokeSet.maxStrokes');
  if (columns * rows > maxStrokes) throw new Error(`hatching stroke budget exceeded: ${columns * rows} > ${maxStrokes}`);

  const strokes = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      strokes.push(expectedStroke(next, strokes.length, column, row, columns, rows));
    }
  }

  const strokeSet = {
    schema: 'axm.hatching-stroke-set2d/v0.1',
    sourceHash: next.hatchingSourceHash,
    fieldSourceHash: next.fieldSourceHash,
    flowSourceHash: next.flowSourceHash,
    columns,
    rows,
    strokeCount: strokes.length,
    strokes,
    derived: true,
    rebuildable: true,
  };
  strokeSet.strokeSetHash = hashValue(strokeSetHashPayload(strokeSet));
  next.hatchingStrokeSets ??= {};
  next.hatchingStrokeSets[next.hatchingSource.id] = strokeSet;

  return {
    state: next,
    evidence: {
      fieldSourceHash: next.fieldSourceHash,
      flowSourceHash: next.flowSourceHash,
      hatchingSourceHash: next.hatchingSourceHash,
      strokeSetHash: strokeSet.strokeSetHash,
      columns,
      rows,
      strokeCount: strokeSet.strokeCount,
      maxStrokes,
      hardMaxStrokes: HARD_MAX_STROKES,
      performanceMeasurement: 'NOT_TESTED',
    },
  };
}, 'Build a bounded rebuildable hatch-stroke working set from retained scalar intensity and continuous vector-flow direction.');

export const realizeHatchingStaticSvgHand = hand('fx.stylize.hatching2d-static-svg-realize', (state, params = {}) => {
  const next = deepClone(state);
  validateHatchingSource(next);
  const strokeSet = next.hatchingStrokeSets?.[next.hatchingSource.id];
  validateStrokeSet(next, strokeSet);

  const width = boundedInteger(params.width ?? 640, 16, 4096, 'hatchingSvg.width');
  const height = boundedInteger(params.height ?? 420, 16, 4096, 'hatchingSvg.height');
  const opacity = round6(bounded(params.opacity ?? 0.9, 0, 1, 'hatchingSvg.opacity'));
  const strokeWidthPx = round6(bounded(params.strokeWidthPx ?? 1, 0.25, 16, 'hatchingSvg.strokeWidthPx'));
  const lines = strokeSet.strokes.map((stroke) => {
    const x1 = round6(stroke.from[0] * width);
    const y1 = round6(stroke.from[1] * height);
    const x2 = round6(stroke.to[0] * width);
    const y2 = round6(stroke.to[1] * height);
    return `<line data-stroke="${stroke.index}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  }).join('');
  const content = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><g fill="none" stroke="currentColor" stroke-width="${strokeWidthPx}" stroke-linecap="round" opacity="${opacity}">${lines}</g></svg>`;
  const realization = {
    schema: 'axm.static-svg-realization/v0.1',
    kind: 'field-guided-hatching2d',
    sourceHash: next.hatchingSourceHash,
    fieldSourceHash: next.fieldSourceHash,
    flowSourceHash: next.flowSourceHash,
    strokeSetHash: strokeSet.strokeSetHash,
    renderer: 'svg-static-inspection',
    width,
    height,
    opacity,
    strokeWidthPx,
    content,
    artifactHash: hashValue(content),
    derived: true,
    replaceable: true,
  };
  next.realizations ??= {};
  next.realizations.hatchingStaticSvg = realization;

  return {
    state: next,
    evidence: {
      fieldSourceHash: next.fieldSourceHash,
      flowSourceHash: next.flowSourceHash,
      hatchingSourceHash: next.hatchingSourceHash,
      strokeSetHash: strokeSet.strokeSetHash,
      artifactHash: realization.artifactHash,
      renderer: realization.renderer,
      visualQuality: 'NOT_TESTED',
      performanceMeasurement: 'NOT_TESTED',
    },
  };
}, 'Realize a replaceable static SVG inspection view from validated field-guided hatch strokes without promoting renderer state into source truth.');

export const HATCHING_FIELD2D_HANDS = [
  normalizeFlowFieldRequestHand,
  normalizeHatchingSourceHand,
  buildHatchingStrokeSetHand,
  realizeHatchingStaticSvgHand,
];

export const HATCHING_FIELD2D_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.stylize.field-guided-hatching2d-static-svg',
  version: '0.1.0',
  stages: [
    { id: 'normalize-flow-source', hand: 'fx.field.flow-source-normalize', params: {} },
    { id: 'normalize-hatching-source', hand: 'fx.stylize.hatching2d-source-normalize', params: {} },
    { id: 'build-hatching-stroke-set', hand: 'fx.stylize.hatching2d-stroke-set-build', params: { columns: 48, rows: 32, maxStrokes: HARD_MAX_STROKES } },
    { id: 'realize-hatching-svg', hand: 'fx.stylize.hatching2d-static-svg-realize', params: { width: 640, height: 420, opacity: 0.9, strokeWidthPx: 1 } },
  ],
});

export function makeHatchingFieldState(options = {}) {
  return {
    schema: 'axm.effect-work-state/v0.1',
    fieldRequest: {
      id: options.fieldId ?? 'hatching-field',
      seed: options.seed ?? 1337,
      frequency: options.frequency ?? 3,
      octaves: options.octaves ?? 4,
      lacunarity: options.lacunarity ?? 2,
      gain: options.gain ?? 0.5,
      offset: options.offset ?? [0, 0],
    },
    flowRequest: {
      id: options.flowId ?? 'hatching-flow',
      mode: options.flowMode ?? 'tangent',
      sampleStep: options.sampleStep ?? 0.015625,
      strength: options.flowStrength ?? 1,
    },
    hatchingRequest: {
      id: options.id ?? 'hatching',
      valueMode: options.valueMode ?? 'normal',
      minLengthCell: options.minLengthCell ?? 0.15,
      maxLengthCell: options.maxLengthCell ?? 0.85,
      responsePower: options.responsePower ?? 1,
      fallbackAngleTurns: options.fallbackAngleTurns ?? 0,
    },
    hatchingStrokeSets: {},
  };
}
