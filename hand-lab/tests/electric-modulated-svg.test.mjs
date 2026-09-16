import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph, hashValue } from '../src/hand-runtime.mjs';
import { ELECTRIC_HANDS, ELECTRIC_STORM_GRAPH, makeElectricInitialState } from '../src/electric-hands.mjs';
import {
  ELECTRIC_MODULATED_SVG_GRAPH,
  ELECTRIC_MODULATED_SVG_HANDS,
  electricModulatedSvgHand,
  makeElectricModulatedSvgState,
} from '../src/electric-modulated-svg.mjs';

const modulatedRegistry = createHandRegistry(ELECTRIC_MODULATED_SVG_HANDS);
const electricRegistry = createHandRegistry(ELECTRIC_HANDS);

function run(state, callerKind = 'test') {
  return executeHandGraph({
    registry: modulatedRegistry,
    graph: ELECTRIC_MODULATED_SVG_GRAPH,
    initialState: state,
    context: { callerKind },
  });
}

function composition(operation = 'multiply') {
  return {
    id: 'electric-render-field',
    operation,
    a: { id: 'electric-render-a', seed: 131, frequency: 2.4, octaves: 3, lacunarity: 2, gain: 0.51 },
    b: { id: 'electric-render-b', seed: 811, frequency: 6.1, octaves: 2, lacunarity: 2.2, gain: 0.46 },
  };
}

function baseElectricState({ seed, source, target, controls }) {
  const state = makeElectricInitialState(seed);
  if (source) state.effect.source = structuredClone(source);
  if (target) state.effect.target = structuredClone(target);
  if (controls) state.effect.controls = { ...state.effect.controls, ...structuredClone(controls) };
  return state;
}

test('modulated electric SVG is deterministic, caller-neutral, and keeps retained base paths untouched', () => {
  const options = {
    electric: {
      seed: 20260916,
      source: { x: 0.07, y: 0.68 },
      target: { x: 0.93, y: 0.28 },
    },
    composition: composition('multiply'),
    strength: 0.88,
    floor: 0.16,
  };
  const human = run(makeElectricModulatedSvgState(options), 'human');
  const machine = run(makeElectricModulatedSvgState(options), 'machine');

  assert.equal(human.finalStateHash, machine.finalStateHash);
  assert.deepEqual(human.finalState, machine.finalState);

  const final = human.finalState;
  const selected = final.modulatedElectricPathSets['electric-field-modulation'];
  const realization = final.realizations.electricModulatedSvg;

  assert.equal(final.electricBasePathsHash, hashValue(final.paths));
  assert.equal(selected.basePathsHash, final.electricBasePathsHash);
  assert.equal(realization.basePathsHash, final.electricBasePathsHash);
  assert.equal(realization.selectedPathSet.pathSetHash, selected.pathSetHash);
  assert.equal(realization.derivedFromSelectedPathSetHash, selected.pathSetHash);
  assert.equal(realization.fieldCompositionSourceHash, final.fieldCompositionSourceHash);
  assert.equal(realization.electricFieldModulationSourceHash, final.electricFieldModulationSourceHash);
  assert.ok(final.paths.every((path) => path.scalarModulation === undefined));
  assert.ok(selected.paths.every((path) => path.scalarModulation));
  assert.match(realization.content, /<svg/);
  assert.match(realization.content, /<polyline/);
});

test('zero-strength selection is byte-identical to the existing electric SVG donor while retaining separate derived lineage', () => {
  const electric = {
    seed: 404,
    source: { x: 0.1, y: 0.56 },
    target: { x: 0.9, y: 0.44 },
    controls: { branchEnergyScale: 0.61, glowScale: 0.92 },
  };
  const modulated = run(makeElectricModulatedSvgState({
    electric,
    composition: composition('min'),
    strength: 0,
    floor: 0,
  }), 'modulated-proof').finalState;

  const base = executeHandGraph({
    registry: electricRegistry,
    graph: ELECTRIC_STORM_GRAPH,
    initialState: baseElectricState(electric),
    context: { callerKind: 'base-proof' },
  }).finalState;

  const selected = modulated.modulatedElectricPathSets['electric-field-modulation'];
  assert.deepEqual(modulated.paths, base.paths);
  assert.deepEqual(
    selected.paths.map((path) => path.energy),
    base.paths.map((path) => path.energy),
  );
  assert.equal(
    modulated.realizations.electricModulatedSvg.content,
    base.realizations.svgPreview.content,
  );
  assert.notEqual(selected.pathSetHash, modulated.electricBasePathsHash);
  assert.equal(modulated.realizations.electricModulatedSvg.selectedPathSet.pathSetHash, selected.pathSetHash);
});

test('non-zero field modulation changes the SVG artifact without changing the retained electric donor paths', () => {
  const electric = {
    seed: 717,
    source: { x: 0.06, y: 0.74 },
    target: { x: 0.94, y: 0.22 },
  };
  const modulated = run(makeElectricModulatedSvgState({
    electric,
    composition: composition('multiply'),
    strength: 1,
    floor: 0.05,
  })).finalState;
  const base = executeHandGraph({
    registry: electricRegistry,
    graph: ELECTRIC_STORM_GRAPH,
    initialState: baseElectricState(electric),
    context: { callerKind: 'base-proof' },
  }).finalState;

  assert.deepEqual(modulated.paths, base.paths);
  assert.notEqual(
    modulated.realizations.electricModulatedSvg.content,
    base.realizations.svgPreview.content,
  );
  assert.notEqual(
    modulated.modulatedElectricPathSets['electric-field-modulation'].pathSetHash,
    modulated.electricBasePathsHash,
  );
});

test('one modulated SVG graph handles materially different electric forms and neutral composition operations', () => {
  const diagonal = run(makeElectricModulatedSvgState({
    electric: { seed: 5150, source: { x: 0.05, y: 0.86 }, target: { x: 0.95, y: 0.14 } },
    composition: composition('max'),
    strength: 0.76,
    floor: 0.22,
  })).finalState;
  const vertical = run(makeElectricModulatedSvgState({
    electric: { seed: 5150, source: { x: 0.47, y: 0.06 }, target: { x: 0.53, y: 0.94 } },
    composition: composition('add-clamp'),
    strength: 0.76,
    floor: 0.22,
  })).finalState;

  assert.notEqual(diagonal.electricBasePathsHash, vertical.electricBasePathsHash);
  assert.notEqual(diagonal.fieldCompositionSourceHash, vertical.fieldCompositionSourceHash);
  assert.notEqual(
    diagonal.realizations.electricModulatedSvg.selectedPathSet.pathSetHash,
    vertical.realizations.electricModulatedSvg.selectedPathSet.pathSetHash,
  );
  assert.match(diagonal.realizations.electricModulatedSvg.content, /<svg/);
  assert.match(vertical.realizations.electricModulatedSvg.content, /<svg/);
  assert.equal(diagonal.paths.length, vertical.paths.length);
});

test('modulated electric SVG selection rejects base, selected, or scalar lineage drift', () => {
  const final = run(makeElectricModulatedSvgState({
    electric: { seed: 909 },
    composition: composition('multiply'),
    strength: 0.8,
    floor: 0.2,
  })).finalState;

  const changedBase = structuredClone(final);
  changedBase.paths[0].points[1].x = Math.min(1, changedBase.paths[0].points[1].x + 0.01);
  assert.throws(
    () => electricModulatedSvgHand.execute(changedBase, {}),
    /electric base path hash mismatch/,
  );

  const changedSelected = structuredClone(final);
  changedSelected.modulatedElectricPathSets['electric-field-modulation'].paths[1].energy *= 0.9;
  assert.throws(
    () => electricModulatedSvgHand.execute(changedSelected, {}),
    /modulated electric path set hash mismatch/,
  );

  const changedSource = structuredClone(final);
  changedSource.fieldSources.b.frequency += 0.1;
  assert.throws(
    () => electricModulatedSvgHand.execute(changedSource, {}),
    /composition inputB source hash mismatch/,
  );
});
