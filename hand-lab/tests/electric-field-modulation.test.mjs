import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph, hashValue } from '../src/hand-runtime.mjs';
import { ELECTRIC_HANDS, ELECTRIC_STORM_GRAPH, makeElectricInitialState } from '../src/electric-hands.mjs';
import {
  ELECTRIC_FIELD_MODULATION_GRAPH,
  ELECTRIC_FIELD_MODULATION_HANDS,
  makeElectricFieldModulationState,
  modulateElectricPathsWithComposedFieldHand,
} from '../src/electric-field-modulation.mjs';

const modulationRegistry = createHandRegistry(ELECTRIC_FIELD_MODULATION_HANDS);
const electricRegistry = createHandRegistry(ELECTRIC_HANDS);

function run(state, callerKind = 'test') {
  return executeHandGraph({
    registry: modulationRegistry,
    graph: ELECTRIC_FIELD_MODULATION_GRAPH,
    initialState: state,
    context: { callerKind },
  });
}

function composition(operation = 'multiply') {
  return {
    id: 'electric-detail-field',
    operation,
    a: { id: 'electric-field-a', seed: 101, frequency: 2.2, octaves: 3, lacunarity: 2, gain: 0.52 },
    b: { id: 'electric-field-b', seed: 707, frequency: 5.4, octaves: 2, lacunarity: 2.1, gain: 0.47 },
  };
}

test('electric composed-field modulation is deterministic, caller-neutral, and preserves the base electric donor paths', () => {
  const state = makeElectricFieldModulationState({
    electric: {
      seed: 20260916,
      source: { x: 0.08, y: 0.62 },
      target: { x: 0.91, y: 0.31 },
    },
    composition: composition('multiply'),
    strength: 0.82,
    floor: 0.24,
  });
  const human = run(state, 'human');
  const machine = run(state, 'machine');

  assert.equal(human.finalStateHash, machine.finalStateHash);
  assert.deepEqual(human.finalState, machine.finalState);

  const baseState = makeElectricInitialState(20260916);
  baseState.effect.source = { x: 0.08, y: 0.62 };
  baseState.effect.target = { x: 0.91, y: 0.31 };
  const base = executeHandGraph({
    registry: electricRegistry,
    graph: ELECTRIC_STORM_GRAPH,
    initialState: baseState,
    context: { callerKind: 'base-proof' },
  }).finalState;

  assert.deepEqual(human.finalState.paths, base.paths);
  assert.equal(human.finalState.electricBasePathsHash, hashValue(base.paths));
  const modulated = human.finalState.modulatedElectricPathSets['electric-field-modulation'];
  assert.equal(modulated.basePathsHash, hashValue(base.paths));
  assert.equal(modulated.derived, true);
  assert.equal(modulated.rebuildable, true);
  assert.equal(modulated.paths.length, base.paths.length);
  assert.notEqual(modulated.pathSetHash, hashValue(base.paths));
});

test('the same electric topology responds differently to different neutral scalar composition operations', () => {
  const common = {
    electric: { seed: 88, source: { x: 0.1, y: 0.48 }, target: { x: 0.9, y: 0.52 } },
    strength: 1,
    floor: 0.12,
  };
  const multiply = run(makeElectricFieldModulationState({ ...common, composition: composition('multiply') })).finalState;
  const maximum = run(makeElectricFieldModulationState({ ...common, composition: composition('max') })).finalState;
  const multiplySet = multiply.modulatedElectricPathSets['electric-field-modulation'];
  const maximumSet = maximum.modulatedElectricPathSets['electric-field-modulation'];

  assert.equal(multiply.electricBasePathsHash, maximum.electricBasePathsHash);
  assert.deepEqual(multiply.paths, maximum.paths);
  assert.notEqual(multiply.fieldCompositionSourceHash, maximum.fieldCompositionSourceHash);
  assert.notEqual(multiplySet.pathSetHash, maximumSet.pathSetHash);
  assert.notDeepEqual(multiplySet.factorStats, maximumSet.factorStats);
});

test('one modulation graph handles materially different electric path forms without changing their retained topology', () => {
  const diagonal = run(makeElectricFieldModulationState({
    electric: { seed: 5150, source: { x: 0.06, y: 0.82 }, target: { x: 0.94, y: 0.18 } },
    composition: composition('add-clamp'),
    strength: 0.7,
    floor: 0.3,
  })).finalState;
  const vertical = run(makeElectricFieldModulationState({
    electric: { seed: 5150, source: { x: 0.48, y: 0.08 }, target: { x: 0.52, y: 0.92 } },
    composition: composition('add-clamp'),
    strength: 0.7,
    floor: 0.3,
  })).finalState;

  assert.notEqual(diagonal.electricBasePathsHash, vertical.electricBasePathsHash);
  assert.notDeepEqual(diagonal.paths, vertical.paths);
  assert.equal(diagonal.paths.length, vertical.paths.length);
  assert.equal(diagonal.modulatedElectricPathSets['electric-field-modulation'].paths.length, diagonal.paths.length);
  assert.equal(vertical.modulatedElectricPathSets['electric-field-modulation'].paths.length, vertical.paths.length);
});

test('zero modulation strength is an energy no-op while retaining separate derived lineage', () => {
  const final = run(makeElectricFieldModulationState({
    electric: { seed: 303 },
    composition: composition('min'),
    strength: 0,
    floor: 0,
  })).finalState;
  const modulated = final.modulatedElectricPathSets['electric-field-modulation'];

  assert.deepEqual(
    modulated.paths.map((path) => path.energy),
    final.paths.map((path) => path.energy),
  );
  assert.deepEqual(
    modulated.paths.map((path) => path.points),
    final.paths.map((path) => path.points),
  );
  assert.deepEqual(modulated.factorStats, { min: 1, max: 1, mean: 1, samples: final.paths.length });
  assert.notEqual(modulated.pathSetHash, final.electricBasePathsHash, 'derived metadata keeps the path set separately identifiable');
});

test('electric modulation rejects retained-path or scalar-source lineage drift', () => {
  const final = run(makeElectricFieldModulationState({
    electric: { seed: 909 },
    composition: composition('multiply'),
    strength: 0.8,
    floor: 0.2,
  })).finalState;

  const changedPath = structuredClone(final);
  changedPath.paths[0].points[1].x = Math.min(1, changedPath.paths[0].points[1].x + 0.01);
  assert.throws(
    () => modulateElectricPathsWithComposedFieldHand.execute(changedPath, {}),
    /electric base path hash mismatch/,
  );

  const changedSource = structuredClone(final);
  changedSource.fieldSources.a.frequency += 0.1;
  assert.throws(
    () => modulateElectricPathsWithComposedFieldHand.execute(changedSource, {}),
    /composition inputA source hash mismatch/,
  );
});

test('invalid modulation strength fails instead of being silently clamped', () => {
  assert.throws(
    () => run(makeElectricFieldModulationState({
      electric: { seed: 12 },
      composition: composition('multiply'),
      strength: 1.2,
    })),
    /electricFieldModulationRequest\.strength must be within \[0,1\]/,
  );
});
