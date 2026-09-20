import { deepClone, hashValue } from './hand-runtime.mjs';
import { normalizeScalarFieldRequestHand } from './field-operators.mjs';
import { normalizeCellularFieldRequestHand } from './cellular-field2d.mjs';
import {
  makeCoverageMaskState,
  makeCellularCoverageMaskState,
  normalizeCoverageMaskRequestHand,
  sampleCoverageSource,
} from './field-mask-operators.mjs';

const TAU = Math.PI * 2;
const EPSILON = 1e-12;
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

function explicitHexColor(value, label) {
  const color = String(value ?? '').trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error(`${label} must be a #RRGGBB color`);
  return color.toLowerCase();
}

function lightPresentationMode(value) {
  const mode = String(value ?? 'line-inspection').trim();
  if (!['line-inspection', 'volumetric-light'].includes(mode)) {
    throw new Error('lightRaySvg.presentationMode must be line-inspection or volumetric-light');
  }
  return mode;
}

function normalizedTurns(value, label) {
  const turns = finite(value, label);
  return round6(((turns % 1) + 1) % 1);
}

function retainedScalarBindings(next) {
  const bindings = [];
  if (next.fieldSource && next.fieldSourceHash) {
    bindings.push({ kind: 'fbm', source: next.fieldSource, hash: next.fieldSourceHash });
  }
  if (next.cellularFieldSource && next.cellularFieldSourceHash) {
    bindings.push({ kind: 'cellular', source: next.cellularFieldSource, hash: next.cellularFieldSourceHash });
  }
  return bindings;
}

function validateBaseLineage(next) {
  if (!next.coverageMaskSource || !next.coverageMaskSourceHash) {
    throw new Error('mask-guided light rays require normalized coverage mask source');
  }
  if (hashValue(next.coverageMaskSource) !== next.coverageMaskSourceHash) {
    throw new Error('coverage mask source state hash mismatch');
  }

  const matches = retainedScalarBindings(next).filter((binding) => (
    binding.hash === next.coverageMaskSource.fieldSourceHash
    && binding.source?.id === next.coverageMaskSource.fieldId
  ));
  if (matches.length === 0) {
    throw new Error('mask-guided light rays require the retained scalar source referenced by the coverage mask');
  }
  if (matches.length > 1) throw new Error('mask-guided light ray scalar lineage is ambiguous');

  const binding = matches[0];
  if (hashValue(binding.source) !== binding.hash) {
    throw new Error(`${binding.kind} scalar field source state hash mismatch`);
  }

  // sampleCoverageSource performs the shared scalar-schema/algorithm validation as well as lineage validation.
  sampleCoverageSource(binding.source, next.coverageMaskSource, 0.5, 0.5);
  return binding;
}

function maxDistanceInsideUnitSquare(origin, dx, dy) {
  const distances = [];
  if (dx > EPSILON) distances.push((1 - origin[0]) / dx);
  else if (dx < -EPSILON) distances.push((0 - origin[0]) / dx);
  if (dy > EPSILON) distances.push((1 - origin[1]) / dy);
  else if (dy < -EPSILON) distances.push((0 - origin[1]) / dy);
  const positive = distances.filter((distance) => Number.isFinite(distance) && distance >= 0);
  if (positive.length === 0) return 0;
  return Math.min(...positive);
}

function raySetHashPayload(raySet) {
  return {
    schema: raySet.schema,
    raySourceHash: raySet.raySourceHash,
    fieldSourceHash: raySet.fieldSourceHash,
    maskSourceHash: raySet.maskSourceHash,
    rayCount: raySet.rayCount,
    samplesPerRay: raySet.samplesPerRay,
    rays: raySet.rays,
  };
}

function deriveRaySet(next, binding, rayCount, samplesPerRay) {
  const source = next.lightRaySource;
  const rays = [];
  for (let index = 0; index < rayCount; index += 1) {
    const centeredFraction = rayCount === 1 ? 0 : ((index + 0.5) / rayCount) - 0.5;
    const angleTurns = normalizedTurns(source.directionTurns + source.spanTurns * centeredFraction, `light ray ${index}.angleTurns`);
    const angle = angleTurns * TAU;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const length = Math.min(source.maxLength, maxDistanceInsideUnitSquare(source.origin, dx, dy));
    const coverage = [];

    for (let sampleIndex = 0; sampleIndex < samplesPerRay; sampleIndex += 1) {
      const fraction = sampleIndex / (samplesPerRay - 1);
      const distance = length * fraction;
      const u = Math.max(0, Math.min(1, source.origin[0] + dx * distance));
      const v = Math.max(0, Math.min(1, source.origin[1] + dy * distance));
      coverage.push(sampleCoverageSource(binding.source, next.coverageMaskSource, u, v));
    }

    const coverageMean = round6(coverage.reduce((sum, value) => sum + value, 0) / coverage.length);
    const end = [
      round6(Math.max(0, Math.min(1, source.origin[0] + dx * length))),
      round6(Math.max(0, Math.min(1, source.origin[1] + dy * length))),
    ];
    rays.push({
      id: `${source.id}:${index}`,
      index,
      angleTurns,
      start: deepClone(source.origin),
      end,
      length: round6(length),
      coverageMean,
      coverageMin: round6(Math.min(...coverage)),
      coverageMax: round6(Math.max(...coverage)),
      weight: round6(Math.pow(coverageMean, source.weightPower)),
    });
  }

  const raySet = {
    schema: 'axm.mask-guided-light-ray-set/v0.1',
    raySourceHash: next.lightRaySourceHash,
    fieldSourceHash: binding.hash,
    maskSourceHash: next.coverageMaskSourceHash,
    rayCount,
    samplesPerRay,
    rays,
    derived: true,
    rebuildable: true,
  };
  raySet.raySetHash = hashValue(raySetHashPayload(raySet));
  return raySet;
}

function validateRaySet(next, raySet) {
  const binding = validateBaseLineage(next);
  if (!next.lightRaySource || !next.lightRaySourceHash) {
    throw new Error('mask-guided light ray realization requires normalized ray source');
  }
  if (hashValue(next.lightRaySource) !== next.lightRaySourceHash) {
    throw new Error('light ray source state hash mismatch');
  }
  if (!raySet || raySet.schema !== 'axm.mask-guided-light-ray-set/v0.1') {
    throw new Error('mask-guided light ray realization requires a derived ray set');
  }
  if (raySet.raySourceHash !== next.lightRaySourceHash) {
    throw new Error('light ray set source lineage mismatch');
  }
  if (raySet.fieldSourceHash !== binding.hash || raySet.maskSourceHash !== next.coverageMaskSourceHash) {
    throw new Error('light ray set field/mask lineage mismatch');
  }
  if (raySet.derived !== true || raySet.rebuildable !== true) {
    throw new Error('light ray set must remain derived and rebuildable');
  }
  const rayCount = boundedInteger(raySet.rayCount, 1, 256, 'lightRaySet.rayCount');
  const samplesPerRay = boundedInteger(raySet.samplesPerRay, 2, 128, 'lightRaySet.samplesPerRay');
  if (rayCount * samplesPerRay > 32768) throw new Error('light ray set exceeds hard sample ceiling');
  if (!Array.isArray(raySet.rays) || raySet.rays.length !== rayCount) {
    throw new Error('light ray set cardinality mismatch');
  }
  if (hashValue(raySetHashPayload(raySet)) !== raySet.raySetHash) {
    throw new Error('light ray set hash mismatch');
  }

  for (let index = 0; index < raySet.rays.length; index += 1) {
    const ray = raySet.rays[index];
    if (!ray || ray.index !== index || ray.id !== `${next.lightRaySource.id}:${index}`) {
      throw new Error(`light ray ${index} identity mismatch`);
    }
    if (!Array.isArray(ray.start) || ray.start.length !== 2 || !Array.isArray(ray.end) || ray.end.length !== 2) {
      throw new Error(`light ray ${index} endpoints must be 2D coordinates`);
    }
    for (const value of [...ray.start, ...ray.end]) bounded(value, 0, 1, `light ray ${index} coordinate`);
    bounded(ray.weight, 0, 1, `light ray ${index}.weight`);
    bounded(ray.coverageMean, 0, 1, `light ray ${index}.coverageMean`);
    bounded(ray.coverageMin, 0, 1, `light ray ${index}.coverageMin`);
    bounded(ray.coverageMax, 0, 1, `light ray ${index}.coverageMax`);
    if (ray.coverageMin > ray.coverageMean || ray.coverageMean > ray.coverageMax) {
      throw new Error(`light ray ${index} coverage statistics are inconsistent`);
    }
  }

  const rebuilt = deriveRaySet(next, binding, rayCount, samplesPerRay);
  if (rebuilt.raySetHash !== raySet.raySetHash) {
    throw new Error('light ray set does not rebuild from retained source truth');
  }
  return binding;
}

export const normalizeMaskGuidedLightRaySourceHand = hand('fx.light.mask-guided-ray-source-normalize', (state) => {
  const next = deepClone(state);
  const binding = validateBaseLineage(next);
  const request = next.lightRayRequest;
  if (!request || typeof request !== 'object') throw new Error('mask-guided light rays require lightRayRequest state');

  const id = String(request.id ?? 'mask-guided-light-rays').trim();
  if (!id) throw new Error('lightRayRequest.id must be non-empty');
  const origin = request.origin ?? [0.5, 0.5];
  if (!Array.isArray(origin) || origin.length !== 2) throw new Error('lightRayRequest.origin must contain two coordinates');

  next.lightRaySource = {
    schema: 'axm.mask-guided-light-ray-source/v0.1',
    id,
    fieldSourceHash: binding.hash,
    maskSourceHash: next.coverageMaskSourceHash,
    origin: [
      round6(bounded(origin[0], 0, 1, 'lightRayRequest.origin[0]')),
      round6(bounded(origin[1], 0, 1, 'lightRayRequest.origin[1]')),
    ],
    directionTurns: normalizedTurns(request.directionTurns ?? 0, 'lightRayRequest.directionTurns'),
    spanTurns: round6(bounded(request.spanTurns ?? 0.25, 0, 1, 'lightRayRequest.spanTurns')),
    maxLength: round6(bounded(request.maxLength ?? 1.25, 0.001, 2, 'lightRayRequest.maxLength')),
    weightPower: round6(bounded(request.weightPower ?? 1, 0.25, 4, 'lightRayRequest.weightPower')),
  };
  next.lightRaySourceHash = hashValue(next.lightRaySource);

  return {
    state: next,
    evidence: {
      fieldSourceKind: binding.kind,
      fieldSourceHash: binding.hash,
      maskSourceHash: next.coverageMaskSourceHash,
      lightRaySourceHash: next.lightRaySourceHash,
      origin: next.lightRaySource.origin,
      directionTurns: next.lightRaySource.directionTurns,
      spanTurns: next.lightRaySource.spanTurns,
      maxLength: next.lightRaySource.maxLength,
      weightPower: next.lightRaySource.weightPower,
    },
  };
}, 'Normalize a consumer-neutral 2D light-ray source that references retained supported scalar-field and coverage-mask truth without choosing a renderer or working-set density.');

export const buildMaskGuidedLightRaySetHand = hand('fx.light.mask-guided-ray-set-build', (state, params = {}) => {
  const next = deepClone(state);
  const binding = validateBaseLineage(next);
  if (!next.lightRaySource || !next.lightRaySourceHash) throw new Error('mask-guided-ray-set-build requires normalized ray source');
  if (hashValue(next.lightRaySource) !== next.lightRaySourceHash) throw new Error('light ray source state hash mismatch');
  if (next.lightRaySource.fieldSourceHash !== binding.hash || next.lightRaySource.maskSourceHash !== next.coverageMaskSourceHash) {
    throw new Error('light ray source field/mask lineage mismatch');
  }

  const rayCount = boundedInteger(params.rayCount ?? 64, 1, 256, 'lightRaySet.rayCount');
  const samplesPerRay = boundedInteger(params.samplesPerRay ?? 24, 2, 128, 'lightRaySet.samplesPerRay');
  const maxRays = boundedInteger(params.maxRays ?? 256, 1, 256, 'lightRaySet.maxRays');
  const maxSamples = boundedInteger(params.maxSamples ?? 32768, 2, 32768, 'lightRaySet.maxSamples');
  if (rayCount > maxRays) throw new Error(`light ray count budget exceeded: ${rayCount} > ${maxRays}`);
  const totalSamples = rayCount * samplesPerRay;
  if (totalSamples > maxSamples) throw new Error(`light ray sample budget exceeded: ${totalSamples} > ${maxSamples}`);

  const raySet = deriveRaySet(next, binding, rayCount, samplesPerRay);
  next.lightRaySets ??= {};
  next.lightRaySets[next.lightRaySource.id] = raySet;

  return {
    state: next,
    evidence: {
      fieldSourceKind: binding.kind,
      fieldSourceHash: binding.hash,
      maskSourceHash: next.coverageMaskSourceHash,
      lightRaySourceHash: next.lightRaySourceHash,
      raySetHash: raySet.raySetHash,
      rays: rayCount,
      samplesPerRay,
      totalSamples,
      maxRays,
      maxSamples,
      performanceMeasurement: 'NOT_TESTED',
    },
  };
}, 'Build a bounded rebuildable 2D ray working set whose renderer-neutral weights are derived from retained supported coverage-mask samples.');

export const realizeMaskGuidedLightRaysStaticSvgHand = hand('fx.light.mask-guided-rays-static-svg-realize', (state, params = {}) => {
  const next = deepClone(state);
  if (!next.lightRaySource || !next.lightRaySourceHash) throw new Error('mask-guided-rays-static-svg-realize requires normalized ray source');
  const raySet = next.lightRaySets?.[next.lightRaySource.id];
  const binding = validateRaySet(next, raySet);

  const width = boundedInteger(params.width ?? 640, 16, 4096, 'lightRaySvg.width');
  const height = boundedInteger(params.height ?? 420, 16, 4096, 'lightRaySvg.height');
  const strokeWidth = round6(bounded(params.strokeWidth ?? 1.5, 0.1, 16, 'lightRaySvg.strokeWidth'));
  const minOpacity = round6(bounded(params.minOpacity ?? 0, 0, 1, 'lightRaySvg.minOpacity'));
  const maxOpacity = round6(bounded(params.maxOpacity ?? 0.85, 0, 1, 'lightRaySvg.maxOpacity'));
  if (maxOpacity < minOpacity) throw new Error('lightRaySvg.maxOpacity must be >= minOpacity');
  const strokeColor = explicitHexColor(params.strokeColor ?? '#69d7ff', 'lightRaySvg.strokeColor');
  const presentationMode = lightPresentationMode(params.presentationMode);
  const hazeWidthMultiplier = round6(bounded(params.hazeWidthMultiplier ?? 5, 1, 24, 'lightRaySvg.hazeWidthMultiplier'));
  const beamWidthMultiplier = round6(bounded(params.beamWidthMultiplier ?? 1.8, 1, 12, 'lightRaySvg.beamWidthMultiplier'));
  const hazeBlur = round6(bounded(params.hazeBlur ?? 7, 0, 32, 'lightRaySvg.hazeBlur'));
  const beamThreshold = round6(bounded(params.beamThreshold ?? 0.5, 0, 0.95, 'lightRaySvg.beamThreshold'));
  const coreThreshold = round6(bounded(params.coreThreshold ?? 0.7, 0, 0.95, 'lightRaySvg.coreThreshold'));
  if (coreThreshold < beamThreshold) throw new Error('lightRaySvg.coreThreshold must be >= lightRaySvg.beamThreshold');
  const tipOpacity = round6(bounded(params.tipOpacity ?? 0, 0, 0.5, 'lightRaySvg.tipOpacity'));
  const originGlowRadius = round6(bounded(params.originGlowRadius ?? 14, 0, 256, 'lightRaySvg.originGlowRadius'));

  const projectedRays = raySet.rays.map((ray) => ({
    ray,
    x1: round6(ray.start[0] * width),
    y1: round6(ray.start[1] * height),
    x2: round6(ray.end[0] * width),
    y2: round6(ray.end[1] * height),
  }));

  let content;
  if (presentationMode === 'line-inspection') {
    const lines = projectedRays.map(({ ray, x1, y1, x2, y2 }) => {
      const opacity = round6(minOpacity + (maxOpacity - minOpacity) * ray.weight);
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" opacity="${opacity}"/>`;
    }).join('');
    content = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" color="${strokeColor}" data-presentation-mode="line-inspection"><g fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round">${lines}</g></svg>`;
  } else {
    const weights = raySet.rays.map((ray) => ray.weight);
    const weightMin = Math.min(...weights);
    const weightMax = Math.max(...weights);
    const weightSpan = Math.max(EPSILON, weightMax - weightMin);
    const visualRays = projectedRays.map((entry) => {
      const normalizedWeight = Math.max(0, Math.min(1, (entry.ray.weight - weightMin) / weightSpan));
      const beamNormalized = Math.max(0, (normalizedWeight - beamThreshold) / Math.max(EPSILON, 1 - beamThreshold));
      const coreNormalized = Math.max(0, (normalizedWeight - coreThreshold) / Math.max(EPSILON, 1 - coreThreshold));
      const beamStrength = round6(0.03 + 0.19 * Math.pow(beamNormalized, 1.2));
      const coreStrength = round6(0.68 * Math.pow(coreNormalized, 1.35));
      return {
        ...entry,
        normalizedWeight: round6(normalizedWeight),
        beamStrength,
        coreStrength,
        beamVisible: normalizedWeight >= beamThreshold,
        coreVisible: normalizedWeight >= coreThreshold,
      };
    });
    const beamRays = visualRays.filter((entry) => entry.beamVisible);
    const coreRays = visualRays.filter((entry) => entry.coreVisible);
    const first = visualRays[0];
    const last = visualRays.at(-1);
    const origin = first ?? { x1: width / 2, y1: height / 2 };
    const farCenter = visualRays.reduce((acc, entry) => ({
      x: acc.x + entry.x2 / visualRays.length,
      y: acc.y + entry.y2 / visualRays.length,
    }), { x: 0, y: 0 });
    const volumePath = first && last
      ? `M ${origin.x1} ${origin.y1} L ${first.x2} ${first.y2} L ${last.x2} ${last.y2} Z`
      : '';

    const gradientMarkup = beamRays.map((entry, index) => {
      const beamTip = round6(entry.beamStrength * tipOpacity);
      return `<linearGradient id="axm-beam-${index}" gradientUnits="userSpaceOnUse" x1="${entry.x1}" y1="${entry.y1}" x2="${entry.x2}" y2="${entry.y2}"><stop offset="0%" stop-color="${strokeColor}" stop-opacity="${round6(entry.beamStrength * 0.08)}"/><stop offset="34%" stop-color="${strokeColor}" stop-opacity="${round6(entry.beamStrength * 0.62)}"/><stop offset="55%" stop-color="${strokeColor}" stop-opacity="${entry.beamStrength}"/><stop offset="82%" stop-color="${strokeColor}" stop-opacity="${round6(entry.beamStrength * 0.28)}"/><stop offset="100%" stop-color="${strokeColor}" stop-opacity="${beamTip}"/></linearGradient>`;
    }).join('');
    const coreGradientMarkup = coreRays.map((entry, index) => `<linearGradient id="axm-core-${index}" gradientUnits="userSpaceOnUse" x1="${entry.x1}" y1="${entry.y1}" x2="${entry.x2}" y2="${entry.y2}"><stop offset="0%" stop-color="#ffffff" stop-opacity="${round6(entry.coreStrength * 0.08)}"/><stop offset="38%" stop-color="#dff9ff" stop-opacity="${round6(entry.coreStrength * 0.72)}"/><stop offset="56%" stop-color="#ffffff" stop-opacity="${entry.coreStrength}"/><stop offset="80%" stop-color="${strokeColor}" stop-opacity="${round6(entry.coreStrength * 0.32)}"/><stop offset="100%" stop-color="${strokeColor}" stop-opacity="0"/></linearGradient>`).join('');
    const beamLines = beamRays.map((entry, index) => `<line data-ray-index="${entry.ray.index}" x1="${entry.x1}" y1="${entry.y1}" x2="${entry.x2}" y2="${entry.y2}" stroke="url(#axm-beam-${index})"/>`).join('');
    const coreLines = coreRays.map((entry, index) => `<line data-ray-index="${entry.ray.index}" x1="${entry.x1}" y1="${entry.y1}" x2="${entry.x2}" y2="${entry.y2}" stroke="url(#axm-core-${index})"/>`).join('');

    content = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" color="${strokeColor}" data-presentation-mode="volumetric-light" data-beam-ray-count="${beamRays.length}" data-core-ray-count="${coreRays.length}"><defs><filter id="axm-volume-haze-filter" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${hazeBlur}"/></filter><linearGradient id="axm-volume-fill" gradientUnits="userSpaceOnUse" x1="${origin.x1}" y1="${origin.y1}" x2="${round6(farCenter.x)}" y2="${round6(farCenter.y)}"><stop offset="0%" stop-color="${strokeColor}" stop-opacity="0.035"/><stop offset="32%" stop-color="${strokeColor}" stop-opacity="0.12"/><stop offset="64%" stop-color="${strokeColor}" stop-opacity="0.075"/><stop offset="100%" stop-color="${strokeColor}" stop-opacity="0"/></linearGradient><radialGradient id="axm-origin-glow"><stop offset="0%" stop-color="#ffffff" stop-opacity="0.52"/><stop offset="35%" stop-color="${strokeColor}" stop-opacity="0.18"/><stop offset="100%" stop-color="${strokeColor}" stop-opacity="0"/></radialGradient>${gradientMarkup}${coreGradientMarkup}</defs><path data-layer="ray-volume" d="${volumePath}" fill="url(#axm-volume-fill)" filter="url(#axm-volume-haze-filter)"/><circle data-layer="ray-origin-glow" cx="${origin.x1}" cy="${origin.y1}" r="${originGlowRadius}" fill="url(#axm-origin-glow)"/><g data-layer="ray-beam" fill="none" stroke-linecap="round" stroke-width="${round6(strokeWidth * beamWidthMultiplier)}">${beamLines}</g><g data-layer="ray-core" fill="none" stroke-linecap="round" stroke-width="${strokeWidth}">${coreLines}</g></svg>`;

  }

  const renderControls = {
    width,
    height,
    strokeWidth,
    minOpacity,
    maxOpacity,
    strokeColor,
    presentationMode,
    hazeWidthMultiplier,
    beamWidthMultiplier,
    hazeBlur,
    beamThreshold,
    coreThreshold,
    tipOpacity,
    originGlowRadius,
  };
  const realization = {
    schema: 'axm.vfx.mask-guided-light-rays-static-svg/v0.1',
    mediaType: 'image/svg+xml',
    renderer: 'axm.vfx.mask-guided-light-rays-static-svg/v0.1',
    raySourceHash: next.lightRaySourceHash,
    raySetHash: raySet.raySetHash,
    fieldSourceHash: binding.hash,
    maskSourceHash: next.coverageMaskSourceHash,
    derivedFromStateHash: hashValue({
      lightRaySourceHash: next.lightRaySourceHash,
      raySetHash: raySet.raySetHash,
      renderControls,
    }),
    renderControls,
    content,
  };

  next.realizations ??= {};
  next.realizations.maskGuidedLightRaysStaticSvg = realization;

  return {
    state: next,
    evidence: {
      fieldSourceKind: binding.kind,
      renderer: realization.renderer,
      raySourceHash: realization.raySourceHash,
      raySetHash: realization.raySetHash,
      rays: raySet.rayCount,
      bytes: Buffer.byteLength(content),
      width,
      height,
      strokeWidth,
      minOpacity,
      maxOpacity,
      strokeColor,
      presentationMode,
      hazeWidthMultiplier,
      beamWidthMultiplier,
      hazeBlur,
      beamThreshold,
      coreThreshold,
      tipOpacity,
      originGlowRadius,
      performanceMeasurement: 'NOT_TESTED',
      visualInspection: 'NOT_TESTED',
    },
  };
}, 'Realize one derived mask-guided ray set as a replaceable static SVG inspection artifact without promoting renderer controls or ray geometry into canonical field/mask truth.');

export const MASK_GUIDED_LIGHT_RAY_HANDS = [
  normalizeScalarFieldRequestHand,
  normalizeCoverageMaskRequestHand,
  normalizeMaskGuidedLightRaySourceHand,
  buildMaskGuidedLightRaySetHand,
  realizeMaskGuidedLightRaysStaticSvgHand,
];

export const CELLULAR_MASK_GUIDED_LIGHT_RAY_HANDS = [
  normalizeCellularFieldRequestHand,
  normalizeCoverageMaskRequestHand,
  normalizeMaskGuidedLightRaySourceHand,
  buildMaskGuidedLightRaySetHand,
  realizeMaskGuidedLightRaysStaticSvgHand,
];

export const MASK_GUIDED_LIGHT_RAY_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.light.mask-guided-rays2d-static-svg',
  version: '0.1.0',
  stages: [
    { id: 'normalize-field-source', hand: 'fx.field.fbm-source-normalize', params: {} },
    { id: 'normalize-coverage-mask-source', hand: 'fx.field.coverage-mask-source-normalize', params: {} },
    { id: 'normalize-light-ray-source', hand: 'fx.light.mask-guided-ray-source-normalize', params: {} },
    { id: 'build-light-ray-set', hand: 'fx.light.mask-guided-ray-set-build', params: { rayCount: 64, samplesPerRay: 24, maxRays: 256, maxSamples: 32768 } },
    { id: 'realize-static-svg', hand: 'fx.light.mask-guided-rays-static-svg-realize', params: { width: 640, height: 420, strokeWidth: 1.5, minOpacity: 0, maxOpacity: 0.85, strokeColor: '#69d7ff' } },
  ],
});

export const CELLULAR_MASK_GUIDED_LIGHT_RAY_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.light.mask-guided-rays2d-static-svg-cellular',
  version: '0.1.0',
  stages: [
    { id: 'normalize-cellular-source', hand: 'fx.field.cellular-source-normalize', params: {} },
    { id: 'normalize-coverage-mask-source', hand: 'fx.field.coverage-mask-source-normalize', params: {} },
    { id: 'normalize-light-ray-source', hand: 'fx.light.mask-guided-ray-source-normalize', params: {} },
    { id: 'build-light-ray-set', hand: 'fx.light.mask-guided-ray-set-build', params: { rayCount: 64, samplesPerRay: 24, maxRays: 256, maxSamples: 32768 } },
    { id: 'realize-static-svg', hand: 'fx.light.mask-guided-rays-static-svg-realize', params: { width: 640, height: 420, strokeWidth: 1.5, minOpacity: 0, maxOpacity: 0.85 } },
  ],
});

export function makeMaskGuidedLightRayState(options = {}) {
  const base = makeCoverageMaskState({ field: options.field ?? {}, mask: options.mask ?? {} });
  const ray = options.ray ?? {};
  return {
    ...base,
    lightRayRequest: {
      id: ray.id ?? 'mask-guided-light-rays',
      origin: deepClone(ray.origin ?? [0.5, 0.5]),
      directionTurns: ray.directionTurns ?? 0,
      spanTurns: ray.spanTurns ?? 0.25,
      maxLength: ray.maxLength ?? 1.25,
      weightPower: ray.weightPower ?? 1,
    },
    lightRaySets: {},
    realizations: {},
  };
}

export function makeCellularMaskGuidedLightRayState(options = {}) {
  const base = makeCellularCoverageMaskState({ field: options.field ?? {}, mask: options.mask ?? {} });
  const ray = options.ray ?? {};
  return {
    ...base,
    lightRayRequest: {
      id: ray.id ?? 'mask-guided-light-rays',
      origin: deepClone(ray.origin ?? [0.5, 0.5]),
      directionTurns: ray.directionTurns ?? 0,
      spanTurns: ray.spanTurns ?? 0.25,
      maxLength: ray.maxLength ?? 1.25,
      weightPower: ray.weightPower ?? 1,
    },
    lightRaySets: {},
    realizations: {},
  };
}
