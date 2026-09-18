import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph, hashValue } from '../src/hand-runtime.mjs';
import {
  makeBranchGrowth2dState,
  normalizeBranchGrowthSourceHand,
  buildBranchGrowthNetworkHand,
  realizeBranchGrowthStaticSvgHand,
} from '../src/branch-growth2d.mjs';
import {
  makePropagationFrontState,
  normalizePropagationFrontSourceHand,
} from '../src/propagation-front1d.mjs';
import { buildBranchPropagationEnvelopeHand } from '../src/branch-propagation-envelope.mjs';
import {
  BRANCH_PROPAGATION_STATIC_SVG_GRAPH,
  BRANCH_PROPAGATION_STATIC_SVG_HANDS,
  makeBranchPropagationStaticSvgState,
  realizeBranchPropagationStaticSvgHand,
} from '../src/branch-propagation-static-svg.mjs';

const registry = createHandRegistry(BRANCH_PROPAGATION_STATIC_SVG_HANDS);

function prepared(options = {}) {
  let state = makeBranchGrowth2dState({
    id: options.branchId ?? 'svg-branch',
    origin: options.origin ?? [0.5, 0.9],
    headingTurns: options.headingTurns ?? 0.75,
    baseLength: options.baseLength ?? 0.18,
    lengthDecay: options.lengthDecay ?? 0.65,
    branchOffsetsTurns: options.branchOffsetsTurns ?? [-0.08, 0.08],
    generations: options.generations ?? 4,
  });
  state = normalizeBranchGrowthSourceHand.execute(state, {}, {}).state;
  state = buildBranchGrowthNetworkHand.execute(state, { maxSegments: 4096 }, {}).state;

  const propagation = makePropagationFrontState({
    id: options.propagationId ?? 'svg-front',
    direction: options.direction ?? 'forward',
    frontSoftness: options.frontSoftness ?? 0.2,
  });
  state.propagationFrontRequest = propagation.propagationFrontRequest;
  state.propagationFrontSamples = {};
  state = normalizePropagationFrontSourceHand.execute(state, {}, {}).state;
  state.consumerMetadata = { untouched: true, label: 'caller-neutral' };
  return state;
}

function key(state) {
  return `${state.branchGrowthSource.id}::${state.propagationFrontSource.id}`;
}

function withEnvelope(state, phase) {
  return buildBranchPropagationEnvelopeHand.execute(state, { phase, maxSegments: 4096 }, {}).state;
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

test('human and machine callers produce the same propagation-aware SVG without rewriting retained truth', () => {
  const base = makeBranchPropagationStaticSvgState({
    id: 'graph-branch',
    propagationId: 'graph-front',
    generations: 4,
    frontSoftness: 0.2,
  });
  base.consumerMetadata = { untouched: true };
  const human = executeHandGraph({ registry, graph: BRANCH_PROPAGATION_STATIC_SVG_GRAPH, initialState: base, context: { callerKind: 'human' } });
  const machine = executeHandGraph({ registry, graph: BRANCH_PROPAGATION_STATIC_SVG_GRAPH, initialState: base, context: { callerKind: 'machine' } });
  const humanSvg = human.finalState.realizations.branchPropagationStaticSvg;
  const machineSvg = machine.finalState.realizations.branchPropagationStaticSvg;
  assert.equal(humanSvg.contentHash, machineSvg.contentHash);
  assert.equal(humanSvg.derivedFromStateHash, machineSvg.derivedFromStateHash);
  assert.deepEqual(human.finalState.branchGrowthSource, machine.finalState.branchGrowthSource);
  assert.deepEqual(human.finalState.propagationFrontSource, machine.finalState.propagationFrontSource);
  assert.deepEqual(human.finalState.consumerMetadata, base.consumerMetadata);
  assert.equal(realizeBranchPropagationStaticSvgHand.callerNeutral, true);
});

test('phase 1 is an exact renderer no-op and reuses the existing branch SVG bytes', () => {
  const built = withEnvelope(prepared({ frontSoftness: 0.3 }), 1);
  const controls = { width: 512, height: 384, strokeWidth: 2, opacity: 0.77, showOrigin: true, originRadius: 3 };
  const baseSvg = realizeBranchGrowthStaticSvgHand.execute(built, controls, {}).state.realizations.branchGrowthStaticSvg;
  const propagated = realizeBranchPropagationStaticSvgHand.execute(built, controls, {}).state.realizations.branchPropagationStaticSvg;
  assert.equal(propagated.content, baseSvg.content);
  assert.equal(propagated.contentHash, hashValue(baseSvg.content));
  assert.equal(propagated.networkHash, baseSvg.networkHash);
  assert.equal(propagated.rendererDonor, 'hand-lab/src/branch-growth2d.mjs#fx.growth.branching2d-static-svg-realize');
});

test('derived phase changes only disposable SVG expression while retained branch, network and propagation truth stay fixed', () => {
  const base = prepared();
  const networkHash = base.branchGrowthNetworks[base.branchGrowthSource.id].networkHash;
  const earlyState = withEnvelope(base, 0.25);
  const lateState = withEnvelope(base, 0.75);
  const early = realizeBranchPropagationStaticSvgHand.execute(earlyState, { showOrigin: false }, {}).state;
  const late = realizeBranchPropagationStaticSvgHand.execute(lateState, { showOrigin: false }, {}).state;
  const earlySvg = early.realizations.branchPropagationStaticSvg;
  const lateSvg = late.realizations.branchPropagationStaticSvg;
  assert.notEqual(earlySvg.contentHash, lateSvg.contentHash);
  assert.match(earlySvg.content, /<line[^>]+ opacity="(?:0|0\.[0-9]+)"\/>/);
  assert.equal(early.branchGrowthSourceHash, late.branchGrowthSourceHash);
  assert.equal(early.propagationFrontSourceHash, late.propagationFrontSourceHash);
  assert.equal(earlySvg.networkHash, networkHash);
  assert.equal(lateSvg.networkHash, networkHash);
});

test('the same renderer wrapper works across straight and branching topologies and keeps escaped donor ids valid', () => {
  const straightBase = withEnvelope(prepared({ branchId: 'straight<&"', branchOffsetsTurns: [0], generations: 4 }), 0.55);
  const branchingBase = withEnvelope(prepared({ branchId: 'branching', branchOffsetsTurns: [-0.12, 0.12], generations: 4 }), 0.55);
  const straight = realizeBranchPropagationStaticSvgHand.execute(straightBase, {}, {}).state.realizations.branchPropagationStaticSvg;
  const branching = realizeBranchPropagationStaticSvgHand.execute(branchingBase, {}, {}).state.realizations.branchPropagationStaticSvg;
  assert.notEqual(straight.contentHash, branching.contentHash);
  assert.match(straight.content, /data-segment="straight&lt;&amp;&quot;:root"/);
  assert.equal((straight.content.match(/<line /g) ?? []).length, straightBase.branchPropagationEnvelopes[key(straightBase)].segmentCount);
  assert.equal((branching.content.match(/<line /g) ?? []).length, branchingBase.branchPropagationEnvelopes[key(branchingBase)].segmentCount);
});

test('renderer controls remain disposable and do not alter either retained source or the verified envelope', () => {
  const built = withEnvelope(prepared(), 0.5);
  const envelopeHash = built.branchPropagationEnvelopes[key(built)].envelopeHash;
  const a = realizeBranchPropagationStaticSvgHand.execute(built, { width: 320, height: 240, strokeWidth: 1 }, {}).state;
  const b = realizeBranchPropagationStaticSvgHand.execute(built, { width: 900, height: 500, strokeWidth: 4 }, {}).state;
  assert.notEqual(a.realizations.branchPropagationStaticSvg.contentHash, b.realizations.branchPropagationStaticSvg.contentHash);
  assert.equal(a.branchGrowthSourceHash, b.branchGrowthSourceHash);
  assert.equal(a.propagationFrontSourceHash, b.propagationFrontSourceHash);
  assert.equal(a.branchPropagationEnvelopes[key(a)].envelopeHash, envelopeHash);
  assert.equal(b.branchPropagationEnvelopes[key(b)].envelopeHash, envelopeHash);
});

test('self-consistent envelope tampering and forged retained propagation semantics are rejected before rendering', () => {
  const tampered = withEnvelope(prepared(), 0.5);
  const envelope = tampered.branchPropagationEnvelopes[key(tampered)];
  envelope.segments[0].endWeight = envelope.segments[0].endWeight === 0 ? 0.25 : 0;
  envelope.envelopeHash = hashValue(envelopeHashPayload(envelope));
  assert.throws(() => realizeBranchPropagationStaticSvgHand.execute(tampered, {}, {}), /does not match fresh source derivation/);

  const forged = withEnvelope(prepared(), 0.5);
  forged.propagationFrontSource.profile = 'linear-convenience/v9';
  forged.propagationFrontSourceHash = hashValue(forged.propagationFrontSource);
  assert.throws(() => realizeBranchPropagationStaticSvgHand.execute(forged, {}, {}), /profile is invalid/);
});

test('structural and renderer budgets fail loudly without changing canonical source state', () => {
  const built = withEnvelope(prepared({ generations: 5 }), 0.5);
  const branchHash = built.branchGrowthSourceHash;
  const propagationHash = built.propagationFrontSourceHash;
  assert.throws(() => realizeBranchPropagationStaticSvgHand.execute(built, { maxSegments: 10 }, {}), /exceeds maxSegments 10/);
  assert.throws(() => realizeBranchPropagationStaticSvgHand.execute(built, { maxSegments: 4097 }, {}), /maxSegments.*\[1,4096\]/);
  assert.throws(() => realizeBranchPropagationStaticSvgHand.execute(built, { width: 5000 }, {}), /width.*\[16,4096\]/);
  assert.equal(built.branchGrowthSourceHash, branchHash);
  assert.equal(built.propagationFrontSourceHash, propagationHash);
});
