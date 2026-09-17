import { deepClone, hashValue } from './hand-runtime.mjs';

const round3 = (value) => Number(Number(value).toFixed(3));

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

export function hashDerivedPathSetPayload(pathSet) {
  const payload = deepClone(pathSet);
  delete payload.pathSetHash;
  return hashValue(payload);
}

function validateNormalizedPoint(point, label) {
  if (!point || typeof point !== 'object') throw new Error(`${label} must be an object`);
  const x = finite(point.x, `${label}.x`);
  const y = finite(point.y, `${label}.y`);
  if (x < 0 || x > 1 || y < 0 || y > 1) {
    throw new Error(`${label} must remain inside normalized [0,1] bounds`);
  }
}

export function validateNormalizedPathArray(paths, expectedPathCount, expectedPointCount, label) {
  if (!Array.isArray(paths) || paths.length !== expectedPathCount) {
    throw new Error(`${label} path cardinality mismatch`);
  }
  let pointCount = 0;
  for (let pathIndex = 0; pathIndex < paths.length; pathIndex += 1) {
    const path = paths[pathIndex];
    if (!path || typeof path !== 'object' || !Array.isArray(path.points) || path.points.length < 2) {
      throw new Error(`${label} path ${pathIndex} is malformed`);
    }
    pointCount += path.points.length;
    path.points.forEach((point, pointIndex) => validateNormalizedPoint(point, `${label} path ${pathIndex} point ${pointIndex}`));
  }
  if (pointCount !== expectedPointCount) throw new Error(`${label} point cardinality mismatch`);
}

export function validatePathIdentity(basePaths, derivedPaths, label = 'path SVG') {
  if (basePaths.length !== derivedPaths.length) throw new Error(`${label} path identity cardinality mismatch`);
  for (let index = 0; index < basePaths.length; index += 1) {
    const base = basePaths[index];
    const derived = derivedPaths[index];
    if (String(base.id) !== String(derived.id) || base.points.length !== derived.points.length) {
      throw new Error(`${label} path identity mismatch at index ${index}`);
    }
  }
}

function project(point, width, height, padding) {
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  return {
    x: round3(padding + Number(point.x) * innerWidth),
    y: round3(padding + Number(point.y) * innerHeight),
  };
}

function svgNumber(value) {
  return Number(value).toFixed(3).replace(/\.000$/, '');
}

function pathPolyline(path, layer, width, height, padding) {
  const points = path.points
    .map((point) => {
      const projected = project(point, width, height, padding);
      return `${svgNumber(projected.x)},${svgNumber(projected.y)}`;
    })
    .join(' ');
  return `<polyline data-layer="${layer}" data-path-id="${escapeAttribute(path.id)}" points="${points}"/>`;
}

export function renderDerivedPathSetStaticSvg({
  basePaths,
  pathSet,
  renderer,
  title,
  params = {},
  paramPrefix = 'pathSvg',
}) {
  if (!pathSet || typeof pathSet !== 'object' || !Array.isArray(pathSet.paths)) {
    throw new Error(`${paramPrefix} requires a derived path set`);
  }
  if (typeof renderer !== 'string' || renderer.length === 0) throw new Error(`${paramPrefix}.renderer must be non-empty`);
  if (typeof title !== 'string' || title.length === 0) throw new Error(`${paramPrefix}.title must be non-empty`);

  validateNormalizedPathArray(basePaths, pathSet.pathCount, pathSet.pointCount, `${paramPrefix} base`);
  validateNormalizedPathArray(pathSet.paths, pathSet.pathCount, pathSet.pointCount, `${paramPrefix} derived`);
  validatePathIdentity(basePaths, pathSet.paths, paramPrefix);

  const width = boundedInteger(params.width ?? 640, 64, 4096, `${paramPrefix}.width`);
  const height = boundedInteger(params.height ?? 420, 64, 4096, `${paramPrefix}.height`);
  const padding = bounded(params.padding ?? 20, 0, 512, `${paramPrefix}.padding`);
  if (padding * 2 >= Math.min(width, height)) {
    throw new Error(`${paramPrefix}.padding must leave a positive drawable area`);
  }
  const strokeWidth = bounded(params.strokeWidth ?? 2, 0.25, 16, `${paramPrefix}.strokeWidth`);
  const opacity = bounded(params.opacity ?? 0.92, 0, 1, `${paramPrefix}.opacity`);
  const baseOpacity = bounded(params.baseOpacity ?? 0.3, 0, 1, `${paramPrefix}.baseOpacity`);
  const showBase = params.showBase ?? true;
  if (typeof showBase !== 'boolean') throw new Error(`${paramPrefix}.showBase must be boolean`);
  const maxPoints = boundedInteger(params.maxPoints ?? 4096, 4, 16384, `${paramPrefix}.maxPoints`);
  if (pathSet.pointCount > maxPoints) {
    throw new Error(`${paramPrefix} point budget exceeded: ${pathSet.pointCount} > ${maxPoints}`);
  }

  const baseMarkup = showBase
    ? basePaths.map((path) => pathPolyline(path, 'base', width, height, padding)).join('')
    : '';
  const derivedMarkup = pathSet.paths
    .map((path) => pathPolyline(path, 'derived', width, height, padding))
    .join('');

  const content = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" data-renderer="${escapeAttribute(renderer)}" data-path-set-hash="${escapeAttribute(pathSet.pathSetHash)}"><title>${escapeAttribute(title)}</title><rect width="100%" height="100%" fill="#071018"/>${showBase ? `<g data-layer="base-paths" fill="none" stroke="#7b8794" stroke-opacity="${svgNumber(baseOpacity)}" stroke-width="${svgNumber(strokeWidth)}" stroke-dasharray="4 4" vector-effect="non-scaling-stroke">${baseMarkup}</g>` : ''}<g data-layer="derived-paths" fill="none" stroke="#75e6ff" stroke-opacity="${svgNumber(opacity)}" stroke-width="${svgNumber(strokeWidth)}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke">${derivedMarkup}</g></svg>`;
  const mediaType = 'image/svg+xml';
  const artifactHash = hashValue({ mediaType, renderer, content });

  return {
    mediaType,
    renderer,
    artifactHash,
    content,
    bytes: Buffer.byteLength(content),
    width,
    height,
    padding,
    strokeWidth,
    opacity,
    baseOpacity,
    showBase,
    maxPoints,
  };
}
