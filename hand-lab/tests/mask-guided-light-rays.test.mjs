import test from 'node:test';
import assert from 'node:assert/strict';
import { deepClone, createHandRegistry, executeHandGraph } from '../src/hand-runtime.mjs';
import {
  MASK_GUIDED_LIGHT_RAY_GRAPH,
  MASK_GUIDED_LIGHT_RAY_HANDS,
  buildMaskGuidedLightRaySetHand,
  makeMaskGuidedLightRayState,
  realizeMaskGuidedLightRaysStaticSvgHand,
} from '../src/mask-guided-light-rays.mjs';

const registry = createHandRegistry(MASK_GUIDED_LIGHT_RAY_HANDS);

function graphWithWorkset(rayCount, samplesPerRay, options = {}) {
  const render = options.render ?? {};
  return {
    ...MASK_GUIDED_LIGHT_RAY_GRAPH,
    stages: [
      MASK_GUIDED_LIGHT_RAY_GRAPH.stages[0],
      MASK_GUIDED_LIGHT_RAY_GRAPH.stages[1],
      MASK_GUIDED_LIGHT_RAY_GRAPH.stages[2],
      {
        id: 'build-light-ray-set',
        hand: 'fx.light.mask-guided-ray-set-build',
        params: {
          rayCount,
          samplesPerRay,
          maxRays: options.maxRays ?? 256,
          maxSamples: options.maxSamples ?? 32768,
        },
      },
      {
        id: 'realize-static-svg',
        hand: 'fx.light.mask-guided-rays-static-svg-realize',
        params: {
          width: render.width ?? 640,
          height: render.height ?? 420,
          strokeWidth: render.strokeWidth ?? 1.5,
          minOpacity: render.minOpacity ?? 0,
          maxOpacity: render.maxOpacity ?? 0.85,
        },
      },
    ],
  };
}

function run(state, graph = MASK_GUIDED_LIGHT_RAY_GRAPH, callerKind = 'test') {
  return executeHandGraph({ registry, graph, initialState: state, context: { callerKind } });
}

function raySetFrom(result) {
  const state = result.finalState;
  return state.lightRaySets[state.lightRaySource.id];
}

function realizationFrom(result) {
  return result.finalState.realizations.maskGuidedLightRaysStaticSvg;
}

test('mask-guided light rays are deterministic and caller-neutral while preserving canonical requests', () => {
  const state = makeMaskGuidedLightRayState({
    field: { id: 'neutral-light-field', seed: 2026, frequency: 4.25, octaves: 5, lacunarity: 2.05, gain: 0.58 },
    mask: { id: 'neutral-light-mask', threshold: 0.52, softness: 0.12 },
    ray: { id: 'neutral-rays', origin: [0.18, 0.55], directionTurns: 0, spanTurns: 0.2, maxLength: 1.4 },
  });
  const human = run(state, MASK_GUIDED_LIGHT_RAY_GRAPH, 'human');
  const machine = run(state, MASK_GUIDED_LIGHT_RAY_GRAPH, 'machine');
  const humanSet = raySetFrom(human);
  const machineSet = raySetFrom(machine);
  const humanSvg = realizationFrom(human);
  const machineSvg = realizationFrom(machine);

  assert.equal(human.finalStateHash, machine.finalStateHash);
  assert.equal(human.finalState.fieldSourceHash, machine.finalState.fieldSourceHash);
  assert.equal(human.finalState.coverageMaskSourceHash, machine.finalState.coverageMaskSourceHash);
  assert.equal(human.finalState.lightRaySourceHash, machine.finalState.lightRaySourceHash);
  assert.equal(humanSet.raySetHash, machineSet.raySetHash);
  assert.equal(humanSvg.content, machineSvg.content);
  assert.deepEqual(human.finalState.fieldRequest, state.fieldRequest);
  assert.deepEqual(human.finalState.maskRequest, state.maskRequest);
  assert.deepEqual(human.finalState.lightRayRequest, state.lightRayRequest);
  assert.equal(humanSet.derived, true);
  assert.equal(humanSet.rebuildable, true);
  assert.equal(humanSet.rays.length, 64);
  assert.equal((humanSvg.content.match(/<line /g) ?? []).length, 64);
});

test('ray working-set density is rebuildable and does not rewrite field, mask, or ray-source truth', () => {
  const state = makeMaskGuidedLightRayState({
    field: { id: 'density-field', seed: 4040, frequency: 3.1, octaves: 6, gain: 0.61 },
    mask: { id: 'density-mask', threshold: 0.46, softness: 0.09 },
    ray: { id: 'density-rays', origin: [0.5, 0.5], directionTurns: 0.125, spanTurns: 0.6, maxLength: 1.3, weightPower: 1.2 },
  });
  const low = run(state, graphWithWorkset(12, 6)).finalState;
  const high = run(state, graphWithWorkset(96, 40)).finalState;
  const lowSet = low.lightRaySets['density-rays'];
  const highSet = high.lightRaySets['density-rays'];

  assert.equal(low.fieldSourceHash, high.fieldSourceHash);
  assert.equal(low.coverageMaskSourceHash, high.coverageMaskSourceHash);
  assert.equal(low.lightRaySourceHash, high.lightRaySourceHash);
  assert.deepEqual(low.lightRaySource, high.lightRaySource);
  assert.notEqual(lowSet.raySetHash, highSet.raySetHash);
  assert.equal(lowSet.rayCount, 12);
  assert.equal(highSet.rayCount, 96);
  assert.equal(lowSet.samplesPerRay, 6);
  assert.equal(highSet.samplesPerRay, 40);
});

test('one ray graph supports materially different narrow directional and wide radial contexts', () => {
  const narrow = run(makeMaskGuidedLightRayState({
    field: { id: 'context-field-a', seed: 77, frequency: 2.4, octaves: 5 },
    mask: { id: 'context-mask-a', threshold: 0.43, softness: 0.14 },
    ray: { id: 'narrow-rays', origin: [0.08, 0.52], directionTurns: 0, spanTurns: 0.12, maxLength: 1.6 },
  })).finalState;
  const radial = run(makeMaskGuidedLightRayState({
    field: { id: 'context-field-b', seed: 991, frequency: 6.2, octaves: 4, gain: 0.49 },
    mask: { id: 'context-mask-b', threshold: 0.61, softness: 0.04, invert: true },
    ray: { id: 'radial-rays', origin: [0.5, 0.5], directionTurns: 0.25, spanTurns: 1, maxLength: 1.1, weightPower: 2 },
  })).finalState;
  const narrowSet = narrow.lightRaySets['narrow-rays'];
  const radialSet = radial.lightRaySets['radial-rays'];

  assert.notEqual(narrowSet.raySetHash, radialSet.raySetHash);
  for (const raySet of [narrowSet, radialSet]) {
    assert.equal(raySet.rays.length, 64);
    assert.ok(raySet.rays.every((ray) => Number.isFinite(ray.weight) && ray.weight >= 0 && ray.weight <= 1));
    assert.ok(raySet.rays.every((ray) => [...ray.start, ...ray.end].every((value) => value >= 0 && value <= 1)));
    assert.ok(raySet.rays.every((ray) => ray.length >= 0));
  }
});

test('coverage-mask inversion changes ray weights while retaining the same geometric request', () => {
  const shared = {
    field: { id: 'invert-field', seed: 5150, frequency: 4.6, octaves: 5, gain: 0.57 },
    ray: { id: 'invert-rays', origin: [0.3, 0.4], directionTurns: 0.08, spanTurns: 0.35, maxLength: 1.2, weightPower: 1 },
  };
  const normal = run(makeMaskGuidedLightRayState({
    ...shared,
    mask: { id: 'normal-mask', threshold: 0.5, softness: 0.12, invert: false },
  }), graphWithWorkset(20, 17)).finalState;
  const inverted = run(makeMaskGuidedLightRayState({
    ...shared,
    mask: { id: 'inverted-mask', threshold: 0.5, softness: 0.12, invert: true },
  }), graphWithWorkset(20, 17)).finalState;
  const normalSet = normal.lightRaySets['invert-rays'];
  const invertedSet = inverted.lightRaySets['invert-rays'];

  assert.equal(normal.fieldSourceHash, inverted.fieldSourceHash);
  assert.notEqual(normal.coverageMaskSourceHash, inverted.coverageMaskSourceHash);
  for (let index = 0; index < normalSet.rays.length; index += 1) {
    const a = normalSet.rays[index];
    const b = invertedSet.rays[index];
    assert.deepEqual(a.start, b.start);
    assert.deepEqual(a.end, b.end);
    assert.equal(a.angleTurns, b.angleTurns);
    assert.ok(Math.abs((a.coverageMean + b.coverageMean) - 1) <= 0.000002);
    assert.ok(Math.abs((a.weight + b.weight) - 1) <= 0.000002);
  }
});

test('static SVG renderer controls remain disposable and do not alter retained ray truth', () => {
  const state = makeMaskGuidedLightRayState({
    field: { id: 'render-field', seed: 1234 },
    mask: { id: 'render-mask', threshold: 0.48, softness: 0.1 },
    ray: { id: 'render-rays', origin: [0.5, 0.88], directionTurns: 0.75, spanTurns: 0.4 },
  });
  const compact = run(state, graphWithWorkset(32, 12, { render: { width: 320, height: 180, strokeWidth: 1 } })).finalState;
  const large = run(state, graphWithWorkset(32, 12, { render: { width: 1280, height: 720, strokeWidth: 3 } })).finalState;
  const compactSet = compact.lightRaySets['render-rays'];
  const largeSet = large.lightRaySets['render-rays'];
  const compactSvg = compact.realizations.maskGuidedLightRaysStaticSvg;
  const largeSvg = large.realizations.maskGuidedLightRaysStaticSvg;

  assert.equal(compact.lightRaySourceHash, large.lightRaySourceHash);
  assert.equal(compactSet.raySetHash, largeSet.raySetHash);
  assert.notEqual(compactSvg.content, largeSvg.content);
  assert.notEqual(compactSvg.derivedFromStateHash, largeSvg.derivedFromStateHash);
  assert.equal(compactSvg.raySetHash, compactSet.raySetHash);
  assert.equal(largeSvg.raySetHash, largeSet.raySetHash);
});

test('lineage drift fails instead of silently becoming renderer or ray-set truth', () => {
  const result = run(makeMaskGuidedLightRayState({
    field: { id: 'drift-field', seed: 8080 },
    mask: { id: 'drift-mask', threshold: 0.55, softness: 0.08 },
    ray: { id: 'drift-rays', origin: [0.4, 0.6], directionTurns: 0.15, spanTurns: 0.3 },
  }));

  const maskDrift = deepClone(result.finalState);
  maskDrift.coverageMaskSource.threshold = 0.1;
  assert.throws(
    () => buildMaskGuidedLightRaySetHand.execute(maskDrift, { rayCount: 16, samplesPerRay: 8 }),
    /coverage mask source state hash mismatch/,
  );

  const rayDrift = deepClone(result.finalState);
  rayDrift.lightRaySets['drift-rays'].rays[0].weight = 0.999;
  assert.throws(
    () => realizeMaskGuidedLightRaysStaticSvgHand.execute(rayDrift, {}),
    /light ray set hash mismatch/,
  );
});

test('invalid source controls, oversized working sets, and invalid renderer controls fail explicitly', () => {
  assert.throws(
    () => run(makeMaskGuidedLightRayState({ ray: { id: 'bad-origin', origin: [-0.01, 0.5] } })),
    /lightRayRequest\.origin\[0\] must be within \[0,1\]/,
  );
  assert.throws(
    () => run(makeMaskGuidedLightRayState({ ray: { id: 'bad-power', weightPower: 4.1 } })),
    /lightRayRequest\.weightPower must be within \[0.25,4\]/,
  );
  assert.throws(
    () => run(makeMaskGuidedLightRayState({ ray: { id: 'ray-budget' } }), graphWithWorkset(257, 8)),
    /lightRaySet\.rayCount must be an integer within \[1,256\]/,
  );
  assert.throws(
    () => run(makeMaskGuidedLightRayState({ ray: { id: 'sample-budget' } }), graphWithWorkset(100, 64, { maxSamples: 4096 })),
    /light ray sample budget exceeded: 6400 > 4096/,
  );
  assert.throws(
    () => run(makeMaskGuidedLightRayState({ ray: { id: 'bad-render' } }), graphWithWorkset(8, 4, { render: { width: 8 } })),
    /lightRaySvg\.width must be an integer within \[16,4096\]/,
  );
  assert.throws(
    () => run(makeMaskGuidedLightRayState({ ray: { id: 'bad-opacity' } }), graphWithWorkset(8, 4, { render: { minOpacity: 0.8, maxOpacity: 0.4 } })),
    /lightRaySvg\.maxOpacity must be >= minOpacity/,
  );
});
