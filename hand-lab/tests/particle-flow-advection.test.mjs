import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph, hashValue } from '../src/hand-runtime.mjs';
import {
  PARTICLE_FLOW_ADVECTION_GRAPH,
  PARTICLE_FLOW_ADVECTION_HANDS,
  buildFlowAdvectedParticleSetHand,
  makeParticleFlowAdvectionState,
  normalizeParticleFlowAdvectionHand,
} from '../src/particle-flow-advection.mjs';

const registry = createHandRegistry(PARTICLE_FLOW_ADVECTION_HANDS);

function run(state, callerKind = 'test', graph = PARTICLE_FLOW_ADVECTION_GRAPH) {
  return executeHandGraph({ registry, graph, initialState: state, context: { callerKind } });
}

function particleSet(result, id = 'advected') {
  return result.finalState.flowAdvectedParticleSets[id];
}

function graphWithBudgets(maxParticles, maxSamples) {
  return {
    ...PARTICLE_FLOW_ADVECTION_GRAPH,
    stages: [
      PARTICLE_FLOW_ADVECTION_GRAPH.stages[0],
      {
        id: 'build-flow-advected-particles',
        hand: 'fx.particle.flow-advection-build',
        params: { maxParticles, maxSamples },
      },
    ],
  };
}

function diagonalSeeds() {
  return [
    { id: 'p0', x: 0.15, y: 0.2, role: 'marker', size: 0.8 },
    { id: 'p1', x: 0.35, y: 0.4, role: 'marker', size: 1.1 },
    { id: 'p2', x: 0.55, y: 0.6, role: 'marker', size: 0.7 },
    { id: 'p3', x: 0.75, y: 0.8, role: 'marker', size: 1.25 },
  ];
}

function ringSeeds(count = 12) {
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2;
    return {
      id: `ring-${index}`,
      x: Number((0.5 + Math.cos(angle) * 0.24).toFixed(6)),
      y: Number((0.5 + Math.sin(angle) * 0.24).toFixed(6)),
      role: index % 2 === 0 ? 'primary' : 'secondary',
      tag: `seed-${index}`,
    };
  });
}

function assertParticleMetadataPreserved(baseParticles, derivedParticles) {
  assert.equal(baseParticles.length, derivedParticles.length);
  for (let i = 0; i < baseParticles.length; i += 1) {
    const { x: baseX, y: baseY, ...baseMeta } = baseParticles[i];
    const { x: derivedX, y: derivedY, ...derivedMeta } = derivedParticles[i];
    assert.deepEqual(derivedMeta, baseMeta);
    assert.ok(Number.isFinite(baseX) && Number.isFinite(baseY));
    assert.ok(Number.isFinite(derivedX) && derivedX >= 0 && derivedX <= 1);
    assert.ok(Number.isFinite(derivedY) && derivedY >= 0 && derivedY <= 1);
  }
}

test('flow particle advection is deterministic, caller-neutral and keeps canonical particle seeds untouched', () => {
  const particles = diagonalSeeds();
  const initial = makeParticleFlowAdvectionState(particles, {
    id: 'advected',
    stepSize: 0.04,
    steps: 20,
    flow: { id: 'guide-flow', mode: 'tangent', strength: 1.15, sampleStep: 0.0125 },
    field: { id: 'guide-field', seed: 90210, frequency: 5.25, octaves: 5, lacunarity: 2.1, gain: 0.52 },
  });
  const initialParticleHash = hashValue(initial.particles);
  const human = run(initial, 'human');
  const machine = run(initial, 'machine');
  const humanSet = particleSet(human);
  const machineSet = particleSet(machine);

  assert.equal(human.finalStateHash, machine.finalStateHash);
  assert.equal(human.finalState.particleSourceHash, machine.finalState.particleSourceHash);
  assert.equal(human.finalState.particleFlowSourceHash, machine.finalState.particleFlowSourceHash);
  assert.equal(humanSet.particleSetHash, machineSet.particleSetHash);
  assert.equal(human.finalState.particleSourceHash, initialParticleHash);
  assert.deepEqual(human.finalState.particles, particles);
  assert.deepEqual(machine.finalState.particles, particles);
  assert.equal(humanSet.derived, true);
  assert.equal(humanSet.rebuildable, true);
  assert.equal(humanSet.sampleCount, particles.length * 21);
  assert.ok(humanSet.movedParticleCount > 0);
  assert.ok(humanSet.maxStepDistance > 0);
  assertParticleMetadataPreserved(particles, humanSet.particles);
});

test('zero step size is an exact no-motion derived case with retained independent lineage', () => {
  const particles = diagonalSeeds();
  const result = run(makeParticleFlowAdvectionState(particles, {
    id: 'advected',
    stepSize: 0,
    steps: 8,
    flow: { id: 'zero-flow', mode: 'gradient', strength: 1.6 },
    field: { id: 'zero-field', seed: 2026, frequency: 7 },
  }));
  const advected = particleSet(result);

  assert.deepEqual(advected.particles, particles);
  assert.equal(advected.movedParticleCount, 0);
  assert.equal(advected.maxStepDistance, 0);
  assert.equal(advected.particleSourceHash, hashValue(particles));
  assert.equal(advected.advectionSourceHash, result.finalState.particleFlowSourceHash);
  for (let i = 0; i < particles.length; i += 1) {
    assert.equal(advected.trajectories[i].points.length, 9);
    assert.ok(advected.trajectories[i].points.every((point) => point.x === particles[i].x && point.y === particles[i].y));
  }
});

test('one neutral advection contract handles sparse diagonal and radial particle layouts', () => {
  const diagonal = diagonalSeeds();
  const ring = ringSeeds(16);
  const common = {
    id: 'advected',
    stepSize: 0.03,
    steps: 18,
    flow: { id: 'shared-flow', mode: 'tangent', strength: 0.95 },
    field: { id: 'shared-field', seed: 5150, frequency: 4.25, octaves: 6, gain: 0.57 },
  };
  const a = particleSet(run(makeParticleFlowAdvectionState(diagonal, common)));
  const b = particleSet(run(makeParticleFlowAdvectionState(ring, common)));

  assert.equal(a.particleCount, diagonal.length);
  assert.equal(b.particleCount, ring.length);
  assert.ok(a.movedParticleCount > 0);
  assert.ok(b.movedParticleCount > 0);
  assert.notEqual(a.particleSetHash, b.particleSetHash);
  assertParticleMetadataPreserved(diagonal, a.particles);
  assertParticleMetadataPreserved(ring, b.particles);
  assert.equal(a.trajectories.length, diagonal.length);
  assert.equal(b.trajectories.length, ring.length);
});

test('gradient and tangent flow produce distinct derived motion from the same retained particle and scalar truth', () => {
  const particles = ringSeeds(10);
  const common = {
    id: 'advected',
    stepSize: 0.045,
    steps: 14,
    field: { id: 'same-field', seed: 123, frequency: 6.5, octaves: 4, lacunarity: 2.2, gain: 0.48 },
  };
  const gradient = run(makeParticleFlowAdvectionState(particles, {
    ...common,
    flow: { id: 'gradient-flow', mode: 'gradient', strength: 1.2, sampleStep: 0.01 },
  }));
  const tangent = run(makeParticleFlowAdvectionState(particles, {
    ...common,
    flow: { id: 'tangent-flow', mode: 'tangent', strength: 1.2, sampleStep: 0.01 },
  }));

  assert.equal(gradient.finalState.particleSourceHash, tangent.finalState.particleSourceHash);
  assert.equal(gradient.finalState.fieldSourceHash, tangent.finalState.fieldSourceHash);
  assert.notEqual(gradient.finalState.flowSourceHash, tangent.finalState.flowSourceHash);
  assert.notDeepEqual(particleSet(gradient).particles, particleSet(tangent).particles);
  assert.deepEqual(gradient.finalState.particles, particles);
  assert.deepEqual(tangent.finalState.particles, particles);
});

test('lineage drift, malformed seeds and oversized derived working sets fail explicitly', () => {
  const particles = ringSeeds(8);
  const normalized = normalizeParticleFlowAdvectionHand.execute(makeParticleFlowAdvectionState(particles, {
    id: 'advected',
    stepSize: 0.04,
    steps: 12,
    flow: { id: 'lineage-flow', mode: 'tangent' },
    field: { id: 'lineage-field', seed: 321 },
  }), {}).state;

  const particleDrift = structuredClone(normalized);
  particleDrift.particles[0].x = Number((particleDrift.particles[0].x + 0.01).toFixed(6));
  assert.throws(() => buildFlowAdvectedParticleSetHand.execute(particleDrift, {}), /particle flow retained particle state hash mismatch/);

  const fieldDrift = structuredClone(normalized);
  fieldDrift.fieldSource.frequency += 0.25;
  assert.throws(() => buildFlowAdvectedParticleSetHand.execute(fieldDrift, {}), /particle flow scalar source state hash mismatch/);

  const flowDrift = structuredClone(normalized);
  flowDrift.flowSource.strength += 0.25;
  assert.throws(() => buildFlowAdvectedParticleSetHand.execute(flowDrift, {}), /particle flow vector source state hash mismatch/);

  const sourceDrift = structuredClone(normalized);
  sourceDrift.particleFlowSource.stepSize += 0.01;
  assert.throws(() => buildFlowAdvectedParticleSetHand.execute(sourceDrift, {}), /particle flow advection source state hash mismatch/);

  assert.throws(
    () => run(makeParticleFlowAdvectionState([{ id: 'broken', x: 1.1, y: 0.5 }])),
    /particle broken\.x must be within \[0,1\]/,
  );
  assert.throws(
    () => run(makeParticleFlowAdvectionState([
      { id: 'same', x: 0.2, y: 0.2 },
      { id: 'same', x: 0.8, y: 0.8 },
    ])),
    /duplicate particle id: same/,
  );
  assert.throws(
    () => run(makeParticleFlowAdvectionState(particles, { stepSize: 0.251 })),
    /particleFlowRequest\.stepSize must be within \[0,0.25\]/,
  );
  assert.throws(
    () => run(makeParticleFlowAdvectionState(particles, { steps: 257 })),
    /particleFlowRequest\.steps must be an integer within \[1,256\]/,
  );

  assert.throws(
    () => run(makeParticleFlowAdvectionState(particles), 'test', graphWithBudgets(4, 65536)),
    new RegExp(`particleFlow particle budget exceeded: ${particles.length} > 4`),
  );
  const sampleCount = particles.length * 17;
  assert.throws(
    () => run(makeParticleFlowAdvectionState(particles), 'test', graphWithBudgets(2048, 32)),
    new RegExp(`particleFlow sample budget exceeded: ${sampleCount} > 32`),
  );
});
