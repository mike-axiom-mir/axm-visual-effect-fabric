import { deepClone, hashValue } from './hand-runtime.mjs';
import {
  normalizeBranchGrowthSourceHand,
  buildBranchGrowthNetworkHand,
  makeBranchGrowth2dState,
} from './branch-growth2d.mjs';
import {
  normalizeFlowFieldRequestHand,
  sampleFlowFieldSource,
  makeFieldFlowState,
} from './field-flow-operators.mjs';

const HARD_MAX_CURVES = 4096;
const EPSILON = 1e-9;
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

function samePoint(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === 2 && b.length === 2
    && Math.abs(a[0] - b[0]) <= EPSILON && Math.abs(a[1] - b[1]) <= EPSILON;
}

function distance2d(a, b) {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

function midpoint(a, b) {
  return [round6((a[0] + b[0]) / 2), round6((a[1] + b[1]) / 2)];
}

function clamp01(value) {
  return round6(Math.max(0, Math.min(1, value)));
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function baseNetworkHashPayload(network) {
  return {
    schema: network.schema,
    sourceHash: network.sourceHash,
    segmentCount: network.segmentCount,
    clippedSegmentCount: network.clippedSegmentCount,
    terminalSegmentCount: network.terminalSegmentCount,
    segments: network.segments,
  };
}

function curveSetHashPayload(curveSet) {
  return {
    schema: curveSet.schema,
    branchSourceHash: curveSet.branchSourceHash,
    baseNetworkHash: curveSet.baseNetworkHash,
    scalarSourceHash: curveSet.scalarSourceHash,
    flowSourceHash: curveSet.flowSourceHash,
    guidanceSourceHash: curveSet.guidanceSourceHash,
    curveCount: curveSet.curveCount,
    clampedControlCount: curveSet.clampedControlCount,
    maxOffsetMagnitude: curveSet.maxOffsetMagnitude,
    meanOffsetMagnitude: curveSet.meanOffsetMagnitude,
    curves: curveSet.curves,
  };
}

function validateBranchTruth(next) {
  if (!next.branchGrowthSource || !next.branchGrowthSourceHash) {
    throw new Error('branch flow guidance requires normalized branch growth source');
  }
  if (hashValue(next.branchGrowthSource) !== next.branchGrowthSourceHash) {
    throw new Error('branch growth source state hash mismatch');
  }

  const network = next.branchGrowthNetworks?.[next.branchGrowthSource.id];
  if (!network || network.schema !== 'axm.branch-growth-network2d/v0.1') {
    throw new Error('branch flow guidance requires derived branch growth network');
  }
  if (network.sourceHash !== next.branchGrowthSourceHash) {
    throw new Error('branch growth network source lineage mismatch');
  }
  if (network.derived !== true || network.rebuildable !== true) {
    throw new Error('branch growth network must remain derived and rebuildable');
  }
  if (!Array.isArray(network.segments) || network.segments.length !== network.segmentCount) {
    throw new Error('branch growth network cardinality mismatch');
  }
  if (hashValue(baseNetworkHashPayload(network)) !== network.networkHash) {
    throw new Error('branch growth network hash mismatch');
  }

  const byId = new Map();
  for (let index = 0; index < network.segments.length; index += 1) {
    const segment = network.segments[index];
    if (!segment || segment.index !== index || typeof segment.id !== 'string' || !segment.id) {
      throw new Error(`branch growth segment ${index} identity mismatch`);
    }
    if (byId.has(segment.id)) throw new Error(`duplicate branch growth segment id: ${segment.id}`);
    byId.set(segment.id, segment);
    if (!Array.isArray(segment.start) || segment.start.length !== 2 || !Array.isArray(segment.end) || segment.end.length !== 2) {
      throw new Error(`branch growth segment ${index} endpoints must be 2D coordinates`);
    }
    for (const coordinate of [...segment.start, ...segment.end]) {
      bounded(coordinate, 0, 1, `segment ${index}.coordinate`);
    }
    if (Math.abs(round6(distance2d(segment.start, segment.end)) - Number(segment.actualLength)) > 1e-6) {
      throw new Error(`branch growth segment ${index} actual length mismatch`);
    }
  }

  for (const segment of network.segments) {
    if (segment.parentId === null) continue;
    const parent = byId.get(segment.parentId);
    if (!parent) throw new Error(`branch growth segment ${segment.id} parent missing`);
    if (!samePoint(segment.start, parent.end)) {
      throw new Error(`branch growth segment ${segment.id} does not start at parent end`);
    }
  }
  return network;
}

function validateFlowTruth(next) {
  if (!next.fieldSource || !next.fieldSourceHash || !next.flowSource || !next.flowSourceHash) {
    throw new Error('branch flow guidance requires normalized scalar and flow sources');
  }
  if (hashValue(next.fieldSource) !== next.fieldSourceHash) {
    throw new Error('flow scalar source state hash mismatch');
  }
  if (hashValue(next.flowSource) !== next.flowSourceHash) {
    throw new Error('flow source state hash mismatch');
  }
  if (next.flowSource.scalarSource?.sourceHash !== next.fieldSourceHash) {
    throw new Error('flow scalar source lineage mismatch');
  }
}

function validateGuidanceSource(next, network) {
  validateFlowTruth(next);
  const guidance = next.branchFlowGuidanceSource;
  if (!guidance || !next.branchFlowGuidanceSourceHash) {
    throw new Error('branch flow guidance requires normalized guidance source');
  }
  if (hashValue(guidance) !== next.branchFlowGuidanceSourceHash) {
    throw new Error('branch flow guidance source hash mismatch');
  }
  if (guidance.branchSource.sourceHash !== next.branchGrowthSourceHash) {
    throw new Error('branch flow guidance branch-source lineage mismatch');
  }
  if (guidance.baseNetworkHash !== network.networkHash) {
    throw new Error('branch flow guidance base-network lineage mismatch');
  }
  if (guidance.flowSource.sourceHash !== next.flowSourceHash || guidance.flowSource.scalarSourceHash !== next.fieldSourceHash) {
    throw new Error('branch flow guidance flow-source lineage mismatch');
  }
  return guidance;
}

function validateCurveSet(next, curveSet) {
  const network = validateBranchTruth(next);
  validateGuidanceSource(next, network);
  if (!curveSet || curveSet.schema !== 'axm.flow-guided-branch-curves2d/v0.1') {
    throw new Error('branch flow guidance realization requires derived curve set');
  }
  if (curveSet.branchSourceHash !== next.branchGrowthSourceHash
    || curveSet.baseNetworkHash !== network.networkHash
    || curveSet.scalarSourceHash !== next.fieldSourceHash
    || curveSet.flowSourceHash !== next.flowSourceHash
    || curveSet.guidanceSourceHash !== next.branchFlowGuidanceSourceHash) {
    throw new Error('branch flow guided curve-set lineage mismatch');
  }
  if (curveSet.derived !== true || curveSet.rebuildable !== true) {
    throw new Error('branch flow guided curve set must remain derived and rebuildable');
  }
  if (!Array.isArray(curveSet.curves) || curveSet.curves.length !== curveSet.curveCount) {
    throw new Error('branch flow guided curve-set cardinality mismatch');
  }
  if (curveSet.curveCount !== network.segmentCount) {
    throw new Error('branch flow guided curve-set topology count mismatch');
  }
  if (hashValue(curveSetHashPayload(curveSet)) !== curveSet.curveSetHash) {
    throw new Error('branch flow guided curve-set hash mismatch');
  }

  for (let index = 0; index < curveSet.curves.length; index += 1) {
    const curve = curveSet.curves[index];
    const segment = network.segments[index];
    if (curve.index !== index || curve.segmentId !== segment.id || curve.parentId !== segment.parentId || curve.generation !== segment.generation) {
      throw new Error(`branch flow guided curve ${index} topology mismatch`);
    }
    if (!samePoint(curve.start, segment.start) || !samePoint(curve.end, segment.end)) {
      throw new Error(`branch flow guided curve ${index} endpoint mismatch`);
    }
    if (!Array.isArray(curve.control) || curve.control.length !== 2) {
      throw new Error(`branch flow guided curve ${index} control point missing`);
    }
    for (const coordinate of curve.control) bounded(coordinate, 0, 1, `curve ${index}.control`);
  }
  return { network };
}

export const normalizeBranchFlowGuidanceSourceHand = hand('fx.growth.branching2d-flow-guidance-source-normalize', (state) => {
  const next = deepClone(state);
  const network = validateBranchTruth(next);
  validateFlowTruth(next);
  const request = next.branchFlowGuidanceRequest;
  if (!request || typeof request !== 'object') {
    throw new Error('branch flow guidance requires branchFlowGuidanceRequest state');
  }
  const id = String(request.id ?? `${next.branchGrowthSource.id}-flow-guidance`).trim();
  if (!id || id.length > 96) throw new Error('branchFlowGuidanceRequest.id must be non-empty and <= 96 characters');

  next.branchFlowGuidanceSource = {
    schema: 'axm.branch-flow-guidance-source2d/v0.1',
    id,
    branchSource: {
      id: next.branchGrowthSource.id,
      sourceHash: next.branchGrowthSourceHash,
    },
    baseNetworkHash: network.networkHash,
    flowSource: {
      id: next.flowSource.id,
      sourceHash: next.flowSourceHash,
      scalarSourceHash: next.fieldSourceHash,
    },
    samplePosition: 'segment-midpoint',
    curvatureScale: round6(bounded(request.curvatureScale ?? 0.35, 0, 2, 'branchFlowGuidanceRequest.curvatureScale')),
    maxControlOffset: round6(bounded(request.maxControlOffset ?? 0.08, 0, 0.5, 'branchFlowGuidanceRequest.maxControlOffset')),
  };
  next.branchFlowGuidanceSourceHash = hashValue(next.branchFlowGuidanceSource);

  return {
    state: next,
    evidence: {
      branchGrowthSourceHash: next.branchGrowthSourceHash,
      baseNetworkHash: network.networkHash,
      scalarSourceHash: next.fieldSourceHash,
      flowSourceHash: next.flowSourceHash,
      guidanceSourceHash: next.branchFlowGuidanceSourceHash,
      curvatureScale: next.branchFlowGuidanceSource.curvatureScale,
      maxControlOffset: next.branchFlowGuidanceSource.maxControlOffset,
      sourceCodeReuse: 'none',
    },
  };
}, 'Normalize a consumer-neutral source that bends a retained branching network through a retained vector-flow source without changing branch endpoints or topology truth.');

export const buildBranchFlowGuidedCurveSetHand = hand('fx.growth.branching2d-flow-guided-curves-build', (state, params = {}) => {
  const next = deepClone(state);
  const network = validateBranchTruth(next);
  const guidance = validateGuidanceSource(next, network);
  const maxCurves = boundedInteger(params.maxCurves ?? 2048, 1, HARD_MAX_CURVES, 'branchFlowGuidance.maxCurves');
  if (network.segmentCount > maxCurves) {
    throw new Error(`branch flow guided curve budget exceeded: ${network.segmentCount} > ${maxCurves}`);
  }

  let clampedControlCount = 0;
  let maxOffsetMagnitude = 0;
  let offsetSum = 0;
  const curves = network.segments.map((segment, index) => {
    const center = midpoint(segment.start, segment.end);
    const flow = sampleFlowFieldSource(next.fieldSource, next.flowSource, center[0], center[1]);
    const offsetLimit = Math.min(guidance.maxControlOffset, Number(segment.actualLength) * guidance.curvatureScale);
    const rawControl = [
      center[0] + flow.x * offsetLimit,
      center[1] + flow.y * offsetLimit,
    ];
    const control = [clamp01(rawControl[0]), clamp01(rawControl[1])];
    if (Math.abs(control[0] - rawControl[0]) > EPSILON || Math.abs(control[1] - rawControl[1]) > EPSILON) {
      clampedControlCount += 1;
    }
    const offset = [round6(control[0] - center[0]), round6(control[1] - center[1])];
    const offsetMagnitude = round6(Math.hypot(offset[0], offset[1]));
    offsetSum += offsetMagnitude;
    maxOffsetMagnitude = Math.max(maxOffsetMagnitude, offsetMagnitude);
    return {
      id: `${guidance.id}:${segment.id}`,
      index,
      segmentId: segment.id,
      parentId: segment.parentId,
      generation: segment.generation,
      start: deepClone(segment.start),
      control,
      end: deepClone(segment.end),
      sampledAt: center,
      flow: {
        x: flow.x,
        y: flow.y,
        magnitude: flow.magnitude,
      },
      offset,
      offsetMagnitude,
    };
  });

  const curveSet = {
    schema: 'axm.flow-guided-branch-curves2d/v0.1',
    branchSourceHash: next.branchGrowthSourceHash,
    baseNetworkHash: network.networkHash,
    scalarSourceHash: next.fieldSourceHash,
    flowSourceHash: next.flowSourceHash,
    guidanceSourceHash: next.branchFlowGuidanceSourceHash,
    curveCount: curves.length,
    clampedControlCount,
    maxOffsetMagnitude: round6(maxOffsetMagnitude),
    meanOffsetMagnitude: curves.length ? round6(offsetSum / curves.length) : 0,
    curves,
    derived: true,
    rebuildable: true,
  };
  curveSet.curveSetHash = hashValue(curveSetHashPayload(curveSet));
  next.branchFlowGuidedCurveSets ??= {};
  next.branchFlowGuidedCurveSets[guidance.id] = curveSet;

  return {
    state: next,
    evidence: {
      guidanceSourceHash: next.branchFlowGuidanceSourceHash,
      curveSetHash: curveSet.curveSetHash,
      baseNetworkHash: network.networkHash,
      flowSourceHash: next.flowSourceHash,
      curveCount: curveSet.curveCount,
      clampedControlCount: curveSet.clampedControlCount,
      maxOffsetMagnitude: curveSet.maxOffsetMagnitude,
      meanOffsetMagnitude: curveSet.meanOffsetMagnitude,
      maxCurves,
      hardMaxCurves: HARD_MAX_CURVES,
      performanceMeasurement: 'NOT_TESTED',
    },
  };
}, 'Build a bounded rebuildable quadratic-curve working set that preserves every retained branch endpoint and parent/child identity while using continuous flow only for derived curvature.');

export const realizeBranchFlowGuidedStaticSvgHand = hand('fx.growth.branching2d-flow-guided-static-svg-realize', (state, params = {}) => {
  const next = deepClone(state);
  const guidance = next.branchFlowGuidanceSource;
  const curveSet = guidance ? next.branchFlowGuidedCurveSets?.[guidance.id] : null;
  const { network } = validateCurveSet(next, curveSet);

  const width = boundedInteger(params.width ?? 640, 16, 4096, 'branchFlowGuidedSvg.width');
  const height = boundedInteger(params.height ?? 420, 16, 4096, 'branchFlowGuidedSvg.height');
  const strokeWidth = round6(bounded(params.strokeWidth ?? 1.5, 0.1, 32, 'branchFlowGuidedSvg.strokeWidth'));
  const opacity = round6(bounded(params.opacity ?? 0.9, 0, 1, 'branchFlowGuidedSvg.opacity'));
  const showOrigin = params.showOrigin === undefined ? true : Boolean(params.showOrigin);
  const originRadius = round6(bounded(params.originRadius ?? 2.5, 0.1, 32, 'branchFlowGuidedSvg.originRadius'));

  const paths = curveSet.curves.map((curve) => {
    const x1 = round6(curve.start[0] * width);
    const y1 = round6(curve.start[1] * height);
    const cx = round6(curve.control[0] * width);
    const cy = round6(curve.control[1] * height);
    const x2 = round6(curve.end[0] * width);
    const y2 = round6(curve.end[1] * height);
    return `<path data-segment="${escapeXml(curve.segmentId)}" d="M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}"/>`;
  }).join('');
  const origin = next.branchGrowthSource.origin;
  const originMarker = showOrigin
    ? `<circle cx="${round6(origin[0] * width)}" cy="${round6(origin[1] * height)}" r="${originRadius}" fill="currentColor"/>`
    : '';
  const content = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><g fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}">${paths}</g>${originMarker}</svg>`;
  const renderControls = { width, height, strokeWidth, opacity, showOrigin, originRadius };
  const realization = {
    schema: 'axm.vfx.branch-flow-guided-static-svg/v0.1',
    mediaType: 'image/svg+xml',
    renderer: 'axm.vfx.branch-flow-guided-static-svg/v0.1',
    branchSourceHash: next.branchGrowthSourceHash,
    baseNetworkHash: network.networkHash,
    flowSourceHash: next.flowSourceHash,
    guidanceSourceHash: next.branchFlowGuidanceSourceHash,
    curveSetHash: curveSet.curveSetHash,
    derivedFromStateHash: hashValue({
      branchSourceHash: next.branchGrowthSourceHash,
      baseNetworkHash: network.networkHash,
      flowSourceHash: next.flowSourceHash,
      guidanceSourceHash: next.branchFlowGuidanceSourceHash,
      curveSetHash: curveSet.curveSetHash,
      renderControls,
    }),
    renderControls,
    content,
  };
  next.realizations ??= {};
  next.realizations.branchFlowGuidedStaticSvg = realization;

  return {
    state: next,
    evidence: {
      renderer: realization.renderer,
      branchGrowthSourceHash: next.branchGrowthSourceHash,
      baseNetworkHash: network.networkHash,
      flowSourceHash: next.flowSourceHash,
      guidanceSourceHash: next.branchFlowGuidanceSourceHash,
      curveSetHash: curveSet.curveSetHash,
      derivedFromStateHash: realization.derivedFromStateHash,
      artifactHash: hashValue(content),
      curveCount: curveSet.curveCount,
      bytes: Buffer.byteLength(content),
      performanceMeasurement: 'NOT_TESTED',
      visualInspection: 'NOT_TESTED',
      targetDevicePerformance: 'NOT_TESTED',
    },
  };
}, 'Realize one replaceable static SVG inspection view from a validated flow-guided branch curve set without changing retained branch geometry or flow truth.');

export const BRANCH_FLOW_GUIDED_CURVE_HANDS = [
  normalizeBranchGrowthSourceHand,
  buildBranchGrowthNetworkHand,
  normalizeFlowFieldRequestHand,
  normalizeBranchFlowGuidanceSourceHand,
  buildBranchFlowGuidedCurveSetHand,
  realizeBranchFlowGuidedStaticSvgHand,
];

export const BRANCH_FLOW_GUIDED_CURVE_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.growth.branching2d-flow-guided-static-svg',
  version: '0.1.0',
  stages: [
    { id: 'normalize-growth-source', hand: normalizeBranchGrowthSourceHand.id },
    { id: 'build-growth-network', hand: buildBranchGrowthNetworkHand.id, params: { maxSegments: 2048 } },
    { id: 'normalize-flow-source', hand: normalizeFlowFieldRequestHand.id },
    { id: 'normalize-flow-guidance', hand: normalizeBranchFlowGuidanceSourceHand.id },
    { id: 'build-flow-guided-curves', hand: buildBranchFlowGuidedCurveSetHand.id, params: { maxCurves: 2048 } },
    { id: 'realize-static-svg', hand: realizeBranchFlowGuidedStaticSvgHand.id, params: { width: 640, height: 420, strokeWidth: 1.5, opacity: 0.9 } },
  ],
});

export function makeBranchFlowGuidedCurveState(options = {}) {
  const growth = makeBranchGrowth2dState(options.growth ?? {});
  const flow = makeFieldFlowState(options.flow ?? {});
  return {
    schema: 'axm.effect-work-state/v0.1',
    branchGrowthRequest: deepClone(growth.branchGrowthRequest),
    branchGrowthNetworks: {},
    fieldRequest: deepClone(flow.fieldRequest),
    flowRequest: deepClone(flow.flowRequest),
    vectorFields: {},
    branchFlowGuidanceRequest: {
      id: options.guidance?.id ?? `${growth.branchGrowthRequest.id}-flow-guidance`,
      curvatureScale: options.guidance?.curvatureScale ?? 0.35,
      maxControlOffset: options.guidance?.maxControlOffset ?? 0.08,
    },
    branchFlowGuidedCurveSets: {},
    realizations: {},
  };
}
