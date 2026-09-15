import { deepClone, hashValue } from './hand-runtime.mjs';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v)));
const round6 = (v) => Number(Number(v).toFixed(6));

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hand(id, execute, description) {
  return Object.freeze({
    schema: 'axm.hand/v0.1', id, version: '0.1.0', deterministic: true,
    callerNeutral: true, network: 'forbidden', description, execute,
  });
}

function canonicalVisualState(state) {
  return {
    effect: state.effect,
    geometry: state.geometry,
    fields: state.fields,
    layers: state.layers,
    motion: state.motion,
  };
}

export const panelFormHand = hand('fx.hologram.panel-form', (state, params) => {
  const next = deepClone(state);
  const width = clamp(params.width ?? next.effect.size?.width ?? 820, 240, 1600);
  const height = clamp(params.height ?? next.effect.size?.height ?? 460, 160, 1200);
  const cut = clamp(params.cornerCut ?? 24, 4, Math.min(width, height) * 0.16);
  next.effect.size = { width, height };
  next.geometry = {
    panel: {
      x: 0, y: 0, width, height, cornerCut: cut,
      polygon: [
        [cut, 0], [width - cut, 0], [width, cut], [width, height - cut],
        [width - cut, height], [cut, height], [0, height - cut], [0, cut],
      ],
    },
  };
  return { state: next, evidence: { width, height, cornerCut: cut } };
}, 'Create a renderer-neutral clipped holographic panel form.');

export const depthStackHand = hand('fx.hologram.depth-stack', (state, params) => {
  const next = deepClone(state);
  if (!next.geometry?.panel) throw new Error('depth-stack requires panel geometry');
  const count = Math.round(clamp(params.count ?? 6, 2, 16));
  const spacing = clamp(params.spacing ?? 0.012, 0.002, 0.08);
  const random = mulberry32((next.effect.seed ?? 1) ^ 0x484F4C4F);
  next.geometry.depthSlices = Array.from({ length: count }, (_, index) => ({
    id: `depth-${index + 1}`,
    z: round6(index * spacing),
    xDrift: round6((random() * 2 - 1) * 0.008 * index),
    yDrift: round6((random() * 2 - 1) * 0.004 * index),
    opacity: round6(0.18 + (index / Math.max(1, count - 1)) * 0.28),
  }));
  return { state: next, evidence: { slices: count, spacing } };
}, 'Create deterministic depth slices so one flat panel can realize as layered projection/parallax.');

export const scanFieldHand = hand('fx.hologram.scan-field', (state, params) => {
  const next = deepClone(state);
  const count = Math.round(clamp(params.lines ?? 38, 8, 96));
  const random = mulberry32((next.effect.seed ?? 1) ^ 0x5CA11F1E);
  next.fields ??= {};
  next.fields.scanlines = Array.from({ length: count }, (_, index) => ({
    id: `scan-${index + 1}`,
    y: round6((index + 0.5) / count),
    phase: round6(random()),
    opacity: round6(0.045 + random() * 0.085),
    thickness: round6(0.55 + random() * 1.15),
  }));
  next.fields.sweep = {
    axis: 'y', start: -0.08, end: 1.08,
    width: round6(clamp(params.sweepWidth ?? 0.055, 0.01, 0.2)),
    phase: round6(random()),
  };
  return { state: next, evidence: { scanlines: count } };
}, 'Build editable scanline and sweep fields without flattening them into pixels.');

export const interferenceHand = hand('fx.hologram.interference-field', (state, params) => {
  const next = deepClone(state);
  const random = mulberry32((next.effect.seed ?? 1) ^ 0x1A73F3E7);
  const bandCount = Math.round(clamp(params.bands ?? 8, 0, 24));
  const sparkCount = Math.round(clamp(params.sparks ?? 18, 0, 64));
  next.fields ??= {};
  next.fields.interference = {
    bands: Array.from({ length: bandCount }, (_, index) => ({
      id: `band-${index + 1}`,
      y: round6(random()),
      height: round6(0.006 + random() * 0.028),
      xShift: round6((random() * 2 - 1) * 0.025),
      intensity: round6(0.12 + random() * 0.32),
    })),
    sparks: Array.from({ length: sparkCount }, (_, index) => ({
      id: `spark-${index + 1}`,
      x: round6(random()), y: round6(random()),
      radius: round6(0.6 + random() * 1.9),
      intensity: round6(0.25 + random() * 0.7),
    })),
  };
  return { state: next, evidence: { bands: bandCount, sparks: sparkCount } };
}, 'Generate deterministic signal breakup bands and micro-sparks as editable state.');

export const emissionHand = hand('fx.hologram.emission-layers', (state, params) => {
  const next = deepClone(state);
  const glowScale = clamp(next.effect.controls?.glowScale ?? 1, 0, 3);
  next.layers = [
    { id: 'holo-core', role: 'translucent-core', module: 'surface.translucent-emissive', params: { opacity: round6(clamp(params.coreOpacity ?? 0.12, 0, 1)), tint: next.effect.tint } },
    { id: 'holo-edge', role: 'edge-emission', module: 'light.neon-edge-glow', params: { strength: round6(clamp(params.edgeStrength ?? 0.92, 0, 2) * glowScale), radius: round6(clamp(params.edgeRadius ?? 0.018, 0, 0.12)) } },
    { id: 'holo-bloom', role: 'soft-bloom', module: 'light.soft-bloom-halo', params: { strength: round6(clamp(params.bloom ?? 0.52, 0, 2) * glowScale), radius: 0.05 } },
    { id: 'holo-depth', role: 'depth-projection', module: 'projection.layered-depth', params: { parallax: round6(clamp(params.parallax ?? 0.018, 0, 0.12)) } },
  ];
  return { state: next, evidence: { layers: next.layers.length, glowScale } };
}, 'Describe hologram material/light intent as replaceable layers.');

const STATE_PROFILES = Object.freeze({
  dormant: { visibility: 0.035, edge: 0.12, scan: 0.0, shimmer: 0.02, depth: 0.1 },
  materialize: { visibility: 0.72, edge: 0.92, scan: 1.0, shimmer: 0.48, depth: 0.72 },
  stable: { visibility: 0.88, edge: 0.68, scan: 0.32, shimmer: 0.16, depth: 0.62 },
  focus: { visibility: 1.0, edge: 1.0, scan: 0.72, shimmer: 0.22, depth: 0.84 },
  alert: { visibility: 1.0, edge: 1.2, scan: 0.86, shimmer: 0.5, depth: 0.9 },
  collapse: { visibility: 0.16, edge: 0.34, scan: 0.92, shimmer: 0.74, depth: 0.24 },
});

export const semanticStateHand = hand('fx.hologram.semantic-state', (state) => {
  const next = deepClone(state);
  const requested = String(next.effect.requestedState ?? 'stable');
  const profile = STATE_PROFILES[requested];
  if (!profile) throw new Error(`Unsupported hologram state: ${requested}`);
  next.effect.activeState = requested;
  next.effect.profile = deepClone(profile);
  return { state: next, evidence: { activeState: requested, profile } };
}, 'Map semantic software state to restrained visual intensity instead of decoration-only animation.');

export const motionEnvelopeHand = hand('fx.hologram.motion-envelope', (state, params) => {
  const next = deepClone(state);
  const revealMs = Math.round(clamp(params.revealMs ?? 1100, 160, 5000));
  const settleMs = Math.round(clamp(params.settleMs ?? 520, 80, 2400));
  const idleMs = Math.round(clamp(params.idleMs ?? 3600, 600, 12000));
  next.motion = {
    timeModel: 'normalized-deterministic-tracks',
    reveal: [
      { t: 0, state: 'dormant', visibility: 0.03, verticalClip: 0.0, edgeBurst: 0.05 },
      { t: 0.18, state: 'materialize', visibility: 0.22, verticalClip: 0.18, edgeBurst: 0.92 },
      { t: 0.58, state: 'materialize', visibility: 0.76, verticalClip: 0.72, edgeBurst: 1.0 },
      { t: 1, state: 'stable', visibility: 0.88, verticalClip: 1.0, edgeBurst: 0.68 },
    ],
    focus: [
      { t: 0, intensity: 0.0, sweep: -0.08 },
      { t: 0.5, intensity: 1.0, sweep: 0.5 },
      { t: 1, intensity: 0.35, sweep: 1.08 },
    ],
    collapse: [
      { t: 0, visibility: 0.88, verticalClip: 1.0, breakup: 0.08 },
      { t: 0.7, visibility: 0.32, verticalClip: 0.28, breakup: 0.62 },
      { t: 1, visibility: 0.0, verticalClip: 0.0, breakup: 1.0 },
    ],
    durations: { revealMs, settleMs, idleMs },
  };
  return { state: next, evidence: { revealMs, settleMs, idleMs } };
}, 'Attach deterministic reveal/focus/collapse tracks that any renderer can realize.');

function esc(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function panelPath(panel, inset = 0) {
  const { width:w, height:h, cornerCut:c } = panel;
  const i = inset; const ci = Math.max(2, c - inset * 0.4);
  return `M ${ci+i} ${i} H ${w-ci-i} L ${w-i} ${ci+i} V ${h-ci-i} L ${w-ci-i} ${h-i} H ${ci+i} L ${i} ${h-ci-i} V ${ci+i} Z`;
}

export const svgPreviewHand = hand('fx.hologram.svg-preview', (state) => {
  const next = deepClone(state);
  const panel = next.geometry?.panel;
  if (!panel) throw new Error('svg-preview requires panel geometry');
  const { width:w, height:h } = panel;
  const tint = next.effect.tint ?? '#63f6ff';
  const profile = next.effect.profile ?? STATE_PROFILES.stable;
  const scan = next.fields?.scanlines ?? [];
  const interference = next.fields?.interference ?? { bands: [], sparks: [] };
  const depth = next.geometry?.depthSlices ?? [];
  const sourceHash = hashValue(canonicalVisualState(next));
  const depthMarkup = depth.slice().reverse().map((slice, index) => {
    const dx = round6(slice.xDrift * w + (index + 1) * 2.4);
    const dy = round6(slice.yDrift * h + (index + 1) * 1.6);
    return `<path d="${panelPath(panel, 3 + index * 0.75)}" transform="translate(${dx} ${dy})" fill="none" stroke="${tint}" stroke-opacity="${round6(slice.opacity * 0.28 * profile.depth)}" stroke-width="1"/>`;
  }).join('');
  const scanMarkup = scan.map((line) => `<line x1="24" y1="${round6(line.y*h)}" x2="${w-24}" y2="${round6(line.y*h)}" stroke="${tint}" stroke-opacity="${round6(line.opacity * profile.scan)}" stroke-width="${line.thickness}"/>`).join('');
  const bands = interference.bands.map((band) => `<rect x="${round6(18 + band.xShift*w)}" y="${round6(band.y*h)}" width="${round6(w-36)}" height="${round6(Math.max(1,band.height*h))}" fill="${tint}" opacity="${round6(band.intensity*0.12*profile.shimmer)}"/>`).join('');
  const sparks = interference.sparks.map((spark) => `<circle cx="${round6(20+spark.x*(w-40))}" cy="${round6(20+spark.y*(h-40))}" r="${spark.radius}" fill="white" opacity="${round6(spark.intensity*0.3*profile.shimmer)}"/>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="AXM holographic panel proof"><defs><filter id="glow"><feGaussianBlur stdDeviation="7" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter><linearGradient id="core" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${tint}" stop-opacity="0.12"/><stop offset="0.48" stop-color="${tint}" stop-opacity="0.035"/><stop offset="1" stop-color="${tint}" stop-opacity="0.09"/></linearGradient><clipPath id="clip"><path d="${panelPath(panel)}"/></clipPath></defs><rect width="${w}" height="${h}" fill="#04070b"/>${depthMarkup}<path d="${panelPath(panel)}" fill="url(#core)" stroke="${tint}" stroke-opacity="${round6(0.82*profile.edge)}" stroke-width="2" filter="url(#glow)"/><g clip-path="url(#clip)">${scanMarkup}${bands}${sparks}<rect x="0" y="${round6(h*0.42)}" width="${w}" height="${round6(h*0.085)}" fill="${tint}" opacity="${round6(0.055*profile.scan)}"/></g><g font-family="ui-monospace, SFMono-Regular, Menlo, monospace" fill="${tint}"><text x="46" y="74" font-size="19" opacity="0.95">AXM // HOLOGRAPHIC SURFACE</text><text x="46" y="106" font-size="12" opacity="0.48">SEMANTIC STATE: ${esc(next.effect.activeState).toUpperCase()}</text><text x="46" y="${h-52}" font-size="11" opacity="0.38">${sourceHash.slice(0,24)}</text></g><circle cx="${w-52}" cy="54" r="5" fill="${tint}" opacity="0.82" filter="url(#glow)"/></svg>`;
  next.realizations ??= {};
  next.realizations.svgPreview = { mediaType: 'image/svg+xml', derivedFromStateHash: sourceHash, content: svg };
  return { state: next, evidence: { bytes: Buffer.byteLength(svg), sourceHash } };
}, 'Render a disposable SVG hologram proof from canonical editable panel state.');

export const htmlDemoHand = hand('fx.hologram.html-demo', (state) => {
  const next = deepClone(state);
  const svg = next.realizations?.svgPreview?.content;
  if (!svg) throw new Error('html-demo requires SVG preview');
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AXM Hologram Hand Proof</title><style>html,body{height:100%;margin:0;background:#03060a;color:#bffcff;font-family:Inter,system-ui,sans-serif}body{display:grid;place-items:center;overflow:hidden}.stage{width:min(92vw,980px);perspective:1100px}.holo{position:relative;opacity:.08;transform:translateY(28px) rotateX(8deg) scale(.965);filter:blur(7px) saturate(.7);transition:opacity 1.05s cubic-bezier(.2,.75,.2,1),transform 1.05s cubic-bezier(.2,.75,.2,1),filter .7s ease}.holo.active{opacity:1;transform:none;filter:none}.holo.focus{transform:translateY(-4px) scale(1.012);filter:brightness(1.16) saturate(1.18)}.holo.collapsing{opacity:0;transform:translateY(-18px) scaleY(.08) scaleX(.94);filter:blur(3px) brightness(1.55)}.holo svg{display:block;width:100%;height:auto;filter:drop-shadow(0 0 18px rgba(99,246,255,.26))}.holo::before{content:"";position:absolute;inset:2% 2%;pointer-events:none;background:linear-gradient(to bottom,transparent 0%,rgba(99,246,255,.0) 43%,rgba(185,255,255,.24) 49%,rgba(99,246,255,.05) 54%,transparent 61%);mix-blend-mode:screen;transform:translateY(-120%);opacity:0}.holo.active::before{opacity:1;animation:sweep 2.7s cubic-bezier(.22,.7,.25,1) .32s both}.holo.focus::before{animation:sweep 1.25s linear infinite}.holo::after{content:"";position:absolute;inset:4%;pointer-events:none;background:repeating-linear-gradient(to bottom,rgba(99,246,255,.045) 0 1px,transparent 1px 7px);mix-blend-mode:screen;opacity:.25}.holo.active::after{animation:flicker 5.2s steps(1,end) infinite}.controls{display:flex;justify-content:center;gap:10px;margin-top:18px}.controls button{appearance:none;border:1px solid rgba(99,246,255,.35);background:rgba(8,22,28,.62);color:#aefaff;padding:9px 14px;border-radius:999px;letter-spacing:.08em;font-size:11px;cursor:pointer}.controls button:hover,.controls button:focus-visible{border-color:rgba(180,255,255,.9);box-shadow:0 0 22px rgba(99,246,255,.16);outline:none}@keyframes sweep{0%{transform:translateY(-120%);opacity:0}10%{opacity:.25}55%{opacity:.8}100%{transform:translateY(120%);opacity:0}}@keyframes flicker{0%,89%,94%,100%{opacity:.25}90%{opacity:.08}91%{opacity:.42}92%{opacity:.16}93%{opacity:.32}}@media(prefers-reduced-motion:reduce){.holo,.holo::before,.holo::after{animation:none!important;transition:none!important}}</style></head><body><main class="stage"><div id="holo" class="holo" aria-live="polite">${svg}</div><div class="controls"><button id="activate">MATERIALIZE</button><button id="focus">FOCUS</button><button id="collapse">COLLAPSE</button></div></main><script>const h=document.getElementById('holo');const activate=()=>{h.className='holo';requestAnimationFrame(()=>requestAnimationFrame(()=>h.classList.add('active')))};document.getElementById('activate').onclick=activate;document.getElementById('focus').onclick=()=>{h.classList.add('active');h.classList.toggle('focus')};document.getElementById('collapse').onclick=()=>{h.className='holo active collapsing';setTimeout(()=>h.className='holo',900)};setTimeout(activate,380);</script></body></html>`;
  next.realizations.htmlDemo = {
    mediaType: 'text/html',
    derivedFromStateHash: next.realizations.svgPreview.derivedFromStateHash,
    content: html,
  };
  return { state: next, evidence: { bytes: Buffer.byteLength(html), interactiveStates: ['materialize','focus','collapse'] } };
}, 'Create an interactive browser demo where the hologram stays quiet until materialized/focused.');

export const HOLOGRAM_HANDS = [
  panelFormHand, depthStackHand, scanFieldHand, interferenceHand,
  emissionHand, semanticStateHand, motionEnvelopeHand, svgPreviewHand, htmlDemoHand,
];

export const HOLOGRAPHIC_PANEL_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1', id: 'fx.holographic-panel-reveal', version: '0.1.0',
  stages: [
    { id: 'panel-form', hand: 'fx.hologram.panel-form', params: { width: 820, height: 460, cornerCut: 26 } },
    { id: 'depth-stack', hand: 'fx.hologram.depth-stack', params: { count: 7, spacing: 0.011 } },
    { id: 'scan-field', hand: 'fx.hologram.scan-field', params: { lines: 42, sweepWidth: 0.052 } },
    { id: 'interference', hand: 'fx.hologram.interference-field', params: { bands: 9, sparks: 22 } },
    { id: 'emission', hand: 'fx.hologram.emission-layers', params: { coreOpacity: 0.12, edgeStrength: 0.9, bloom: 0.5, parallax: 0.018 } },
    { id: 'semantic-state', hand: 'fx.hologram.semantic-state', params: {} },
    { id: 'motion-envelope', hand: 'fx.hologram.motion-envelope', params: { revealMs: 1100, settleMs: 520, idleMs: 3600 } },
    { id: 'svg-preview', hand: 'fx.hologram.svg-preview', params: {} },
    { id: 'html-demo', hand: 'fx.hologram.html-demo', params: {} },
  ],
});

export function makeHologramInitialState(seed = 20260915, requestedState = 'stable') {
  return {
    schema: 'axm.effect-work-state/v0.1',
    effect: {
      kind: 'holographic-panel', seed, requestedState,
      tint: '#63f6ff', size: { width: 820, height: 460 },
      controls: { glowScale: 1 },
    },
    geometry: {}, fields: {}, layers: [], motion: {}, realizations: {},
  };
}
