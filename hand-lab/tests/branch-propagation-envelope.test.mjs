import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph, hashValue } from '../src/hand-runtime.mjs';
import {
  makeBranchGrowth2dState,
  normalizeBranchGrowthSourceHand,
  buildBranchGrowthNetworkHand,
} from '../src/branch-growth2d.mjs';
import {
  makePropagationFrontState,
  normalizePropagationFrontSourceHand,
} from '../src/propagation-front1d.mjs';
import {
  BRANCH_PROPAGATION_GRAPH,
  BRANCH_PROPAGATION_HANDS,
  buildBranchPropagationEnvelopeHand,
  validateBranchPropagationEnvelope,
} from '../src/branch-propagation-envelope.mjs';

const registry = createHandRegistry(BRANCH_PROPAGATION_HANDS);

function prepared(options = {}) {
  const branchOptions = {
    id: options.branchId ?? 'fixture-branch',
    origin: options.origin ?? [0.5, 0.9],
    headingTurns: options.headingTurns ?? 0.75,
    baseLength: options.baseLength ?? 0.18,
    lengthDecay: options.lengthDecay ?? 0.65,
    branchOffsetsTurns: options.branchOffsetsTurns ?? [-0.08, 0.08],
    generations: options.generations ?? 4,
  };
  let state = makeBranchGrowth2dState(branchOptions);
  state = normalizeBranchGrowthSourceHand.execute(state, {}, {}).state;
  state = buildBranchGrowthNetworkHand.execute(state, { maxSegments: 4096 }, {}).state;

  const propagation = makePropagationFrontState({
    id: options.propagationId ?? 'fixture-front',
    direction: options.direction ?? 'forward',
    frontSoftness: options.frontSoftness ?? 0.2,
  });
  state.propagationFrontRequest = propagation.propagationFrontRequest;
  state.propagationFrontSamples = {};
  state = normalizePropagationFrontSourceHand.execute(state, {}, {}).state;
  state.consumerMetadata = { untouched: true, label: 'consumer-neutral' };
  return state;
}

function run(state, callerKind = 'human') {
  return executeHandGraph({ registry, graph: BRANCH_PROPAGATION_GRAPH, initialState: state, context: { callerKind } });
}

function envelopeKey(state) {
  return `${state.branchGrowthSource.id}::${state.propagationFrontSource.id}`;
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

test('human and machine callers produce the same branch propagation envelope without rewriting retained donors', () => {
  const base = prepared();
  const human = run(base, 'human');
  const machine = run(base, 'machine');
  const key = envelopeKey(human.finalState);
  assert.equal(human.finalState.branchPropagationEnvelopes[key].envelopeHash, machine.finalState.branchPropagationEnvelopes[key].envelopeHash);
  assert.deepEqual(human.finalState.branchGrowthSource, base.branchGrowthSource);
  assert.deepEqual(human.finalState.propagationFrontSource, base.propagationFrontSource);
  assert.deepEqual(human.finalState.consumerMetadata, base.consumerMetadata);
  assert.equal(buildBranchPropagationEnvelopeHand.callerNeutral, true);
});

test('one propagation Hand works across materially different straight and branching growth networks', () => {
  const straight = buildBranchPropagationEnvelopeHand.execute(prepared({ branchOffsetsTurns: [0], generations: 4 }), { phase: 0.55 }, {}).state;
  const branching = buildBranchPropagationEnvelopeHand.execute(prepared({ branchOffsetsTurns: [-0.12, 0.12], generations: 4 }), { phase: 0.55 }, {}).state;
  const straightEnvelope = straight.branchPropagationEnvelopes[envelopeKey(straight)];
  const branchingEnvelope = branching.branchPropagationEnvelopes[envelopeKey(branching)];
  assert.notEqual(straightEnvelope.segmentCount, branchingEnvelope.segmentCount);
  assert.equal(straightEnvelope.algorithm, branchingEnvelope.algorithm);
  for (const envelope of [straightEnvelope, branchingEnvelope]) {
    assert.ok(envelope.segments.every((segment) => segment.startWeight >= 0 && segment.startWeight <= 1));
    assert.ok(envelope.segments.every((segment) => segment.endWeight >= 0 && segment.endWeight <= 1));
    assert.equal(validateBranchPropagationEnvelope(envelope === straightEnvelope ? straight : branching, envelope), true);
  }
});

test('propagation positions follow cumulative root-path length instead of generation or point index', () => {
  const state = prepared({ branchOffsetsTurns: [0], generations: 3, baseLength: 0.2, lengthDecay: 0.5, frontSoftness: 0 });
  const built = buildBranchPropagationEnvelopeHand.execute(state, { phase: 0.6 }, {}).state;
  const envelope = built.branchPropagationEnvelopes[envelopeKey(built)];
  assert.equal(envelope.segmentCount, 3);
  assert.equal(envelope.maxPathLength, 0.35);
  assert.equal(envelope.segments[0].normalizedStart, 0);
  assert.equal(envelope.segments[0].normalizedEnd, 0.571429);
  assert.equal(envelope.segments[1].normalizedStart, 0.571429);
  assert.equal(envelope.segments[1].normalizedEnd, 0.857143);
  assert.equal(envelope.segments[2].normalizedEnd, 1);
  assert.equal(envelope.segments[0].endWeight, 1);
  assert.equal(envelope.segments[1].endWeight, 0);
});

test('phase stays derived: changing it changes only the envelope while retained branch, network and propagation truth remain unchanged', () => {
  const base = prepared();
  const sourceSnapshot = structuredClone(base.branchGrowthSource);
  const propagationSnapshot = structuredClone(base.propagationFrontSource);
  const networkHash = base.branchGrowthNetworks[base.branchGrowthSource.id].networkHash;
  const early = buildBranchPropagationEnvelopeHand.execute(base, { phase: 0.2 }, {}).state;
  const late = buildBranchPropagationEnvelopeHand.execute(base, { phase: 0.8 }, {}).state;
  const earlyEnvelope = early.branchPropagationEnvelopes[envelopeKey(early)];
  const lateEnvelope = late.branchPropagationEnvelopes[envelopeKey(late)];
  assert.notEqual(earlyEnvelope.envelopeHash, lateEnvelope.envelopeHash);
  assert.deepEqual(early.branchGrowthSource, sourceSnapshot);
  assert.deepEqual(late.branchGrowthSource, sourceSnapshot);
  assert.deepEqual(early.propagationFrontSource, propagationSnapshot);
  assert.deepEqual(late.propagationFrontSource, propagationSnapshot);
  assert.equal(earlyEnvelope.networkHash, networkHash);
  assert.equal(lateEnvelope.networkHash, networkHash);
});

test('forged retained semantics and self-consistent derived network tampering are rejected', () => {
  const base = prepared();

  const forgedBranch = structuredClone(base);
  forgedBranch.branchGrowthSource.boundaryMode = 'wrap';
  forgedBranch.branchGrowthSourceHash = hashValue(forgedBranch.branchGrowthSource);
  forgedBranch.branchGrowthNetworks = buildBranchGrowthNetworkHand.execute({ ...forgedBranch, branchGrowthNetworks: {} }, { maxSegments: 4096 }, {}).state.branchGrowthNetworks;
  assert.throws(() => buildBranchPropagationEnvelopeHand.execute(forgedBranch, { phase: 0.5 }, {}), /boundary mode is invalid/);

  const forgedPropagation = structuredClone(base);
  forgedPropagation.propagationFrontSource.profile = 'linear-convenience/v9';
  forgedPropagation.propagationFrontSourceHash = hashValue(forgedPropagation.propagationFrontSource);
  assert.throws(() => buildBranchPropagationEnvelopeHand.execute(forgedPropagation, { phase: 0.5 }, {}), /profile is invalid/);

  const tamperedNetwork = structuredClone(base);
  const network = tamperedNetwork.branchGrowthNetworks[tamperedNetwork.branchGrowthSource.id];
  const oldTerminal = network.segments[0].terminal;
  network.segments[0].terminal = !oldTerminal;
  network.terminalSegmentCount += oldTerminal ? -1 : 1;
  network.networkHash = hashValue(networkHashPayload(network));
  assert.throws(() => buildBranchPropagationEnvelopeHand.execute(tamperedNetwork, { phase: 0.5 }, {}), /does not match retained branch source rebuild/);
});

test('self-consistent envelope tampering is rejected by fresh derivation from both retained sources', () => {
  const built = buildBranchPropagationEnvelopeHand.execute(prepared(), { phase: 0.5 }, {}).state;
  const key = envelopeKey(built);
  const envelope = built.branchPropagationEnvelopes[key];
  envelope.segments[0].startWeight = envelope.segments[0].startWeight === 0 ? 0.25 : 0;
  envelope.envelopeHash = hashValue(envelopeHashPayload(envelope));
  assert.throws(() => validateBranchPropagationEnvelope(built, envelope), /does not match fresh source derivation/);
});

test('derived phase clamps explicitly and structural work budgets fail loudly without changing canonical truth', () => {
  const base = prepared({ branchOffsetsTurns: [-0.08, 0.08], generations: 5 });
  const before = buildBranchPropagationEnvelopeHand.execute(base, { phase: -4 }, {}).state;
  const after = buildBranchPropagationEnvelopeHand.execute(base, { phase: 9 }, {}).state;
  assert.equal(before.branchPropagationEnvelopes[envelopeKey(before)].phase, 0);
  assert.equal(after.branchPropagationEnvelopes[envelopeKey(after)].phase, 1);
  assert.equal(before.branchGrowthSourceHash, after.branchGrowthSourceHash);
  assert.equal(before.propagationFrontSourceHash, after.propagationFrontSourceHash);
  assert.throws(() => buildBranchPropagationEnvelopeHand.execute(base, { maxSegments: 10 }, {}), /exceeds maxSegments 10/);
  assert.throws(() => buildBranchPropagationEnvelopeHand.execute(base, { maxSegments: 4097 }, {}), /maxSegments.*\[1,4096\]/);
});
