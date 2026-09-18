import { deepClone, hashValue } from './hand-runtime.mjs';
import { buildBranchGrowthNetworkHand } from './branch-growth2d.mjs';
import { samplePropagationFrontSource } from './propagation-front1d.mjs';

const HARD_MAX_SEGMENTS = 4096;
const EPSILON = 1e-9;
const round6 = (value) => Number(Number(value).toFixed(6));

const FIXED_DERIVATION = Object.freeze({
  algorithm: 'branch-root-path-propagation-envelope/v0.1',
  distanceMetric: 'root-path-actual-length',
  normalization: 'max-root-path-end-distance',
  sampleSites: 'segment-start-end',
  phaseMode: 'clamp',
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

function clampUnit(value, label) {
  return round6(Math.min(1, Math.max(0, finite(value, label))));
}

function validateBranchSource(next) {
  const source = next.branchGrowthSource;
  if (!source || !next.branchGrowthSourceHash) throw new Error('branch propagation requires retained branch growth source state');
  if (hashValue(source) !== next.branchGrowthSourceHash) throw new Error('branch propagation branch source hash mismatch');
  if (source.schema !== 'axm.branch-growth-source2d/v0.1') throw new Error('branch propagation branch source schema is invalid');
  if (typeof source.id !== 'string' || source.id.length < 1 || source.id.length > 96) throw new Error('branch propagation branch source id is invalid');
  if (!Array.isArray(source.origin) || source.origin.length !== 2) throw new Error('branch propagation branch source origin is invalid');
  source.origin.forEach((value, index) => bounded(value, 0, 1, `branch propagation branch source origin[${index}]`));
  bounded(source.headingTurns, 0, 1, 'branch propagation branch source headingTurns');
  bounded(source.baseLength, 0.001, 1, 'branch propagation branch source baseLength');
  bounded(source.lengthDecay, 0.1, 0.99, 'branch propagation branch source lengthDecay');
  if (!Array.isArray(source.branchOffsetsTurns) || source.branchOffsetsTurns.length < 1 || source.branchOffsetsTurns.length > 4) {
    throw new Error('branch propagation branch source offsets are invalid');
  }
  source.branchOffsetsTurns.forEach((value, index) => bounded(value, -0.5, 0.5, `branch propagation branch source offset[${index}]`));
  boundedInteger(source.generations, 1, 8, 'branch propagation branch source generations');
  if (source.boundaryMode !== 'clip') throw new Error('branch propagation branch source boundary mode is invalid');
}

function validatePropagationSource(next) {
  if (!next.propagationFrontSource || !next.propagationFrontSourceHash) {
    throw new Error('branch propagation requires retained propagation front source state');
  }
  if (hashValue(next.propagationFrontSource) !== next.propagationFrontSourceHash) {
    throw new Error('branch propagation propagation source hash mismatch');
  }
  // The donor sampler performs the authoritative fixed-semantics/provenance validation.
  samplePropagationFrontSource(next.propagationFrontSource, 0, 0);
}

function networkComparable(network) {
  return {
    schema: network.schema,
    sourceHash: network.sourceHash,
    segmentCount: network.segmentCount,
    clippedSegmentCount: network.clippedSegmentCount,
    terminalSegmentCount: network.terminalSegmentCount,
    segments: network.segments,
    derived: network.derived,
    rebuildable: network.rebuildable,
  };
}

function validateAndRebuildNetwork(next, maxSegments) {
  validateBranchSource(next);
  const selected = next.branchGrowthNetworks?.[next.branchGrowthSource.id];
  if (!selected || selected.schema !== 'axm.branch-growth-network2d/v0.1') {
    throw new Error('branch propagation requires a derived branch growth network');
  }
  if (selected.sourceHash !== next.branchGrowthSourceHash) throw new Error('branch propagation network source lineage mismatch');
  if (selected.derived !== true || selected.rebuildable !== true) throw new Error('branch propagation network must remain derived and rebuildable');
  boundedInteger(selected.segmentCount, 1, HARD_MAX_SEGMENTS, 'branch propagation selected network segmentCount');
  if (!Array.isArray(selected.segments) || selected.segments.length !== selected.segmentCount) {
    throw new Error('branch propagation selected network cardinality mismatch');
  }
  if (selected.segmentCount > maxSegments) {
    throw new Error(`branch propagation selected network exceeds maxSegments ${maxSegments}`);
  }

  const rebuildSeed = deepClone(next);
  rebuildSeed.branchGrowthNetworks = {};
  const rebuiltState = buildBranchGrowthNetworkHand.execute(rebuildSeed, { maxSegments }, {}).state;
  const rebuilt = rebuiltState.branchGrowthNetworks[next.branchGrowthSource.id];
  if (!rebuilt || selected.networkHash !== rebuilt.networkHash
    || hashValue(networkComparable(selected)) !== hashValue(networkComparable(rebuilt))) {
    throw new Error('branch propagation selected network does not match retained branch source rebuild');
  }
  return rebuilt;
}

function deriveEnvelope(next, network, phase) {
  const endDistanceById = new Map();
  const distanceRows = [];
  let maxPathLength = 0;

  for (const segment of network.segments) {
    const startDistance = segment.parentId === null ? 0 : endDistanceById.get(segment.parentId);
    if (startDistance === undefined) throw new Error(`branch propagation parent distance missing for ${segment.id}`);
    const endDistance = round6(startDistance + bounded(segment.actualLength, 0, 1, `branch propagation ${segment.id} actualLength`));
    endDistanceById.set(segment.id, endDistance);
    maxPathLength = Math.max(maxPathLength, endDistance);
    distanceRows.push({ segment, startDistance: round6(startDistance), endDistance });
  }

  maxPathLength = round6(maxPathLength);
  const segments = distanceRows.map(({ segment, startDistance, endDistance }) => {
    const normalizedStart = maxPathLength > EPSILON ? round6(startDistance / maxPathLength) : 0;
    const normalizedEnd = maxPathLength > EPSILON ? round6(endDistance / maxPathLength) : 0;
    return {
      segmentId: segment.id,
      index: segment.index,
      parentId: segment.parentId,
      generation: segment.generation,
      normalizedStart,
      normalizedEnd,
      startWeight: samplePropagationFrontSource(next.propagationFrontSource, normalizedStart, phase),
      endWeight: samplePropagationFrontSource(next.propagationFrontSource, normalizedEnd, phase),
    };
  });

  return {
    schema: 'axm.branch-propagation-envelope2d/v0.1',
    ...FIXED_DERIVATION,
    branchSourceHash: next.branchGrowthSourceHash,
    networkHash: network.networkHash,
    propagationSourceHash: next.propagationFrontSourceHash,
    phase,
    maxPathLength,
    segmentCount: segments.length,
    segments,
    derived: true,
    rebuildable: true,
  };
}

function envelopeHashPayload(envelope) {
  return {
    schema: envelope.schema,
    algorithm: envelope.algorithm,
    distanceMetric: envelope.distanceMetric,
    normalization: envelope.normalization,
    sampleSites: envelope.sampleSites,
    phaseMode: envelope.phaseMode,
    branchSourceHash: envelope.branchSourceHash,
    networkHash: envelope.networkHash,
    propagationSourceHash: envelope.propagationSourceHash,
    phase: envelope.phase,
    maxPathLength: envelope.maxPathLength,
    segmentCount: envelope.segmentCount,
    segments: envelope.segments,
    derived: envelope.derived,
    rebuildable: envelope.rebuildable,
  };
}

function finalizeEnvelope(envelope) {
  envelope.envelopeHash = hashValue(envelopeHashPayload(envelope));
  return envelope;
}

export function validateBranchPropagationEnvelope(state, envelope, options = {}) {
  const next = deepClone(state);
  validateBranchSource(next);
  validatePropagationSource(next);
  const maxSegments = boundedInteger(options.maxSegments ?? HARD_MAX_SEGMENTS, 1, HARD_MAX_SEGMENTS, 'branchPropagation.maxSegments');
  if (!envelope || envelope.schema !== 'axm.branch-propagation-envelope2d/v0.1') {
    throw new Error('branch propagation validation requires a derived envelope');
  }
  if (envelope.algorithm !== FIXED_DERIVATION.algorithm
    || envelope.distanceMetric !== FIXED_DERIVATION.distanceMetric
    || envelope.normalization !== FIXED_DERIVATION.normalization
    || envelope.sampleSites !== FIXED_DERIVATION.sampleSites
    || envelope.phaseMode !== FIXED_DERIVATION.phaseMode) {
    throw new Error('branch propagation envelope derivation semantics are invalid');
  }
  if (envelope.branchSourceHash !== next.branchGrowthSourceHash) throw new Error('branch propagation branch source lineage mismatch');
  if (envelope.propagationSourceHash !== next.propagationFrontSourceHash) throw new Error('branch propagation propagation source lineage mismatch');
  if (envelope.derived !== true || envelope.rebuildable !== true) throw new Error('branch propagation envelope must remain derived and rebuildable');
  bounded(envelope.phase, 0, 1, 'branch propagation envelope phase');
  boundedInteger(envelope.segmentCount, 1, maxSegments, 'branch propagation envelope segmentCount');
  if (!Array.isArray(envelope.segments) || envelope.segments.length !== envelope.segmentCount) {
    throw new Error('branch propagation envelope cardinality mismatch');
  }
  if (hashValue(envelopeHashPayload(envelope)) !== envelope.envelopeHash) {
    throw new Error('branch propagation envelope hash mismatch');
  }

  const rebuiltNetwork = validateAndRebuildNetwork(next, maxSegments);
  if (envelope.networkHash !== rebuiltNetwork.networkHash) throw new Error('branch propagation envelope network lineage mismatch');
  const expected = finalizeEnvelope(deriveEnvelope(next, rebuiltNetwork, envelope.phase));
  if (envelope.envelopeHash !== expected.envelopeHash
    || hashValue(envelopeHashPayload(envelope)) !== hashValue(envelopeHashPayload(expected))) {
    throw new Error('branch propagation envelope does not match fresh source derivation');
  }
  return true;
}

export const buildBranchPropagationEnvelopeHand = hand('fx.growth.branching2d-propagation-front-envelope-build', (state, params = {}) => {
  const next = deepClone(state);
  validateBranchSource(next);
  validatePropagationSource(next);
  const maxSegments = boundedInteger(params.maxSegments ?? HARD_MAX_SEGMENTS, 1, HARD_MAX_SEGMENTS, 'branchPropagation.maxSegments');
  const phase = clampUnit(params.phase ?? 0.5, 'branchPropagation.phase');
  const rebuiltNetwork = validateAndRebuildNetwork(next, maxSegments);
  const envelope = finalizeEnvelope(deriveEnvelope(next, rebuiltNetwork, phase));

  next.branchPropagationEnvelopes ??= {};
  const key = `${next.branchGrowthSource.id}::${next.propagationFrontSource.id}`;
  next.branchPropagationEnvelopes[key] = envelope;

  return {
    state: next,
    evidence: {
      branchSourceHash: next.branchGrowthSourceHash,
      networkHash: rebuiltNetwork.networkHash,
      propagationSourceHash: next.propagationFrontSourceHash,
      envelopeHash: envelope.envelopeHash,
      phase,
      segmentCount: envelope.segmentCount,
      maxPathLength: envelope.maxPathLength,
      maxSegments,
      hardMaxSegments: HARD_MAX_SEGMENTS,
      sourceReuse: 'internal-donors-only',
      performanceMeasurement: 'NOT_TESTED',
      visualInspection: 'NOT_TESTED',
    },
  };
}, 'Derive a bounded renderer-neutral propagation envelope over retained branch topology using normalized root-path distance while keeping branch and propagation sources independently authoritative.');

export const BRANCH_PROPAGATION_HANDS = [buildBranchPropagationEnvelopeHand];

export const BRANCH_PROPAGATION_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.growth.branching2d-propagation-front',
  version: '0.1.0',
  stages: [
    {
      id: 'build-branch-propagation-envelope',
      hand: buildBranchPropagationEnvelopeHand.id,
      params: { phase: 0.5, maxSegments: HARD_MAX_SEGMENTS },
    },
  ],
});
