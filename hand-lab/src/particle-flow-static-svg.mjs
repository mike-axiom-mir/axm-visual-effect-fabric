import { deepClone, hashValue } from './hand-runtime.mjs';
import {
  buildFlowAdvectedParticleSetHand,
  makeParticleFlowAdvectionState,
  normalizeParticleFlowAdvectionHand,
} from './particle-flow-advection.mjs';

const round3 = (value) => Number(Number(value).toFixed(3));

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

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be finite`);
  return number;
}

function bounded(value, min, max, label) {
  const number = finite(value, label);
  if (number < min || number > max) throw new Error(`${label} must be within [${min},${max}]`);
  return number;
}

function boundedInteger(value, min, max, label) {
  const number = finite(value, label);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(`${label} must be an integer within [${min},${max}]`);
  }
  return number;
}

function escapeAttribute(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function hashParticleSetPayload(particleSet) {
  const payload = deepClone(particleSet);
  delete payload.particleSetHash;
  return hashValue(payload);
}

function assertNormalizedPoint(point, label) {
  if (!point || typeof point !== 'object') throw new Error(`${label} must be an object`);
  const x = finite(point.x, `${label}.x`);
  const y = finite(point.y, `${label}.y`);
  if (x < 0 || x > 1 || y < 0 || y > 1) {
    throw new Error(`${label} must remain inside normalized [0,1] bounds`);
  }
}

function requireExactLineage(next, selected) {
  if (hashValue(next.particles) !== next.particleSourceHash) {
    throw new Error('particle-flow SVG base particle hash mismatch');
  }
  if (hashValue(next.fieldSource) !== next.fieldSourceHash) {
    throw new Error('particle-flow SVG scalar source hash mismatch');
  }
  if (hashValue(next.flowSource) !== next.flowSourceHash) {
    throw new Error('particle-flow SVG vector source hash mismatch');
  }
  if (hashValue(next.particleFlowSource) !== next.particleFlowSourceHash) {
    throw new Error('particle-flow SVG advection source hash mismatch');
  }
  if (hashParticleSetPayload(selected) !== selected.particleSetHash) {
    throw new Error('particle-flow SVG selected particle set hash mismatch');
  }
  if (selected.particleSourceHash !== next.particleSourceHash) {
    throw new Error('particle-flow SVG particle lineage mismatch');
  }
  if (selected.scalarSourceHash !== next.fieldSourceHash) {
    throw new Error('particle-flow SVG scalar lineage mismatch');
  }
  if (selected.flowSourceHash !== next.flowSourceHash) {
    throw new Error('particle-flow SVG vector lineage mismatch');
  }
  if (selected.advectionSourceHash !== next.particleFlowSourceHash) {
    throw new Error('particle-flow SVG advection lineage mismatch');
  }
  if (!Array.isArray(selected.particles) || selected.particles.length !== selected.particleCount) {
    throw new Error('particle-flow SVG selected particle cardinality mismatch');
  }
  if (!Array.isArray(selected.trajectories) || selected.trajectories.length !== selected.particleCount) {
    throw new Error('particle-flow SVG trajectory cardinality mismatch');
  }

  let liveSampleCount = 0;
  for (let index = 0; index < selected.particleCount; index += 1) {
    const particle = selected.particles[index];
    const trajectory = selected.trajectories[index];
    if (!particle || !trajectory || String(particle.id) !== String(trajectory.id)) {
      throw new Error(`particle-flow SVG trajectory identity mismatch at index ${index}`);
    }
    assertNormalizedPoint(particle, `selected particle ${particle.id}`);
    if (!Array.isArray(trajectory.points) || trajectory.points.length === 0) {
      throw new Error(`particle-flow SVG trajectory ${trajectory.id} must contain points`);
    }
    trajectory.points.forEach((point, pointIndex) => {
      assertNormalizedPoint(point, `trajectory ${trajectory.id} point ${pointIndex}`);
    });
    const last = trajectory.points.at(-1);
    if (Number(last.x) !== Number(particle.x) || Number(last.y) !== Number(particle.y)) {
      throw new Error(`particle-flow SVG trajectory ${trajectory.id} final point mismatch`);
    }
    liveSampleCount += trajectory.points.length;
  }
  if (liveSampleCount !== selected.sampleCount) {
    throw new Error('particle-flow SVG selected sample cardinality mismatch');
  }
}

function project(point, width, height, padding) {
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  return {
    x: round3(padding + Number(point.x) * innerWidth),
    y: round3(padding + Number(point.y) * innerHeight),
  };
}

function svgNumber(value) {
  return Number(value).toFixed(3).replace(/\.000$/, '');
}

function trajectoryPolyline(trajectory, width, height, padding) {
  const points = trajectory.points
    .map((point) => {
      const p = project(point, width, height, padding);
      return `${svgNumber(p.x)},${svgNumber(p.y)}`;
    })
    .join(' ');
  return `<polyline data-particle-id="${escapeAttribute(trajectory.id)}" points="${points}" fill="none" stroke="#69d7ff" stroke-opacity="0.55" stroke-width="1.25" vector-effect="non-scaling-stroke"/>`;
}

function marker(point, kind, width, height, padding, radius) {
  const p = project(point, width, height, padding);
  const stroke = kind === 'start' ? '#9aa7b2' : '#e9fbff';
  const fill = kind === 'start' ? 'none' : '#69d7ff';
  const opacity = kind === 'start' ? '0.72' : '0.92';
  return `<circle data-particle-id="${escapeAttribute(point.id)}" data-marker="${kind}" cx="${svgNumber(p.x)}" cy="${svgNumber(p.y)}" r="${svgNumber(radius)}" fill="${fill}" stroke="${stroke}" stroke-opacity="${opacity}" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
}

export const particleFlowStaticSvgHand = hand('fx.particle.flow-static-svg-realize', (state, params = {}) => {
  const next = deepClone(state);
  if (!next.particleSourceHash || !next.fieldSourceHash || !next.flowSourceHash || !next.particleFlowSourceHash) {
    throw new Error('particle-flow-static-svg-realize requires normalized particle-flow source lineage');
  }
  const selectionId = next.particleFlowSource?.id;
  if (!selectionId) throw new Error('particle-flow-static-svg-realize requires particle flow source id');
  const selected = next.flowAdvectedParticleSets?.[selectionId];
  if (!selected) {
    throw new Error(`particle-flow-static-svg-realize requires flow-advected particle set ${selectionId}`);
  }
  requireExactLineage(next, selected);

  const width = boundedInteger(params.width ?? 640, 64, 4096, 'particleFlowSvg.width');
  const height = boundedInteger(params.height ?? 420, 64, 4096, 'particleFlowSvg.height');
  const padding = bounded(params.padding ?? 20, 0, 512, 'particleFlowSvg.padding');
  if (padding * 2 >= Math.min(width, height)) {
    throw new Error('particleFlowSvg.padding must leave a positive drawable area');
  }
  const markerRadius = bounded(params.markerRadius ?? 2.4, 0.25, 16, 'particleFlowSvg.markerRadius');
  const maxParticles = boundedInteger(params.maxParticles ?? 2048, 1, 4096, 'particleFlowSvg.maxParticles');
  const maxSamples = boundedInteger(params.maxSamples ?? 65536, 2, 262144, 'particleFlowSvg.maxSamples');
  if (selected.particleCount > maxParticles) {
    throw new Error(`particleFlowSvg particle budget exceeded: ${selected.particleCount} > ${maxParticles}`);
  }
  if (selected.sampleCount > maxSamples) {
    throw new Error(`particleFlowSvg sample budget exceeded: ${selected.sampleCount} > ${maxSamples}`);
  }

  const trajectoryMarkup = selected.trajectories
    .map((trajectory) => trajectoryPolyline(trajectory, width, height, padding))
    .join('');
  const startMarkup = selected.trajectories
    .map((trajectory) => marker({ ...trajectory.points[0], id: trajectory.id }, 'start', width, height, padding, markerRadius * 0.75))
    .join('');
  const endMarkup = selected.particles
    .map((particle) => marker(particle, 'end', width, height, padding, markerRadius))
    .join('');

  const content = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" data-renderer="axm.vfx.particle-flow-static-svg/v0.1" data-particle-set-hash="${escapeAttribute(selected.particleSetHash)}"><title>AXM derived particle-flow inspection</title><rect width="100%" height="100%" fill="#071018"/><g data-layer="trajectories">${trajectoryMarkup}</g><g data-layer="starts">${startMarkup}</g><g data-layer="ends">${endMarkup}</g></svg>`;

  const realization = {
    mediaType: 'image/svg+xml',
    renderer: 'axm.vfx.particle-flow-static-svg/v0.1',
    derivedFromParticleSetHash: selected.particleSetHash,
    particleSourceHash: next.particleSourceHash,
    scalarSourceHash: next.fieldSourceHash,
    flowSourceHash: next.flowSourceHash,
    advectionSourceHash: next.particleFlowSourceHash,
    particleCount: selected.particleCount,
    sampleCount: selected.sampleCount,
    width,
    height,
    padding,
    markerRadius,
    content,
  };

  next.realizations ??= {};
  next.realizations.particleFlowStaticSvg = realization;

  return {
    state: next,
    evidence: {
      renderer: realization.renderer,
      bytes: Buffer.byteLength(content),
      derivedFromParticleSetHash: realization.derivedFromParticleSetHash,
      particleSourceHash: realization.particleSourceHash,
      scalarSourceHash: realization.scalarSourceHash,
      flowSourceHash: realization.flowSourceHash,
      advectionSourceHash: realization.advectionSourceHash,
      particleCount: realization.particleCount,
      sampleCount: realization.sampleCount,
      width,
      height,
      maxParticles,
      maxSamples,
      visualInspection: 'NOT_TESTED',
      performanceMeasurement: 'NOT_TESTED',
    },
  };
}, 'Render a bounded deterministic SVG inspection view of a separately retained flow-advected particle set without rewriting canonical particle seeds or claiming aesthetic quality.');

export const PARTICLE_FLOW_STATIC_SVG_HANDS = [
  normalizeParticleFlowAdvectionHand,
  buildFlowAdvectedParticleSetHand,
  particleFlowStaticSvgHand,
];

export const PARTICLE_FLOW_STATIC_SVG_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.particle.flow-advected-static-svg',
  version: '0.1.0',
  stages: [
    { id: 'normalize-particle-flow-source', hand: 'fx.particle.flow-advection-source-normalize', params: {} },
    { id: 'build-flow-advected-particles', hand: 'fx.particle.flow-advection-build', params: { maxParticles: 2048, maxSamples: 65536 } },
    { id: 'realize-particle-flow-static-svg', hand: 'fx.particle.flow-static-svg-realize', params: { width: 640, height: 420, padding: 20, markerRadius: 2.4, maxParticles: 2048, maxSamples: 65536 } },
  ],
});

export function makeParticleFlowStaticSvgState(particles, options = {}) {
  return makeParticleFlowAdvectionState(particles, options);
}
