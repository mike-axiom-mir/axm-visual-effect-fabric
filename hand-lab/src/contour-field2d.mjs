import { deepClone, hashValue } from './hand-runtime.mjs';
import { normalizeScalarFieldRequestHand, sampleFbmSource } from './field-operators.mjs';

const HARD_MAX_AXIS = 256;
const HARD_MAX_LEVELS = 8;
const HARD_MAX_CELL_LEVEL_PROBES = 65536;
const HARD_MAX_SEGMENTS = 32768;
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
  if (!next.fieldSource || !next.fieldSourceHash) throw new Error('contour treatment requires normalized scalar field source');
  if (hashValue(next.fieldSource) !== next.fieldSourceHash) throw new Error('scalar field source hash mismatch');
}

function normalizeLevels(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > HARD_MAX_LEVELS) {
    throw new Error(`contourRequest.levels must contain 1-${HARD_MAX_LEVELS} levels`);
  }
  const levels = value.map((entry, index) => round6(bounded(entry, 0.01, 0.99, `contourRequest.levels[${index}]`)));
  for (let index = 1; index < levels.length; index += 1) {
    if (levels[index] <= levels[index - 1]) throw new Error('contourRequest.levels must be strictly increasing');
  }
  return levels;
}

function validateContourSource(next) {
  validateFieldSource(next);
  const source = next.contourSource;
  if (!source || source.schema !== 'axm.contour-source2d/v0.1' || !next.contourSourceHash) {
    throw new Error('contour treatment requires normalized contour source');
  }
  if (hashValue(source) !== next.contourSourceHash) throw new Error('contour source hash mismatch');
  if (source.fieldSourceHash !== next.fieldSourceHash) throw new Error('contour source field lineage mismatch');
}

function interpolateEdge(a, b, level) {
  const delta = b.value - a.value;
  const rawT = Math.abs(delta) <= EPSILON ? 0.5 : (level - a.value) / delta;
  const t = Math.max(0, Math.min(1, rawT));
  return [
    round6(a.position[0] + (b.position[0] - a.position[0]) * t),
    round6(a.position[1] + (b.position[1] - a.position[1]) * t),
  ];
}

function edgeCrosses(a, b, level) {
  return (a.value < level && b.value >= level) || (b.value < level && a.value >= level);
}

function segmentLength(start, end) {
  return round6(Math.hypot(end[0] - start[0], end[1] - start[1]));
}

function cellSegments(fieldSource, column, row, columns, rows, level, levelIndex) {
  const u0 = column / columns;
  const u1 = (column + 1) / columns;
  const v0 = row / rows;
  const v1 = (row + 1) / rows;
  const corners = [
    { id: 'tl', position: [u0, v0], value: sampleFbmSource(fieldSource, u0, v0) },
    { id: 'tr', position: [u1, v0], value: sampleFbmSource(fieldSource, u1, v0) },
    { id: 'br', position: [u1, v1], value: sampleFbmSource(fieldSource, u1, v1) },
    { id: 'bl', position: [u0, v1], value: sampleFbmSource(fieldSource, u0, v1) },
  ];
  const edgeDefs = [
    ['top', 0, 1],
    ['right', 1, 2],
    ['bottom', 3, 2],
    ['left', 0, 3],
  ];
  const hits = [];
  for (const [edge, aIndex, bIndex] of edgeDefs) {
    const a = corners[aIndex];
    const b = corners[bIndex];
    if (edgeCrosses(a, b, level)) hits.push({ edge, position: interpolateEdge(a, b, level) });
  }
  if (hits.length === 0) return [];
  if (hits.length !== 2 && hits.length !== 4) throw new Error(`contour cell intersection count unsupported: ${hits.length}`);

  const makeSegment = (a, b, branch) => ({
    levelIndex,
    level,
    column,
    row,
    branch,
    startEdge: a.edge,
    endEdge: b.edge,
    start: a.position,
    end: b.position,
    length: segmentLength(a.position, b.position),
  });

  if (hits.length === 2) return [makeSegment(hits[0], hits[1], 0)];

  const centerValue = round6((corners[0].value + corners[1].value + corners[2].value + corners[3].value) / 4);
  const byEdge = Object.fromEntries(hits.map((hit) => [hit.edge, hit]));
  if (centerValue >= level) {
    return [
      makeSegment(byEdge.top, byEdge.left, 0),
      makeSegment(byEdge.right, byEdge.bottom, 1),
    ];
  }
  return [
    makeSegment(byEdge.top, byEdge.right, 0),
    makeSegment(byEdge.bottom, byEdge.left, 1),
  ];
}

function segmentSetHashPayload(segmentSet) {
  return {
    schema: segmentSet.schema,
    sourceHash: segmentSet.sourceHash,
    fieldSourceHash: segmentSet.fieldSourceHash,
    columns: segmentSet.columns,
    rows: segmentSet.rows,
    levels: segmentSet.levels,
    cellLevelProbes: segmentSet.cellLevelProbes,
    segmentCount: segmentSet.segmentCount,
    segments: segmentSet.segments,
  };
}

function buildExpectedSegmentSet(next, columns, rows, maxSegments) {
  const segments = [];
  for (let levelIndex = 0; levelIndex < next.contourSource.levels.length; levelIndex += 1) {
    const level = next.contourSource.levels[levelIndex];
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const found = cellSegments(next.fieldSource, column, row, columns, rows, level, levelIndex);
        for (const segment of found) {
          if (segments.length >= maxSegments) throw new Error(`contour segment budget exceeded: > ${maxSegments}`);
          segments.push({ index: segments.length, ...segment });
        }
      }
    }
  }

  const segmentSet = {
    schema: 'axm.contour-segment-set2d/v0.1',
    sourceHash: next.contourSourceHash,
    fieldSourceHash: next.fieldSourceHash,
    columns,
    rows,
    levels: deepClone(next.contourSource.levels),
    cellLevelProbes: columns * rows * next.contourSource.levels.length,
    segmentCount: segments.length,
    segments,
    derived: true,
    rebuildable: true,
  };
  segmentSet.segmentSetHash = hashValue(segmentSetHashPayload(segmentSet));
  return segmentSet;
}

function validateSegmentSet(next, segmentSet) {
  validateContourSource(next);
  if (!segmentSet || segmentSet.schema !== 'axm.contour-segment-set2d/v0.1') throw new Error('contour realization requires derived contour segment set');
  if (segmentSet.sourceHash !== next.contourSourceHash) throw new Error('contour segment set source lineage mismatch');
  if (segmentSet.fieldSourceHash !== next.fieldSourceHash) throw new Error('contour segment set field lineage mismatch');
  if (segmentSet.derived !== true || segmentSet.rebuildable !== true) throw new Error('contour segment set must remain derived and rebuildable');
  if (!Array.isArray(segmentSet.segments) || segmentSet.segments.length !== segmentSet.segmentCount) throw new Error('contour segment set cardinality mismatch');
  if (segmentSet.cellLevelProbes !== segmentSet.columns * segmentSet.rows * segmentSet.levels.length) throw new Error('contour segment probe count mismatch');
  if (hashValue(segmentSetHashPayload(segmentSet)) !== segmentSet.segmentSetHash) throw new Error('contour segment set hash mismatch');

  const expected = buildExpectedSegmentSet(next, segmentSet.columns, segmentSet.rows, Math.max(segmentSet.segmentCount, 1));
  if (expected.segmentSetHash !== segmentSet.segmentSetHash) throw new Error('contour segment set does not match retained sources');
  if (expected.segmentCount !== segmentSet.segmentCount) throw new Error('contour segment count mismatch');

  for (let index = 0; index < segmentSet.segments.length; index += 1) {
    const actual = segmentSet.segments[index];
    const target = expected.segments[index];
    if (!actual || actual.index !== index || actual.levelIndex !== target.levelIndex
      || actual.column !== target.column || actual.row !== target.row || actual.branch !== target.branch
      || actual.startEdge !== target.startEdge || actual.endEdge !== target.endEdge) {
      throw new Error(`contour segment ${index} identity mismatch`);
    }
    for (const key of ['start', 'end']) {
      if (!Array.isArray(actual[key]) || actual[key].length !== 2
        || Math.abs(actual[key][0] - target[key][0]) > EPSILON
        || Math.abs(actual[key][1] - target[key][1]) > EPSILON) {
        throw new Error(`contour segment ${index} ${key} mismatch`);
      }
    }
    if (Math.abs(actual.level - target.level) > EPSILON) throw new Error(`contour segment ${index} level mismatch`);
    if (Math.abs(actual.length - target.length) > EPSILON) throw new Error(`contour segment ${index} length mismatch`);
  }
}

export const normalizeContourSourceHand = hand('fx.stylize.contour2d-source-normalize', (state) => {
  const next = deepClone(state);
  validateFieldSource(next);
  const request = next.contourRequest;
  if (!request || typeof request !== 'object') throw new Error('contour treatment requires contourRequest state');
  const id = String(request.id ?? 'contours').trim();
  if (!id || id.length > 96) throw new Error('contourRequest.id must be non-empty and <= 96 characters');
  const levels = normalizeLevels(request.levels ?? [0.35, 0.5, 0.65]);

  next.contourSource = {
    schema: 'axm.contour-source2d/v0.1',
    id,
    fieldSourceHash: next.fieldSourceHash,
    algorithm: 'bounded-cell-isoline-v0.1',
    levels,
  };
  next.contourSourceHash = hashValue(next.contourSource);
  return {
    state: next,
    evidence: {
      fieldSourceHash: next.fieldSourceHash,
      contourSourceHash: next.contourSourceHash,
      levels: deepClone(levels),
      sourceCodeReuse: 'AXM existing scalar-field sampling contract and hand-runtime hashValue only',
    },
  };
}, 'Normalize a consumer-neutral scalar-field contour treatment source while keeping sampling resolution and rendering outside retained source truth.');

export const buildContourSegmentSetHand = hand('fx.stylize.contour2d-segment-set-build', (state, params = {}) => {
  const next = deepClone(state);
  validateContourSource(next);
  const columns = boundedInteger(params.columns ?? 48, 2, HARD_MAX_AXIS, 'contourSegmentSet.columns');
  const rows = boundedInteger(params.rows ?? 32, 2, HARD_MAX_AXIS, 'contourSegmentSet.rows');
  const maxCellLevelProbes = boundedInteger(params.maxCellLevelProbes ?? HARD_MAX_CELL_LEVEL_PROBES, 4, HARD_MAX_CELL_LEVEL_PROBES, 'contourSegmentSet.maxCellLevelProbes');
  const maxSegments = boundedInteger(params.maxSegments ?? HARD_MAX_SEGMENTS, 1, HARD_MAX_SEGMENTS, 'contourSegmentSet.maxSegments');
  const cellLevelProbes = columns * rows * next.contourSource.levels.length;
  if (cellLevelProbes > maxCellLevelProbes) throw new Error(`contour cell-level probe budget exceeded: ${cellLevelProbes} > ${maxCellLevelProbes}`);

  const segmentSet = buildExpectedSegmentSet(next, columns, rows, maxSegments);
  next.contourSegmentSets ??= {};
  next.contourSegmentSets[next.contourSource.id] = segmentSet;
  return {
    state: next,
    evidence: {
      fieldSourceHash: next.fieldSourceHash,
      contourSourceHash: next.contourSourceHash,
      segmentSetHash: segmentSet.segmentSetHash,
      columns,
      rows,
      levels: segmentSet.levels.length,
      cellLevelProbes,
      segmentCount: segmentSet.segmentCount,
      maxCellLevelProbes,
      maxSegments,
      hardMaxCellLevelProbes: HARD_MAX_CELL_LEVEL_PROBES,
      hardMaxSegments: HARD_MAX_SEGMENTS,
      performanceMeasurement: 'NOT_TESTED',
    },
  };
}, 'Build a bounded rebuildable isoline segment set from retained scalar-field truth and retained contour levels.');

export const realizeContourStaticSvgHand = hand('fx.stylize.contour2d-static-svg-realize', (state, params = {}) => {
  const next = deepClone(state);
  validateContourSource(next);
  const segmentSet = next.contourSegmentSets?.[next.contourSource.id];
  validateSegmentSet(next, segmentSet);

  const width = boundedInteger(params.width ?? 640, 16, 4096, 'contourSvg.width');
  const height = boundedInteger(params.height ?? 420, 16, 4096, 'contourSvg.height');
  const strokeWidth = round6(bounded(params.strokeWidth ?? 1.25, 0.1, 32, 'contourSvg.strokeWidth'));
  const opacity = round6(bounded(params.opacity ?? 0.9, 0, 1, 'contourSvg.opacity'));
  const lines = segmentSet.segments.map((segment) => {
    const x1 = round6(segment.start[0] * width);
    const y1 = round6(segment.start[1] * height);
    const x2 = round6(segment.end[0] * width);
    const y2 = round6(segment.end[1] * height);
    return `<line data-segment="${segment.index}" data-level="${segment.levelIndex}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  }).join('');
  const content = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><g fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}">${lines}</g></svg>`;
  const realization = {
    schema: 'axm.static-svg-realization/v0.1',
    kind: 'field-contours2d',
    sourceHash: next.contourSourceHash,
    fieldSourceHash: next.fieldSourceHash,
    segmentSetHash: segmentSet.segmentSetHash,
    renderer: 'svg-static-inspection',
    width,
    height,
    strokeWidth,
    opacity,
    content,
    artifactHash: hashValue(content),
    derived: true,
    replaceable: true,
  };
  next.realizations ??= {};
  next.realizations.contourStaticSvg = realization;
  return {
    state: next,
    evidence: {
      fieldSourceHash: next.fieldSourceHash,
      contourSourceHash: next.contourSourceHash,
      segmentSetHash: segmentSet.segmentSetHash,
      artifactHash: realization.artifactHash,
      renderer: realization.renderer,
      segmentCount: segmentSet.segmentCount,
      visualQuality: 'NOT_TESTED',
      performanceMeasurement: 'NOT_TESTED',
    },
  };
}, 'Realize a replaceable static SVG inspection view from a validated contour segment set without promoting renderer state into source truth.');

export const CONTOUR_FIELD2D_HANDS = [
  normalizeScalarFieldRequestHand,
  normalizeContourSourceHand,
  buildContourSegmentSetHand,
  realizeContourStaticSvgHand,
];

export const CONTOUR_FIELD2D_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.stylize.field-contours2d-static-svg',
  version: '0.1.0',
  stages: [
    { id: 'normalize-field-source', hand: 'fx.field.fbm-source-normalize', params: {} },
    { id: 'normalize-contour-source', hand: 'fx.stylize.contour2d-source-normalize', params: {} },
    { id: 'build-contour-segment-set', hand: 'fx.stylize.contour2d-segment-set-build', params: { columns: 48, rows: 32, maxCellLevelProbes: HARD_MAX_CELL_LEVEL_PROBES, maxSegments: HARD_MAX_SEGMENTS } },
    { id: 'realize-contour-svg', hand: 'fx.stylize.contour2d-static-svg-realize', params: { width: 640, height: 420, strokeWidth: 1.25, opacity: 0.9 } },
  ],
});

export function makeContourFieldState(options = {}) {
  return {
    schema: 'axm.effect-work-state/v0.1',
    fieldRequest: {
      id: options.fieldId ?? 'contour-field',
      seed: options.seed ?? 1337,
      frequency: options.frequency ?? 3,
      octaves: options.octaves ?? 4,
      lacunarity: options.lacunarity ?? 2,
      gain: options.gain ?? 0.5,
      offset: options.offset ?? [0, 0],
    },
    contourRequest: {
      id: options.id ?? 'contours',
      levels: options.levels ?? [0.35, 0.5, 0.65],
    },
    contourSegmentSets: {},
  };
}
