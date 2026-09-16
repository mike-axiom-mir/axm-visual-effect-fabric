import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createHandRegistry,
  executeHandGraph,
  hashValue,
} from '../src/hand-runtime.mjs';
import {
  HOLOGRAPHIC_STATE_PROJECTOR_GRAPH,
  HOLOGRAPHIC_STATE_PROJECTOR_HANDS,
  makeGlobeForm,
  makeHolographicFormState,
  makeRoverForm,
} from '../src/holographic-state-projector.mjs';
import {
  HOLOGRAPHIC_MODULATED_PROJECTOR_GRAPH,
  HOLOGRAPHIC_MODULATED_PROJECTOR_HANDS,
  holographicModulatedProjectorHand,
  makeHolographicModulatedProjectorState,
} from '../src/holographic-modulated-projector.mjs';

const modulatedRegistry = createHandRegistry(HOLOGRAPHIC_MODULATED_PROJECTOR_HANDS);
const baseRegistry = createHandRegistry(HOLOGRAPHIC_STATE_PROJECTOR_HANDS);

function composition(operation = 'multiply') {
  return {
    id: 'holographic-render-field',
    operation,
    a: { id: 'holographic-render-a', seed: 317, frequency: 2.2, octaves: 3, lacunarity: 2, gain: 0.5 },
    b: { id: 'holographic-render-b', seed: 811, frequency: 6.7, octaves: 2, lacunarity: 2.1, gain: 0.47 },
  };
}

function run(form, options = {}, callerKind = 'test') {
  return executeHandGraph({
    registry: modulatedRegistry,
    graph: HOLOGRAPHIC_MODULATED_PROJECTOR_GRAPH,
    initialState: makeHolographicModulatedProjectorState(form, options),
    context: { callerKind },
  });
}

function baseRun(form, seed = 42, callerKind = 'base-proof') {
  return executeHandGraph({
    registry: baseRegistry,
    graph: HOLOGRAPHIC_STATE_PROJECTOR_GRAPH,
    initialState: makeHolographicFormState(form, seed),
    context: { callerKind },
  });
}

function selected(state, id = 'holographic-field-modulation') {
  return state.modulatedHolographicSampleFields[id];
}

test('modulated holographic projector is deterministic, caller-neutral, and retains the base sample field', () => {
  const options = {
    seed: 20260916,
    axes: 'xz',
    strength: 0.86,
    floor: 0.14,
    composition: composition('multiply'),
  };
  const human = run(makeGlobeForm(), options, 'human');
  const machine = run(makeGlobeForm(), options, 'machine');

  assert.equal(human.finalStateHash, machine.finalStateHash);
  assert.deepEqual(human.finalState, machine.finalState);

  const final = human.finalState;
  const modulated = selected(final);
  const realization = final.realizations.holographicModulatedStateProjector;

  assert.equal(final.holographicBaseSampleFieldHash, hashValue(final.sampleField));
  assert.equal(modulated.baseSampleFieldHash, final.holographicBaseSampleFieldHash);
  assert.equal(realization.baseSampleFieldHash, final.holographicBaseSampleFieldHash);
  assert.equal(realization.selectedSampleField.sampleFieldHash, modulated.sampleFieldHash);
  assert.equal(realization.canonicalFormHash, hashValue(final.form));
  assert.equal(realization.donorRenderer, 'axm.vfx.holographic-state-projector/v0.1');
  assert.equal(realization.renderer, 'axm.vfx.holographic-modulated-state-projector/v0.1');
  assert.equal(realization.workingSet.baseSampleFieldRetained, true);
  assert.equal(realization.workingSet.selectedDerivedSampleField, true);
  assert.equal(realization.workingSet.modeledBufferBytes, final.sampleField.points.length * 4);
  assert.match(realization.content, /<!doctype html>/);
  assert.match(realization.content, /webgl2/);
  assert.match(realization.content, /g\.drawArrays\(g\.POINTS/);
});

test('zero-strength selection is byte-identical to the existing holographic WebGL donor', () => {
  const seed = 404;
  const modulated = run(makeGlobeForm(), {
    seed,
    axes: 'xy',
    composition: composition('min'),
    strength: 0,
    floor: 0,
  }, 'modulated-proof').finalState;
  const base = baseRun(makeGlobeForm(), seed).finalState;

  const derived = selected(modulated);
  assert.deepEqual(modulated.sampleField, base.sampleField);
  assert.deepEqual(derived.points, base.sampleField.points);
  assert.equal(
    modulated.realizations.holographicModulatedStateProjector.content,
    base.realizations.holographicStateProjector.content,
  );
  assert.equal(derived.factorStats.min, 1);
  assert.equal(derived.factorStats.max, 1);
  assert.equal(derived.factorStats.mean, 1);
});

test('non-zero scalar modulation changes the WebGL artifact without rewriting retained form or sample state', () => {
  const seed = 717;
  const form = makeRoverForm();
  const modulated = run(form, {
    seed,
    axes: 'yz',
    composition: composition('multiply'),
    strength: 1,
    floor: 0.06,
  }).finalState;
  const base = baseRun(makeRoverForm(), seed).finalState;

  assert.deepEqual(modulated.form, base.form);
  assert.deepEqual(modulated.sampleField, base.sampleField);
  assert.notDeepEqual(selected(modulated).points, base.sampleField.points);
  assert.notEqual(
    modulated.realizations.holographicModulatedStateProjector.content,
    base.realizations.holographicStateProjector.content,
  );
});

test('one modulated projector graph serves materially different forms and neutral scalar compositions', () => {
  const globe = run(makeGlobeForm(), {
    seed: 5150,
    axes: 'xz',
    composition: composition('max'),
    strength: 0.78,
    floor: 0.2,
  }).finalState;
  const rover = run(makeRoverForm(), {
    seed: 5150,
    axes: 'xy',
    composition: composition('add-clamp'),
    strength: 0.78,
    floor: 0.2,
  }).finalState;

  const globeRealization = globe.realizations.holographicModulatedStateProjector;
  const roverRealization = rover.realizations.holographicModulatedStateProjector;
  assert.equal(globe.form.id, 'strategy-globe');
  assert.equal(rover.form.id, 'recon-rover');
  assert.notEqual(globeRealization.canonicalFormHash, roverRealization.canonicalFormHash);
  assert.notEqual(globeRealization.fieldCompositionSourceHash, roverRealization.fieldCompositionSourceHash);
  assert.notEqual(globeRealization.selectedSampleField.sampleFieldHash, roverRealization.selectedSampleField.sampleFieldHash);
  assert.match(globeRealization.content, /HOLOGRAPHIC STATE PROJECTOR/);
  assert.match(roverRealization.content, /HOLOGRAPHIC STATE PROJECTOR/);
  assert.ok(globeRealization.pointCount > 1000);
  assert.ok(roverRealization.pointCount > 1000);
});

test('modulated holographic projector selection rejects base, selected, or scalar lineage drift', () => {
  const final = run(makeGlobeForm(), {
    seed: 909,
    composition: composition('multiply'),
    strength: 0.8,
    floor: 0.2,
  }).finalState;

  const changedBase = structuredClone(final);
  changedBase.sampleField.points[6] *= 0.9;
  assert.throws(
    () => holographicModulatedProjectorHand.execute(changedBase, {}),
    /holographic base sample field hash mismatch/,
  );

  const changedSelected = structuredClone(final);
  changedSelected.modulatedHolographicSampleFields['holographic-field-modulation'].points[6] *= 0.9;
  assert.throws(
    () => holographicModulatedProjectorHand.execute(changedSelected, {}),
    /modulated holographic sample field hash mismatch/,
  );

  const changedSource = structuredClone(final);
  changedSource.fieldSources.a.frequency += 0.1;
  assert.throws(
    () => holographicModulatedProjectorHand.execute(changedSource, {}),
    /composition inputA source hash mismatch/,
  );
});
