import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HOLOGRAPHIC_AI_PACKAGE,
  transitionHolographicAiState,
  renderHolographicAi,
  inspectHolographicAiPackage,
} from '../src/holographic-ai-package.mjs';

test('package keeps one original AI identity across all render expressions', () => {
  const inspection = inspectHolographicAiPackage(20260915, 'idle');
  const hashes = Object.values(inspection.modes).map(mode => mode.anatomyHash);
  assert.equal(new Set(hashes).size, 1);
  assert.equal(HOLOGRAPHIC_AI_PACKAGE.identity, 'original-guide-01');
  assert.equal(HOLOGRAPHIC_AI_PACKAGE.renderers.default, 'state-native');
});

test('semantic event contract drives reusable AI states', () => {
  assert.equal(transitionHolographicAiState('dormant', 'wake'), 'materialize');
  assert.equal(transitionHolographicAiState('materialize', 'ready'), 'idle');
  assert.equal(transitionHolographicAiState('idle', 'attention'), 'listen');
  assert.equal(transitionHolographicAiState('listen', 'speechStart'), 'speak');
  assert.equal(transitionHolographicAiState('speak', 'speechEnd'), 'idle');
  assert.equal(transitionHolographicAiState('idle', 'deliberate'), 'think');
  assert.equal(transitionHolographicAiState('think', 'warning'), 'alert');
  assert.equal(transitionHolographicAiState('alert', 'settle'), 'idle');
  assert.equal(transitionHolographicAiState('idle', 'dismiss'), 'collapse');
  assert.equal(transitionHolographicAiState('collapse', 'wake'), 'materialize');
  assert.throws(() => transitionHolographicAiState('idle', 'invented-event'), /Unknown holographic AI event/);
});

test('default renderer remains state-native and cinematic donor remains available', () => {
  const efficient = renderHolographicAi({ mode: 'state-native', seed: 77, state: 'listen' });
  const cinematic = renderHolographicAi({ mode: 'cinematic', seed: 77, state: 'listen' });
  assert.equal(efficient.realization.renderer, 'axm.vfx.state-native-points/v0.1');
  assert.match(efficient.realization.content, /STATIC_DRAW/);
  assert.match(cinematic.realization.content, /getContext\('webgl2'/);
  assert.match(cinematic.realization.content, /sdCapsule/);
  assert.equal(efficient.run.finalState.ai.identity, cinematic.run.finalState.ai.identity);
});

test('calm fallback is animated SVG and avoids WebGL', () => {
  const calm = renderHolographicAi({ mode: 'calm', seed: 91, state: 'idle' });
  const html = calm.realization.content;
  assert.equal(calm.realization.renderer, 'axm.vfx.svg-holographic-ai/v0.1');
  assert.equal(calm.realization.lowCost, true);
  assert.match(html, /<svg /);
  assert.match(html, /@keyframes float/);
  assert.doesNotMatch(html, /getContext\('webgl2'/);
  assert.doesNotMatch(html, /raymarch/i);
});
