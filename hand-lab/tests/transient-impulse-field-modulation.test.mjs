import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph } from '../src/hand-runtime.mjs';
import {
  TRANSIENT_IMPULSE_FIELD_MODULATION_GRAPH,
  TRANSIENT_IMPULSE_FIELD_MODULATION_HANDS,
  makeTransientImpulseFieldModulationState,
  modulateImpulseWithComposedFieldHand,
} from '../src/transient-impulse-field-modulation.mjs';

const registry = createHandRegistry(TRANSIENT_IMPULSE_FIELD_MODULATION_HANDS);

function run(state, callerKind = 'test') {
  return executeHandGraph({
    registry,
    graph: TRANSIENT_IMPULSE_FIELD_MODULATION_GRAPH,
    initialState: state,
    context: { callerKind },
  });
}

function stateFor({ operation = 'multiply', symmetry = 0.2, direction = [1, -0.15], id = 'modulated-proof', strength = 1, floor = 0.08 } = {}) {
  return makeTransientImpulseFieldModulationState({
    id,
    strength,
    floor,
    impulse: {
      id: `${id}-impulse`,
      seed: 20260916,
      origin: [0.5, 0.5],
      direction,
      energy: 1.18,
      radius: 0.31,
      controls: {
        symmetry,
        directionality: symmetry > 0.8 ? 0.16 : 0.94,
        fragmentation: symmetry > 0.8 ? 0.16 : 0.78,
        ringWeight: symmetry > 0.8 ? 1.15 : 0.72,
        spokeWeight: symmetry > 0.8 ? 0.42 : 1.12,
      },
    },
    composition: {
      id: `${id}-composition`,
      operation,
      a: {
        id: `${id}-broad`,
        seed: 771,
        frequency: 2.2,
        octaves: 4,
        lacunarity: 2,
        gain: 0.56,
        offset: [0.11, -0.19],
      },
      b: {
        id: `${id}-detail`,
        seed: 9021,
        frequency: 7.1,
        octaves: 3,
        lacunarity: 1.9,
        gain: 0.43,
        offset: [-0.27, 0.21],
      },
    },
  });
}

function modulation(finalState, id = 'modulated-proof') {
  return finalState.modulatedImpulseFields[id];
}

test('composed-field impulse modulation is deterministic and caller-neutral without rewriting source event or base field', () => {
  const initial = stateFor();
  const human = run(initial, 'human');
  const machine = run(initial, 'machine');
  const humanModulated = modulation(human.finalState);
  const machineModulated = modulation(machine.finalState);

  assert.equal(human.finalStateHash, machine.finalStateHash);
  assert.equal(human.finalState.eventCanonicalHash, machine.finalState.eventCanonicalHash);
  assert.equal(human.finalState.impulseField.geometryHash, machine.finalState.impulseField.geometryHash);
  assert.equal(human.finalState.fieldCompositionSourceHash, machine.finalState.fieldCompositionSourceHash);
  assert.equal(human.finalState.fieldModulationSourceHash, machine.finalState.fieldModulationSourceHash);
  assert.equal(humanModulated.geometryHash, machineModulated.geometryHash);

  assert.equal(humanModulated.canonicalEventHash, human.finalState.eventCanonicalHash);
  assert.equal(humanModulated.baseFieldGeometryHash, human.finalState.impulseField.geometryHash);
  assert.equal(humanModulated.fieldCompositionSourceHash, human.finalState.fieldCompositionSourceHash);
  assert.equal(humanModulated.inputAHash, human.finalState.fieldSourceHashes.a);
  assert.equal(humanModulated.inputBHash, human.finalState.fieldSourceHashes.b);
  assert.equal(humanModulated.fieldModulationSourceHash, human.finalState.fieldModulationSourceHash);
  assert.equal(humanModulated.derived, true);
  assert.equal(humanModulated.rebuildable, true);

  assert.deepEqual(humanModulated.geometry.rings, human.finalState.impulseField.geometry.rings);
  assert.notEqual(humanModulated.geometryHash, human.finalState.impulseField.geometryHash);
  assert.ok(human.finalState.impulseField.geometry.spokes.every((spoke) => !('scalarModulation' in spoke)));
  assert.ok(humanModulated.geometry.spokes.every((spoke) => spoke.scalarModulation));
  assert.ok(humanModulated.geometry.fragments.every((fragment) => fragment.scalarModulation));
});

test('composed field changes derived impulse detail while retaining counts and coherent ring baseline', () => {
  const finalState = run(stateFor()).finalState;
  const modulated = modulation(finalState);
  const base = finalState.impulseField;

  assert.deepEqual(modulated.counts, base.counts);
  assert.deepEqual(modulated.geometry.rings, base.geometry.rings);
  assert.equal(modulated.factorStats.samples, base.counts.spokes + base.counts.fragments);
  assert.ok(modulated.factorStats.min >= 0.08 && modulated.factorStats.max <= 1);

  const baseDetail = [...base.geometry.spokes, ...base.geometry.fragments];
  const modulatedDetail = [...modulated.geometry.spokes, ...modulated.geometry.fragments];
  assert.equal(baseDetail.length, modulatedDetail.length);
  assert.ok(modulatedDetail.every((item, index) => item.intensity <= baseDetail[index].intensity));
  assert.ok(modulatedDetail.some((item, index) => item.intensity < baseDetail[index].intensity));
});

test('different scalar algebra changes only the derived modulation path, not the canonical impulse event or base impulse geometry', () => {
  const minRun = run(stateFor({ operation: 'min', id: 'min-proof' })).finalState;
  const maxRun = run(stateFor({ operation: 'max', id: 'max-proof' })).finalState;
  const minModulated = modulation(minRun, 'min-proof');
  const maxModulated = modulation(maxRun, 'max-proof');

  assert.equal(minRun.eventCanonicalHash, maxRun.eventCanonicalHash);
  assert.equal(minRun.impulseField.geometryHash, maxRun.impulseField.geometryHash);
  assert.equal(minRun.fieldSourceHashes.a, maxRun.fieldSourceHashes.a);
  assert.equal(minRun.fieldSourceHashes.b, maxRun.fieldSourceHashes.b);
  assert.notEqual(minRun.fieldCompositionSourceHash, maxRun.fieldCompositionSourceHash);
  assert.notEqual(minModulated.geometryHash, maxModulated.geometryHash);
});

test('same adapter graph supports materially different directional and symmetric impulse contexts', () => {
  const directional = run(stateFor({ id: 'directional-context', symmetry: 0.08, direction: [1, 0.1] })).finalState;
  const symmetric = run(stateFor({ id: 'symmetric-context', symmetry: 0.98, direction: [0, -1] })).finalState;
  const directionalModulated = modulation(directional, 'directional-context');
  const symmetricModulated = modulation(symmetric, 'symmetric-context');

  assert.notEqual(directional.impulseField.geometryHash, symmetric.impulseField.geometryHash);
  assert.notEqual(directionalModulated.geometryHash, symmetricModulated.geometryHash);
  assert.deepEqual(directionalModulated.counts, directional.impulseField.counts);
  assert.deepEqual(symmetricModulated.counts, symmetric.impulseField.counts);
  assert.deepEqual(directionalModulated.geometry.rings, directional.impulseField.geometry.rings);
  assert.deepEqual(symmetricModulated.geometry.rings, symmetric.impulseField.geometry.rings);
});

test('zero modulation strength is a bounded no-op on detail intensity while preserving explicit derived lineage', () => {
  const finalState = run(stateFor({ id: 'zero-strength', strength: 0, floor: 0 })).finalState;
  const modulated = modulation(finalState, 'zero-strength');
  const base = finalState.impulseField;

  assert.equal(modulated.factorStats.min, 1);
  assert.equal(modulated.factorStats.max, 1);
  assert.equal(modulated.factorStats.mean, 1);
  for (let index = 0; index < base.geometry.spokes.length; index += 1) {
    assert.equal(modulated.geometry.spokes[index].intensity, base.geometry.spokes[index].intensity);
  }
  for (let index = 0; index < base.geometry.fragments.length; index += 1) {
    assert.equal(modulated.geometry.fragments[index].intensity, base.geometry.fragments[index].intensity);
  }
});

test('invalid controls and broken source lineage fail explicitly instead of silently rewriting or resampling truth', () => {
  assert.throws(
    () => run(stateFor({ strength: 1.2 })),
    /fieldModulationRequest\.strength must be within \[0,1\]/,
  );
  assert.throws(
    () => run(stateFor({ floor: -0.01 })),
    /fieldModulationRequest\.floor must be within \[0,1\]/,
  );

  const finalState = run(stateFor()).finalState;
  const changedSource = {
    ...finalState,
    fieldSources: {
      ...finalState.fieldSources,
      a: { ...finalState.fieldSources.a, seed: finalState.fieldSources.a.seed + 1 },
    },
  };
  assert.throws(
    () => modulateImpulseWithComposedFieldHand.execute(changedSource, {}),
    /composition inputA source hash mismatch/,
  );

  const changedEvent = {
    ...finalState,
    event: { ...finalState.event, energy: finalState.event.energy + 0.1 },
  };
  assert.throws(
    () => modulateImpulseWithComposedFieldHand.execute(changedEvent, {}),
    /canonical transient event hash mismatch/,
  );
});
