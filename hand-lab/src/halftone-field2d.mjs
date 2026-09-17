import { deepClone, hashValue } from './hand-runtime.mjs';
import { normalizeScalarFieldRequestHand, sampleFbmSource } from './field-operators.mjs';

const HARD_MAX_DOTS = 16384;
const HARD_MAX_AXIS = 256;
const EPSILON = 1e-6;
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

function validateFieldSource(next) {
  if (!next.fieldSource || !next.fieldSourceHash) throw new Error('halftone treatment requires normalized scalar field source');
  if (hashValue(next.fieldSource) !== next.fieldSourceHash) throw new Error('scalar field source hash mismatch');
}

function validateHalftoneSource(next) {
  validateFieldSource(next);
  const source = next.halftoneSource;
  if (!source || source.schema !== 'axm.halftone-source2d/v0.1' || !next.halftoneSourceHash) {
    throw new Error('halftone treatment requires normalized halftone source');
  }
  if (hashValue(source) !== next.halftoneSourceHash) throw new Error('halftone source hash mismatch');
  if (source.fieldSourceHash !== next.fieldSourceHash) throw new Error('halftone source field lineage mismatch');
}

function dotSetHashPayload(dotSet) {
  return {
    schema: dotSet.schema,
    sourceHash: dotSet.sourceHash,
    fieldSourceHash: dotSet.fieldSourceHash,
    columns: dotSet.columns,
    rows: dotSet.rows,
    dotCount: dotSet.dotCount,
    dots: dotSet.dots,
  };
}

function mappedValue(source, fieldValue) {
  const base = source.valueMode === 'invert' ? 1 - fieldValue : fieldValue;
  return Math.max(0, Math.min(1, base));
}

function expectedRadiusCell(source, fieldValue) {
  const shaped = mappedValue(source, fieldValue) ** source.responsePower;
  return round6(source.minRadiusCell + (source.maxRadiusCell - source.minRadiusCell) * shaped);
}

function validateDotSet(next, dotSet) {
  validateHalftoneSource(next);
  if (!dotSet || dotSet.schema !== 'axm.halftone-dot-set2d/v0.1') throw new Error('halftone realization requires derived dot set');
  if (dotSet.sourceHash !== next.halftoneSourceHash) throw new Error('halftone dot set source lineage mismatch');
  if (dotSet.fieldSourceHash !== next.fieldSourceHash) throw new Error('halftone dot set field lineage mismatch');
  if (dotSet.derived !== true || dotSet.rebuildable !== true) throw new Error('halftone dot set must remain derived and rebuildable');
  if (!Array.isArray(dotSet.dots) || dotSet.dots.length !== dotSet.dotCount || dotSet.dotCount !== dotSet.columns * dotSet.rows) {
    throw new Error('halftone dot set cardinality mismatch');
  }
  if (hashValue(dotSetHashPayload(dotSet)) !== dotSet.dotSetHash) throw new Error('halftone dot set hash mismatch');

  for (let index = 0; index < dotSet.dots.length; index += 1) {
    const dot = dotSet.dots[index];
    if (!dot || dot.index !== index) throw new Error(`halftone dot ${index} identity mismatch`);
    const expectedColumn = index % dotSet.columns;
    const expectedRow = Math.floor(index / dotSet.columns);
    if (dot.column !== expectedColumn || dot.row !== expectedRow) throw new Error(`halftone dot ${index} grid identity mismatch`);
    const expectedCenter = [
      round6((expectedColumn + 0.5) / dotSet.columns),
      round6((expectedRow + 0.5) / dotSet.rows),
    ];
    if (!Array.isArray(dot.center) || dot.center.length !== 2
      || Math.abs(dot.center[0] - expectedCenter[0]) > EPSILON
      || Math.abs(dot.center[1] - expectedCenter[1]) > EPSILON) {
      throw new Error(`halftone dot ${index} center mismatch`);
    }
    const fieldValue = sampleFbmSource(next.fieldSource, expectedCenter[0], expectedCenter[1]);
    if (Math.abs(dot.fieldValue - fieldValue) > EPSILON) throw new Error(`halftone dot ${index} field sample mismatch`);
    const radiusCell = expectedRadiusCell(next.halftoneSource, fieldValue);
    if (Math.abs(dot.radiusCell - radiusCell) > EPSILON) throw new Error(`halftone dot ${index} radius mismatch`);
  }
}

export const normalizeHalftoneSourceHand = hand('fx.stylize.halftone2d-source-normalize', (state) => {
  const next = deepClone(state);
  validateFieldSource(next);
  const request = next.halftoneRequest;
  if (!request || typeof request !== 'object') throw new Error('halftone treatment requires halftoneRequest state');

  const id = String(request.id ?? 'halftone').trim();
  if (!id || id.length > 96) throw new Error('halftoneRequest.id must be non-empty and <= 96 characters');
  const valueMode = request.valueMode ?? 'normal';
  if (!['normal', 'invert'].includes(valueMode)) throw new Error('halftoneRequest.valueMode must be normal or invert');
  const minRadiusCell = round6(bounded(request.minRadiusCell ?? 0.06, 0, 0.5, 'halftoneRequest.minRadiusCell'));
  const maxRadiusCell = round6(bounded(request.maxRadiusCell ?? 0.46, 0, 0.5, 'halftoneRequest.maxRadiusCell'));
  if (maxRadiusCell < minRadiusCell) throw new Error('halftoneRequest.maxRadiusCell must be >= minRadiusCell');

  next.halftoneSource = {
    schema: 'axm.halftone-source2d/v0.1',
    id,
    fieldSourceHash: next.fieldSourceHash,
    valueMode,
    minRadiusCell,
    maxRadiusCell,
    responsePower: round6(bounded(request.responsePower ?? 1, 0.25, 4, 'halftoneRequest.responsePower')),
  };
  next.halftoneSourceHash = hashValue(next.halftoneSource);

  return {
    state: next,
    evidence: {
      fieldSourceHash: next.fieldSourceHash,
      halftoneSourceHash: next.halftoneSourceHash,
      valueMode,
      sourceCodeReuse: 'none',
    },
  };
}, 'Normalize a consumer-neutral halftone treatment source that retains scalar-field lineage while leaving sampling density and renderer controls derived.');

export const buildHalftoneDotSetHand = hand('fx.stylize.halftone2d-dot-set-build', (state, params = {}) => {
  const next = deepClone(state);
  validateHalftoneSource(next);
  const columns = boundedInteger(params.columns ?? 48, 2, HARD_MAX_AXIS, 'halftoneDotSet.columns');
  const rows = boundedInteger(params.rows ?? 32, 2, HARD_MAX_AXIS, 'halftoneDotSet.rows');
  const maxDots = boundedInteger(params.maxDots ?? HARD_MAX_DOTS, 4, HARD_MAX_DOTS, 'halftoneDotSet.maxDots');
  if (columns * rows > maxDots) throw new Error(`halftone dot budget exceeded: ${columns * rows} > ${maxDots}`);

  const dots = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const center = [round6((column + 0.5) / columns), round6((row + 0.5) / rows)];
      const fieldValue = sampleFbmSource(next.fieldSource, center[0], center[1]);
      dots.push({
        index: dots.length,
        column,
        row,
        center,
        fieldValue,
        radiusCell: expectedRadiusCell(next.halftoneSource, fieldValue),
      });
    }
  }

  const dotSet = {
    schema: 'axm.halftone-dot-set2d/v0.1',
    sourceHash: next.halftoneSourceHash,
    fieldSourceHash: next.fieldSourceHash,
    columns,
    rows,
    dotCount: dots.length,
    dots,
    derived: true,
    rebuildable: true,
  };
  dotSet.dotSetHash = hashValue(dotSetHashPayload(dotSet));
  next.halftoneDotSets ??= {};
  next.halftoneDotSets[next.halftoneSource.id] = dotSet;

  return {
    state: next,
    evidence: {
      fieldSourceHash: next.fieldSourceHash,
      halftoneSourceHash: next.halftoneSourceHash,
      dotSetHash: dotSet.dotSetHash,
      columns,
      rows,
      dotCount: dotSet.dotCount,
      maxDots,
      hardMaxDots: HARD_MAX_DOTS,
      performanceMeasurement: 'NOT_TESTED',
    },
  };
}, 'Build a bounded rebuildable halftone dot set by sampling retained continuous field truth at derived grid-cell centers.');

export const realizeHalftoneStaticSvgHand = hand('fx.stylize.halftone2d-static-svg-realize', (state, params = {}) => {
  const next = deepClone(state);
  validateHalftoneSource(next);
  const dotSet = next.halftoneDotSets?.[next.halftoneSource.id];
  validateDotSet(next, dotSet);

  const width = boundedInteger(params.width ?? 640, 16, 4096, 'halftoneSvg.width');
  const height = boundedInteger(params.height ?? 420, 16, 4096, 'halftoneSvg.height');
  const opacity = round6(bounded(params.opacity ?? 1, 0, 1, 'halftoneSvg.opacity'));
  const cellPixels = Math.min(width / dotSet.columns, height / dotSet.rows);
  const circles = dotSet.dots.map((dot) => {
    const cx = round6(dot.center[0] * width);
    const cy = round6(dot.center[1] * height);
    const radius = round6(dot.radiusCell * cellPixels);
    return `<circle data-dot="${dot.index}" cx="${cx}" cy="${cy}" r="${radius}"/>`;
  }).join('');
  const content = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><g fill="currentColor" opacity="${opacity}">${circles}</g></svg>`;
  const realization = {
    schema: 'axm.static-svg-realization/v0.1',
    kind: 'halftone-field2d',
    sourceHash: next.halftoneSourceHash,
    fieldSourceHash: next.fieldSourceHash,
    dotSetHash: dotSet.dotSetHash,
    renderer: 'svg-static-inspection',
    width,
    height,
    opacity,
    content,
    artifactHash: hashValue(content),
    derived: true,
    replaceable: true,
  };
  next.realizations ??= {};
  next.realizations.halftoneStaticSvg = realization;

  return {
    state: next,
    evidence: {
      fieldSourceHash: next.fieldSourceHash,
      halftoneSourceHash: next.halftoneSourceHash,
      dotSetHash: dotSet.dotSetHash,
      artifactHash: realization.artifactHash,
      renderer: realization.renderer,
      visualQuality: 'NOT_TESTED',
      performanceMeasurement: 'NOT_TESTED',
    },
  };
}, 'Realize a replaceable static SVG inspection view from a validated derived halftone dot set without promoting renderer state into source truth.');

export const HALFTONE_FIELD2D_HANDS = [
  normalizeScalarFieldRequestHand,
  normalizeHalftoneSourceHand,
  buildHalftoneDotSetHand,
  realizeHalftoneStaticSvgHand,
];

export const HALFTONE_FIELD2D_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.stylize.halftone-field2d-static-svg',
  version: '0.1.0',
  stages: [
    { id: 'normalize-field-source', hand: 'fx.field.fbm-source-normalize', params: {} },
    { id: 'normalize-halftone-source', hand: 'fx.stylize.halftone2d-source-normalize', params: {} },
    { id: 'build-halftone-dot-set', hand: 'fx.stylize.halftone2d-dot-set-build', params: { columns: 48, rows: 32, maxDots: HARD_MAX_DOTS } },
    { id: 'realize-halftone-svg', hand: 'fx.stylize.halftone2d-static-svg-realize', params: { width: 640, height: 420, opacity: 1 } },
  ],
});

export function makeHalftoneFieldState(options = {}) {
  return {
    schema: 'axm.effect-work-state/v0.1',
    fieldRequest: {
      id: options.fieldId ?? 'halftone-field',
      seed: options.seed ?? 1337,
      frequency: options.frequency ?? 3,
      octaves: options.octaves ?? 4,
      lacunarity: options.lacunarity ?? 2,
      gain: options.gain ?? 0.5,
      offset: options.offset ?? [0, 0],
    },
    halftoneRequest: {
      id: options.id ?? 'halftone',
      valueMode: options.valueMode ?? 'normal',
      minRadiusCell: options.minRadiusCell ?? 0.06,
      maxRadiusCell: options.maxRadiusCell ?? 0.46,
      responsePower: options.responsePower ?? 1,
    },
    halftoneDotSets: {},
  };
}
