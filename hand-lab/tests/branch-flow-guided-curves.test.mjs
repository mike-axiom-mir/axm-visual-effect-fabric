import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph, hashValue } from '../src/hand-runtime.mjs';
import {
  BRANCH_FLOW_GUIDED_CURVE_HANDS,
  BRANCH_FLOW_GUIDED_CURVE_GRAPH,
  makeBranchFlowGuidedCurveState,
  normalizeBranchFlowGuidanceSourceHand,
  buildBranchFlowGuidedCurveSetHand,
  realizeBranchFlowGuidedStaticSvgHand,
} from '../src/branch-flow-guided-curves.mjs';
import { normalizeBranchGrowthSourceHand, buildBranchGrowthNetworkHand } from '../src/branch-growth2d.mjs';
import { normalizeFlowFieldRequestHand } from '../src/field-flow-operators.mjs';

const registry = createHandRegistry(BRANCH_FLOW_GUIDED_CURVE_HANDS);
const round6 = (value) => Number(Number(value).toFixed(6));

function initial(options = {}) {
  return makeBranchFlowGuidedCurveState({
    growth: {
      id: options.growthId ?? 'fixture-growth',
      origin: options.origin ?? [0.5, 0.92],
      headingTurns: options.headingTurns ?? 0.75,
      baseLength: options.baseLength ?? 0.18,
      lengthDecay: options.lengthDecay ?? 0.66,
      branchOffsetsTurns: options.branchOffsetsTurns ?? [-0.075, 0.075],
      generations: options.generations ?? 5,
    },
    flow: {
      id: options.flowId ?? 'fixture-flow',
      mode: options.mode ?? 'gradient',
      strength: options.strength ?? 2.4,
      sampleStep: options.sampleStep ?? 0.02,
      field: {
        id: options.fieldId ?? 'fixture-field',
        seed: options.seed ?? 4242,
        frequency: options.frequency ?? 3.5,
        octaves: options.octaves ?? 4,
        lacunarity: 2,
        gain: 0.5,
        offset: options.fieldOffset ?? [0.1, -0.2],
      },
    },
    guidance: {
      id: options.guidanceId ?? 'fixture-guidance',
      curvatureScale: options.curvatureScale ?? 0.55,
      maxControlOffset: options.maxControlOffset ?? 0.09,
    },
  });
}

function run(state, callerKind = 'human') {
  return executeHandGraph({ registry, graph: BRANCH_FLOW_GUIDED_CURVE_GRAPH, initialState: state, context: { callerKind } });
}

function prepare(state = initial()) {
  let next = normalizeBranchGrowthSourceHand.execute(state, {}, {}).state;
  next = buildBranchGrowthNetworkHand.execute(next, {}, {}).state;
  next = normalizeFlowFieldRequestHand.execute(next, {}, {}).state;
  next = normalizeBranchFlowGuidanceSourceHand.execute(next, {}, {}).state;
  next = buildBranchFlowGuidedCurveSetHand.execute(next, {}, {}).state;
  return next;
}

test('human and machine callers produce identical retained lineages, curve set and SVG', () => {
  const human = run(initial(), 'human');
  const machine = run(initial(), 'machine');
  assert.equal(human.finalState.branchGrowthSourceHash, machine.finalState.branchGrowthSourceHash);
  assert.equal(human.finalState.branchGrowthNetworks['fixture-growth'].networkHash, machine.finalState.branchGrowthNetworks['fixture-growth'].networkHash);
  assert.equal(human.finalState.flowSourceHash, machine.finalState.flowSourceHash);
  assert.equal(human.finalState.branchFlowGuidanceSourceHash, machine.finalState.branchFlowGuidanceSourceHash);
  assert.equal(human.finalState.branchFlowGuidedCurveSets['fixture-guidance'].curveSetHash, machine.finalState.branchFlowGuidedCurveSets['fixture-guidance'].curveSetHash);
  assert.equal(human.finalState.realizations.branchFlowGuidedStaticSvg.content, machine.finalState.realizations.branchFlowGuidedStaticSvg.content);
});

test('zero curvature is a geometric no-op that keeps exact branch endpoints and midpoint controls', () => {
  const result = run(initial({ curvatureScale: 0 }));
  const network = result.finalState.branchGrowthNetworks['fixture-growth'];
  const curveSet = result.finalState.branchFlowGuidedCurveSets['fixture-guidance'];
  assert.equal(curveSet.curveCount, network.segmentCount);
  assert.equal(curveSet.maxOffsetMagnitude, 0);
  assert.equal(curveSet.meanOffsetMagnitude, 0);
  curveSet.curves.forEach((curve, index) => {
    const segment = network.segments[index];
    assert.equal(curve.segmentId, segment.id);
    assert.deepEqual(curve.start, segment.start);
    assert.deepEqual(curve.end, segment.end);
    assert.deepEqual(curve.control, [
      round6((segment.start[0] + segment.end[0]) / 2),
      round6((segment.start[1] + segment.end[1]) / 2),
    ]);
  });
});

test('gradient and tangent flow modes bend the same retained branch network differently', () => {
  const gradient = run(initial({ mode: 'gradient' }));
  const tangent = run(initial({ mode: 'tangent' }));
  assert.equal(gradient.finalState.branchGrowthSourceHash, tangent.finalState.branchGrowthSourceHash);
  assert.equal(
    gradient.finalState.branchGrowthNetworks['fixture-growth'].networkHash,
    tangent.finalState.branchGrowthNetworks['fixture-growth'].networkHash,
  );
  assert.equal(gradient.finalState.fieldSourceHash, tangent.finalState.fieldSourceHash);
  assert.notEqual(gradient.finalState.flowSourceHash, tangent.finalState.flowSourceHash);
  assert.notEqual(
    gradient.finalState.branchFlowGuidedCurveSets['fixture-guidance'].curveSetHash,
    tangent.finalState.branchFlowGuidedCurveSets['fixture-guidance'].curveSetHash,
  );
  assert.notEqual(
    gradient.finalState.realizations.branchFlowGuidedStaticSvg.content,
    tangent.finalState.realizations.branchFlowGuidedStaticSvg.content,
  );
});

test('guidance controls change only derived guidance/curves, not branch or field truth', () => {
  const subtle = run(initial({ curvatureScale: 0.15, maxControlOffset: 0.03 }));
  const stronger = run(initial({ curvatureScale: 1.1, maxControlOffset: 0.18 }));
  assert.equal(subtle.finalState.branchGrowthSourceHash, stronger.finalState.branchGrowthSourceHash);
  assert.equal(
    subtle.finalState.branchGrowthNetworks['fixture-growth'].networkHash,
    stronger.finalState.branchGrowthNetworks['fixture-growth'].networkHash,
  );
  assert.equal(subtle.finalState.fieldSourceHash, stronger.finalState.fieldSourceHash);
  assert.equal(subtle.finalState.flowSourceHash, stronger.finalState.flowSourceHash);
  assert.notEqual(subtle.finalState.branchFlowGuidanceSourceHash, stronger.finalState.branchFlowGuidanceSourceHash);
  assert.notEqual(
    subtle.finalState.branchFlowGuidedCurveSets['fixture-guidance'].curveSetHash,
    stronger.finalState.branchFlowGuidedCurveSets['fixture-guidance'].curveSetHash,
  );
});

test('materially different branch forms retain their own exact topology and endpoints', () => {
  const fork = run(initial());
  const asymmetric = run(initial({
    growthId: 'asymmetric-growth',
    guidanceId: 'asymmetric-guidance',
    origin: [0.27, 0.9],
    headingTurns: 0.72,
    baseLength: 0.15,
    branchOffsetsTurns: [-0.11, 0.02, 0.09],
    generations: 4,
  }));

  for (const [result, growthId, guidanceId] of [
    [fork, 'fixture-growth', 'fixture-guidance'],
    [asymmetric, 'asymmetric-growth', 'asymmetric-guidance'],
  ]) {
    const network = result.finalState.branchGrowthNetworks[growthId];
    const curveSet = result.finalState.branchFlowGuidedCurveSets[guidanceId];
    assert.equal(curveSet.curveCount, network.segmentCount);
    curveSet.curves.forEach((curve, index) => {
      const segment = network.segments[index];
      assert.equal(curve.segmentId, segment.id);
      assert.equal(curve.parentId, segment.parentId);
      assert.equal(curve.generation, segment.generation);
      assert.deepEqual(curve.start, segment.start);
      assert.deepEqual(curve.end, segment.end);
    });
  }
  assert.notEqual(
    fork.finalState.branchFlowGuidedCurveSets['fixture-guidance'].curveSetHash,
    asymmetric.finalState.branchFlowGuidedCurveSets['asymmetric-guidance'].curveSetHash,
  );
});

test('source, network, flow and curve-set lineage drift are rejected before realization', () => {
  const built = prepare();

  const branchDrift = structuredClone(built);
  branchDrift.branchGrowthSource.baseLength = 0.3;
  assert.throws(() => realizeBranchFlowGuidedStaticSvgHand.execute(branchDrift, {}, {}), /branch growth source state hash mismatch/);

  const networkDrift = structuredClone(built);
  networkDrift.branchGrowthNetworks['fixture-growth'].segments[0].end[0] = 0.123;
  assert.throws(() => realizeBranchFlowGuidedStaticSvgHand.execute(networkDrift, {}, {}), /branch growth network hash mismatch/);

  const flowDrift = structuredClone(built);
  flowDrift.flowSource.strength = 9;
  assert.throws(() => realizeBranchFlowGuidedStaticSvgHand.execute(flowDrift, {}, {}), /flow source state hash mismatch/);

  const curveDrift = structuredClone(built);
  curveDrift.branchFlowGuidedCurveSets['fixture-guidance'].curves[0].control[0] = 0.123;
  assert.throws(() => realizeBranchFlowGuidedStaticSvgHand.execute(curveDrift, {}, {}), /curve-set hash mismatch/);
});

test('invalid guidance controls and curve budgets fail loudly', () => {
  let state = normalizeBranchGrowthSourceHand.execute(initial(), {}, {}).state;
  state = buildBranchGrowthNetworkHand.execute(state, {}, {}).state;
  state = normalizeFlowFieldRequestHand.execute(state, {}, {}).state;

  const badScale = structuredClone(state);
  badScale.branchFlowGuidanceRequest.curvatureScale = 2.01;
  assert.throws(() => normalizeBranchFlowGuidanceSourceHand.execute(badScale, {}, {}), /curvatureScale/);

  const badOffset = structuredClone(state);
  badOffset.branchFlowGuidanceRequest.maxControlOffset = 0.51;
  assert.throws(() => normalizeBranchFlowGuidanceSourceHand.execute(badOffset, {}, {}), /maxControlOffset/);

  const normalized = normalizeBranchFlowGuidanceSourceHand.execute(state, {}, {}).state;
  assert.throws(() => buildBranchFlowGuidedCurveSetHand.execute(normalized, { maxCurves: 8 }, {}), /curve budget exceeded/);
  assert.throws(() => buildBranchFlowGuidedCurveSetHand.execute(normalized, { maxCurves: 4097 }, {}), /within \[1,4096\]/);
});

test('derived SVG artifact is tied to exact curve-set lineage without hiding visual non-claims', () => {
  const result = run(initial());
  const realization = result.finalState.realizations.branchFlowGuidedStaticSvg;
  const curveSet = result.finalState.branchFlowGuidedCurveSets['fixture-guidance'];
  const finalEvidence = result.checkpoints.at(-1).evidence;
  assert.equal(finalEvidence.artifactHash, hashValue(realization.content));
  assert.equal(realization.curveSetHash, curveSet.curveSetHash);
  assert.equal(realization.baseNetworkHash, result.finalState.branchGrowthNetworks['fixture-growth'].networkHash);
  assert.equal(finalEvidence.visualInspection, 'NOT_TESTED');
  assert.equal(finalEvidence.targetDevicePerformance, 'NOT_TESTED');
  assert.match(realization.content, /<svg/);
  assert.match(realization.content, /<path data-segment="fixture-growth:root"/);
});
