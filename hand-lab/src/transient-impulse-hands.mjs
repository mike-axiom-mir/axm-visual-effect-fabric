import { deepClone, hashValue } from './hand-runtime.mjs';

const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value)));
const round6 = (value) => Number(Number(value).toFixed(6));

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

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be finite`);
  return number;
}

function normalizeDirection(value) {
  if (!Array.isArray(value) || value.length < 2) throw new Error('event.direction must be [x,y]');
  const x = finite(value[0], 'event.direction[0]');
  const y = finite(value[1], 'event.direction[1]');
  const length = Math.hypot(x, y);
  if (length < 1e-8) return [0, -1];
  return [round6(x / length), round6(y / length)];
}

function normalizeOrigin(value) {
  if (!Array.isArray(value) || value.length < 2) throw new Error('event.origin must be [x,y]');
  const x = finite(value[0], 'event.origin[0]');
  const y = finite(value[1], 'event.origin[1]');
  if (x < 0 || x > 1 || y < 0 || y > 1) throw new Error('event.origin must stay inside normalized [0,1] bounds');
  return [round6(x), round6(y)];
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export const normalizeImpulseEventHand = hand('fx.impulse.event-normalize', (state) => {
  const next = deepClone(state);
  if (!next.event || typeof next.event !== 'object') throw new Error('transient impulse requires event state');

  const controls = next.event.controls ?? {};
  next.event = {
    schema: 'axm.transient-impulse-event/v0.1',
    id: String(next.event.id ?? 'transient-impulse'),
    kind: 'transient-impulse',
    seed: Math.trunc(finite(next.event.seed ?? 1, 'event.seed')) >>> 0,
    origin: normalizeOrigin(next.event.origin ?? [0.5, 0.5]),
    direction: normalizeDirection(next.event.direction ?? [0, -1]),
    energy: round6(clamp(finite(next.event.energy ?? 1, 'event.energy'), 0.05, 2)),
    radius: round6(clamp(finite(next.event.radius ?? 0.24, 'event.radius'), 0.02, 0.9)),
    duration: round6(clamp(finite(next.event.duration ?? 0.7, 'event.duration'), 0.08, 5)),
    controls: {
      symmetry: round6(clamp(finite(controls.symmetry ?? 0.4, 'event.controls.symmetry'), 0, 1)),
      directionality: round6(clamp(finite(controls.directionality ?? 0.7, 'event.controls.directionality'), 0, 1)),
      fragmentation: round6(clamp(finite(controls.fragmentation ?? 0.45, 'event.controls.fragmentation'), 0, 1)),
      ringWeight: round6(clamp(finite(controls.ringWeight ?? 0.8, 'event.controls.ringWeight'), 0, 1.5)),
      spokeWeight: round6(clamp(finite(controls.spokeWeight ?? 0.9, 'event.controls.spokeWeight'), 0, 1.5)),
    },
  };
  next.eventCanonicalHash = hashValue(next.event);
  return {
    state: next,
    evidence: {
      canonicalEventHash: next.eventCanonicalHash,
      duration: next.event.duration,
      radius: next.event.radius,
    },
  };
}, 'Normalize a bounded consumer-neutral transient event without introducing renderer state.');

export const buildImpulseFieldHand = hand('fx.impulse.field-build', (state, params) => {
  const next = deepClone(state);
  if (!next.event || !next.eventCanonicalHash) throw new Error('field-build requires a normalized transient event');

  const event = next.event;
  const controls = event.controls;
  const random = mulberry32(event.seed ^ 0x49A1C7E5);
  const directionAngle = Math.atan2(event.direction[1], event.direction[0]);
  const ringCount = Math.max(1, Math.min(Number(params.maxRings ?? 8), Math.round(2 + event.energy * 1.5 + controls.symmetry * 3)));
  const spokeCount = Math.max(0, Math.min(Number(params.maxSpokes ?? 18), Math.round((2 + controls.directionality * 10 + event.energy * 2) * controls.spokeWeight)));
  const fragmentCount = Math.max(0, Math.min(Number(params.maxFragments ?? 42), Math.round(controls.fragmentation * (16 + event.energy * 18))));

  const rings = [];
  for (let index = 0; index < ringCount; index += 1) {
    const t = (index + 1) / ringCount;
    rings.push({
      id: `ring-${index + 1}`,
      radiusScale: round6(0.28 + t * 0.72),
      widthScale: round6((0.9 - t * 0.42) * controls.ringWeight),
      intensity: round6(Math.max(0.08, (1 - t * 0.58) * event.energy * controls.ringWeight)),
      phase: round6(index / Math.max(1, ringCount)),
      axisRatio: round6(0.72 + controls.symmetry * 0.28),
      rotation: round6(directionAngle),
    });
  }

  const spokes = [];
  for (let index = 0; index < spokeCount; index += 1) {
    const fullCircleAngle = random() * TAU;
    const directedOffset = (random() * 2 - 1) * (0.22 + controls.symmetry * Math.PI * 0.8);
    const angle = controls.symmetry * fullCircleAngle + (1 - controls.symmetry) * (directionAngle + directedOffset);
    spokes.push({
      id: `spoke-${index + 1}`,
      angle: round6(angle),
      startScale: round6(0.05 + random() * 0.12),
      lengthScale: round6(0.42 + random() * 0.58),
      widthScale: round6((0.45 + random() * 0.85) * controls.spokeWeight),
      intensity: round6((0.35 + random() * 0.65) * event.energy * controls.spokeWeight),
      bend: round6((random() * 2 - 1) * 0.16 * controls.fragmentation),
      phase: round6(random()),
    });
  }

  const fragments = [];
  for (let index = 0; index < fragmentCount; index += 1) {
    const fullCircleAngle = random() * TAU;
    const directedOffset = (random() * 2 - 1) * (0.45 + controls.symmetry * Math.PI);
    const angle = controls.symmetry * fullCircleAngle + (1 - controls.symmetry) * (directionAngle + directedOffset);
    fragments.push({
      id: `fragment-${index + 1}`,
      angle: round6(angle),
      radialScale: round6(0.2 + random() * 0.72),
      lengthScale: round6(0.025 + random() * 0.08),
      tangentScale: round6((random() * 2 - 1) * 0.07),
      intensity: round6((0.22 + random() * 0.68) * event.energy),
      phase: round6(random()),
    });
  }

  const geometry = { rings, spokes, fragments };
  next.impulseField = {
    schema: 'axm.transient-impulse-field/v0.1',
    canonicalEventHash: next.eventCanonicalHash,
    geometry,
    geometryHash: hashValue(geometry),
    counts: { rings: rings.length, spokes: spokes.length, fragments: fragments.length },
    derived: true,
    rebuildable: true,
  };

  return {
    state: next,
    evidence: {
      canonicalEventHash: next.eventCanonicalHash,
      fieldGeometryHash: next.impulseField.geometryHash,
      counts: next.impulseField.counts,
    },
  };
}, 'Build bounded renderer-neutral rings, spokes and fragments from a canonical transient event.');

export const impulseEnvelopeHand = hand('fx.impulse.temporal-envelope', (state, params) => {
  const next = deepClone(state);
  if (!next.impulseField) throw new Error('temporal-envelope requires an impulse field');

  const sampleCount = Math.max(5, Math.min(33, Math.round(Number(params.samples ?? 17))));
  const attack = clamp(Number(params.attack ?? 0.12), 0.02, 0.45);
  const samples = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const t = index / (sampleCount - 1);
    const rise = Math.min(1, t / attack);
    const decayT = Math.max(0, (t - attack) / Math.max(1e-6, 1 - attack));
    const intensity = t <= attack ? rise * rise : Math.pow(1 - decayT, 2.2);
    const expansion = 0.08 + 0.92 * (1 - Math.pow(1 - t, 1.7));
    samples.push({ t: round6(t), intensity: round6(intensity), expansion: round6(expansion) });
  }

  next.impulseEnvelope = {
    schema: 'axm.transient-envelope/v0.1',
    duration: next.event.duration,
    attack: round6(attack),
    samples,
    fieldGeometryHash: next.impulseField.geometryHash,
    derived: true,
  };

  return {
    state: next,
    evidence: {
      duration: next.event.duration,
      samples: sampleCount,
      envelopeHash: hashValue(next.impulseEnvelope),
    },
  };
}, 'Attach a deterministic one-shot attack/decay and expansion envelope to the derived impulse field.');

function colorTriplet(value, fallback) {
  const source = Array.isArray(value) ? value : fallback;
  return source.slice(0, 3).map((channel) => Math.round(clamp(channel, 0, 1) * 255));
}

function rgbCss(channels) {
  return `rgb(${channels[0]} ${channels[1]} ${channels[2]})`;
}

export const impulseSvgHand = hand('fx.impulse.svg-realize', (state) => {
  const next = deepClone(state);
  if (!next.impulseField || !next.impulseEnvelope) throw new Error('svg-realize requires impulse field + envelope');

  const event = next.event;
  const field = next.impulseField.geometry;
  const primary = rgbCss(colorTriplet(next.effect?.tint, [0.25, 0.9, 1]));
  const accent = rgbCss(colorTriplet(next.effect?.accent, [1, 0.55, 0.2]));
  const cx = round6(event.origin[0] * 1000);
  const cy = round6(event.origin[1] * 600);
  const radius = round6(event.radius * 600);
  const duration = round6(event.duration);
  const directionDegrees = round6(Math.atan2(event.direction[1], event.direction[0]) * 180 / Math.PI);

  const ringMarkup = field.rings.map((ring) => {
    const rx = round6(radius * ring.radiusScale);
    const ry = round6(rx * ring.axisRatio);
    const width = round6(Math.max(0.7, 4.2 * ring.widthScale));
    const opacity = round6(clamp(ring.intensity * 0.55, 0.08, 0.9));
    return `<ellipse cx="${cx}" cy="${cy}" rx="${round6(rx * 0.12)}" ry="${round6(ry * 0.12)}" fill="none" stroke="${primary}" stroke-width="${width}" opacity="0" transform="rotate(${directionDegrees} ${cx} ${cy})"><animate attributeName="rx" values="${round6(rx * 0.12)};${rx}" dur="${duration}s" begin="${round6(ring.phase * duration * 0.16)}s" fill="freeze"/><animate attributeName="ry" values="${round6(ry * 0.12)};${ry}" dur="${duration}s" begin="${round6(ring.phase * duration * 0.16)}s" fill="freeze"/><animate attributeName="opacity" values="0;${opacity};0" keyTimes="0;.18;1" dur="${duration}s" begin="${round6(ring.phase * duration * 0.16)}s" fill="freeze"/></ellipse>`;
  }).join('');

  const spokeMarkup = field.spokes.map((spoke) => {
    const start = radius * spoke.startScale;
    const end = radius * spoke.lengthScale;
    const x1 = round6(cx + Math.cos(spoke.angle) * start);
    const y1 = round6(cy + Math.sin(spoke.angle) * start);
    const x2 = round6(cx + Math.cos(spoke.angle + spoke.bend) * end);
    const y2 = round6(cy + Math.sin(spoke.angle + spoke.bend) * end);
    const width = round6(Math.max(0.5, 3.4 * spoke.widthScale));
    const opacity = round6(clamp(spoke.intensity * 0.52, 0.06, 0.92));
    const begin = round6(spoke.phase * duration * 0.12);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${accent}" stroke-width="${width}" stroke-linecap="round" opacity="0"><animate attributeName="opacity" values="0;${opacity};0" keyTimes="0;.15;1" dur="${duration}s" begin="${begin}s" fill="freeze"/></line>`;
  }).join('');

  const fragmentMarkup = field.fragments.map((fragment) => {
    const distance = radius * fragment.radialScale;
    const tangent = fragment.angle + Math.PI / 2;
    const x = cx + Math.cos(fragment.angle) * distance + Math.cos(tangent) * radius * fragment.tangentScale;
    const y = cy + Math.sin(fragment.angle) * distance + Math.sin(tangent) * radius * fragment.tangentScale;
    const half = radius * fragment.lengthScale * 0.5;
    const x1 = round6(x - Math.cos(fragment.angle) * half);
    const y1 = round6(y - Math.sin(fragment.angle) * half);
    const x2 = round6(x + Math.cos(fragment.angle) * half);
    const y2 = round6(y + Math.sin(fragment.angle) * half);
    const opacity = round6(clamp(fragment.intensity * 0.48, 0.04, 0.8));
    const begin = round6(fragment.phase * duration * 0.2);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${primary}" stroke-width="1.4" stroke-linecap="round" opacity="0"><animate attributeName="opacity" values="0;${opacity};0" keyTimes="0;.12;1" dur="${round6(duration * 0.72)}s" begin="${begin}s" fill="freeze"/></line>`;
  }).join('');

  const title = escapeXml(event.id);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 600" role="img" aria-label="${title}"><rect width="1000" height="600" fill="#03060b"/><defs><filter id="softGlow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><g filter="url(#softGlow)">${ringMarkup}${spokeMarkup}${fragmentMarkup}</g><circle cx="${cx}" cy="${cy}" r="4" fill="${accent}" opacity="0"><animate attributeName="r" values="4;${round6(Math.max(8, radius * 0.09))};4" dur="${duration}s" fill="freeze"/><animate attributeName="opacity" values="0;.9;0" keyTimes="0;.1;1" dur="${duration}s" fill="freeze"/></circle><text x="20" y="575" fill="#9ffcff88" font-family="monospace" font-size="12">AXM // TRANSIENT IMPULSE // ${title}</text></svg>`;

  const sourceHash = hashValue({ event: next.event, field: next.impulseField, envelope: next.impulseEnvelope, effect: next.effect });
  next.realizations ??= {};
  next.realizations.transientImpulseSvg = {
    mediaType: 'image/svg+xml',
    renderer: 'axm.vfx.transient-impulse-svg/v0.1',
    derivedFromStateHash: sourceHash,
    canonicalEventHash: next.eventCanonicalHash,
    fieldGeometryHash: next.impulseField.geometryHash,
    oneShotDuration: event.duration,
    content: svg,
  };

  return {
    state: next,
    evidence: {
      renderer: 'axm.vfx.transient-impulse-svg/v0.1',
      bytes: Buffer.byteLength(svg),
      canonicalEventHash: next.eventCanonicalHash,
      fieldGeometryHash: next.impulseField.geometryHash,
    },
  };
}, 'Realize the derived impulse field as a disposable one-shot animated SVG preview.');

export const TRANSIENT_IMPULSE_HANDS = [
  normalizeImpulseEventHand,
  buildImpulseFieldHand,
  impulseEnvelopeHand,
  impulseSvgHand,
];

export const TRANSIENT_IMPULSE_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.transient-impulse',
  version: '0.1.0',
  stages: [
    { id: 'normalize-event', hand: 'fx.impulse.event-normalize', params: {} },
    { id: 'build-field', hand: 'fx.impulse.field-build', params: { maxRings: 8, maxSpokes: 18, maxFragments: 42 } },
    { id: 'temporal-envelope', hand: 'fx.impulse.temporal-envelope', params: { samples: 17, attack: 0.12 } },
    { id: 'realize-svg', hand: 'fx.impulse.svg-realize', params: {} },
  ],
});

export function makeTransientImpulseState(options = {}) {
  const controls = options.controls ?? {};
  return {
    schema: 'axm.effect-work-state/v0.1',
    effect: {
      kind: 'transient-impulse',
      tint: options.tint ?? [0.18, 0.9, 1],
      accent: options.accent ?? [1, 0.52, 0.18],
    },
    event: {
      id: options.id ?? 'transient-impulse',
      seed: options.seed ?? 1337,
      origin: options.origin ?? [0.5, 0.5],
      direction: options.direction ?? [1, 0],
      energy: options.energy ?? 1,
      radius: options.radius ?? 0.26,
      duration: options.duration ?? 0.72,
      controls: {
        symmetry: controls.symmetry ?? 0.38,
        directionality: controls.directionality ?? 0.78,
        fragmentation: controls.fragmentation ?? 0.5,
        ringWeight: controls.ringWeight ?? 0.82,
        spokeWeight: controls.spokeWeight ?? 0.92,
      },
    },
    realizations: {},
  };
}
