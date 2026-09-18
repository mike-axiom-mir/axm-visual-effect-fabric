import { deepClone, hashValue } from './hand-runtime.mjs';
import {
  PATH_SWEEP_PROPAGATION_WEIGHTS_2D_GRAPH,
  PATH_SWEEP_PROPAGATION_WEIGHTS_2D_HANDS,
  makePathSweepPropagationWeightState,
  validatePathSweepPropagationWeightSet,
} from './path-sweep-propagation-weights2d.mjs';

const HARD_MAX_POINTS = 16384;
const HARD_MAX_VERTICES = HARD_MAX_POINTS * 2;
const HARD_MAX_SEGMENTS = HARD_MAX_POINTS - 1;
const HARD_MAX_OUTPUT_POINTS = 98304;
const round6 = (value) => Number(Number(value).toFixed(6));

const FIXED_RENDER_MAPPING = Object.freeze({
  algorithm: 'path-sweep-propagation-static-svg/v0.1',
  geometryInput: 'verified-indexed-strip-triangle-list',
  weightInput: 'verified-neutral-propagation-vertex-scalar',
  segmentWeight: 'mean-adjacent-source-point-weight',
  triangleExpression: 'paired-triangles-share-segment-local-opacity',
  projection: 'normalized-path-position-to-padded-svg',
  fullWeightNoOp: 'omit-local-opacity-attribute-at-weight-1',
  clipping: 'svg-viewport-only',
  interpolationAuthority: 'renderer-local-flat-segment-only',
  styleAuthority: 'replaceable-renderer-only',
  materialAuthority: 'none',
  consumerAuthority: 'none',
  canonicalAuthority: 'none',
});

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

function escapeAttribute(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function svgNumber(value) {
  return Number(value).toFixed(3).replace(/\.000$/, '');
}

function selectionKey(state) {
  const sweepId = state?.pathSweepFrameSource?.id;
  const propagationId = state?.propagationFrontSource?.id;
  if (!sweepId || !propagationId) {
    throw new Error('path sweep propagation SVG requires normalized sweep-frame and propagation source state');
  }
  return `${sweepId}::${propagationId}`;
}

function selectedWeightSet(state) {
  const key = selectionKey(state);
  const set = state?.pathSweepPropagationWeightSets?.[key];
  if (!set) throw new Error(`path sweep propagation SVG requires derived weight set ${key}`);
  return set;
}

function selectedIndexedStripSet(state) {
  const id = state?.pathSweepFrameSource?.id;
  const set = id ? state?.pathSweepIndexedStripSets?.[id] : null;
  if (!set) throw new Error(`path sweep propagation SVG requires derived indexed strip set for source: ${id ?? 'unknown'}`);
  return set;
}

function project(vertex, width, height, padding) {
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  return {
    x: padding + Number(vertex.x) * innerWidth,
    y: padding + Number(vertex.y) * innerHeight,
  };
}

function weightByVertex(weightPath) {
  return new Map(weightPath.vertices.map((vertex) => [vertex.vertexIndex, vertex]));
}

function assertPairedPointWeights(weights, leftIndex, rightIndex, pointIndex, pathId) {
  const left = weights.get(leftIndex);
  const right = weights.get(rightIndex);
  if (!left || !right) throw new Error(`path sweep propagation SVG missing weights for path ${pathId} point ${pointIndex}`);
  if (left.pointIndex !== pointIndex || right.pointIndex !== pointIndex || left.side !== 'left' || right.side !== 'right') {
    throw new Error(`path sweep propagation SVG weight pairing mismatch for path ${pathId} point ${pointIndex}`);
  }
  if (left.weight !== right.weight) {
    throw new Error(`path sweep propagation SVG paired-side weights differ for path ${pathId} point ${pointIndex}`);
  }
  return left.weight;
}

function polygonMarkup(pathId, segmentIndex, triangleIndex, triangle, vertices, width, height, padding, weight) {
  const points = triangle.map((vertexIndex) => {
    const vertex = vertices[vertexIndex];
    if (!vertex) throw new Error(`path sweep propagation SVG triangle references missing vertex ${vertexIndex}`);
    const point = project(vertex, width, height, padding);
    return `${svgNumber(point.x)},${svgNumber(point.y)}`;
  }).join(' ');
  const localOpacity = weight >= 1 ? '' : ` opacity="${svgNumber(weight)}"`;
  return `<polygon data-path-id="${escapeAttribute(pathId)}" data-segment-index="${segmentIndex}" data-triangle-index="${triangleIndex}" points="${points}"${localOpacity}/>`;
}

function renderStripPath(stripPath, weightPath, width, height, padding) {
  if (!weightPath || weightPath.id !== stripPath.id) {
    throw new Error(`path sweep propagation SVG weight path lineage mismatch for ${stripPath.id}`);
  }
  if (weightPath.vertexCount !== stripPath.vertexCount || weightPath.pointCount !== stripPath.pointCount) {
    throw new Error(`path sweep propagation SVG weight cardinality mismatch for ${stripPath.id}`);
  }
  if (stripPath.triangleCount !== Math.max(0, (stripPath.pointCount - 1) * 2)) {
    throw new Error(`path sweep propagation SVG triangle pairing mismatch for ${stripPath.id}`);
  }

  const weights = weightByVertex(weightPath);
  const output = [];
  for (let pointIndex = 0; pointIndex < stripPath.pointCount - 1; pointIndex += 1) {
    const left = pointIndex * 2;
    const right = left + 1;
    const nextLeft = left + 2;
    const nextRight = left + 3;
    const startWeight = assertPairedPointWeights(weights, left, right, pointIndex, stripPath.id);
    const endWeight = assertPairedPointWeights(weights, nextLeft, nextRight, pointIndex + 1, stripPath.id);
    const segmentWeight = round6((Number(startWeight) + Number(endWeight)) / 2);
    const firstTriangleIndex = pointIndex * 2;
    const first = stripPath.triangles[firstTriangleIndex];
    const second = stripPath.triangles[firstTriangleIndex + 1];
    if (!first || !second) throw new Error(`path sweep propagation SVG missing triangle pair for ${stripPath.id} segment ${pointIndex}`);
    output.push(polygonMarkup(stripPath.id, pointIndex, firstTriangleIndex, first, stripPath.vertices, width, height, padding, segmentWeight));
    output.push(polygonMarkup(stripPath.id, pointIndex, firstTriangleIndex + 1, second, stripPath.vertices, width, height, padding, segmentWeight));
  }
  return output.join('');
}

export const realizePathSweepPropagationStaticSvgHand = hand('fx.geometry.path-sweep-propagation-static-svg-realize', (state, params = {}) => {
  const next = deepClone(state);
  const weightSet = selectedWeightSet(next);
  const indexedStripSet = selectedIndexedStripSet(next);
  const maxPoints = boundedInteger(params.maxPoints ?? 4096, 2, HARD_MAX_POINTS, 'pathSweepPropagationSvg.maxPoints');
  const maxVertices = boundedInteger(params.maxVertices ?? 8192, 4, HARD_MAX_VERTICES, 'pathSweepPropagationSvg.maxVertices');
  const maxSegments = boundedInteger(params.maxSegments ?? 4096, 1, HARD_MAX_SEGMENTS, 'pathSweepPropagationSvg.maxSegments');
  const maxOutputPoints = boundedInteger(
    params.maxOutputPoints ?? 24576,
    6,
    HARD_MAX_OUTPUT_POINTS,
    'pathSweepPropagationSvg.maxOutputPoints',
  );

  // Rebuild every upstream derived layer from retained path, sweep and
  // propagation truth before renderer-local expression is allowed. Rehashed
  // derived state is intentionally insufficient evidence.
  validatePathSweepPropagationWeightSet(next, weightSet, { maxPoints, maxVertices });
  if (indexedStripSet.indexedStripSetHash !== weightSet.indexedStripSetHash) {
    throw new Error('path sweep propagation SVG indexed-strip lineage mismatch');
  }

  const segmentCount = indexedStripSet.pointCount - indexedStripSet.pathCount;
  const outputPointCount = indexedStripSet.triangleCount * 3;
  if (segmentCount > maxSegments) {
    throw new Error(`path sweep propagation SVG segment budget exceeded: ${segmentCount} > ${maxSegments}`);
  }
  if (outputPointCount > maxOutputPoints) {
    throw new Error(`path sweep propagation SVG output-point budget exceeded: ${outputPointCount} > ${maxOutputPoints}`);
  }

  const width = boundedInteger(params.width ?? 640, 64, 4096, 'pathSweepPropagationSvg.width');
  const height = boundedInteger(params.height ?? 420, 64, 4096, 'pathSweepPropagationSvg.height');
  const padding = bounded(params.padding ?? 20, 0, 512, 'pathSweepPropagationSvg.padding');
  if (padding * 2 >= Math.min(width, height)) {
    throw new Error('pathSweepPropagationSvg.padding must leave a positive drawable area');
  }
  const fillOpacity = bounded(params.fillOpacity ?? 0.92, 0, 1, 'pathSweepPropagationSvg.fillOpacity');

  const weightsByPath = new Map(weightSet.paths.map((path) => [path.id, path]));
  const polygons = indexedStripSet.paths.map((path) => renderStripPath(
    path,
    weightsByPath.get(path.id),
    width,
    height,
    padding,
  )).join('');

  const renderer = 'axm.vfx.path-sweep-propagation-static-svg/v0.1';
  const content = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" data-renderer="${renderer}" data-indexed-strip-set-hash="${escapeAttribute(indexedStripSet.indexedStripSetHash)}" data-weight-set-hash="${escapeAttribute(weightSet.weightSetHash)}"><title>AXM path-sweep propagation weight inspection</title><g data-layer="path-sweep-propagation" fill="#75e6ff" fill-opacity="${svgNumber(fillOpacity)}">${polygons}</g></svg>`;

  const renderControls = {
    width,
    height,
    padding,
    fillOpacity,
    maxPoints,
    maxVertices,
    maxSegments,
    maxOutputPoints,
  };
  const realization = {
    schema: 'axm.vfx.path-sweep-propagation-static-svg/v0.1',
    mediaType: 'image/svg+xml',
    renderer,
    rendererMapping: deepClone(FIXED_RENDER_MAPPING),
    pathSourceHash: weightSet.pathSourceHash,
    sweepSourceHash: weightSet.sweepSourceHash,
    frameSetHash: weightSet.frameSetHash,
    ribbonSetHash: weightSet.ribbonSetHash,
    indexedStripSetHash: weightSet.indexedStripSetHash,
    propagationSourceHash: weightSet.propagationSourceHash,
    weightSetHash: weightSet.weightSetHash,
    phase: weightSet.phase,
    pathCount: indexedStripSet.pathCount,
    segmentCount,
    triangleCount: indexedStripSet.triangleCount,
    outputPointCount,
    renderControls,
    derivedFromStateHash: hashValue({
      pathSourceHash: weightSet.pathSourceHash,
      sweepSourceHash: weightSet.sweepSourceHash,
      frameSetHash: weightSet.frameSetHash,
      ribbonSetHash: weightSet.ribbonSetHash,
      indexedStripSetHash: weightSet.indexedStripSetHash,
      propagationSourceHash: weightSet.propagationSourceHash,
      weightSetHash: weightSet.weightSetHash,
      phase: weightSet.phase,
      rendererMapping: FIXED_RENDER_MAPPING,
      renderControls,
    }),
    content,
    derived: true,
    replaceable: true,
  };
  realization.contentHash = hashValue(content);

  next.realizations ??= {};
  next.realizations.pathSweepPropagationStaticSvg = realization;

  return {
    state: next,
    evidence: {
      renderer,
      pathSourceHash: realization.pathSourceHash,
      sweepSourceHash: realization.sweepSourceHash,
      indexedStripSetHash: realization.indexedStripSetHash,
      propagationSourceHash: realization.propagationSourceHash,
      weightSetHash: realization.weightSetHash,
      phase: realization.phase,
      pathCount: realization.pathCount,
      segmentCount,
      triangleCount: realization.triangleCount,
      outputPointCount,
      contentHash: realization.contentHash,
      bytes: Buffer.byteLength(content),
      rendererExpression: FIXED_RENDER_MAPPING.triangleExpression,
      rendererReplaceable: true,
      canonicalStateChanged: false,
      materialAuthorityAdded: false,
      consumerMeaningAssigned: false,
      externalSourceCodeReuse: 'none',
      performanceMeasurement: 'NOT_TESTED',
      visualInspection: 'NOT_TESTED',
      targetDevicePerformance: 'NOT_TESTED',
    },
  };
}, 'Render one source-verified path-sweep propagation weight set as a bounded replaceable SVG triangle strip, mapping neutral weights only into renderer-local flat segment opacity without assigning material or consumer meaning.');

export const PATH_SWEEP_PROPAGATION_STATIC_SVG_HANDS = [
  ...PATH_SWEEP_PROPAGATION_WEIGHTS_2D_HANDS,
  realizePathSweepPropagationStaticSvgHand,
];

export function makePathSweepPropagationStaticSvgGraph(params = {}) {
  const maxPoints = params.maxPoints ?? 4096;
  const maxVertices = params.maxVertices ?? 8192;
  const phase = params.phase ?? 0.5;
  const baseStages = PATH_SWEEP_PROPAGATION_WEIGHTS_2D_GRAPH.stages.map((stage) => {
    if (stage.id !== 'build-path-sweep-propagation-weight-set') return deepClone(stage);
    return {
      ...deepClone(stage),
      params: { phase, maxPoints, maxVertices },
    };
  });

  return {
    schema: 'axm.hand-graph/v0.1',
    id: 'fx.geometry.path-sweep-propagation-static-svg',
    version: '0.1.0',
    stages: [
      ...baseStages,
      {
        id: 'realize-path-sweep-propagation-static-svg',
        hand: realizePathSweepPropagationStaticSvgHand.id,
        params: {
          width: params.width ?? 640,
          height: params.height ?? 420,
          padding: params.padding ?? 20,
          fillOpacity: params.fillOpacity ?? 0.92,
          maxPoints,
          maxVertices,
          maxSegments: params.maxSegments ?? 4096,
          maxOutputPoints: params.maxOutputPoints ?? 24576,
        },
      },
    ],
  };
}

export function makePathSweepPropagationStaticSvgState(paths, options = {}) {
  return makePathSweepPropagationWeightState(paths, options);
}

export const PATH_SWEEP_PROPAGATION_STATIC_SVG_RENDER_MAPPING = FIXED_RENDER_MAPPING;
