import { deepClone, hashValue } from './hand-runtime.mjs';

const TAU = Math.PI * 2;
const EPSILON = 1e-9;
const HARD_MAX_SEGMENTS = 4096;
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

function normalizedTurns(value, label) {
  const turns = finite(value, label);
  return round6(((turns % 1) + 1) % 1);
}

function samePoint(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === 2 && b.length === 2
    && Math.abs(a[0] - b[0]) <= EPSILON && Math.abs(a[1] - b[1]) <= EPSILON;
}

function distance2d(a, b) {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function clipEndToUnitSquare(start, rawEnd) {
  const dx = rawEnd[0] - start[0];
  const dy = rawEnd[1] - start[1];
  let t = 1;

  if (dx > EPSILON && rawEnd[0] > 1) t = Math.min(t, (1 - start[0]) / dx);
  else if (dx < -EPSILON && rawEnd[0] < 0) t = Math.min(t, (0 - start[0]) / dx);
  if (dy > EPSILON && rawEnd[1] > 1) t = Math.min(t, (1 - start[1]) / dy);
  else if (dy < -EPSILON && rawEnd[1] < 0) t = Math.min(t, (0 - start[1]) / dy);

  t = Math.max(0, Math.min(1, t));
  const end = [
    round6(Math.max(0, Math.min(1, start[0] + dx * t))),
    round6(Math.max(0, Math.min(1, start[1] + dy * t))),
  ];
  return { end, clipped: t < 1 - EPSILON };
}

function validateSource(next) {
  if (!next.branchGrowthSource || !next.branchGrowthSourceHash) {
    throw new Error('branch growth requires normalized source state');
  }
  if (hashValue(next.branchGrowthSource) !== next.branchGrowthSourceHash) {
    throw new Error('branch growth source state hash mismatch');
  }
}

function networkHashPayload(network) {
  return {
    schema: network.schema,
    sourceHash: network.sourceHash,
    segmentCount: network.segmentCount,
    clippedSegmentCount: network.clippedSegmentCount,
    terminalSegmentCount: network.terminalSegmentCount,
    segments: network.segments,
  };
}

function validateNetwork(next, network) {
  validateSource(next);
  if (!network || network.schema !== 'axm.branch-growth-network2d/v0.1') {
    throw new Error('branch growth realization requires derived network');
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
  if (hashValue(networkHashPayload(network)) !== network.networkHash) {
    throw new Error('branch growth network hash mismatch');
  }

  const byId = new Map();
  let clipped = 0;
  let terminals = 0;
  for (let index = 0; index < network.segments.length; index += 1) {
    const segment = network.segments[index];
    if (!segment || segment.index !== index || typeof segment.id !== 'string' || !segment.id) {
      throw new Error(`branch growth segment ${index} identity mismatch`);
    }
    if (byId.has(segment.id)) throw new Error(`duplicate branch growth segment id: ${segment.id}`);
    byId.set(segment.id, segment);
    boundedInteger(segment.generation, 0, next.branchGrowthSource.generations - 1, `segment ${index}.generation`);
    bounded(segment.requestedLength, 0, 1, `segment ${index}.requestedLength`);
    bounded(segment.actualLength, 0, 1, `segment ${index}.actualLength`);
    normalizedTurns(segment.headingTurns, `segment ${index}.headingTurns`);
    if (!Array.isArray(segment.start) || segment.start.length !== 2 || !Array.isArray(segment.end) || segment.end.length !== 2) {
      throw new Error(`segment ${index} endpoints must be 2D coordinates`);
    }
    for (const value of [...segment.start, ...segment.end]) bounded(value, 0, 1, `segment ${index}.coordinate`);
    if (Math.abs(round6(distance2d(segment.start, segment.end)) - segment.actualLength) > 1e-6) {
      throw new Error(`segment ${index} actual length mismatch`);
    }
    if (segment.actualLength > segment.requestedLength + 1e-6) {
      throw new Error(`segment ${index} actual length exceeds requested length`);
    }
    if (segment.clipped === true) clipped += 1;
    if (segment.terminal === true) terminals += 1;
  }

  for (const segment of network.segments) {
    if (segment.parentId === null) {
      if (segment.generation !== 0 || !samePoint(segment.start, next.branchGrowthSource.origin)) {
        throw new Error('root branch growth segment source mismatch');
      }
      continue;
    }
    const parent = byId.get(segment.parentId);
    if (!parent) throw new Error(`branch growth segment ${segment.id} parent missing`);
    if (segment.generation !== parent.generation + 1) {
      throw new Error(`branch growth segment ${segment.id} generation mismatch`);
    }
    if (!samePoint(segment.start, parent.end)) {
      throw new Error(`branch growth segment ${segment.id} does not start at parent end`);
    }
  }

  if (clipped !== network.clippedSegmentCount) throw new Error('branch growth clipped segment count mismatch');
  if (terminals !== network.terminalSegmentCount) throw new Error('branch growth terminal segment count mismatch');
}

export const normalizeBranchGrowthSourceHand = hand('fx.growth.branching2d-source-normalize', (state) => {
  const next = deepClone(state);
  const request = next.branchGrowthRequest;
  if (!request || typeof request !== 'object') throw new Error('branch growth requires branchGrowthRequest state');

  const id = String(request.id ?? 'branch-growth').trim();
  if (!id || id.length > 96) throw new Error('branchGrowthRequest.id must be non-empty and <= 96 characters');
  const origin = request.origin ?? [0.5, 0.95];
  if (!Array.isArray(origin) || origin.length !== 2) throw new Error('branchGrowthRequest.origin must contain two coordinates');
  const branchOffsetsTurns = request.branchOffsetsTurns ?? [-0.08, 0.08];
  if (!Array.isArray(branchOffsetsTurns) || branchOffsetsTurns.length < 1 || branchOffsetsTurns.length > 4) {
    throw new Error('branchGrowthRequest.branchOffsetsTurns must contain 1..4 offsets');
  }

  next.branchGrowthSource = {
    schema: 'axm.branch-growth-source2d/v0.1',
    id,
    origin: [
      round6(bounded(origin[0], 0, 1, 'branchGrowthRequest.origin[0]')),
      round6(bounded(origin[1], 0, 1, 'branchGrowthRequest.origin[1]')),
    ],
    headingTurns: normalizedTurns(request.headingTurns ?? 0.75, 'branchGrowthRequest.headingTurns'),
    baseLength: round6(bounded(request.baseLength ?? 0.2, 0.001, 1, 'branchGrowthRequest.baseLength')),
    lengthDecay: round6(bounded(request.lengthDecay ?? 0.68, 0.1, 0.99, 'branchGrowthRequest.lengthDecay')),
    branchOffsetsTurns: branchOffsetsTurns.map((value, index) => round6(bounded(value, -0.5, 0.5, `branchGrowthRequest.branchOffsetsTurns[${index}]`))),
    generations: boundedInteger(request.generations ?? 5, 1, 8, 'branchGrowthRequest.generations'),
    boundaryMode: 'clip',
  };
  next.branchGrowthSourceHash = hashValue(next.branchGrowthSource);

  return {
    state: next,
    evidence: {
      branchGrowthSourceHash: next.branchGrowthSourceHash,
      generations: next.branchGrowthSource.generations,
      branchFactor: next.branchGrowthSource.branchOffsetsTurns.length,
      boundaryMode: next.branchGrowthSource.boundaryMode,
      sourceCodeReuse: 'none',
    },
  };
}, 'Normalize a renderer-neutral 2D branching-growth rule source whose topology is defined by retained source state rather than a particular realization.');

export const buildBranchGrowthNetworkHand = hand('fx.growth.branching2d-network-build', (state, params = {}) => {
  const next = deepClone(state);
  validateSource(next);
  const source = next.branchGrowthSource;
  const maxSegments = boundedInteger(params.maxSegments ?? 2048, 1, HARD_MAX_SEGMENTS, 'branchGrowthNetwork.maxSegments');

  const segments = [];
  const queue = [{
    parentId: null,
    generation: 0,
    branchIndex: null,
    path: 'root',
    start: deepClone(source.origin),
    headingTurns: source.headingTurns,
    requestedLength: source.baseLength,
  }];
  let queueIndex = 0;

  while (queueIndex < queue.length) {
    if (segments.length >= maxSegments) {
      throw new Error(`branch growth segment budget exceeded: more than ${maxSegments}`);
    }
    const candidate = queue[queueIndex];
    queueIndex += 1;
    const angle = candidate.headingTurns * TAU;
    const rawEnd = [
      candidate.start[0] + Math.cos(angle) * candidate.requestedLength,
      candidate.start[1] + Math.sin(angle) * candidate.requestedLength,
    ];
    const { end, clipped } = clipEndToUnitSquare(candidate.start, rawEnd);
    const atDepth = candidate.generation + 1 >= source.generations;
    const actualLength = round6(distance2d(candidate.start, end));
    const zeroLengthAfterClip = actualLength <= EPSILON;
    const terminal = clipped || atDepth || zeroLengthAfterClip;
    const id = `${source.id}:${candidate.path}`;
    const segment = {
      id,
      index: segments.length,
      parentId: candidate.parentId,
      generation: candidate.generation,
      branchIndex: candidate.branchIndex,
      start: candidate.start.map(round6),
      end,
      headingTurns: round6(candidate.headingTurns),
      requestedLength: round6(candidate.requestedLength),
      actualLength,
      clipped,
      terminal,
    };
    segments.push(segment);

    if (!terminal) {
      source.branchOffsetsTurns.forEach((offset, branchIndex) => {
        queue.push({
          parentId: id,
          generation: candidate.generation + 1,
          branchIndex,
          path: `${candidate.path}.${branchIndex}`,
          start: deepClone(end),
          headingTurns: normalizedTurns(candidate.headingTurns + offset, `${id}.childHeadingTurns`),
          requestedLength: round6(candidate.requestedLength * source.lengthDecay),
        });
      });
    }
  }

  const network = {
    schema: 'axm.branch-growth-network2d/v0.1',
    sourceHash: next.branchGrowthSourceHash,
    segmentCount: segments.length,
    clippedSegmentCount: segments.filter((segment) => segment.clipped).length,
    terminalSegmentCount: segments.filter((segment) => segment.terminal).length,
    segments,
    derived: true,
    rebuildable: true,
  };
  network.networkHash = hashValue(networkHashPayload(network));
  next.branchGrowthNetworks ??= {};
  next.branchGrowthNetworks[source.id] = network;

  return {
    state: next,
    evidence: {
      branchGrowthSourceHash: next.branchGrowthSourceHash,
      networkHash: network.networkHash,
      segmentCount: network.segmentCount,
      clippedSegmentCount: network.clippedSegmentCount,
      terminalSegmentCount: network.terminalSegmentCount,
      maxSegments,
      hardMaxSegments: HARD_MAX_SEGMENTS,
      performanceMeasurement: 'NOT_TESTED',
    },
  };
}, 'Build a bounded deterministic branching network from retained growth-rule truth; the network is derived, hash-addressed and rebuildable.');

export const realizeBranchGrowthStaticSvgHand = hand('fx.growth.branching2d-static-svg-realize', (state, params = {}) => {
  const next = deepClone(state);
  validateSource(next);
  const network = next.branchGrowthNetworks?.[next.branchGrowthSource.id];
  validateNetwork(next, network);

  const width = boundedInteger(params.width ?? 640, 16, 4096, 'branchGrowthSvg.width');
  const height = boundedInteger(params.height ?? 420, 16, 4096, 'branchGrowthSvg.height');
  const strokeWidth = round6(bounded(params.strokeWidth ?? 1.5, 0.1, 32, 'branchGrowthSvg.strokeWidth'));
  const opacity = round6(bounded(params.opacity ?? 0.9, 0, 1, 'branchGrowthSvg.opacity'));
  const showOrigin = params.showOrigin === undefined ? true : Boolean(params.showOrigin);
  const originRadius = round6(bounded(params.originRadius ?? 2.5, 0.1, 32, 'branchGrowthSvg.originRadius'));

  const lines = network.segments.map((segment) => {
    const x1 = round6(segment.start[0] * width);
    const y1 = round6(segment.start[1] * height);
    const x2 = round6(segment.end[0] * width);
    const y2 = round6(segment.end[1] * height);
    return `<line data-segment="${escapeXml(segment.id)}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  }).join('');
  const origin = next.branchGrowthSource.origin;
  const originMarker = showOrigin
    ? `<circle cx="${round6(origin[0] * width)}" cy="${round6(origin[1] * height)}" r="${originRadius}" fill="currentColor"/>`
    : '';
  const content = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><g fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}">${lines}</g>${originMarker}</svg>`;
  const renderControls = { width, height, strokeWidth, opacity, showOrigin, originRadius };
  const realization = {
    schema: 'axm.vfx.branch-growth-static-svg/v0.1',
    mediaType: 'image/svg+xml',
    renderer: 'axm.vfx.branch-growth-static-svg/v0.1',
    sourceHash: next.branchGrowthSourceHash,
    networkHash: network.networkHash,
    derivedFromStateHash: hashValue({
      branchGrowthSourceHash: next.branchGrowthSourceHash,
      networkHash: network.networkHash,
      renderControls,
    }),
    renderControls,
    content,
  };
  next.realizations ??= {};
  next.realizations.branchGrowthStaticSvg = realization;

  return {
    state: next,
    evidence: {
      renderer: realization.renderer,
      branchGrowthSourceHash: next.branchGrowthSourceHash,
      networkHash: network.networkHash,
      derivedFromStateHash: realization.derivedFromStateHash,
      artifactHash: hashValue(content),
      segmentCount: network.segmentCount,
      bytes: Buffer.byteLength(content),
      performanceMeasurement: 'NOT_TESTED',
      visualInspection: 'NOT_TESTED',
      targetDevicePerformance: 'NOT_TESTED',
    },
  };
}, 'Realize one replaceable static SVG inspection view from a validated derived branching network without promoting renderer controls into source truth.');

export const BRANCH_GROWTH_2D_HANDS = [
  normalizeBranchGrowthSourceHand,
  buildBranchGrowthNetworkHand,
  realizeBranchGrowthStaticSvgHand,
];

export const BRANCH_GROWTH_2D_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.growth.branching2d-static-svg',
  version: '0.1.0',
  stages: [
    { id: 'normalize-growth-source', hand: normalizeBranchGrowthSourceHand.id },
    { id: 'build-growth-network', hand: buildBranchGrowthNetworkHand.id, params: { maxSegments: 2048 } },
    { id: 'realize-static-svg', hand: realizeBranchGrowthStaticSvgHand.id, params: { width: 640, height: 420, strokeWidth: 1.5, opacity: 0.9 } },
  ],
});

export function makeBranchGrowth2dState(options = {}) {
  return {
    branchGrowthRequest: {
      id: options.id ?? 'branch-growth',
      origin: deepClone(options.origin ?? [0.5, 0.95]),
      headingTurns: options.headingTurns ?? 0.75,
      baseLength: options.baseLength ?? 0.2,
      lengthDecay: options.lengthDecay ?? 0.68,
      branchOffsetsTurns: deepClone(options.branchOffsetsTurns ?? [-0.08, 0.08]),
      generations: options.generations ?? 5,
    },
    branchGrowthNetworks: {},
    realizations: {},
  };
}
