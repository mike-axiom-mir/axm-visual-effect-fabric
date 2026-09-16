import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph, hashValue } from '../src/hand-runtime.mjs';
import {
  buildFlowAdvectedParticleSetHand,
  makeParticleFlowAdvectionState,
  normalizeParticleFlowAdvectionHand,
} from '../src/particle-flow-advection.mjs';
import {
  PARTICLE_FLOW_STATIC_SVG_GRAPH,
  PARTICLE_FLOW_STATIC_SVG_HANDS,
  makeParticleFlowStaticSvgState,
  particleFlowStaticSvgHand,
} from '../src/particle-flow-static-svg.mjs';

const registry = createHandRegistry(PARTICLE_FLOW_STATIC_SVG_HANDS);

function run(state, callerKind = 'test', graph = PARTICLE_FLOW_STATIC_SVG_GRAPH) {
  return executeHandGraph({ registry, graph, initialState: state, context: { callerKind } });
}

function selected(result, id = 'advected') {
  return result.finalState.flowAdvectedParticleSets[id];
}

function realization(result) {
  return result.finalState.realizations.particleFlowStaticSvg;
}

function graphWithRendererParams(params) {
  return {
    ...PARTICLE_FLOW_STATIC_SVG_GRAPH,
    stages: [
      PARTICLE_FLOW_STATIC_SVG_GRAPH.stages[0],
      PARTICLE_FLOW_STATIC_SVG_GRAPH.stages[1],
      {
        ...PARTICLE_FLOW_STATIC_SVG_GRAPH.stages[2],
        params: { ...PARTICLE_FLOW_STATIC_SVG_GRAPH.stages[2].params, ...params },
      },
    ],
  };
}

function diagonalSeeds() {
  return [
    { id: 'p0', x: 0.14, y: 0.18, role: 'marker', size: 0.8 },
    { id: 'p1', x: 0.34, y: 0.39, role: 'marker', size: 1.1 },
    { id: 'p2', x: 0.56, y: 0.61, role: 'marker', size: 0.7 },
    { id: 'p3', x: 0.78, y: 0.82, role: 'marker', size: 1.25 },
  ];
}

function ringSeeds(count = 14) {
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2;
    return {
      id: `ring-${index}`,
      x: Number((0.5 + Math.cos(angle) * 0.23).toFixed(6)),
      y: Number((0.5 + Math.sin(angle) * 0.23).toFixed(6)),
      role: index % 2 === 0 ? 'primary' : 'secondary',
      tag: `seed-${index}`,
    };
  });
}

test('particle-flow SVG is deterministic and caller-neutral while canonical particle seeds remain untouched', () => {
  const particles = diagonalSeeds();
  const initial = makeParticleFlowStaticSvgState(particles, {
    id: 'advected',
    stepSize: 0.04,
    steps: 20,
    flow: { id: 'svg-flow', mode: 'tangent', strength: 1.15, sampleStep: 0.0125 },
    field: { id: 'svg-field', seed: 90210, frequency: 5.25, octaves: 5, lacunarity: 2.1, gain: 0.52 },
  });
  const canonicalHash = hashValue(initial.particles);
  const human = run(initial, 'human');
  const machine = run(initial, 'machine');
  const humanSvg = realization(human);
  const machineSvg = realization(machine);

  assert.equal(human.finalStateHash, machine.finalStateHash);
  assert.equal(humanSvg.content, machineSvg.content);
  assert.equal(humanSvg.renderer, 'axm.vfx.particle-flow-static-svg/v0.1');
  assert.equal(humanSvg.mediaType, 'image/svg+xml');
  assert.equal(humanSvg.particleSourceHash, canonicalHash);
  assert.deepEqual(human.finalState.particles, particles);
  assert.deepEqual(machine.finalState.particles, particles);
  assert.equal(humanSvg.derivedFromParticleSetHash, selected(human).particleSetHash);
  assert.match(humanSvg.content, /data-layer="trajectories"/);
  assert.match(humanSvg.content, /data-marker="start"/);
  assert.match(humanSvg.content, /data-marker="end"/);
  assert.match(humanSvg.content, /<polyline /);
  assert.ok(Buffer.byteLength(humanSvg.content) > 0);
});

test('zero-step advection remains an exact no-motion derived case and still renders inspectable source/end markers', () => {
  const particles = diagonalSeeds();
  const result = run(makeParticleFlowStaticSvgState(particles, {
    id: 'advected',
    stepSize: 0,
    steps: 8,
    flow: { id: 'zero-svg-flow', mode: 'gradient', strength: 1.5 },
    field: { id: 'zero-svg-field', seed: 2026, frequency: 6.5 },
  }));
  const particleSet = selected(result);
  const svg = realization(result);

  assert.deepEqual(particleSet.particles, particles);
  assert.equal(particleSet.movedParticleCount, 0);
  assert.equal(particleSet.maxStepDistance, 0);
  assert.deepEqual(result.finalState.particles, particles);
  assert.equal(svg.particleCount, particles.length);
  assert.equal(svg.sampleCount, particles.length * 9);
  assert.equal((svg.content.match(/data-marker="start"/g) ?? []).length, particles.length);
  assert.equal((svg.content.match(/data-marker="end"/g) ?? []).length, particles.length);
  assert.equal((svg.content.match(/<polyline /g) ?? []).length, particles.length);
});

test('one neutral particle-flow renderer handles sparse diagonal and radial layouts and distinct neutral flow modes', () => {
  const common = {
    id: 'advected',
    stepSize: 0.035,
    steps: 16,
    field: { id: 'shared-svg-field', seed: 5150, frequency: 4.25, octaves: 6, gain: 0.57 },
  };
  const diagonal = run(makeParticleFlowStaticSvgState(diagonalSeeds(), {
    ...common,
    flow: { id: 'diagonal-tangent', mode: 'tangent', strength: 0.95 },
  }));
  const radial = run(makeParticleFlowStaticSvgState(ringSeeds(16), {
    ...common,
    flow: { id: 'radial-gradient', mode: 'gradient', strength: 0.95 },
  }));

  assert.equal(realization(diagonal).renderer, realization(radial).renderer);
  assert.equal(realization(diagonal).particleCount, diagonalSeeds().length);
  assert.equal(realization(radial).particleCount, 16);
  assert.notEqual(realization(diagonal).content, realization(radial).content);
  assert.notEqual(selected(diagonal).particleSetHash, selected(radial).particleSetHash);
  assert.deepEqual(diagonal.finalState.particles, diagonalSeeds());
  assert.deepEqual(radial.finalState.particles, ringSeeds(16));
});

test('gradient and tangent guidance produce different static inspection artifacts from the same canonical particles and scalar field', () => {
  const particles = ringSeeds(10);
  const common = {
    id: 'advected',
    stepSize: 0.045,
    steps: 14,
    field: { id: 'same-svg-field', seed: 123, frequency: 6.5, octaves: 4, lacunarity: 2.2, gain: 0.48 },
  };
  const gradient = run(makeParticleFlowStaticSvgState(particles, {
    ...common,
    flow: { id: 'gradient-svg-flow', mode: 'gradient', strength: 1.2, sampleStep: 0.01 },
  }));
  const tangent = run(makeParticleFlowStaticSvgState(particles, {
    ...common,
    flow: { id: 'tangent-svg-flow', mode: 'tangent', strength: 1.2, sampleStep: 0.01 },
  }));

  assert.equal(gradient.finalState.particleSourceHash, tangent.finalState.particleSourceHash);
  assert.equal(gradient.finalState.fieldSourceHash, tangent.finalState.fieldSourceHash);
  assert.notEqual(gradient.finalState.flowSourceHash, tangent.finalState.flowSourceHash);
  assert.notEqual(realization(gradient).content, realization(tangent).content);
  assert.deepEqual(gradient.finalState.particles, particles);
  assert.deepEqual(tangent.finalState.particles, particles);
});

test('renderer rejects canonical/derived lineage drift, malformed layout controls and oversized working sets', () => {
  const particles = ringSeeds(8);
  const normalized = normalizeParticleFlowAdvectionHand.execute(makeParticleFlowAdvectionState(particles, {
    id: 'advected',
    stepSize: 0.04,
    steps: 12,
    flow: { id: 'lineage-svg-flow', mode: 'tangent' },
    field: { id: 'lineage-svg-field', seed: 321 },
  }), {}).state;
  const built = buildFlowAdvectedParticleSetHand.execute(normalized, {}).state;

  const particleDrift = structuredClone(built);
  particleDrift.particles[0].x = Number((particleDrift.particles[0].x + 0.01).toFixed(6));
  assert.throws(
    () => particleFlowStaticSvgHand.execute(particleDrift, {}),
    /particle-flow SVG base particle hash mismatch/,
  );

  const derivedDrift = structuredClone(built);
  derivedDrift.flowAdvectedParticleSets.advected.trajectories[0].points[1].x = 0.123456;
  assert.throws(
    () => particleFlowStaticSvgHand.execute(derivedDrift, {}),
    /particle-flow SVG selected particle set hash mismatch/,
  );

  const scalarDrift = structuredClone(built);
  scalarDrift.fieldSource.frequency += 0.25;
  assert.throws(
    () => particleFlowStaticSvgHand.execute(scalarDrift, {}),
    /particle-flow SVG scalar source hash mismatch/,
  );

  assert.throws(
    () => run(makeParticleFlowStaticSvgState(particles), 'test', graphWithRendererParams({ maxSamples: 32 })),
    /particleFlowSvg sample budget exceeded/,
  );
  assert.throws(
    () => run(makeParticleFlowStaticSvgState(particles), 'test', graphWithRendererParams({ maxParticles: 4 })),
    /particleFlowSvg particle budget exceeded/,
  );
  assert.throws(
    () => run(makeParticleFlowStaticSvgState(particles), 'test', graphWithRendererParams({ width: 63 })),
    /particleFlowSvg\.width must be an integer within \[64,4096\]/,
  );
  assert.throws(
    () => run(makeParticleFlowStaticSvgState(particles), 'test', graphWithRendererParams({ width: 100, height: 100, padding: 50 })),
    /particleFlowSvg\.padding must leave a positive drawable area/,
  );
});
