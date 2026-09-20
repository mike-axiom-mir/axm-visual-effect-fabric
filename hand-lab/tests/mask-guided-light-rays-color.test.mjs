import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph } from '../src/hand-runtime.mjs';
import {
  MASK_GUIDED_LIGHT_RAY_GRAPH,
  MASK_GUIDED_LIGHT_RAY_HANDS,
  makeMaskGuidedLightRayState,
} from '../src/mask-guided-light-rays.mjs';

const registry = createHandRegistry(MASK_GUIDED_LIGHT_RAY_HANDS);

function graphWithColor(strokeColor) {
  return {
    ...MASK_GUIDED_LIGHT_RAY_GRAPH,
    stages: MASK_GUIDED_LIGHT_RAY_GRAPH.stages.map((stage) => (
      stage.id === 'realize-static-svg'
        ? { ...stage, params: { ...stage.params, strokeColor } }
        : stage
    )),
  };
}

function fixture() {
  return makeMaskGuidedLightRayState({
    field: {
      id: 'portable-color-field',
      seed: 2468,
      frequency: 4.2,
      octaves: 4,
      lacunarity: 2,
      gain: 0.5,
    },
    mask: {
      id: 'portable-color-mask',
      threshold: 0.47,
      softness: 0.12,
    },
    ray: {
      id: 'portable-color-rays',
      origin: [0.18, 0.5],
      directionTurns: 0,
      spanTurns: 0.2,
      maxLength: 1.25,
      weightPower: 1,
    },
  });
}

test('light-ray SVG binds an explicit default color instead of relying on host viewer currentColor', () => {
  const run = executeHandGraph({
    registry,
    graph: MASK_GUIDED_LIGHT_RAY_GRAPH,
    initialState: fixture(),
    context: { callerKind: 'test' },
  });
  const view = run.finalState.realizations.maskGuidedLightRaysStaticSvg;

  assert.equal(view.renderControls.strokeColor, '#69d7ff');
  assert.match(view.content, /color="#69d7ff"/);
  assert.match(view.content, /stroke="currentColor"/);
});

test('renderer-local light color changes output without rewriting ray source or derived ray geometry', () => {
  const cyan = executeHandGraph({
    registry,
    graph: graphWithColor('#69d7ff'),
    initialState: fixture(),
    context: { callerKind: 'human' },
  });
  const magenta = executeHandGraph({
    registry,
    graph: graphWithColor('#ff00aa'),
    initialState: fixture(),
    context: { callerKind: 'machine' },
  });

  const a = cyan.finalState.realizations.maskGuidedLightRaysStaticSvg;
  const b = magenta.finalState.realizations.maskGuidedLightRaysStaticSvg;

  assert.equal(cyan.finalState.lightRaySourceHash, magenta.finalState.lightRaySourceHash);
  assert.deepEqual(cyan.finalState.lightRaySets, magenta.finalState.lightRaySets);
  assert.notEqual(a.content, b.content);
  assert.equal(a.renderControls.strokeColor, '#69d7ff');
  assert.equal(b.renderControls.strokeColor, '#ff00aa');
  assert.match(b.content, /color="#ff00aa"/);
});

test('invalid renderer color fails explicitly', () => {
  assert.throws(
    () => executeHandGraph({
      registry,
      graph: graphWithColor('currentColor'),
      initialState: fixture(),
      context: { callerKind: 'test' },
    }),
    /lightRaySvg\.strokeColor must be a #RRGGBB color/,
  );
});
