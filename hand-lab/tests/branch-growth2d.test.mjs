import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph, hashValue } from '../src/hand-runtime.mjs';
import {
  BRANCH_GROWTH_2D_HANDS,
  BRANCH_GROWTH_2D_GRAPH,
  normalizeBranchGrowthSourceHand,
  buildBranchGrowthNetworkHand,
  realizeBranchGrowthStaticSvgHand,
} from '../src/branch-growth2d.mjs';

const registry = createHandRegistry(BRANCH_GROWTH_2D_HANDS);

function initial(overrides = {}) {
  return {
    consumerMetadata: { untouched: true, label: 'neutral-fixture' },
    branchGrowthRequest: {
      id: 'fixture-growth',
      origin: [0.5, 0.92],
      headingTurns: 0.75,
      baseLength: 0.18,
      lengthDecay: 0.66,
      branchOffsetsTurns: [-0.075, 0.075],
      generations: 5,
      ...overrides,
    },
  };
}

function run(state, callerKind = 'human') {
  return executeHandGraph({ registry, graph: BRANCH_GROWTH_2D_GRAPH, initialState: state, context: { callerKind } });
}

test('human and machine callers produce identical retained source, network and SVG', () => {
  const human = run(initial(), 'human');
  const machine = run(initial(), 'machine');
  assert.equal(human.finalState.branchGrowthSourceHash, machine.finalState.branchGrowthSourceHash);
  assert.equal(human.finalState.branchGrowthNetworks['fixture-growth'].networkHash, machine.finalState.branchGrowthNetworks['fixture-growth'].networkHash);
  assert.equal(human.finalState.realizations.branchGrowthStaticSvg.content, machine.finalState.realizations.branchGrowthStaticSvg.content);
  assert.deepEqual(human.finalState.consumerMetadata, initial().consumerMetadata);
});

test('working-set budget and renderer controls do not rewrite source truth', () => {
  const normalized = normalizeBranchGrowthSourceHand.execute(initial(), {}, {});
  const sourceHash = normalized.state.branchGrowthSourceHash;
  const sourceSnapshot = structuredClone(normalized.state.branchGrowthSource);
  const smallBudget = buildBranchGrowthNetworkHand.execute(normalized.state, { maxSegments: 256 }, {});
  const largeBudget = buildBranchGrowthNetworkHand.execute(normalized.state, { maxSegments: 2048 }, {});
  assert.equal(smallBudget.state.branchGrowthNetworks['fixture-growth'].networkHash, largeBudget.state.branchGrowthNetworks['fixture-growth'].networkHash);
  assert.equal(smallBudget.state.branchGrowthSourceHash, sourceHash);
  assert.deepEqual(smallBudget.state.branchGrowthSource, sourceSnapshot);

  const a = realizeBranchGrowthStaticSvgHand.execute(smallBudget.state, { width: 320, height: 240, strokeWidth: 1 }, {});
  const b = realizeBranchGrowthStaticSvgHand.execute(smallBudget.state, { width: 900, height: 500, strokeWidth: 4 }, {});
  assert.equal(a.state.branchGrowthSourceHash, b.state.branchGrowthSourceHash);
  assert.equal(a.state.branchGrowthNetworks['fixture-growth'].networkHash, b.state.branchGrowthNetworks['fixture-growth'].networkHash);
  assert.notEqual(a.state.realizations.branchGrowthStaticSvg.content, b.state.realizations.branchGrowthStaticSvg.content);
});

test('materially different branching forms do not collapse into one fixture', () => {
  const fork = run(initial({ branchOffsetsTurns: [-0.075, 0.075], generations: 5 }));
  const asymmetric = run(initial({
    id: 'asymmetric',
    origin: [0.28, 0.9],
    headingTurns: 0.73,
    baseLength: 0.14,
    branchOffsetsTurns: [-0.10, 0.015, 0.085],
    generations: 4,
  }));
  const forkNetwork = fork.finalState.branchGrowthNetworks['fixture-growth'];
  const asymmetricNetwork = asymmetric.finalState.branchGrowthNetworks.asymmetric;
  assert.notEqual(forkNetwork.networkHash, asymmetricNetwork.networkHash);
  assert.notEqual(fork.finalState.realizations.branchGrowthStaticSvg.content, asymmetric.finalState.realizations.branchGrowthStaticSvg.content);
  assert.ok(forkNetwork.segmentCount > 1);
  assert.ok(asymmetricNetwork.segmentCount > 1);
});

test('boundary clipping is parametric, explicit and terminates clipped growth', () => {
  const result = run(initial({ id: 'edge', origin: [0.98, 0.5], headingTurns: 0, baseLength: 0.3, generations: 6 }));
  const network = result.finalState.branchGrowthNetworks.edge;
  assert.equal(network.segmentCount, 1);
  assert.equal(network.clippedSegmentCount, 1);
  assert.equal(network.terminalSegmentCount, 1);
  assert.equal(network.segments[0].clipped, true);
  assert.deepEqual(network.segments[0].end, [1, 0.5]);
  assert.equal(network.segments[0].requestedLength, 0.3);
  assert.equal(network.segments[0].actualLength, 0.02);

  const diagonal = run(initial({ id: 'diagonal-edge', origin: [0.9, 0.8], headingTurns: 0.125, baseLength: 0.5, generations: 3 }));
  const segment = diagonal.finalState.branchGrowthNetworks['diagonal-edge'].segments[0];
  assert.equal(segment.clipped, true);
  assert.equal(segment.end[0], 1);
  assert.ok(segment.end[1] < 1, 'line should intersect x=1 before y=1 rather than clamp to the corner');
  assert.ok(segment.actualLength < segment.requestedLength);
});

test('source and derived-network lineage drift are rejected before realization', () => {
  const normalized = normalizeBranchGrowthSourceHand.execute(initial(), {}, {}).state;
  const built = buildBranchGrowthNetworkHand.execute(normalized, {}, {}).state;
  const sourceDrift = structuredClone(built);
  sourceDrift.branchGrowthSource.baseLength = 0.3;
  assert.throws(() => realizeBranchGrowthStaticSvgHand.execute(sourceDrift, {}, {}), /source state hash mismatch/);

  const networkDrift = structuredClone(built);
  networkDrift.branchGrowthNetworks['fixture-growth'].segments[0].end[0] = 0.123;
  assert.throws(() => realizeBranchGrowthStaticSvgHand.execute(networkDrift, {}, {}), /network hash mismatch/);
});

test('invalid canonical controls and segment-budget overflow fail loudly', () => {
  assert.throws(() => normalizeBranchGrowthSourceHand.execute(initial({ generations: 9 }), {}, {}), /generations/);
  assert.throws(() => normalizeBranchGrowthSourceHand.execute(initial({ branchOffsetsTurns: [] }), {}, {}), /1\.\.4 offsets/);
  assert.throws(() => normalizeBranchGrowthSourceHand.execute(initial({ branchOffsetsTurns: [-0.6] }), {}, {}), /within \[-0\.5,0\.5\]/);
  assert.throws(() => normalizeBranchGrowthSourceHand.execute(initial({ id: 'x'.repeat(97) }), {}, {}), /<= 96 characters/);

  const explosive = normalizeBranchGrowthSourceHand.execute(initial({
    id: 'explosive',
    origin: [0.5, 0.9],
    headingTurns: 0.75,
    baseLength: 0.01,
    lengthDecay: 0.5,
    branchOffsetsTurns: [-0.004, -0.001, 0.001, 0.004],
    generations: 8,
  }), {}, {}).state;
  assert.throws(() => buildBranchGrowthNetworkHand.execute(explosive, { maxSegments: 64 }, {}), /segment budget exceeded/);
  assert.throws(() => buildBranchGrowthNetworkHand.execute(explosive, { maxSegments: 4097 }, {}), /within \[1,4096\]/);
});

test('SVG escapes source-derived segment ids instead of exposing markup', () => {
  const result = run(initial({ id: 'growth&<"\'>' }));
  const content = result.finalState.realizations.branchGrowthStaticSvg.content;
  assert.match(content, /data-segment="growth&amp;&lt;&quot;&apos;&gt;:root"/);
  assert.doesNotMatch(content, /data-segment="growth&<"/);
});

test('derived artifact hash is tied to exact SVG content and retained lineage', () => {
  const result = run(initial());
  const realization = result.finalState.realizations.branchGrowthStaticSvg;
  assert.equal(result.checkpoints.at(-1).evidence.artifactHash, hashValue(realization.content));
  assert.equal(realization.sourceHash, result.finalState.branchGrowthSourceHash);
  assert.equal(realization.networkHash, result.finalState.branchGrowthNetworks['fixture-growth'].networkHash);
  assert.match(realization.content, /<svg/);
  assert.match(realization.content, /data-segment="fixture-growth:root"/);
});
