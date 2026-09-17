import { deepClone, hashValue } from './hand-runtime.mjs';
import { normalizeScalarFieldRequestHand, sampleFbmSource } from './field-operators.mjs';

const HARD_MAX_CANDIDATES = 16384;
const HARD_MAX_AXIS = 256;
const HARD_MAX_CANDIDATES_PER_CELL = 4;
const EPSILON = 1e-6;
const UINT32_RANGE = 4294967296;
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
  if (!next.fieldSource || !next.fieldSourceHash) throw new Error('stippling treatment requires normalized scalar field source');
  if (hashValue(next.fieldSource) !== next.fieldSourceHash) throw new Error('scalar field source hash mismatch');
}

function validateStipplingSource(next) {
  validateFieldSource(next);
  const source = next.stipplingSource;
  if (!source || source.schema !== 'axm.stippling-source2d/v0.1' || !next.stipplingSourceHash) {
    throw new Error('stippling treatment requires normalized stippling source');
  }
  if (hashValue(source) !== next.stipplingSourceHash) throw new Error('stippling source hash mismatch');
  if (source.fieldSourceHash !== next.fieldSourceHash) throw new Error('stippling source field lineage mismatch');
}

function mappedValue(source, fieldValue) {
  const value = source.valueMode === 'invert' ? 1 - fieldValue : fieldValue;
  return Math.max(0, Math.min(1, value));
}

function expectedDensity(source, fieldValue) {
  const shaped = mappedValue(source, fieldValue) ** source.responsePower;
  return round6(source.minDensity + (source.maxDensity - source.minDensity) * shaped);
}

function deterministicUnit(patternSeed, column, row, candidate, channel) {
  const digest = hashValue({
    schema: 'axm.stipple-random-key/v0.1',
    patternSeed,
    column,
    row,
    candidate,
    channel,
  });
  return Number.parseInt(digest.slice(0, 8), 16) / UINT32_RANGE;
}

function expectedCandidate(next, column, row, candidate, columns, rows) {
  const source = next.stipplingSource;
  const jitterX = (deterministicUnit(source.patternSeed, column, row, candidate, 'jitter-x') * 2 - 1) * source.jitterCell;
  const jitterY = (deterministicUnit(source.patternSeed, column, row, candidate, 'jitter-y') * 2 - 1) * source.jitterCell;
  const position = [
    round6((column + 0.5 + jitterX) / columns),
    round6((row + 0.5 + jitterY) / rows),
  ];
  const fieldValue = sampleFbmSource(next.fieldSource, position[0], position[1]);
  const density = expectedDensity(source, fieldValue);
  const decision = round6(deterministicUnit(source.patternSeed, column, row, candidate, 'accept'));
  return {
    column,
    row,
    candidate,
    position,
    fieldValue,
    density,
    decision,
    accepted: decision < density,
  };
}

function pointSetHashPayload(pointSet) {
  return {
    schema: pointSet.schema,
    sourceHash: pointSet.sourceHash,
    fieldSourceHash: pointSet.fieldSourceHash,
    columns: pointSet.columns,
    rows: pointSet.rows,
    candidatesPerCell: pointSet.candidatesPerCell,
    candidateCount: pointSet.candidateCount,
    pointCount: pointSet.pointCount,
    points: pointSet.points,
  };
}

function buildExpectedPointSet(next, columns, rows, candidatesPerCell) {
  const points = [];
  let candidateIndex = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      for (let candidate = 0; candidate < candidatesPerCell; candidate += 1) {
        const sample = expectedCandidate(next, column, row, candidate, columns, rows);
        if (sample.accepted) {
          points.push({
            index: points.length,
            candidateIndex,
            column,
            row,
            candidate,
            position: sample.position,
            fieldValue: sample.fieldValue,
            density: sample.density,
            decision: sample.decision,
          });
        }
        candidateIndex += 1;
      }
    }
  }

  const pointSet = {
    schema: 'axm.stippling-point-set2d/v0.1',
    sourceHash: next.stipplingSourceHash,
    fieldSourceHash: next.fieldSourceHash,
    columns,
    rows,
    candidatesPerCell,
    candidateCount: columns * rows * candidatesPerCell,
    pointCount: points.length,
    points,
    derived: true,
    rebuildable: true,
  };
  pointSet.pointSetHash = hashValue(pointSetHashPayload(pointSet));
  return pointSet;
}

function validatePointSet(next, pointSet) {
  validateStipplingSource(next);
  if (!pointSet || pointSet.schema !== 'axm.stippling-point-set2d/v0.1') throw new Error('stippling realization requires derived point set');
  if (pointSet.sourceHash !== next.stipplingSourceHash) throw new Error('stippling point set source lineage mismatch');
  if (pointSet.fieldSourceHash !== next.fieldSourceHash) throw new Error('stippling point set field lineage mismatch');
  if (pointSet.derived !== true || pointSet.rebuildable !== true) throw new Error('stippling point set must remain derived and rebuildable');
  if (!Array.isArray(pointSet.points) || pointSet.points.length !== pointSet.pointCount) throw new Error('stippling point set cardinality mismatch');
  if (pointSet.candidateCount !== pointSet.columns * pointSet.rows * pointSet.candidatesPerCell) throw new Error('stippling candidate cardinality mismatch');
  if (hashValue(pointSetHashPayload(pointSet)) !== pointSet.pointSetHash) throw new Error('stippling point set hash mismatch');

  const expected = buildExpectedPointSet(next, pointSet.columns, pointSet.rows, pointSet.candidatesPerCell);
  if (expected.pointSetHash !== pointSet.pointSetHash) throw new Error('stippling point set does not match retained sources');
  if (expected.pointCount !== pointSet.pointCount) throw new Error('stippling point count mismatch');

  for (let index = 0; index < pointSet.points.length; index += 1) {
    const actual = pointSet.points[index];
    const target = expected.points[index];
    if (!actual || actual.index !== index || actual.candidateIndex !== target.candidateIndex
      || actual.column !== target.column || actual.row !== target.row || actual.candidate !== target.candidate) {
      throw new Error(`stippling point ${index} identity mismatch`);
    }
    if (!Array.isArray(actual.position) || actual.position.length !== 2
      || Math.abs(actual.position[0] - target.position[0]) > EPSILON
      || Math.abs(actual.position[1] - target.position[1]) > EPSILON) {
      throw new Error(`stippling point ${index} position mismatch`);
    }
    if (Math.abs(actual.fieldValue - target.fieldValue) > EPSILON) throw new Error(`stippling point ${index} field sample mismatch`);
    if (Math.abs(actual.density - target.density) > EPSILON) throw new Error(`stippling point ${index} density mismatch`);
    if (Math.abs(actual.decision - target.decision) > EPSILON) throw new Error(`stippling point ${index} decision mismatch`);
  }
}

export const normalizeStipplingSourceHand = hand('fx.stylize.stippling2d-source-normalize', (state) => {
  const next = deepClone(state);
  validateFieldSource(next);
  const request = next.stipplingRequest;
  if (!request || typeof request !== 'object') throw new Error('stippling treatment requires stipplingRequest state');

  const id = String(request.id ?? 'stippling').trim();
  if (!id || id.length > 96) throw new Error('stipplingRequest.id must be non-empty and <= 96 characters');
  const valueMode = request.valueMode ?? 'normal';
  if (!['normal', 'invert'].includes(valueMode)) throw new Error('stipplingRequest.valueMode must be normal or invert');
  const minDensity = round6(bounded(request.minDensity ?? 0.08, 0, 1, 'stipplingRequest.minDensity'));
  const maxDensity = round6(bounded(request.maxDensity ?? 0.92, 0, 1, 'stipplingRequest.maxDensity'));
  if (maxDensity < minDensity) throw new Error('stipplingRequest.maxDensity must be >= minDensity');

  next.stipplingSource = {
    schema: 'axm.stippling-source2d/v0.1',
    id,
    fieldSourceHash: next.fieldSourceHash,
    patternSeed: boundedInteger(request.patternSeed ?? 424242, 0, 4294967295, 'stipplingRequest.patternSeed') >>> 0,
    valueMode,
    minDensity,
    maxDensity,
    responsePower: round6(bounded(request.responsePower ?? 1, 0.25, 4, 'stipplingRequest.responsePower')),
    jitterCell: round6(bounded(request.jitterCell ?? 0.42, 0, 0.48, 'stipplingRequest.jitterCell')),
    radiusCell: round6(bounded(request.radiusCell ?? 0.12, 0.02, 0.48, 'stipplingRequest.radiusCell')),
  };
  next.stipplingSourceHash = hashValue(next.stipplingSource);

  return {
    state: next,
    evidence: {
      fieldSourceHash: next.fieldSourceHash,
      stipplingSourceHash: next.stipplingSourceHash,
      patternSeed: next.stipplingSource.patternSeed,
      valueMode,
      sourceCodeReuse: 'AXM hand-runtime hashValue and existing scalar-field sampling contract only',
    },
  };
}, 'Normalize a consumer-neutral stippling treatment source with stable seeded placement while leaving working-set density and renderer controls derived.');

export const buildStipplingPointSetHand = hand('fx.stylize.stippling2d-point-set-build', (state, params = {}) => {
  const next = deepClone(state);
  validateStipplingSource(next);
  const columns = boundedInteger(params.columns ?? 40, 2, HARD_MAX_AXIS, 'stipplingPointSet.columns');
  const rows = boundedInteger(params.rows ?? 28, 2, HARD_MAX_AXIS, 'stipplingPointSet.rows');
  const candidatesPerCell = boundedInteger(params.candidatesPerCell ?? 2, 1, HARD_MAX_CANDIDATES_PER_CELL, 'stipplingPointSet.candidatesPerCell');
  const maxCandidates = boundedInteger(params.maxCandidates ?? HARD_MAX_CANDIDATES, 4, HARD_MAX_CANDIDATES, 'stipplingPointSet.maxCandidates');
  const candidateCount = columns * rows * candidatesPerCell;
  if (candidateCount > maxCandidates) throw new Error(`stippling candidate budget exceeded: ${candidateCount} > ${maxCandidates}`);

  const pointSet = buildExpectedPointSet(next, columns, rows, candidatesPerCell);
  next.stipplingPointSets ??= {};
  next.stipplingPointSets[next.stipplingSource.id] = pointSet;

  return {
    state: next,
    evidence: {
      fieldSourceHash: next.fieldSourceHash,
      stipplingSourceHash: next.stipplingSourceHash,
      pointSetHash: pointSet.pointSetHash,
      columns,
      rows,
      candidatesPerCell,
      candidateCount: pointSet.candidateCount,
      pointCount: pointSet.pointCount,
      maxCandidates,
      hardMaxCandidates: HARD_MAX_CANDIDATES,
      performanceMeasurement: 'NOT_TESTED',
    },
  };
}, 'Build a bounded rebuildable stipple-point set from deterministic seeded candidates accepted against retained scalar-field density.');

export const realizeStipplingStaticSvgHand = hand('fx.stylize.stippling2d-static-svg-realize', (state, params = {}) => {
  const next = deepClone(state);
  validateStipplingSource(next);
  const pointSet = next.stipplingPointSets?.[next.stipplingSource.id];
  validatePointSet(next, pointSet);

  const width = boundedInteger(params.width ?? 640, 16, 4096, 'stipplingSvg.width');
  const height = boundedInteger(params.height ?? 420, 16, 4096, 'stipplingSvg.height');
  const opacity = round6(bounded(params.opacity ?? 0.9, 0, 1, 'stipplingSvg.opacity'));
  const cellPixels = Math.min(width / pointSet.columns, height / pointSet.rows);
  const radius = round6(next.stipplingSource.radiusCell * cellPixels);
  const circles = pointSet.points.map((point) => {
    const cx = round6(point.position[0] * width);
    const cy = round6(point.position[1] * height);
    return `<circle data-point="${point.index}" data-candidate="${point.candidateIndex}" cx="${cx}" cy="${cy}" r="${radius}"/>`;
  }).join('');
  const content = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><g fill="currentColor" opacity="${opacity}">${circles}</g></svg>`;
  const realization = {
    schema: 'axm.static-svg-realization/v0.1',
    kind: 'field-stippling2d',
    sourceHash: next.stipplingSourceHash,
    fieldSourceHash: next.fieldSourceHash,
    pointSetHash: pointSet.pointSetHash,
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
  next.realizations.stipplingStaticSvg = realization;

  return {
    state: next,
    evidence: {
      fieldSourceHash: next.fieldSourceHash,
      stipplingSourceHash: next.stipplingSourceHash,
      pointSetHash: pointSet.pointSetHash,
      artifactHash: realization.artifactHash,
      renderer: realization.renderer,
      pointCount: pointSet.pointCount,
      visualQuality: 'NOT_TESTED',
      performanceMeasurement: 'NOT_TESTED',
    },
  };
}, 'Realize a replaceable static SVG inspection view from a validated stipple-point set without promoting renderer state into source truth.');

export const STIPPLING_FIELD2D_HANDS = [
  normalizeScalarFieldRequestHand,
  normalizeStipplingSourceHand,
  buildStipplingPointSetHand,
  realizeStipplingStaticSvgHand,
];

export const STIPPLING_FIELD2D_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.stylize.field-stippling2d-static-svg',
  version: '0.1.0',
  stages: [
    { id: 'normalize-field-source', hand: 'fx.field.fbm-source-normalize', params: {} },
    { id: 'normalize-stippling-source', hand: 'fx.stylize.stippling2d-source-normalize', params: {} },
    { id: 'build-stippling-point-set', hand: 'fx.stylize.stippling2d-point-set-build', params: { columns: 40, rows: 28, candidatesPerCell: 2, maxCandidates: HARD_MAX_CANDIDATES } },
    { id: 'realize-stippling-svg', hand: 'fx.stylize.stippling2d-static-svg-realize', params: { width: 640, height: 420, opacity: 0.9 } },
  ],
});

export function makeStipplingFieldState(options = {}) {
  return {
    schema: 'axm.effect-work-state/v0.1',
    fieldRequest: {
      id: options.fieldId ?? 'stippling-field',
      seed: options.seed ?? 1337,
      frequency: options.frequency ?? 3,
      octaves: options.octaves ?? 4,
      lacunarity: options.lacunarity ?? 2,
      gain: options.gain ?? 0.5,
      offset: options.offset ?? [0, 0],
    },
    stipplingRequest: {
      id: options.id ?? 'stippling',
      patternSeed: options.patternSeed ?? 424242,
      valueMode: options.valueMode ?? 'normal',
      minDensity: options.minDensity ?? 0.08,
      maxDensity: options.maxDensity ?? 0.92,
      responsePower: options.responsePower ?? 1,
      jitterCell: options.jitterCell ?? 0.42,
      radiusCell: options.radiusCell ?? 0.12,
    },
    stipplingPointSets: {},
  };
}
