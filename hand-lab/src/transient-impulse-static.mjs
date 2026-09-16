import { deepClone, hashValue } from './hand-runtime.mjs';
import {
  normalizeImpulseEventHand,
  buildImpulseFieldHand,
  impulseEnvelopeHand,
} from './transient-impulse-hands.mjs';

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

function colorTriplet(value, fallback) {
  const source = Array.isArray(value) ? value : fallback;
  return source.slice(0, 3).map((channel) => Math.round(clamp(channel, 0, 1) * 255));
}

function rgbCss(channels) {
  return `rgb(${channels[0]} ${channels[1]} ${channels[2]})`;
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function peakSample(envelope) {
  if (!envelope || !Array.isArray(envelope.samples) || envelope.samples.length === 0) {
    throw new Error('static-svg-realize requires temporal envelope samples');
  }
  let peak = envelope.samples[0];
  for (const sample of envelope.samples.slice(1)) {
    if (sample.intensity > peak.intensity) peak = sample;
  }
  return peak;
}

export const impulseStaticSvgHand = hand('fx.impulse.static-svg-realize', (state) => {
  const next = deepClone(state);
  if (!next.impulseField || !next.impulseEnvelope) {
    throw new Error('static-svg-realize requires impulse field + envelope');
  }

  const event = next.event;
  const field = next.impulseField.geometry;
  const peak = peakSample(next.impulseEnvelope);
  const primary = rgbCss(colorTriplet(next.effect?.tint, [0.25, 0.9, 1]));
  const accent = rgbCss(colorTriplet(next.effect?.accent, [1, 0.55, 0.2]));
  const cx = round6(event.origin[0] * 1000);
  const cy = round6(event.origin[1] * 600);
  const radius = round6(event.radius * 600);
  const expansion = peak.expansion;
  const intensity = peak.intensity;
  const directionDegrees = round6(Math.atan2(event.direction[1], event.direction[0]) * 180 / Math.PI);

  const ringMarkup = field.rings.map((ring) => {
    const rx = round6(radius * ring.radiusScale * expansion);
    const ry = round6(rx * ring.axisRatio);
    const width = round6(Math.max(0.7, 4.2 * ring.widthScale));
    const opacity = round6(clamp(ring.intensity * 0.55 * intensity, 0.04, 0.9));
    return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="${primary}" stroke-width="${width}" opacity="${opacity}" transform="rotate(${directionDegrees} ${cx} ${cy})"/>`;
  }).join('');

  const spokeMarkup = field.spokes.map((spoke) => {
    const start = radius * spoke.startScale * expansion;
    const end = radius * spoke.lengthScale * expansion;
    const x1 = round6(cx + Math.cos(spoke.angle) * start);
    const y1 = round6(cy + Math.sin(spoke.angle) * start);
    const x2 = round6(cx + Math.cos(spoke.angle + spoke.bend) * end);
    const y2 = round6(cy + Math.sin(spoke.angle + spoke.bend) * end);
    const width = round6(Math.max(0.5, 3.4 * spoke.widthScale));
    const opacity = round6(clamp(spoke.intensity * 0.52 * intensity, 0.03, 0.92));
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${accent}" stroke-width="${width}" stroke-linecap="round" opacity="${opacity}"/>`;
  }).join('');

  const fragmentMarkup = field.fragments.map((fragment) => {
    const distance = radius * fragment.radialScale * expansion;
    const tangent = fragment.angle + Math.PI / 2;
    const x = cx + Math.cos(fragment.angle) * distance + Math.cos(tangent) * radius * fragment.tangentScale;
    const y = cy + Math.sin(fragment.angle) * distance + Math.sin(tangent) * radius * fragment.tangentScale;
    const half = radius * fragment.lengthScale * 0.5;
    const x1 = round6(x - Math.cos(fragment.angle) * half);
    const y1 = round6(y - Math.sin(fragment.angle) * half);
    const x2 = round6(x + Math.cos(fragment.angle) * half);
    const y2 = round6(y + Math.sin(fragment.angle) * half);
    const opacity = round6(clamp(fragment.intensity * 0.48 * intensity, 0.02, 0.8));
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${primary}" stroke-width="1.4" stroke-linecap="round" opacity="${opacity}"/>`;
  }).join('');

  const coreRadius = round6(Math.max(4, radius * 0.09 * expansion));
  const coreOpacity = round6(clamp(intensity * 0.9, 0.08, 0.9));
  const title = escapeXml(event.id);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 600" role="img" aria-label="${title}"><rect width="1000" height="600" fill="#03060b"/><defs><filter id="softGlow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><g filter="url(#softGlow)">${ringMarkup}${spokeMarkup}${fragmentMarkup}</g><circle cx="${cx}" cy="${cy}" r="${coreRadius}" fill="${accent}" opacity="${coreOpacity}"/><text x="20" y="575" fill="#9ffcff88" font-family="monospace" font-size="12">AXM // TRANSIENT IMPULSE // STATIC // ${title}</text></svg>`;

  const sourceHash = hashValue({ event: next.event, field: next.impulseField, envelope: next.impulseEnvelope, effect: next.effect });
  next.realizations ??= {};
  next.realizations.transientImpulseStaticSvg = {
    mediaType: 'image/svg+xml',
    renderer: 'axm.vfx.transient-impulse-static-svg/v0.1',
    derivedFromStateHash: sourceHash,
    canonicalEventHash: next.eventCanonicalHash,
    fieldGeometryHash: next.impulseField.geometryHash,
    motion: {
      mode: 'static',
      source: 'temporal-envelope-peak',
      sampleT: peak.t,
      intensity: peak.intensity,
      expansion: peak.expansion,
    },
    content: svg,
  };

  return {
    state: next,
    evidence: {
      renderer: 'axm.vfx.transient-impulse-static-svg/v0.1',
      bytes: Buffer.byteLength(svg),
      canonicalEventHash: next.eventCanonicalHash,
      fieldGeometryHash: next.impulseField.geometryHash,
      motionMode: 'static',
      sampleT: peak.t,
      sampleIntensity: peak.intensity,
      sampleExpansion: peak.expansion,
    },
  };
}, 'Realize the derived transient impulse field as a deterministic motion-free SVG snapshot sampled from the retained envelope peak.');

export const TRANSIENT_IMPULSE_STATIC_HANDS = [
  normalizeImpulseEventHand,
  buildImpulseFieldHand,
  impulseEnvelopeHand,
  impulseStaticSvgHand,
];

export const TRANSIENT_IMPULSE_STATIC_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.transient-impulse-static',
  version: '0.1.0',
  stages: [
    { id: 'normalize-event', hand: 'fx.impulse.event-normalize', params: {} },
    { id: 'build-field', hand: 'fx.impulse.field-build', params: { maxRings: 8, maxSpokes: 18, maxFragments: 42 } },
    { id: 'temporal-envelope', hand: 'fx.impulse.temporal-envelope', params: { samples: 17, attack: 0.12 } },
    { id: 'realize-static-svg', hand: 'fx.impulse.static-svg-realize', params: {} },
  ],
});
