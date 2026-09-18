import { deepClone, hashValue } from './hand-runtime.mjs';
import {
  PATH_FRAME_INSTANCES_2D_GRAPH,
  PATH_FRAME_INSTANCES_2D_HANDS,
  validatePathFrameInstanceTransformSet,
} from './path-frame-instances2d.mjs';

const HARD_MAX_POINTS = 16384;
const HARD_MAX_INSTANCES = 16384;
const MAX_PROTOTYPE_POINTS = 32;
const HARD_MAX_OUTPUT_POINTS = 524288;
const EPSILON = 1e-12;

const FIXED_RENDER_MAPPING = Object.freeze({
  algorithm: 'path-frame-instance-static-svg/v0.1',
  translationProjection: 'normalized-path-position-to-padded-svg',
  basisProjection: 'axis-scaled-then-independently-unit-normalized',
  prototypeContract: 'caller-supplied-local-polyline',
  prototypeBinding: 'renderer-only-external',
  prototypeScale: 'marker-size-pixels',
  styleAuthority: 'replaceable-renderer-only',
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

function nonEmptyText(value, maxLength, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  if (value.length > maxLength) throw new Error(`${label} must be at most ${maxLength} characters`);
  return value;
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

function selectedInstanceSet(state) {
  const id = state?.pathSweepFrameSource?.id;
  if (!id) throw new Error('path frame instance SVG requires normalized sweep-frame source state');
  const set = state?.pathFrameInstanceTransformSets?.[id];
  if (!set) throw new Error(`path frame instance SVG requires derived transform set for source: ${id}`);
  return set;
}

function normalizePrototype(params) {
  const id = nonEmptyText(params.prototypeId, 128, 'pathFrameInstanceSvg.prototypeId');
  const provenance = nonEmptyText(
    params.prototypeProvenance,
    256,
    'pathFrameInstanceSvg.prototypeProvenance',
  );
  if (!Array.isArray(params.prototypePoints)) {
    throw new Error('pathFrameInstanceSvg.prototypePoints must be an array');
  }
  if (params.prototypePoints.length < 2 || params.prototypePoints.length > MAX_PROTOTYPE_POINTS) {
    throw new Error(`pathFrameInstanceSvg.prototypePoints must contain 2..${MAX_PROTOTYPE_POINTS} points`);
  }
  const points = params.prototypePoints.map((point, index) => {
    if (!point || typeof point !== 'object') {
      throw new Error(`pathFrameInstanceSvg.prototypePoints[${index}] must be an object`);
    }
    const x = bounded(point.x, -4, 4, `pathFrameInstanceSvg.prototypePoints[${index}].x`);
    const y = bounded(point.y, -4, 4, `pathFrameInstanceSvg.prototypePoints[${index}].y`);
    return { x, y };
  });
  const descriptor = {
    id,
    points,
    provenance,
    provenanceStatus: 'CALLER_DECLARED_NOT_VERIFIED_BY_HAND',
    canonical: false,
    rendererOnly: true,
  };
  descriptor.prototypeHash = hashValue({ id, points, provenance });
  return descriptor;
}

function projectionContext(width, height, padding) {
  return {
    innerWidth: width - padding * 2,
    innerHeight: height - padding * 2,
  };
}

function projectTranslation(translation, width, height, padding) {
  const { innerWidth, innerHeight } = projectionContext(width, height, padding);
  return {
    x: padding + Number(translation.x) * innerWidth,
    y: padding + Number(translation.y) * innerHeight,
  };
}

function projectBasis(basis, width, height, padding, label) {
  const { innerWidth, innerHeight } = projectionContext(width, height, padding);
  const x = Number(basis.x) * innerWidth;
  const y = Number(basis.y) * innerHeight;
  const length = Math.hypot(x, y);
  if (!Number.isFinite(length) || length <= EPSILON) {
    throw new Error(`${label} cannot project to a zero-length SVG basis`);
  }
  return { x: x / length, y: y / length };
}

function projectPrototype(instance, prototype, width, height, padding, markerSize, label) {
  const translation = projectTranslation(instance.translation, width, height, padding);
  const basisX = projectBasis(instance.basisX, width, height, padding, `${label}.basisX`);
  const basisY = projectBasis(instance.basisY, width, height, padding, `${label}.basisY`);
  return prototype.points.map((point) => ({
    x: translation.x + markerSize * (point.x * basisX.x + point.y * basisY.x),
    y: translation.y + markerSize * (point.x * basisX.y + point.y * basisY.y),
  }));
}

function markerPolyline(path, instance, prototype, width, height, padding, markerSize, strokeWidth, opacity) {
  const points = projectPrototype(
    instance,
    prototype,
    width,
    height,
    padding,
    markerSize,
    `path ${path.id} frame ${instance.frameIndex}`,
  ).map((point) => `${svgNumber(point.x)},${svgNumber(point.y)}`).join(' ');

  return `<polyline data-path-id="${escapeAttribute(path.id)}" data-frame-index="${instance.frameIndex}" points="${points}" fill="none" stroke="#75e6ff" stroke-opacity="${svgNumber(opacity)}" stroke-width="${svgNumber(strokeWidth)}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`;
}

export const realizePathFrameInstancesStaticSvgHand = hand('fx.geometry.path-frame-instances2d-static-svg-realize', (state, params = {}) => {
  const next = deepClone(state);
  const selected = selectedInstanceSet(next);
  const maxPoints = boundedInteger(params.maxPoints ?? 4096, 2, HARD_MAX_POINTS, 'pathFrameInstanceSvg.maxPoints');
  const maxInstances = boundedInteger(params.maxInstances ?? 4096, 1, HARD_MAX_INSTANCES, 'pathFrameInstanceSvg.maxInstances');
  const maxOutputPoints = boundedInteger(
    params.maxOutputPoints ?? 65536,
    2,
    HARD_MAX_OUTPUT_POINTS,
    'pathFrameInstanceSvg.maxOutputPoints',
  );

  // Rebuild the selected transform set from retained path + sweep truth before
  // any renderer-only prototype is allowed to consume it. Hash consistency on
  // derived transforms is intentionally insufficient.
  validatePathFrameInstanceTransformSet(next, selected, { maxPoints, maxInstances });

  const prototype = normalizePrototype(params);
  const outputPointCount = selected.instanceCount * prototype.points.length;
  if (outputPointCount > maxOutputPoints) {
    throw new Error(`path frame instance SVG output-point budget exceeded: ${outputPointCount} > ${maxOutputPoints}`);
  }

  const width = boundedInteger(params.width ?? 640, 64, 4096, 'pathFrameInstanceSvg.width');
  const height = boundedInteger(params.height ?? 420, 64, 4096, 'pathFrameInstanceSvg.height');
  const padding = bounded(params.padding ?? 20, 0, 512, 'pathFrameInstanceSvg.padding');
  if (padding * 2 >= Math.min(width, height)) {
    throw new Error('pathFrameInstanceSvg.padding must leave a positive drawable area');
  }
  const markerSize = bounded(params.markerSize ?? 7, 0.25, 128, 'pathFrameInstanceSvg.markerSize');
  const strokeWidth = bounded(params.strokeWidth ?? 1.5, 0.25, 16, 'pathFrameInstanceSvg.strokeWidth');
  const opacity = bounded(params.opacity ?? 0.92, 0, 1, 'pathFrameInstanceSvg.opacity');

  const markerMarkup = selected.paths.flatMap((path) => path.instances.map((instance) => markerPolyline(
    path,
    instance,
    prototype,
    width,
    height,
    padding,
    markerSize,
    strokeWidth,
    opacity,
  ))).join('');

  const renderer = 'axm.vfx.path-frame-instance-static-svg/v0.1';
  const content = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" data-renderer="${renderer}" data-instance-set-hash="${escapeAttribute(selected.instanceSetHash)}" data-prototype-hash="${escapeAttribute(prototype.prototypeHash)}"><title>AXM path-frame instance transform inspection</title><rect width="100%" height="100%" fill="#071018"/><g data-layer="path-frame-instances">${markerMarkup}</g></svg>`;

  const renderControls = {
    width,
    height,
    padding,
    markerSize,
    strokeWidth,
    opacity,
    maxPoints,
    maxInstances,
    maxOutputPoints,
  };
  const realization = {
    schema: 'axm.vfx.path-frame-instance-static-svg/v0.1',
    mediaType: 'image/svg+xml',
    renderer,
    rendererMapping: deepClone(FIXED_RENDER_MAPPING),
    pathSourceHash: selected.pathSourceHash,
    sweepSourceHash: selected.sweepSourceHash,
    frameSetHash: selected.frameSetHash,
    instanceSetHash: selected.instanceSetHash,
    instanceCount: selected.instanceCount,
    outputPointCount,
    prototype,
    renderControls,
    derivedFromStateHash: hashValue({
      pathSourceHash: selected.pathSourceHash,
      sweepSourceHash: selected.sweepSourceHash,
      frameSetHash: selected.frameSetHash,
      instanceSetHash: selected.instanceSetHash,
      prototype,
      rendererMapping: FIXED_RENDER_MAPPING,
      renderControls,
    }),
    content,
    derived: true,
    replaceable: true,
  };
  realization.contentHash = hashValue(content);

  next.realizations ??= {};
  next.realizations.pathFrameInstancesStaticSvg = realization;

  return {
    state: next,
    evidence: {
      renderer,
      pathSourceHash: realization.pathSourceHash,
      sweepSourceHash: realization.sweepSourceHash,
      frameSetHash: realization.frameSetHash,
      instanceSetHash: realization.instanceSetHash,
      prototypeId: prototype.id,
      prototypeHash: prototype.prototypeHash,
      prototypePointCount: prototype.points.length,
      prototypeProvenance: prototype.provenance,
      prototypeProvenanceStatus: prototype.provenanceStatus,
      instanceCount: selected.instanceCount,
      outputPointCount,
      contentHash: realization.contentHash,
      bytes: Buffer.byteLength(content),
      maxPoints,
      maxInstances,
      maxOutputPoints,
      externalSourceCodeReuse: 'none',
      rendererReplaceable: true,
      canonicalStateChanged: false,
      prototypeCanonicalized: false,
      performanceMeasurement: 'NOT_TESTED',
      visualInspection: 'NOT_TESTED',
      targetDevicePerformance: 'NOT_TESTED',
    },
  };
}, 'Render source-verified 2D path-frame instance transforms as a bounded static SVG using only a caller-supplied renderer-local polyline prototype, without promoting SVG or prototype geometry into canonical effect truth.');

export const PATH_FRAME_INSTANCE_STATIC_SVG_HANDS = [
  ...PATH_FRAME_INSTANCES_2D_HANDS,
  realizePathFrameInstancesStaticSvgHand,
];

export function makePathFrameInstanceStaticSvgGraph(params = {}) {
  const maxPoints = params.maxPoints ?? 4096;
  const maxInstances = params.maxInstances ?? 4096;
  const stride = params.stride ?? 1;
  const baseStages = PATH_FRAME_INSTANCES_2D_GRAPH.stages.map((stage, index) => {
    if (index !== PATH_FRAME_INSTANCES_2D_GRAPH.stages.length - 1) return deepClone(stage);
    return {
      ...deepClone(stage),
      params: { maxPoints, maxInstances, stride },
    };
  });

  return {
    schema: 'axm.hand-graph/v0.1',
    id: 'fx.geometry.path-frame-instances2d-static-svg',
    version: '0.1.0',
    stages: [
      ...baseStages,
      {
        id: 'realize-path-frame-instance-static-svg',
        hand: realizePathFrameInstancesStaticSvgHand.id,
        params: {
          prototypeId: params.prototypeId,
          prototypePoints: params.prototypePoints === undefined ? undefined : deepClone(params.prototypePoints),
          prototypeProvenance: params.prototypeProvenance,
          width: params.width ?? 640,
          height: params.height ?? 420,
          padding: params.padding ?? 20,
          markerSize: params.markerSize ?? 7,
          strokeWidth: params.strokeWidth ?? 1.5,
          opacity: params.opacity ?? 0.92,
          maxPoints,
          maxInstances,
          maxOutputPoints: params.maxOutputPoints ?? 65536,
        },
      },
    ],
  };
}

export const PATH_FRAME_INSTANCE_STATIC_SVG_RENDER_MAPPING = FIXED_RENDER_MAPPING;
