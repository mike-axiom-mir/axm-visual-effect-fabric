import { deepClone, hashValue } from './hand-runtime.mjs';

const MAX_CHANNELS = 32;
const MAX_CYCLES_PER_GROUP = 32;
const EPSILON = 1e-6;
const round6 = (value) => Number(Number(value).toFixed(6));

const FIXED_SEMANTICS = Object.freeze({
  algorithm: 'integer-cycle-phase-relationship1d/v0.1',
  phaseDomain: 'normalized-group-cycle',
  wrapMode: 'loop',
  relationshipRule: 'channel-phase=wrap(group-phase*cycles-per-group+phase-offset)',
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

function boundedInteger(value, min, max, label) {
  const number = finite(value, label);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(`${label} must be an integer within [${min},${max}]`);
  }
  return number;
}

function normalizeId(value, label) {
  const id = String(value ?? '').trim();
  if (!id || id.length > 96) throw new Error(`${label} must be non-empty and <= 96 characters`);
  return id;
}

function wrapUnit(value, label) {
  const number = finite(value, label);
  const wrapped = ((number % 1) + 1) % 1;
  const rounded = round6(wrapped);
  return rounded >= 1 ? 0 : rounded;
}

function validateNormalizedSource(source) {
  if (!source || source.schema !== 'axm.phase-relationship-source/v0.1') {
    throw new Error('phase relationship requires normalized source');
  }
  normalizeId(source.id, 'phase relationship source id');
  if (source.algorithm !== FIXED_SEMANTICS.algorithm) throw new Error('phase relationship source algorithm is invalid');
  if (source.phaseDomain !== FIXED_SEMANTICS.phaseDomain) throw new Error('phase relationship source phase domain is invalid');
  if (source.wrapMode !== FIXED_SEMANTICS.wrapMode) throw new Error('phase relationship source wrap mode is invalid');
  if (source.relationshipRule !== FIXED_SEMANTICS.relationshipRule) throw new Error('phase relationship source relationship rule is invalid');
  if (!Array.isArray(source.channels) || source.channels.length < 2 || source.channels.length > MAX_CHANNELS) {
    throw new Error(`phase relationship source must contain 2..${MAX_CHANNELS} channels`);
  }

  const seen = new Set();
  let previousId = '';
  for (const [index, channel] of source.channels.entries()) {
    if (!channel || typeof channel !== 'object') throw new Error(`phase relationship channel ${index} must be an object`);
    const id = normalizeId(channel.id, `phase relationship channel ${index}.id`);
    if (seen.has(id)) throw new Error(`phase relationship channel id must be unique: ${id}`);
    seen.add(id);
    if (previousId && id.localeCompare(previousId) <= 0) throw new Error('phase relationship source channels must be sorted by id');
    previousId = id;
    boundedInteger(channel.cyclesPerGroup, 1, MAX_CYCLES_PER_GROUP, `phase relationship channel ${index}.cyclesPerGroup`);
    const offset = Number(channel.phaseOffset);
    if (!Number.isFinite(offset) || offset < 0 || offset >= 1) {
      throw new Error(`phase relationship channel ${index}.phaseOffset must be within [0,1)`);
    }
  }
  if (!source.provenance || source.provenance.sourceReuse !== 'none') {
    throw new Error('phase relationship source provenance must declare sourceReuse none');
  }
}

function validateSourceState(state) {
  if (!state.phaseRelationshipSource || !state.phaseRelationshipSourceHash) {
    throw new Error('phase relationship requires normalized source state');
  }
  if (hashValue(state.phaseRelationshipSource) !== state.phaseRelationshipSourceHash) {
    throw new Error('phase relationship source state hash mismatch');
  }
  validateNormalizedSource(state.phaseRelationshipSource);
}

function phaseSetHashPayload(set) {
  return {
    schema: set.schema,
    sourceHash: set.sourceHash,
    groupPhase: set.groupPhase,
    channels: set.channels,
    derived: set.derived,
    rebuildable: set.rebuildable,
  };
}

function resolveChannels(source, groupPhase) {
  return source.channels.map((channel) => ({
    id: channel.id,
    phase: wrapUnit(
      groupPhase * channel.cyclesPerGroup + channel.phaseOffset,
      `phase relationship ${channel.id} phase`,
    ),
  }));
}

export function validatePhaseRelationshipSet(state, set) {
  validateSourceState(state);
  if (!set || set.schema !== 'axm.phase-relationship-set/v0.1') {
    throw new Error('phase relationship validation requires derived phase set');
  }
  if (set.sourceHash !== state.phaseRelationshipSourceHash) {
    throw new Error('phase relationship derived source lineage mismatch');
  }
  if (set.derived !== true || set.rebuildable !== true) {
    throw new Error('phase relationship set must remain derived and rebuildable');
  }
  const groupPhase = Number(set.groupPhase);
  if (!Number.isFinite(groupPhase) || groupPhase < 0 || groupPhase >= 1) {
    throw new Error('phase relationship derived groupPhase must be within [0,1)');
  }
  if (!Array.isArray(set.channels) || set.channels.length !== state.phaseRelationshipSource.channels.length) {
    throw new Error('phase relationship derived channel cardinality mismatch');
  }
  if (hashValue(phaseSetHashPayload(set)) !== set.phaseSetHash) {
    throw new Error('phase relationship set hash mismatch');
  }

  const expected = resolveChannels(state.phaseRelationshipSource, groupPhase);
  for (let index = 0; index < expected.length; index += 1) {
    const actual = set.channels[index];
    if (!actual || actual.id !== expected[index].id) {
      throw new Error(`phase relationship derived channel ${index} identity mismatch`);
    }
    if (Math.abs(actual.phase - expected[index].phase) > EPSILON) {
      throw new Error(`phase relationship derived channel ${actual.id} phase mismatch`);
    }
  }
  return true;
}

export const normalizePhaseRelationshipSourceHand = hand('fx.animation.phase-relationship1d-source-normalize', (state) => {
  const next = deepClone(state);
  const request = next.phaseRelationshipRequest;
  if (!request || typeof request !== 'object') throw new Error('phase relationship requires phaseRelationshipRequest state');

  const id = normalizeId(request.id ?? 'phase-relationship', 'phaseRelationshipRequest.id');
  if (!Array.isArray(request.channels) || request.channels.length < 2 || request.channels.length > MAX_CHANNELS) {
    throw new Error(`phaseRelationshipRequest.channels must contain 2..${MAX_CHANNELS} entries`);
  }

  const seen = new Set();
  const channels = request.channels.map((channel, index) => {
    if (!channel || typeof channel !== 'object') throw new Error(`phaseRelationshipRequest.channels[${index}] must be an object`);
    const channelId = normalizeId(channel.id, `phaseRelationshipRequest.channels[${index}].id`);
    if (seen.has(channelId)) throw new Error(`phaseRelationshipRequest channel id must be unique: ${channelId}`);
    seen.add(channelId);
    return {
      id: channelId,
      cyclesPerGroup: boundedInteger(
        channel.cyclesPerGroup ?? 1,
        1,
        MAX_CYCLES_PER_GROUP,
        `phaseRelationshipRequest.channels[${index}].cyclesPerGroup`,
      ),
      phaseOffset: wrapUnit(channel.phaseOffset ?? 0, `phaseRelationshipRequest.channels[${index}].phaseOffset`),
    };
  }).sort((a, b) => a.id.localeCompare(b.id));

  next.phaseRelationshipSource = {
    schema: 'axm.phase-relationship-source/v0.1',
    id,
    ...FIXED_SEMANTICS,
    channels,
    provenance: {
      origin: 'AXM Visual Effect Fabric hand-lab',
      adjacentDonors: [
        'hand-lab/src/parameter-curve.mjs#fx.animation.parameter-curve1d',
        'hand-lab/src/flicker-cycle1d.mjs#fx.animation.flicker-cycle1d',
      ],
      relationship: 'coordinates-derived-loop-phases-only',
      sourceReuse: 'none',
    },
  };
  validateNormalizedSource(next.phaseRelationshipSource);
  next.phaseRelationshipSourceHash = hashValue(next.phaseRelationshipSource);

  return {
    state: next,
    evidence: {
      phaseRelationshipSourceHash: next.phaseRelationshipSourceHash,
      channelCount: channels.length,
      phaseDomain: next.phaseRelationshipSource.phaseDomain,
      wrapMode: next.phaseRelationshipSource.wrapMode,
      sourceReuse: 'none',
      visualInspection: 'NOT_TESTED',
      performanceMeasurement: 'NOT_TESTED',
    },
  };
}, 'Normalize a bounded consumer-neutral relationship among multiple looping normalized phases without sampling, binding, or rewriting the participating effect donors.');

export const resolvePhaseRelationshipHand = hand('fx.animation.phase-relationship1d-resolve', (state, params = {}) => {
  const next = deepClone(state);
  validateSourceState(next);
  const groupPhase = wrapUnit(params.groupPhase ?? 0, 'phaseRelationship.groupPhase');
  const set = {
    schema: 'axm.phase-relationship-set/v0.1',
    sourceHash: next.phaseRelationshipSourceHash,
    groupPhase,
    channels: resolveChannels(next.phaseRelationshipSource, groupPhase),
    derived: true,
    rebuildable: true,
  };
  set.phaseSetHash = hashValue(phaseSetHashPayload(set));

  next.phaseRelationshipSets ??= {};
  next.phaseRelationshipSets[next.phaseRelationshipSource.id] = set;

  return {
    state: next,
    evidence: {
      phaseRelationshipSourceHash: next.phaseRelationshipSourceHash,
      phaseSetHash: set.phaseSetHash,
      groupPhase,
      channelCount: set.channels.length,
      performanceMeasurement: 'NOT_TESTED',
      visualInspection: 'NOT_TESTED',
    },
  };
}, 'Resolve one rebuildable phase snapshot from retained multi-cycle phase relationships while keeping the selected group phase and downstream donor bindings non-canonical.');

export const PHASE_RELATIONSHIP_HANDS = [
  normalizePhaseRelationshipSourceHand,
  resolvePhaseRelationshipHand,
];

export const PHASE_RELATIONSHIP_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.animation.phase-relationship1d',
  version: '0.1.0',
  stages: [
    { id: 'normalize-phase-relationship-source', hand: 'fx.animation.phase-relationship1d-source-normalize', params: {} },
    { id: 'resolve-phase-relationship', hand: 'fx.animation.phase-relationship1d-resolve', params: { groupPhase: 0 } },
  ],
});

export function makePhaseRelationshipState(options = {}) {
  return {
    schema: 'axm.effect-work-state/v0.1',
    phaseRelationshipRequest: {
      id: options.id ?? 'phase-relationship',
      channels: deepClone(options.channels ?? [
        { id: 'primary', cyclesPerGroup: 1, phaseOffset: 0 },
        { id: 'secondary', cyclesPerGroup: 2, phaseOffset: 0.25 },
      ]),
    },
    phaseRelationshipSets: {},
  };
}
