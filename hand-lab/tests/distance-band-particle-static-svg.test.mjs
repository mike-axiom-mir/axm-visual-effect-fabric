import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph, hashValue } from '../src/hand-runtime.mjs';
import {
  CELLULAR_DISTANCE_BAND_PARTICLE_STATIC_SVG_GRAPH,
  CELLULAR_DISTANCE_BAND_PARTICLE_STATIC_SVG_HANDS,
  DISTANCE_BAND_PARTICLE_STATIC_SVG_GRAPH,
  DISTANCE_BAND_PARTICLE_STATIC_SVG_HANDS,
  distanceBandParticleStaticSvgHand,
  makeCellularDistanceBandParticleStaticSvgState,
  makeDistanceBandParticleStaticSvgState,
} from '../src/distance-band-particle-static-svg.mjs';

const registry = createHandRegistry(DISTANCE_BAND_PARTICLE_STATIC_SVG_HANDS);
const cellularRegistry = createHandRegistry(CELLULAR_DISTANCE_BAND_PARTICLE_STATIC_SVG_HANDS);

function particles() {
  return [
    { id: 'p0', x: 0.08, y: 0.12, sourceTag: 'retained' },
    { id: 'p1', x: 0.2, y: 0.75 },
    { id: 'p2', x: 0.34, y: 0.42 },
    { id: 'p3', x: 0.47, y: 0.9 },
    { id: 'p4', x: 0.56, y: 0.2 },
    { id: 'p5', x: 0.68, y: 0.58 },
    { id: 'p6', x: 0.79, y: 0.32 },
    { id: 'p7', x: 0.91, y: 0.84 },
  ];
}

function graphWithControls(graph, { width = 18, height = 14, renderer = {} } = {}) {
  return {
    ...graph,
    stages: graph.stages.map((stage) => {
      if (stage.hand === 'fx.field.coverage-mask-grid-build') {
        return { ...stage, params: { width, height, maxCells: 16384 } };
      }
      if (stage.hand === 'fx.field.mask-distance-grid-build') {
        return { ...stage, params: { maxCells: 4096, maxComparisons: 8388608 } };
      }
      if (stage.hand === 'fx.field.mask-distance-band-grid-build') {
        return { ...stage, params: { maxCells: 4096, maxComparisons: 8388608 } };
      }
      if (stage.hand === 'fx.particle.distance-band-weight-build') {
        return { ...stage, params: { maxParticles: 4096, maxBandCells: 4096, maxComparisons: 8388608 } };
      }
      if (stage.hand === 'fx.particle.distance-band-weighted-static-svg-realize') {
        return { ...stage, params: { ...stage.params, ...renderer } };
      }
      return stage;
    }),
  };
}

function run(state, graph = graphWithControls(DISTANCE_BAND_PARTICLE_STATIC_SVG_GRAPH), callerKind = 'test') {
  return executeHandGraph({ registry, graph, initialState: state, context: { callerKind } });
}

function runCellular(state, graph = graphWithControls(CELLULAR_DISTANCE_BAND_PARTICLE_STATIC_SVG_GRAPH), callerKind = 'test') {
  return executeHandGraph({ registry: cellularRegistry, graph, initialState: state, context: { callerKind } });
}

function realization(result) {
  return result.finalState.realizations.distanceBandParticleStaticSvg;
}

function selected(result, id = 'weighted') {
  return result.finalState.bandWeightedParticleSets[id];
}

function baseOptions() {
  return {
    field: { id: 'svg-field', seed: 6102, frequency: 4.8, octaves: 5, gain: 0.56 },
    mask: { id: 'svg-mask', threshold: 0.5, softness: 0.08 },
    distance: { id: 'distance', isoLevel: 0.5 },
    band: { id: 'band', innerWidth: 0.12, outerWidth: 0.16, softness: 0.04 },
    weight: { id: 'weighted', exponent: 1.2 },
  };
}

function weightedSetHashPayload(set) {
  return {
    schema: set.schema,
    weightSourceHash: set.weightSourceHash,
    particleSourceHash: set.particleSourceHash,
    distanceBandSourceHash: set.distanceBandSourceHash,
    bandGridHash: set.bandGridHash,
    particleCount: set.particleCount,
    samples: set.samples,
  };
}

function recomputeSummary(set) {
  const weights = set.samples.map((sample) => sample.weight);
  set.minWeight = Number(Math.min(...weights).toFixed(6));
  set.maxWeight = Number(Math.max(...weights).toFixed(6));
  set.meanWeight = Number((weights.reduce((sum, value) => sum + value, 0) / weights.length).toFixed(6));
  set.zeroWeightCount = weights.filter((value) => value === 0).length;
  set.fullWeightCount = weights.filter((value) => value === 1).length;
  set.weightedSetHash = hashValue(weightedSetHashPayload(set));
}

test('distance-band particle SVG is deterministic and caller-neutral while retained particles and weight truth stay untouched', () => {
  const sourceParticles = particles();
  const state = makeDistanceBandParticleStaticSvgState(sourceParticles, baseOptions());
  const graph = graphWithControls(DISTANCE_BAND_PARTICLE_STATIC_SVG_GRAPH);
  const human = run(state, graph, 'human');
  const machine = run(state, graph, 'machine');
  const humanSvg = realization(human);
  const machineSvg = realization(machine);

  assert.equal(human.finalStateHash, machine.finalStateHash);
  assert.equal(humanSvg.content, machineSvg.content);
  assert.equal(humanSvg.artifactHash, machineSvg.artifactHash);
  assert.equal(humanSvg.artifactHash, hashValue(humanSvg.content));
  assert.equal(humanSvg.renderer, 'axm.vfx.distance-band-particle-static-svg/v0.1');
  assert.equal(humanSvg.mediaType, 'image/svg+xml');
  assert.equal(humanSvg.derivedFromWeightedSetHash, selected(human).weightedSetHash);
  assert.deepEqual(human.finalState.particles, sourceParticles);
  assert.equal(human.finalState.particles[0].sourceTag, 'retained');
  assert.equal((humanSvg.content.match(/<circle /g) ?? []).length, sourceParticles.length);
  assert.match(humanSvg.content, /data-layer="weighted-particles"/);
  assert.match(humanSvg.content, /data-weight=/);
});

test('renderer controls change only the disposable realization, not retained or derived effect truth', () => {
  const state = makeDistanceBandParticleStaticSvgState(particles(), baseOptions());
  const defaultResult = run(state, graphWithControls(DISTANCE_BAND_PARTICLE_STATIC_SVG_GRAPH));
  const alternateResult = run(state, graphWithControls(DISTANCE_BAND_PARTICLE_STATIC_SVG_GRAPH, {
    renderer: {
      width: 900,
      height: 500,
      padding: 40,
      minRadius: 0.8,
      maxRadius: 8,
      minOpacity: 0.02,
      maxOpacity: 0.75,
      pointColor: '#ffcc66',
      backgroundColor: '#10131a',
    },
  }));

  assert.equal(defaultResult.finalState.particleSourceHash, alternateResult.finalState.particleSourceHash);
  assert.equal(defaultResult.finalState.distanceBandSourceHash, alternateResult.finalState.distanceBandSourceHash);
  assert.equal(defaultResult.finalState.bandParticleWeightSourceHash, alternateResult.finalState.bandParticleWeightSourceHash);
  assert.equal(selected(defaultResult).weightedSetHash, selected(alternateResult).weightedSetHash);
  assert.notEqual(realization(defaultResult).artifactHash, realization(alternateResult).artifactHash);
  assert.notEqual(realization(defaultResult).content, realization(alternateResult).content);
});

test('one neutral SVG realization handles fBm-backed and cellular-backed distance-band weights without collapsing source identities', () => {
  const sourceParticles = particles();
  const shared = baseOptions();
  const fbm = run(makeDistanceBandParticleStaticSvgState(sourceParticles, shared));
  const cellular = runCellular(makeCellularDistanceBandParticleStaticSvgState(sourceParticles, {
    ...shared,
    field: { id: 'svg-field', seed: 6102, frequency: 4.8, jitter: 0.92, valueMode: 'distance' },
  }));

  assert.equal(realization(fbm).renderer, realization(cellular).renderer);
  assert.equal(fbm.finalState.particleSourceHash, cellular.finalState.particleSourceHash);
  assert.notEqual(fbm.finalState.distanceBandSourceHash, cellular.finalState.distanceBandSourceHash);
  assert.notEqual(selected(fbm).weightedSetHash, selected(cellular).weightedSetHash);
  assert.notEqual(realization(fbm).artifactHash, realization(cellular).artifactHash);
  assert.ok(selected(fbm).samples.some((sample, index) => sample.weight !== selected(cellular).samples[index].weight));
});

test('self-consistent weighted-set tampering is rejected by a fresh source-truth rebuild before SVG realization', () => {
  const result = run(makeDistanceBandParticleStaticSvgState(particles(), baseOptions()));
  const tampered = structuredClone(result.finalState);
  const set = tampered.bandWeightedParticleSets.weighted;
  set.samples[0].weight = set.samples[0].weight > 0.5 ? 0.25 : 0.75;
  recomputeSummary(set);

  assert.throws(
    () => distanceBandParticleStaticSvgHand.execute(tampered, {
      maxParticles: 4096,
      maxBandCells: 4096,
      maxComparisons: 8388608,
    }),
    /distance-band particle SVG weighted set differs from source-truth rebuild/,
  );
});

test('particle identifiers are escaped in SVG without changing retained source identity', () => {
  const sourceParticles = [
    { id: 'p<&"one', x: 0.25, y: 0.35 },
    { id: "p'two", x: 0.72, y: 0.65 },
  ];
  const result = run(makeDistanceBandParticleStaticSvgState(sourceParticles, baseOptions()));
  const svg = realization(result).content;

  assert.match(svg, /data-particle-id="p&lt;&amp;&quot;one"/);
  assert.match(svg, /data-particle-id="p&apos;two"/);
  assert.ok(!svg.includes('data-particle-id="p<&"one"'));
  assert.deepEqual(result.finalState.particles, sourceParticles);
});

test('renderer rejects malformed controls and explicit particle budgets instead of silently degrading', () => {
  const state = makeDistanceBandParticleStaticSvgState(particles(), baseOptions());

  assert.throws(
    () => run(state, graphWithControls(DISTANCE_BAND_PARTICLE_STATIC_SVG_GRAPH, { renderer: { width: 63 } })),
    /distanceBandParticleSvg\.width must be an integer within \[64,4096\]/,
  );
  assert.throws(
    () => run(state, graphWithControls(DISTANCE_BAND_PARTICLE_STATIC_SVG_GRAPH, { renderer: { width: 100, height: 100, padding: 50 } })),
    /distanceBandParticleSvg\.padding must leave a positive drawable area/,
  );
  assert.throws(
    () => run(state, graphWithControls(DISTANCE_BAND_PARTICLE_STATIC_SVG_GRAPH, { renderer: { minRadius: 5, maxRadius: 4 } })),
    /distanceBandParticleSvg\.maxRadius must be >= minRadius/,
  );
  assert.throws(
    () => run(state, graphWithControls(DISTANCE_BAND_PARTICLE_STATIC_SVG_GRAPH, { renderer: { pointColor: 'red' } })),
    /distanceBandParticleSvg\.pointColor must be a six-digit hex color/,
  );
  assert.throws(
    () => run(state, graphWithControls(DISTANCE_BAND_PARTICLE_STATIC_SVG_GRAPH, { renderer: { maxParticles: 4 } })),
    /distanceBandParticleSvg particle budget exceeded: 8 > 4/,
  );
});
