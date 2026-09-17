import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph, hashValue } from '../src/hand-runtime.mjs';
import { ELECTRIC_HANDS, ELECTRIC_STORM_GRAPH, makeElectricInitialState } from '../src/electric-hands.mjs';
import { modulateElectricPathsWithFlickerHand } from '../src/electric-flicker-modulation.mjs';
import {
  ELECTRIC_FLICKER_MODULATED_SVG_GRAPH,
  ELECTRIC_FLICKER_MODULATED_SVG_HANDS,
  electricFlickerModulatedSvgHand,
  makeElectricFlickerModulatedSvgState,
} from '../src/electric-flicker-modulated-svg.mjs';

const registry = createHandRegistry(ELECTRIC_FLICKER_MODULATED_SVG_HANDS);
const electricRegistry = createHandRegistry(ELECTRIC_HANDS);
const SELECTION_ID = 'fixture-electric-flicker-svg';

function initial(overrides = {}) {
  return makeElectricFlickerModulatedSvgState({
    seed: 2468,
    id: SELECTION_ID,
    strength: 0.85,
    floor: 0.25,
    electric: {
      seed: 2468,
      source: { x: 0.08, y: 0.72 },
      target: { x: 0.92, y: 0.28 },
      controls: { branchEnergyScale: 0.67, glowScale: 0.9 },
    },
    flicker: {
      id: 'fixture-svg-cycle',
      seed: 777,
      slotCount: 11,
      minValue: -2,
      maxValue: 3,
      responsePower: 1.15,
      phaseOffset: 0.07,
    },
    ...overrides,
  });
}

function run(state = initial(), callerKind = 'human') {
  return executeHandGraph({
    registry,
    graph: ELECTRIC_FLICKER_MODULATED_SVG_GRAPH,
    initialState: state,
    context: { callerKind },
  });
}

function selected(state) {
  return state.flickerModulatedElectricPathSets[SELECTION_ID];
}

function setHashPayload(set) {
  return {
    schema: set.schema,
    basePathsHash: set.basePathsHash,
    flickerCycleSourceHash: set.flickerCycleSourceHash,
    electricFlickerModulationSourceHash: set.electricFlickerModulationSourceHash,
    phase: set.phase,
    sampleValue: set.sampleValue,
    normalizedSample: set.normalizedSample,
    factor: set.factor,
    paths: set.paths,
    pathSetHash: set.pathSetHash,
    pathCount: set.pathCount,
    pointCount: set.pointCount,
    derived: set.derived,
    rebuildable: set.rebuildable,
  };
}

function renderAt(state, phase) {
  const modulated = modulateElectricPathsWithFlickerHand.execute(state, { phase }, {}).state;
  return electricFlickerModulatedSvgHand.execute(modulated, {}, {}).state;
}

function baseElectricState(options) {
  const state = makeElectricInitialState(options.seed);
  state.effect.source = structuredClone(options.source);
  state.effect.target = structuredClone(options.target);
  state.effect.controls = { ...state.effect.controls, ...structuredClone(options.controls) };
  return state;
}

test('flicker-modulated electric SVG is deterministic, caller-neutral, and retains independent lineages', () => {
  const human = run(initial(), 'human');
  const machine = run(initial(), 'machine');
  assert.equal(human.finalStateHash, machine.finalStateHash);
  assert.deepEqual(human.finalState, machine.finalState);

  const final = human.finalState;
  const set = selected(final);
  const realization = final.realizations.electricFlickerModulatedSvg;
  assert.equal(final.electricBasePathsHash, hashValue(final.paths));
  assert.equal(realization.basePathsHash, final.electricBasePathsHash);
  assert.equal(realization.flickerCycleSourceHash, final.flickerCycleSourceHash);
  assert.equal(realization.electricFlickerModulationSourceHash, final.electricFlickerModulationSourceHash);
  assert.equal(realization.selectedPathSet.pathSetHash, set.pathSetHash);
  assert.equal(realization.selectedPathSet.modulatedSetHash, set.modulatedSetHash);
  assert.equal(realization.derivedFromSelectedPathSetHash, set.pathSetHash);
  assert.equal(realization.contentHash, hashValue(realization.content));
  assert.match(realization.content, /<svg/);
  assert.match(realization.content, /<polyline/);
});

test('loop-equivalent phases produce byte-identical SVG while phase remains derived', () => {
  const prepared = run(initial(), 'prepare').finalState;
  const atZero = renderAt(prepared, 0);
  const atOne = renderAt(prepared, 1);

  assert.equal(selected(atZero).phase, 0);
  assert.equal(selected(atOne).phase, 0);
  assert.equal(selected(atZero).modulatedSetHash, selected(atOne).modulatedSetHash);
  assert.equal(
    atZero.realizations.electricFlickerModulatedSvg.content,
    atOne.realizations.electricFlickerModulatedSvg.content,
  );
  assert.equal(
    atZero.realizations.electricFlickerModulatedSvg.contentHash,
    atOne.realizations.electricFlickerModulatedSvg.contentHash,
  );
});

test('zero-strength flicker realization is byte-identical to the existing electric SVG donor', () => {
  const electric = {
    seed: 404,
    source: { x: 0.1, y: 0.56 },
    target: { x: 0.9, y: 0.44 },
    controls: { branchEnergyScale: 0.61, glowScale: 0.92 },
  };
  const flicker = run(initial({ electric, seed: electric.seed, strength: 0 }), 'flicker-proof').finalState;
  const base = executeHandGraph({
    registry: electricRegistry,
    graph: ELECTRIC_STORM_GRAPH,
    initialState: baseElectricState(electric),
    context: { callerKind: 'base-proof' },
  }).finalState;

  assert.equal(selected(flicker).factor, 1);
  assert.deepEqual(selected(flicker).paths, flicker.paths);
  assert.equal(
    flicker.realizations.electricFlickerModulatedSvg.content,
    base.realizations.svgPreview.content,
  );
  assert.equal(flicker.electricBasePathsHash, hashValue(flicker.paths));
});

test('a distinct flicker phase can change the derived SVG without rewriting retained electric paths', () => {
  const prepared = run(initial(), 'prepare').finalState;
  const retainedPaths = structuredClone(prepared.paths);
  const atZero = renderAt(prepared, 0);
  const later = renderAt(prepared, 0.43);

  assert.notEqual(selected(atZero).factor, selected(later).factor);
  assert.notEqual(selected(atZero).pathSetHash, selected(later).pathSetHash);
  assert.notEqual(
    atZero.realizations.electricFlickerModulatedSvg.contentHash,
    later.realizations.electricFlickerModulatedSvg.contentHash,
  );
  assert.deepEqual(atZero.paths, retainedPaths);
  assert.deepEqual(later.paths, retainedPaths);
  assert.equal(atZero.electricBasePathsHash, later.electricBasePathsHash);
  assert.equal(atZero.flickerCycleSourceHash, later.flickerCycleSourceHash);
});

test('self-consistent derived tampering is rejected before the SVG donor receives the selected paths', () => {
  const final = run(initial(), 'tamper-proof').finalState;
  const tampered = structuredClone(final);
  const set = selected(tampered);
  set.paths[1].energy = Number((set.paths[1].energy * 0.5).toFixed(6));
  set.pathSetHash = hashValue(set.paths);
  set.modulatedSetHash = hashValue(setHashPayload(set));

  assert.throws(
    () => electricFlickerModulatedSvgHand.execute(tampered, {}, {}),
    /does not rebuild from retained source truth/,
  );
});

test('renderer selection rejects retained-path drift and self-consistent flicker semantic forgery', () => {
  const final = run(initial(), 'truth-proof').finalState;

  const drifted = structuredClone(final);
  drifted.paths[0].energy = 0.123456;
  assert.throws(
    () => electricFlickerModulatedSvgHand.execute(drifted, {}, {}),
    /base path hash mismatch/,
  );

  const forged = structuredClone(final);
  forged.flickerCycleSource.interpolation = 'nearest';
  forged.flickerCycleSourceHash = hashValue(forged.flickerCycleSource);
  assert.throws(
    () => electricFlickerModulatedSvgHand.execute(forged, {}, {}),
    /interpolation is invalid/,
  );
});
