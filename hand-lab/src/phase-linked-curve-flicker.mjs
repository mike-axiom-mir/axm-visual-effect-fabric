import { deepClone, hashValue } from './hand-runtime.mjs';
import {
  makeParameterCurveState,
  normalizeParameterCurveHand,
  sampleParameterCurveSource,
} from './parameter-curve.mjs';
import {
  makeFlickerCycleState,
  normalizeFlickerCycleSourceHand,
  sampleFlickerCycleSource,
} from './flicker-cycle1d.mjs';
import {
  makePhaseRelationshipState,
  normalizePhaseRelationshipSourceHand,
  resolvePhaseRelationshipHand,
  validatePhaseRelationshipSet,
} from './phase-relationship1d.mjs';

const MAX_ID_LENGTH = 96;

const FIXED_SEMANTICS = Object.freeze({
  mapping: 'relationship-channel-phase-to-independent-donor-sample',
  combination: 'none',
  schedulerAuthority: 'none',
  phaseSelection: 'derived-only',
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

function normalizeId(value, label) {
  const id = String(value ?? '').trim();
  if (!id || id.length > MAX_ID_LENGTH) {
    throw new Error(`${label} must be non-empty and <= ${MAX_ID_LENGTH} characters`);
  }
  return id;
}

function validateParameterCurveTruth(state) {
  if (!state.parameterCurveSource || !state.parameterCurveSourceHash) {
    throw new Error('phase-linked sampling requires normalized parameter curve source');
  }
  if (hashValue(state.parameterCurveSource) !== state.parameterCurveSourceHash) {
    throw new Error('parameter curve source state hash mismatch');
  }
  if (state.parameterCurveSource.wrapMode !== 'loop') {
    throw new Error('phase-linked sampling requires parameter curve wrapMode loop');
  }
  if (!state.parameterCurveSource.provenance || state.parameterCurveSource.provenance.sourceReuse !== 'none') {
    throw new Error('parameter curve source provenance must declare sourceReuse none');
  }
  // The donor sampler validates the retained curve schema, keyframe bounds/order,
  // interpolation vocabulary, and loop behavior without rewriting the source.
  sampleParameterCurveSource(state.parameterCurveSource, 0);
}

function validateFlickerTruth(state) {
  if (!state.flickerCycleSource || !state.flickerCycleSourceHash) {
    throw new Error('phase-linked sampling requires normalized flicker cycle source');
  }
  if (hashValue(state.flickerCycleSource) !== state.flickerCycleSourceHash) {
    throw new Error('flicker cycle source state hash mismatch');
  }
  // The donor sampler independently validates its fixed algorithm, wrap,
  // interpolation, seed/slot bounds, value range, and provenance semantics.
  sampleFlickerCycleSource(state.flickerCycleSource, 0);
}

function validateAllRetainedTruth(state) {
  validateParameterCurveTruth(state);
  validateFlickerTruth(state);
  if (!state.phaseRelationshipSource || !state.phaseRelationshipSourceHash) {
    throw new Error('phase-linked sampling requires normalized phase relationship source');
  }
  if (hashValue(state.phaseRelationshipSource) !== state.phaseRelationshipSourceHash) {
    throw new Error('phase relationship source state hash mismatch');
  }
}

function findChannel(set, id, label) {
  const channel = set.channels.find((candidate) => candidate.id === id);
  if (!channel) throw new Error(`${label} channel ${id} is absent from the selected phase relationship set`);
  return channel;
}

function snapshotHashPayload(snapshot) {
  return {
    schema: snapshot.schema,
    ...FIXED_SEMANTICS,
    phaseRelationshipSourceHash: snapshot.phaseRelationshipSourceHash,
    phaseSetHash: snapshot.phaseSetHash,
    parameterCurveSourceHash: snapshot.parameterCurveSourceHash,
    flickerCycleSourceHash: snapshot.flickerCycleSourceHash,
    groupPhase: snapshot.groupPhase,
    curve: snapshot.curve,
    flicker: snapshot.flicker,
    derived: snapshot.derived,
    rebuildable: snapshot.rebuildable,
  };
}

function buildExpectedSnapshot(state, phaseSet, curveChannelId, flickerChannelId) {
  validateAllRetainedTruth(state);
  validatePhaseRelationshipSet(state, phaseSet);

  const curveId = normalizeId(curveChannelId, 'curveChannelId');
  const flickerId = normalizeId(flickerChannelId, 'flickerChannelId');
  if (curveId === flickerId) {
    throw new Error('phase-linked sampling requires distinct curve and flicker channels');
  }

  const curveChannel = findChannel(phaseSet, curveId, 'parameter curve');
  const flickerChannel = findChannel(phaseSet, flickerId, 'flicker cycle');
  const snapshot = {
    schema: 'axm.phase-linked-curve-flicker-sample/v0.1',
    ...FIXED_SEMANTICS,
    phaseRelationshipSourceHash: state.phaseRelationshipSourceHash,
    phaseSetHash: phaseSet.phaseSetHash,
    parameterCurveSourceHash: state.parameterCurveSourceHash,
    flickerCycleSourceHash: state.flickerCycleSourceHash,
    groupPhase: phaseSet.groupPhase,
    curve: {
      channelId: curveId,
      phase: curveChannel.phase,
      value: sampleParameterCurveSource(state.parameterCurveSource, curveChannel.phase),
    },
    flicker: {
      channelId: flickerId,
      phase: flickerChannel.phase,
      value: sampleFlickerCycleSource(state.flickerCycleSource, flickerChannel.phase),
    },
    derived: true,
    rebuildable: true,
  };
  snapshot.sampleHash = hashValue(snapshotHashPayload(snapshot));
  return snapshot;
}

export function validatePhaseLinkedCurveFlickerSample(state, selected) {
  validateAllRetainedTruth(state);
  if (!selected || selected.schema !== 'axm.phase-linked-curve-flicker-sample/v0.1') {
    throw new Error('phase-linked validation requires derived curve/flicker sample');
  }
  if (selected.mapping !== FIXED_SEMANTICS.mapping) throw new Error('phase-linked sample mapping semantics are invalid');
  if (selected.combination !== FIXED_SEMANTICS.combination) throw new Error('phase-linked sample combination semantics are invalid');
  if (selected.schedulerAuthority !== FIXED_SEMANTICS.schedulerAuthority) throw new Error('phase-linked sample scheduler semantics are invalid');
  if (selected.phaseSelection !== FIXED_SEMANTICS.phaseSelection) throw new Error('phase-linked sample phase-selection semantics are invalid');
  if (selected.derived !== true || selected.rebuildable !== true) {
    throw new Error('phase-linked sample must remain derived and rebuildable');
  }
  if (selected.phaseRelationshipSourceHash !== state.phaseRelationshipSourceHash) {
    throw new Error('phase-linked relationship source lineage mismatch');
  }
  if (selected.parameterCurveSourceHash !== state.parameterCurveSourceHash) {
    throw new Error('phase-linked parameter curve lineage mismatch');
  }
  if (selected.flickerCycleSourceHash !== state.flickerCycleSourceHash) {
    throw new Error('phase-linked flicker cycle lineage mismatch');
  }
  if (hashValue(snapshotHashPayload(selected)) !== selected.sampleHash) {
    throw new Error('phase-linked sample hash mismatch');
  }

  const phaseSet = state.phaseRelationshipSets?.[state.phaseRelationshipSource.id];
  if (!phaseSet) throw new Error('phase-linked validation requires selected phase relationship set in state');
  if (phaseSet.phaseSetHash !== selected.phaseSetHash) {
    throw new Error('phase-linked phase-set lineage mismatch');
  }
  if (phaseSet.groupPhase !== selected.groupPhase) {
    throw new Error('phase-linked group phase mismatch');
  }

  const expected = buildExpectedSnapshot(
    state,
    phaseSet,
    selected.curve?.channelId,
    selected.flicker?.channelId,
  );
  if (expected.sampleHash !== selected.sampleHash) {
    throw new Error('phase-linked sample does not rebuild from retained donor truth');
  }
  return true;
}

export const samplePhaseLinkedCurveFlickerHand = hand('fx.animation.phase-linked-curve-flicker-sample', (state, params = {}) => {
  const next = deepClone(state);
  validateAllRetainedTruth(next);

  const relationshipId = next.phaseRelationshipSource.id;
  const phaseSet = next.phaseRelationshipSets?.[relationshipId];
  if (!phaseSet) {
    throw new Error(`phase-linked sampling requires derived phase relationship set ${relationshipId}`);
  }
  validatePhaseRelationshipSet(next, phaseSet);

  const curveChannelId = normalizeId(params.curveChannelId ?? 'curve', 'curveChannelId');
  const flickerChannelId = normalizeId(params.flickerChannelId ?? 'flicker', 'flickerChannelId');
  const selected = buildExpectedSnapshot(next, phaseSet, curveChannelId, flickerChannelId);

  next.phaseLinkedCurveFlickerSamples ??= {};
  next.phaseLinkedCurveFlickerSamples[relationshipId] = selected;

  return {
    state: next,
    evidence: {
      phaseRelationshipSourceHash: selected.phaseRelationshipSourceHash,
      phaseSetHash: selected.phaseSetHash,
      parameterCurveSourceHash: selected.parameterCurveSourceHash,
      flickerCycleSourceHash: selected.flickerCycleSourceHash,
      sampleHash: selected.sampleHash,
      groupPhase: selected.groupPhase,
      curveChannelId: selected.curve.channelId,
      curvePhase: selected.curve.phase,
      flickerChannelId: selected.flicker.channelId,
      flickerPhase: selected.flicker.phase,
      combination: selected.combination,
      schedulerAuthority: selected.schedulerAuthority,
      performanceMeasurement: 'NOT_TESTED',
      visualInspection: 'NOT_TESTED',
    },
  };
}, 'Sample one looping parameter curve and one flicker cycle from independently resolved relationship channels without combining values, rewriting retained sources, or acquiring scheduler authority.');

export const PHASE_LINKED_CURVE_FLICKER_HANDS = [
  normalizeParameterCurveHand,
  normalizeFlickerCycleSourceHand,
  normalizePhaseRelationshipSourceHand,
  resolvePhaseRelationshipHand,
  samplePhaseLinkedCurveFlickerHand,
];

export const PHASE_LINKED_CURVE_FLICKER_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.animation.phase-linked-curve-flicker',
  version: '0.1.0',
  stages: [
    { id: 'normalize-looping-parameter-curve', hand: 'fx.animation.parameter-curve-source-normalize', params: {} },
    { id: 'normalize-flicker-cycle', hand: 'fx.animation.flicker-cycle1d-source-normalize', params: {} },
    { id: 'normalize-phase-relationship', hand: 'fx.animation.phase-relationship1d-source-normalize', params: {} },
    { id: 'resolve-related-phases', hand: 'fx.animation.phase-relationship1d-resolve', params: { groupPhase: 0.25 } },
    {
      id: 'sample-independent-donors',
      hand: 'fx.animation.phase-linked-curve-flicker-sample',
      params: { curveChannelId: 'curve', flickerChannelId: 'flicker' },
    },
  ],
});

export function makePhaseLinkedCurveFlickerState(options = {}) {
  const curve = makeParameterCurveState({
    id: options.curve?.id ?? 'linked-curve',
    wrapMode: 'loop',
    keyframes: options.curve?.keyframes ?? [
      { t: 0, value: 0, interpolation: 'linear' },
      { t: 0.5, value: 1, interpolation: 'linear' },
      { t: 1, value: 0, interpolation: 'linear' },
    ],
  });
  const flicker = makeFlickerCycleState({
    id: options.flicker?.id ?? 'linked-flicker',
    seed: options.flicker?.seed ?? 7331,
    slotCount: options.flicker?.slotCount ?? 12,
    minValue: options.flicker?.minValue ?? 0,
    maxValue: options.flicker?.maxValue ?? 1,
    responsePower: options.flicker?.responsePower ?? 1,
    phaseOffset: options.flicker?.phaseOffset ?? 0,
  });
  const relationship = makePhaseRelationshipState({
    id: options.relationship?.id ?? 'curve-flicker-relationship',
    channels: options.relationship?.channels ?? [
      { id: 'curve', cyclesPerGroup: 1, phaseOffset: 0 },
      { id: 'flicker', cyclesPerGroup: 2, phaseOffset: 0.25 },
    ],
  });

  return {
    schema: 'axm.effect-work-state/v0.1',
    parameterCurveRequest: curve.parameterCurveRequest,
    flickerCycleRequest: flicker.flickerCycleRequest,
    phaseRelationshipRequest: relationship.phaseRelationshipRequest,
    parameterCurveSamples: {},
    flickerCycleSamples: {},
    phaseRelationshipSets: {},
    phaseLinkedCurveFlickerSamples: {},
  };
}
