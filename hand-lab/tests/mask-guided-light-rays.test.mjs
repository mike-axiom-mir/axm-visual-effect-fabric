import test from 'node:test';
import assert from 'node:assert/strict';
import { deepClone, createHandRegistry, executeHandGraph, hashValue } from '../src/hand-runtime.mjs';
import {
  CELLULAR_MASK_GUIDED_LIGHT_RAY_GRAPH,
  CELLULAR_MASK_GUIDED_LIGHT_RAY_HANDS,
  MASK_GUIDED_LIGHT_RAY_GRAPH,
  MASK_GUIDED_LIGHT_RAY_HANDS,
  buildMaskGuidedLightRaySetHand,
  makeCellularMaskGuidedLightRayState,
  makeMaskGuidedLightRayState,
  realizeMaskGuidedLightRaysStaticSvgHand,
} from '../src/mask-guided-light-rays.mjs';

const registry = createHandRegistry(MASK_GUIDED_LIGHT_RAY_HANDS);
const cellularRegistry = createHandRegistry(CELLULAR_MASK_GUIDED_LIGHT_RAY_HANDS);

function graphWithWorkset(rayCount, samplesPerRay, options = {}, baseGraph = MASK_GUIDED_LIGHT_RAY_GRAPH) {
  const render = options.render ?? {};
  return {
    ...baseGraph,
    stages: [
      baseGraph.stages[0],
      baseGraph.stages[1],
      baseGraph.stages[2],
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

function runCellular(state, graph = CELLULAR_MASK_GUIDED_LIGHT_RAY_GRAPH, callerKind = 'test') {
  return executeHandGraph({ registry: cellularRegistry, graph, initialState: state, context: { callerKind } });
}

function raySetFrom(result) {
  const state = result.finalState;
  return state.lightRaySets[state.lightRaySource.id];
}

function realizationFrom(result) {
  return result.finalState.realizations.maskGuidedLightRaysStaticSvg;
}

function selfHashRaySet(raySet) {
  return hashValue({
    schema: raySet.schema,
    raySourceHash: raySet.raySourceHash,
    fieldSourceHash: raySet.fieldSourceHash,
    maskSourceHash: raySet.maskSourceHash,
    rayCount: raySet.rayCount,
    samplesPerRay: raySet.samplesPerRay,
    rays: raySet.rays,
  });
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

test('cellular-backed mask-guided rays are deterministic and caller-neutral through the same downstream Hands', () => {
  const state = makeCellularMaskGuidedLightRayState({
    field: { id: 'cell-ray-field', seed: 7331, frequency: 6.75, jitter: 0.84, valueMode: 'inverse-distance' },
    mask: { id: 'cell-ray-mask', threshold: 0.56, softness: 0.09 },
    ray: { id: 'cell-rays', origin: [0.2, 0.58], directionTurns: 0.02, spanTurns: 0.22, maxLength: 1.45 },
  });
  const human = runCellular(state, CELLULAR_MASK_GUIDED_LIGHT_RAY_GRAPH, 'human');
  const machine = runCellular(state, CELLULAR_MASK_GUIDED_LIGHT_RAY_GRAPH, 'machine');
  const humanSet = raySetFrom(human);
  const humanSvg = realizationFrom(human);

  assert.equal(human.finalStateHash, machine.finalStateHash);
  assert.equal(human.finalState.cellularFieldSourceHash, machine.finalState.cellularFieldSourceHash);
  assert.equal(human.finalState.coverageMaskSourceHash, machine.finalState.coverageMaskSourceHash);
  assert.equal(human.finalState.lightRaySourceHash, machine.finalState.lightRaySourceHash);
  assert.equal(humanSet.fieldSourceHash, human.finalState.cellularFieldSourceHash);
  assert.equal(humanSvg.fieldSourceHash, human.finalState.cellularFieldSourceHash);
  assert.equal(humanSet.raySetHash, raySetFrom(machine).raySetHash);
  assert.equal(humanSvg.content, realizationFrom(machine).content);
  assert.deepEqual(human.finalState.cellularFieldRequest, state.cellularFieldRequest);
  assert.deepEqual(human.finalState.maskRequest, state.maskRequest);
  assert.deepEqual(human.finalState.lightRayRequest, state.lightRayRequest);
});

test('fBm and cellular coverage families drive different weights without changing the shared ray geometry request', () => {
  const sharedMask = { id: 'family-mask', threshold: 0.5, softness: 0.1 };
  const sharedRay = { id: 'family-rays', origin: [0.3, 0.62], directionTurns: 0.04, spanTurns: 0.3, maxLength: 1.3, weightPower: 1.2 };
  const fbm = run(makeMaskGuidedLightRayState({
    field: { id: 'family-field', seed: 91, frequency: 4.5, octaves: 5, gain: 0.57 },
    mask: sharedMask,
    ray: sharedRay,
  }), graphWithWorkset(24, 19)).finalState;
  const cellular = runCellular(makeCellularMaskGuidedLightRayState({
    field: { id: 'family-field', seed: 91, frequency: 4.5, jitter: 0.9, valueMode: 'distance' },
    mask: sharedMask,
    ray: sharedRay,
  }), graphWithWorkset(24, 19, {}, CELLULAR_MASK_GUIDED_LIGHT_RAY_GRAPH)).finalState;
  const fbmSet = fbm.lightRaySets['family-rays'];
  const cellSet = cellular.lightRaySets['family-rays'];

  assert.notEqual(fbmSet.fieldSourceHash, cellSet.fieldSourceHash);
  assert.notEqual(fbmSet.raySetHash, cellSet.raySetHash);
  for (let index = 0; index < fbmSet.rays.length; index += 1) {
    assert.deepEqual(fbmSet.rays[index].start, cellSet.rays[index].start);
    assert.deepEqual(fbmSet.rays[index].end, cellSet.rays[index].end);
    assert.equal(fbmSet.rays[index].angleTurns, cellSet.rays[index].angleTurns);
  }
  assert.ok(fbmSet.rays.some((ray, index) => Math.abs(ray.weight - cellSet.rays[index].weight) > 0.000001));
});

test('a coverage mask bound to cellular truth keeps using cellular even when an unrelated fBm source is also retained', () => {
  const cellular = runCellular(makeCellularMaskGuidedLightRayState({
    field: { id: 'selected-cell', seed: 501, frequency: 5.2, jitter: 0.72 },
    mask: { id: 'selected-mask', threshold: 0.47, softness: 0.12 },
    ray: { id: 'selected-rays', origin: [0.5, 0.5], directionTurns: 0.1, spanTurns: 0.4 },
  }), graphWithWorkset(18, 11, {}, CELLULAR_MASK_GUIDED_LIGHT_RAY_GRAPH)).finalState;
  const fbm = run(makeMaskGuidedLightRayState({
    field: { id: 'unrelated-fbm', seed: 999 },
    mask: { id: 'unrelated-mask', threshold: 0.5, softness: 0.08 },
    ray: { id: 'unrelated-rays' },
  })).finalState;
  const dual = deepClone(cellular);
  dual.fieldSource = fbm.fieldSource;
  dual.fieldSourceHash = fbm.fieldSourceHash;

  const rebuilt = buildMaskGuidedLightRaySetHand.execute(dual, { rayCount: 18, samplesPerRay: 11 }).state;
  assert.equal(rebuilt.lightRaySets['selected-rays'].fieldSourceHash, cellular.cellularFieldSourceHash);
  assert.equal(rebuilt.lightRaySets['selected-rays'].raySetHash, cellular.lightRaySets['selected-rays'].raySetHash);
});

test('self-consistent derived ray tampering is rejected by rebuilding from retained field, mask, and ray truth', () => {
  const result = runCellular(makeCellularMaskGuidedLightRayState({
    field: { id: 'truth-cell', seed: 606, frequency: 7, jitter: 0.8 },
    mask: { id: 'truth-mask', threshold: 0.51, softness: 0.1 },
    ray: { id: 'truth-rays', origin: [0.42, 0.52], directionTurns: 0.07, spanTurns: 0.26 },
  }), graphWithWorkset(16, 9, {}, CELLULAR_MASK_GUIDED_LIGHT_RAY_GRAPH));
  const tampered = deepClone(result.finalState);
  const raySet = tampered.lightRaySets['truth-rays'];
  raySet.rays[0].weight = raySet.rays[0].weight > 0.5 ? 0.25 : 0.75;
  raySet.raySetHash = selfHashRaySet(raySet);

  assert.throws(
    () => realizeMaskGuidedLightRaysStaticSvgHand.execute(tampered, {}),
    /light ray set does not rebuild from retained source truth/,
  );
});
