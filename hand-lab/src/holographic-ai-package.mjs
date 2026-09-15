import { deepClone, hashValue, createHandRegistry, executeHandGraph } from './hand-runtime.mjs';
import {
  aiAnatomyHand,
  aiFragmentHand,
  aiBehaviorHand,
  HOLOGRAPHIC_AI_HANDS,
  HOLOGRAPHIC_AI_GRAPH,
  makeHolographicAiInitialState,
} from './holographic-ai-hands.mjs';
import {
  HOLOGRAPHIC_AI_STATE_NATIVE_HANDS,
  HOLOGRAPHIC_AI_STATE_NATIVE_GRAPH,
} from './holographic-ai-state-native.mjs';
import { emitterFieldHand, projectionMotionHand } from './volumetric-hologram-hands.mjs';

export const HOLOGRAPHIC_AI_PACKAGE = Object.freeze({
  schema: 'axm.holographic-ai-package/v0.1',
  id: 'fx.holographic-ai-guide',
  version: '0.1.0',
  identity: 'original-guide-01',
  canonicalState: 'procedural anatomy + semantic behavior + emitter/motion state',
  renderers: Object.freeze({
    default: 'state-native',
    'state-native': {
      id: 'axm.vfx.state-native-points/v0.1',
      purpose: 'normal interactive use; reusable GPU body working set with state deltas',
      graph: HOLOGRAPHIC_AI_STATE_NATIVE_GRAPH.id,
    },
    cinematic: {
      id: 'axm.vfx.raymarch-holographic-ai/v0.1',
      purpose: 'high-cost/high-detail donor path for stronger hardware or bounded shots',
      graph: HOLOGRAPHIC_AI_GRAPH.id,
    },
    calm: {
      id: 'axm.vfx.svg-holographic-ai/v0.1',
      purpose: 'low-cost fallback and quiet software presence from the same canonical anatomy',
      graph: 'fx.holographic-ai-entity-calm',
    },
  }),
});

export const HOLOGRAPHIC_AI_EVENTS = Object.freeze({
  wake: 'materialize',
  ready: 'idle',
  attention: 'listen',
  speechStart: 'speak',
  speechEnd: 'idle',
  deliberate: 'think',
  warning: 'alert',
  settle: 'idle',
  dismiss: 'collapse',
});

export function transitionHolographicAiState(currentState, event) {
  const current = String(currentState || 'dormant');
  const key = String(event || '');
  const next = HOLOGRAPHIC_AI_EVENTS[key];
  if (!next) throw new Error(`Unknown holographic AI event: ${key}`);
  if (current === 'dormant' && !['wake', 'dismiss'].includes(key)) return current;
  if (current === 'collapse' && key !== 'wake') return current;
  return next;
}

function hand(id, execute, description) {
  return Object.freeze({
    schema: 'axm.hand/v0.1',
    id,
    version: '0.1.0',
    deterministic: true,
    callerNeutral: true,
    network: 'forbidden',
    description,
    execute,
  });
}

function limbPath(points, project) {
  return points.map((point, index) => `${index ? 'L' : 'M'} ${project(point).join(' ')}`).join(' ');
}

export const aiCalmSvgHand = hand('fx.hologram.ai-calm-svg', (state) => {
  const next = deepClone(state);
  if (!next.ai || !next.emitter || !next.motion) throw new Error('calm SVG realization requires anatomy, emitter, and motion');
  const ai = next.ai;
  const profile = next.effect.profile ?? { visibility: 1, eyes: 0.72, core: 0.62, breakup: 0.18 };
  const sourceHash = hashValue({ effect: next.effect, ai: next.ai, emitter: next.emitter, motion: next.motion });
  const tint = next.effect.tintCss ?? '#55eaff';
  const accent = next.effect.accentCss ?? '#9d79ff';
  const W = 720;
  const H = 720;
  const project = ([x, y, z = 0]) => [
    Number((W / 2 + x * 330 + z * 42).toFixed(2)),
    Number((H * 0.46 - y * 330 + z * 18).toFixed(2)),
  ];
  const head = project(ai.head.center);
  const torso = project(ai.torso.center);
  const pelvis = project(ai.pelvis.center);
  const core = project(ai.core.center);
  const leftEye = project([-ai.face.sensorSpacing, ai.face.sensorY, 0.115]);
  const rightEye = project([ai.face.sensorSpacing, ai.face.sensorY, 0.115]);
  const halo = project(ai.halo.center);
  const emitterY = 610;
  const fragments = (ai.fragments ?? []).slice(0, 24).map((f, index) => {
    const p = project(f.anchor);
    return `<rect x="${p[0]}" y="${p[1]}" width="${Math.max(2, f.size[0] * 420).toFixed(2)}" height="${Math.max(3, f.size[1] * 300).toFixed(2)}" rx="1" opacity="${(0.1 + f.intensity * 0.28).toFixed(3)}" style="animation-delay:${(-index * 0.08).toFixed(2)}s"/>`;
  }).join('');
  const scanlines = Array.from({ length: 18 }, (_, i) => {
    const y = 118 + i * 23;
    return `<line x1="230" y1="${y}" x2="490" y2="${y}" opacity="${(0.035 + (i % 3) * 0.012).toFixed(3)}"/>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="AXM calm holographic AI"><defs><filter id="g"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter><linearGradient id="beam" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${tint}" stop-opacity=".18"/><stop offset="1" stop-color="${tint}" stop-opacity="0"/></linearGradient></defs><style>.body{fill:none;stroke:${tint};stroke-width:4;stroke-linecap:round;stroke-linejoin:round;filter:url(#g)}.soft{fill:${tint};stroke:${tint};filter:url(#g)}.scan{stroke:${tint}}.frag rect{fill:${tint};animation:drift 3.8s ease-in-out infinite}.pulse{animation:pulse 2.8s ease-in-out infinite}.float{animation:float 4.8s ease-in-out infinite;transform-origin:360px 340px}@keyframes float{50%{transform:translateY(-6px)}}@keyframes pulse{50%{opacity:.45}}@keyframes drift{50%{transform:translateY(-5px);opacity:.12}}</style><rect width="720" height="720" fill="#02050b"/><path d="M 287 ${emitterY} L 238 145 L 482 145 L 433 ${emitterY} Z" fill="url(#beam)"/><ellipse cx="360" cy="${emitterY}" rx="118" ry="30" fill="none" stroke="${tint}" stroke-opacity=".5" stroke-width="3" filter="url(#g)"/><g class="float" opacity="${Math.max(.08, profile.visibility).toFixed(3)}"><g class="scan">${scanlines}</g><g class="body"><ellipse cx="${head[0]}" cy="${head[1]}" rx="${(ai.head.radius * ai.head.scale[0] * 330).toFixed(2)}" ry="${(ai.head.radius * ai.head.scale[1] * 330).toFixed(2)}"/><ellipse cx="${torso[0]}" cy="${torso[1]}" rx="${(ai.torso.scale[0] * 330).toFixed(2)}" ry="${(ai.torso.scale[1] * 330).toFixed(2)}"/><ellipse cx="${pelvis[0]}" cy="${pelvis[1]}" rx="${(ai.pelvis.scale[0] * 330).toFixed(2)}" ry="${(ai.pelvis.scale[1] * 330).toFixed(2)}"/><path d="${limbPath(ai.arms.left, project)}"/><path d="${limbPath(ai.arms.right, project)}"/><path d="${limbPath(ai.legs.left, project)}"/><path d="${limbPath(ai.legs.right, project)}"/><ellipse cx="${halo[0]}" cy="${halo[1]}" rx="${(ai.halo.major * 330).toFixed(2)}" ry="${Math.max(8, ai.halo.major * 92).toFixed(2)}" stroke="${accent}" stroke-opacity=".62"/></g><g class="soft pulse"><circle cx="${leftEye[0]}" cy="${leftEye[1]}" r="5" opacity="${Math.min(1, profile.eyes ?? 0.72).toFixed(3)}"/><circle cx="${rightEye[0]}" cy="${rightEye[1]}" r="5" opacity="${Math.min(1, profile.eyes ?? 0.72).toFixed(3)}"/><circle cx="${core[0]}" cy="${core[1]}" r="${(ai.core.radius * 250).toFixed(2)}" fill="${accent}" opacity="${Math.min(1, profile.core ?? 0.62).toFixed(3)}"/></g><g class="frag">${fragments}</g></g></svg>`;
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AXM Holographic AI — Calm fallback</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#02050b}body{display:grid;place-items:center}svg{width:min(94vw,760px);height:min(94vh,760px)}.tag{position:fixed;left:14px;bottom:12px;font:10px ui-monospace,monospace;color:#9ffcff88;letter-spacing:.11em}</style>${svg}<div class="tag">AXM // HOLOGRAPHIC AI // CALM FALLBACK</div>`;
  next.realizations ??= {};
  next.realizations.holographicAiCalm = {
    mediaType: 'text/html',
    renderer: 'axm.vfx.svg-holographic-ai/v0.1',
    derivedFromStateHash: sourceHash,
    lowCost: true,
    animated: true,
    content: html,
  };
  return { state: next, evidence: { renderer: 'axm.vfx.svg-holographic-ai/v0.1', bytes: Buffer.byteLength(html), lowCost: true } };
}, 'Realize the canonical holographic AI as a quiet low-cost animated SVG fallback.');

export const HOLOGRAPHIC_AI_CALM_HANDS = [
  aiAnatomyHand,
  emitterFieldHand,
  aiFragmentHand,
  aiBehaviorHand,
  projectionMotionHand,
  aiCalmSvgHand,
];

export const HOLOGRAPHIC_AI_CALM_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.holographic-ai-entity-calm',
  version: '0.1.0',
  stages: [
    { id: 'anatomy', hand: 'fx.hologram.ai-anatomy', params: {} },
    { id: 'emitter', hand: 'fx.hologram.emitter-field', params: { originY: -0.98, coneHeight: 1.7, coneWidth: 0.72, floorRingRadius: 0.34, intensity: 0.58 } },
    { id: 'body-fragments', hand: 'fx.hologram.ai-fragments', params: { count: 34 } },
    { id: 'semantic-behavior', hand: 'fx.hologram.ai-behavior', params: {} },
    { id: 'projection-motion', hand: 'fx.hologram.projection-motion', params: { revealMs: 1250, collapseMs: 800, idlePeriodMs: 5600, floatAmplitude: 0.02, yawAmplitude: 0.03, shimmer: 0.13 } },
    { id: 'realize-ai-calm', hand: 'fx.hologram.ai-calm-svg', params: {} },
  ],
});

function graphForMode(mode) {
  if (mode === 'state-native') return { graph: HOLOGRAPHIC_AI_STATE_NATIVE_GRAPH, hands: HOLOGRAPHIC_AI_STATE_NATIVE_HANDS, key: 'holographicAiStateNative' };
  if (mode === 'cinematic') return { graph: HOLOGRAPHIC_AI_GRAPH, hands: HOLOGRAPHIC_AI_HANDS, key: 'holographicAi' };
  if (mode === 'calm') return { graph: HOLOGRAPHIC_AI_CALM_GRAPH, hands: HOLOGRAPHIC_AI_CALM_HANDS, key: 'holographicAiCalm' };
  throw new Error(`Unknown holographic AI render mode: ${mode}`);
}

export function renderHolographicAi({ mode = 'state-native', seed = 20260915, state = 'idle', callerKind = 'deterministic-program' } = {}) {
  const selected = graphForMode(mode);
  const registry = createHandRegistry(selected.hands);
  const run = executeHandGraph({
    registry,
    graph: selected.graph,
    initialState: makeHolographicAiInitialState(seed, state),
    context: { callerKind },
  });
  const realization = run.finalState.realizations?.[selected.key];
  if (!realization) throw new Error(`Missing ${mode} realization`);
  return { mode, run, realization };
}

export function inspectHolographicAiPackage(seed = 20260915, state = 'idle') {
  const modes = {};
  for (const mode of ['state-native', 'cinematic', 'calm']) {
    const { run, realization } = renderHolographicAi({ mode, seed, state });
    modes[mode] = {
      graph: run.graph,
      renderer: realization.renderer,
      finalStateHash: run.finalStateHash,
      anatomyHash: hashValue({
        identity: run.finalState.ai.identity,
        head: run.finalState.ai.head,
        torso: run.finalState.ai.torso,
        pelvis: run.finalState.ai.pelvis,
        arms: run.finalState.ai.arms,
        legs: run.finalState.ai.legs,
        core: run.finalState.ai.core,
        halo: run.finalState.ai.halo,
        face: run.finalState.ai.face,
      }),
    };
  }
  return {
    schema: 'axm.holographic-ai-package-inspection/v0.1',
    package: HOLOGRAPHIC_AI_PACKAGE,
    seed,
    state,
    modes,
  };
}
