import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph, hashValue } from '../src/hand-runtime.mjs';
import { svgPreviewHand } from '../src/electric-hands.mjs';
import {
  ELECTRIC_FLOW_GUIDED_SVG_GRAPH,
  ELECTRIC_FLOW_GUIDED_SVG_HANDS,
  electricFlowGuidedSvgHand,
  makeElectricFlowGuidedSvgState,
} from '../src/electric-flow-guided-svg.mjs';

const registry = createHandRegistry(ELECTRIC_FLOW_GUIDED_SVG_HANDS);

function run(state, callerKind = 'test', graph = ELECTRIC_FLOW_GUIDED_SVG_GRAPH) {
  return executeHandGraph({ registry, graph, initialState: state, context: { callerKind } });
}

function realization(result) {
  return result.finalState.realizations.electricFlowGuidedSvg;
}

function beforeRealizeGraph() {
  return {
    ...ELECTRIC_FLOW_GUIDED_SVG_GRAPH,
    id: 'fx.electric-storm.flow-guided-svg.pre-realize-test',
    stages: ELECTRIC_FLOW_GUIDED_SVG_GRAPH.stages.slice(0, -1),
  };
}

test('flow-guided electric SVG selection is deterministic, caller-neutral and preserves retained base paths', () => {
  const initial = makeElectricFlowGuidedSvgState({
    id: 'guided-electric',
    seed: 90210,
    amplitude: 0.075,
    field: { id: 'guide-field', seed: 5150, frequency: 5.5, octaves: 5, gain: 0.53 },
    flow: { id: 'guide-flow', mode: 'tangent', strength: 1.1, sampleStep: 0.0125 },
  });
  const human = run(initial, 'human');
  const machine = run(initial, 'machine');
  const humanRealization = realization(human);
  const machineRealization = realization(machine);
  const selected = human.finalState.flowGuidedPathSets['guided-electric'];

  assert.equal(human.finalStateHash, machine.finalStateHash);
  assert.deepEqual(humanRealization, machineRealization);
  assert.equal(humanRealization.renderer, 'axm.vfx.electric-flow-guided-svg/v0.1');
  assert.equal(humanRealization.mediaType, 'image/svg+xml');
  assert.equal(humanRealization.basePathsHash, hashValue(human.finalState.paths));
  assert.equal(humanRealization.selectedPathSet.pathSetHash, selected.pathSetHash);
  assert.equal(humanRealization.selectedPathSet.pathsHash, hashValue(selected.paths));
  assert.equal(humanRealization.scalarSourceHash, human.finalState.fieldSourceHash);
  assert.equal(humanRealization.flowSourceHash, human.finalState.flowSourceHash);
  assert.equal(humanRealization.displacementSourceHash, human.finalState.pathFlowSourceHash);
  assert.ok(humanRealization.maxDisplacement > 0);
  assert.equal(human.finalState.realizations.svgPreview, undefined);
  assert.notDeepEqual(selected.paths, human.finalState.paths);
  assert.equal(hashValue(human.finalState.paths), human.finalState.pathSourceHash);
});

test('zero displacement is byte-identical to the existing electric SVG donor while keeping independent derived lineage', () => {
  const result = run(makeElectricFlowGuidedSvgState({
    id: 'zero-guidance',
    seed: 444,
    amplitude: 0,
    field: { id: 'zero-field', seed: 77, frequency: 6.25 },
    flow: { id: 'zero-flow', mode: 'gradient', strength: 1.3 },
  }));
  const guided = realization(result);
  const selected = result.finalState.flowGuidedPathSets['zero-guidance'];
  const baseDonor = svgPreviewHand.execute(result.finalState, {}).state.realizations.svgPreview;

  assert.deepEqual(selected.paths, result.finalState.paths);
  assert.equal(selected.maxDisplacement, 0);
  assert.equal(guided.content, baseDonor.content);
  assert.equal(guided.basePathsHash, result.finalState.pathSourceHash);
  assert.equal(guided.selectedPathSet.pathSetHash, selected.pathSetHash);
  assert.equal(guided.selectedPathSet.pathsHash, baseDonor.derivedFromTopologyHash);
});

test('non-zero guidance changes the rendered SVG artifact without changing the retained electric donor paths', () => {
  const zero = run(makeElectricFlowGuidedSvgState({
    id: 'guided',
    seed: 8181,
    amplitude: 0,
    field: { id: 'same-field', seed: 81, frequency: 4.75, octaves: 5 },
    flow: { id: 'same-flow', mode: 'tangent', strength: 1.05 },
  }));
  const guided = run(makeElectricFlowGuidedSvgState({
    id: 'guided',
    seed: 8181,
    amplitude: 0.09,
    field: { id: 'same-field', seed: 81, frequency: 4.75, octaves: 5 },
    flow: { id: 'same-flow', mode: 'tangent', strength: 1.05 },
  }));

  assert.deepEqual(zero.finalState.paths, guided.finalState.paths);
  assert.equal(zero.finalState.pathSourceHash, guided.finalState.pathSourceHash);
  assert.notEqual(realization(zero).content, realization(guided).content);
  assert.notEqual(realization(zero).selectedPathSet.pathSetHash, realization(guided).selectedPathSet.pathSetHash);
  assert.ok(realization(guided).maxDisplacement > 0);
});

test('one replaceable realization handles diagonal and near-vertical electric donors through the same flow-guided selector', () => {
  const common = {
    id: 'guided',
    seed: 7331,
    amplitude: 0.065,
    field: { id: 'shared-field', seed: 909, frequency: 3.75, octaves: 6, gain: 0.56 },
    flow: { id: 'shared-flow', mode: 'tangent', strength: 0.9 },
  };
  const diagonal = run(makeElectricFlowGuidedSvgState({
    ...common,
    electric: { source: { x: 0.08, y: 0.75 }, target: { x: 0.91, y: 0.22 } },
  }));
  const vertical = run(makeElectricFlowGuidedSvgState({
    ...common,
    electric: { source: { x: 0.47, y: 0.08 }, target: { x: 0.53, y: 0.92 } },
  }));

  assert.equal(realization(diagonal).renderer, realization(vertical).renderer);
  assert.ok(realization(diagonal).maxDisplacement > 0);
  assert.ok(realization(vertical).maxDisplacement > 0);
  assert.notEqual(realization(diagonal).selectedPathSet.pathSetHash, realization(vertical).selectedPathSet.pathSetHash);
  assert.notEqual(realization(diagonal).content, realization(vertical).content);
  assert.equal(hashValue(diagonal.finalState.paths), diagonal.finalState.pathSourceHash);
  assert.equal(hashValue(vertical.finalState.paths), vertical.finalState.pathSourceHash);
});

test('renderer selection rejects drift in retained source truth or the separately derived selected path set', () => {
  const prepared = run(makeElectricFlowGuidedSvgState({
    id: 'guarded',
    seed: 2026,
    amplitude: 0.08,
    field: { id: 'guard-field', seed: 12345, frequency: 5.25 },
    flow: { id: 'guard-flow', mode: 'gradient', strength: 1.2 },
  }), 'test', beforeRealizeGraph()).finalState;

  const baseDrift = structuredClone(prepared);
  baseDrift.paths[0].points[1].x = Number((baseDrift.paths[0].points[1].x + 0.01).toFixed(6));
  assert.throws(() => electricFlowGuidedSvgHand.execute(baseDrift, {}), /base path hash mismatch/);

  const scalarDrift = structuredClone(prepared);
  scalarDrift.fieldSource.frequency += 0.25;
  assert.throws(() => electricFlowGuidedSvgHand.execute(scalarDrift, {}), /scalar source hash mismatch/);

  const vectorDrift = structuredClone(prepared);
  vectorDrift.flowSource.strength += 0.2;
  assert.throws(() => electricFlowGuidedSvgHand.execute(vectorDrift, {}), /vector source hash mismatch/);

  const displacementDrift = structuredClone(prepared);
  displacementDrift.pathFlowSource.amplitude += 0.01;
  assert.throws(() => electricFlowGuidedSvgHand.execute(displacementDrift, {}), /displacement source hash mismatch/);

  const selectedDrift = structuredClone(prepared);
  selectedDrift.flowGuidedPathSets.guarded.paths[0].points[1].y = Number((selectedDrift.flowGuidedPathSets.guarded.paths[0].points[1].y + 0.01).toFixed(6));
  assert.throws(() => electricFlowGuidedSvgHand.execute(selectedDrift, {}), /selected path set hash mismatch/);

  const missingSelection = structuredClone(prepared);
  delete missingSelection.flowGuidedPathSets.guarded;
  assert.throws(() => electricFlowGuidedSvgHand.execute(missingSelection, {}), /requires flow-guided path set guarded/);
});
