import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph } from '../src/hand-runtime.mjs';
import {
  MASK_GUIDED_LIGHT_RAY_GRAPH,
  MASK_GUIDED_LIGHT_RAY_HANDS,
  makeMaskGuidedLightRayState,
} from '../src/mask-guided-light-rays.mjs';

const registry = createHandRegistry(MASK_GUIDED_LIGHT_RAY_HANDS);

function fixture() {
  return makeMaskGuidedLightRayState({
    field: {
      id: 'volumetric-fixture-field',
      seed: 31415,
      frequency: 3.8,
      octaves: 4,
      lacunarity: 2,
      gain: 0.52,
    },
    mask: {
      id: 'volumetric-fixture-mask',
      threshold: 0.48,
      softness: 0.14,
    },
    ray: {
      id: 'volumetric-fixture-rays',
      origin: [0.16, 0.5],
      directionTurns: 0,
      spanTurns: 0.22,
      maxLength: 1.25,
      weightPower: 1,
    },
  });
}

function graphWithRendererParams(params = {}) {
  return {
    ...MASK_GUIDED_LIGHT_RAY_GRAPH,
    stages: MASK_GUIDED_LIGHT_RAY_GRAPH.stages.map((stage) => (
      stage.id === 'realize-static-svg'
        ? { ...stage, params: { ...stage.params, ...params } }
        : stage
    )),
  };
}

function run(params = {}, callerKind = 'test') {
  return executeHandGraph({
    registry,
    graph: graphWithRendererParams(params),
    initialState: fixture(),
    context: { callerKind },
  });
}

function view(runResult) {
  return runResult.finalState.realizations.maskGuidedLightRaysStaticSvg;
}

test('volumetric-light mode preserves canonical and derived ray truth while changing only renderer expression', () => {
  const line = run({ presentationMode: 'line-inspection' });
  const volume = run({
    presentationMode: 'volumetric-light',
    hazeWidthMultiplier: 5,
    beamWidthMultiplier: 1.8,
    hazeBlur: 7,
    beamThreshold: 0.5,
    coreThreshold: 0.7,
    tipOpacity: 0,
    originGlowRadius: 14,
  });

  assert.equal(line.finalState.lightRaySourceHash, volume.finalState.lightRaySourceHash);
  assert.deepEqual(line.finalState.lightRaySource, volume.finalState.lightRaySource);
  assert.deepEqual(line.finalState.lightRaySets, volume.finalState.lightRaySets);
  assert.notEqual(view(line).content, view(volume).content);
  assert.equal(view(line).renderControls.presentationMode, 'line-inspection');
  assert.equal(view(volume).renderControls.presentationMode, 'volumetric-light');
});

test('volumetric-light mode emits one soft volume plus selective beam/core structure instead of equal bright lines', () => {
  const result = run({
    presentationMode: 'volumetric-light',
    hazeWidthMultiplier: 5,
    beamWidthMultiplier: 1.8,
    hazeBlur: 7,
    beamThreshold: 0.5,
    coreThreshold: 0.7,
    tipOpacity: 0,
    originGlowRadius: 14,
  });
  const svg = view(result).content;
  const rayCount = result.finalState.lightRaySets['volumetric-fixture-rays'].rayCount;
  const beamMatch = svg.match(/data-beam-ray-count="(\d+)"/);
  const coreMatch = svg.match(/data-core-ray-count="(\d+)"/);
  assert.ok(beamMatch);
  assert.ok(coreMatch);
  const beamCount = Number(beamMatch[1]);
  const coreCount = Number(coreMatch[1]);

  assert.match(svg, /data-presentation-mode="volumetric-light"/);
  assert.match(svg, /data-layer="ray-volume"/);
  assert.match(svg, /data-layer="ray-origin-glow"/);
  assert.match(svg, /data-layer="ray-beam"/);
  assert.match(svg, /data-layer="ray-core"/);
  assert.match(svg, /feGaussianBlur/);
  assert.match(svg, /linearGradient id="axm-volume-fill"/);
  assert.match(svg, /linearGradient id="axm-beam-0"/);
  assert.match(svg, /offset="100%"/);
  assert.ok(beamCount > 0, 'expected some visible beam rays');
  assert.ok(beamCount < rayCount, 'not every ray should remain a visible beam');
  assert.ok(coreCount > 0, 'expected at least one strong core ray');
  assert.ok(coreCount < beamCount, 'core rays should be a stricter subset of beam rays');
  assert.equal((svg.match(/data-layer="ray-volume"/g) ?? []).length, 1);
  assert.equal((svg.match(/data-layer="ray-beam"/g) ?? []).length, 1);
  assert.equal((svg.match(/data-layer="ray-core"/g) ?? []).length, 1);
});

test('volumetric renderer is caller-neutral and its shaping controls are disposable', () => {
  const human = run({ presentationMode: 'volumetric-light', beamThreshold: 0.42, coreThreshold: 0.6, hazeBlur: 5 }, 'human');
  const machine = run({ presentationMode: 'volumetric-light', beamThreshold: 0.42, coreThreshold: 0.6, hazeBlur: 5 }, 'machine');
  const softer = run({ presentationMode: 'volumetric-light', coreThreshold: 0.72, hazeBlur: 6.5 }, 'machine');

  assert.equal(human.finalStateHash, machine.finalStateHash);
  assert.equal(view(human).content, view(machine).content);
  assert.deepEqual(human.finalState.lightRaySets, softer.finalState.lightRaySets);
  assert.equal(human.finalState.lightRaySourceHash, softer.finalState.lightRaySourceHash);
  assert.notEqual(view(human).content, view(softer).content);
});

test('volumetric renderer rejects unsupported mode and unsafe shaping controls', () => {
  assert.throws(
    () => run({ presentationMode: 'laser-party' }),
    /lightRaySvg\.presentationMode must be line-inspection or volumetric-light/,
  );
  assert.throws(
    () => run({ presentationMode: 'volumetric-light', coreThreshold: 0.99 }),
    /lightRaySvg\.coreThreshold must be within \[0,0\.95\]/,
  );
  assert.throws(
    () => run({ presentationMode: 'volumetric-light', hazeWidthMultiplier: 30 }),
    /lightRaySvg\.hazeWidthMultiplier must be within \[1,24\]/,
  );
  assert.throws(
    () => run({ presentationMode: 'volumetric-light', tipOpacity: 0.75 }),
    /lightRaySvg\.tipOpacity must be within \[0,0\.5\]/,
  );
});
