import { deepClone, hashValue } from './hand-runtime.mjs';

const MAX_SAMPLES = 4097;
const EPSILON = 1e-6;
const round6 = (value) => Number(Number(value).toFixed(6));

const FIXED_SEMANTICS = Object.freeze({
  algorithm: 'normalized-propagation-front1d/v0.1',
  spaceDomain: 'normalized-distance',
  phaseDomain: 'normalized-progress',
  phaseMode: 'clamp',
  profile: 'smoothstep3-behind-front',
  outputRange: '[0,1]',
});

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

function clampUnit(value, label) {
  return round6(Math.min(1, Math.max(0, finite(value, label))));
}

function smoothstep3(value) {
  return value * value * (3 - 2 * value);
}

function validateNormalizedSource(source) {
  if (!source || source.schema !== 'axm.propagation-front-source/v0.1') {
    throw new Error('propagation front requires normalized source');
  }
  if (typeof source.id !== 'string' || source.id.length < 1 || source.id.length > 96) {
    throw new Error('propagation front source id is invalid');
  }
  if (source.algorithm !== FIXED_SEMANTICS.algorithm) throw new Error('propagation front source algorithm is invalid');
  if (source.spaceDomain !== FIXED_SEMANTICS.spaceDomain) throw new Error('propagation front source space domain is invalid');
  if (source.phaseDomain !== FIXED_SEMANTICS.phaseDomain) throw new Error('propagation front source phase domain is invalid');
  if (source.phaseMode !== FIXED_SEMANTICS.phaseMode) throw new Error('propagation front source phase mode is invalid');
  if (source.profile !== FIXED_SEMANTICS.profile) throw new Error('propagation front source profile is invalid');
  if (source.outputRange !== FIXED_SEMANTICS.outputRange) throw new Error('propagation front source output range is invalid');
  if (!['forward', 'reverse'].includes(source.direction)) throw new Error('propagation front source direction is invalid');
  bounded(source.frontSoftness, 0, 1, 'propagation front source frontSoftness');
  if (!source.provenance || source.provenance.sourceReuse !== 'none') {
    throw new Error('propagation front source provenance must declare sourceReuse none');
  }
}

function validateSourceState(next) {
  if (!next.propagationFrontSource || !next.propagationFrontSourceHash) {
    throw new Error('propagation front requires normalized source state');
  }
  if (hashValue(next.propagationFrontSource) !== next.propagationFrontSourceHash) {
    throw new Error('propagation front source state hash mismatch');
  }
  validateNormalizedSource(next.propagationFrontSource);
}

function orientedPosition(source, position) {
  const normalized = bounded(position, 0, 1, 'propagation position');
  return source.direction === 'forward' ? normalized : 1 - normalized;
}

export function samplePropagationFrontSource(source, position, phase) {
  validateNormalizedSource(source);
  const progress = clampUnit(phase, 'propagation phase');
  if (progress <= 0) return 0;
  if (progress >= 1) return 1;

  const x = orientedPosition(source, position);
  if (source.frontSoftness === 0) return x <= progress ? 1 : 0;
  const u = Math.min(1, Math.max(0, (progress - x) / source.frontSoftness));
  return round6(smoothstep3(u));
}

function sampleSetHashPayload(sampleSet) {
  return {
    schema: sampleSet.schema,
    sourceHash: sampleSet.sourceHash,
    phase: sampleSet.phase,
    sampleCount: sampleSet.sampleCount,
    samples: sampleSet.samples,
    minWeight: sampleSet.minWeight,
    maxWeight: sampleSet.maxWeight,
    derived: sampleSet.derived,
    rebuildable: sampleSet.rebuildable,
  };
}

export function validatePropagationFrontSampleSet(state, sampleSet) {
  validateSourceState(state);
  if (!sampleSet || sampleSet.schema !== 'axm.propagation-front-samples/v0.1') {
    throw new Error('propagation front sample validation requires derived sample set');
  }
  if (sampleSet.sourceHash !== state.propagationFrontSourceHash) {
    throw new Error('propagation front sample source lineage mismatch');
  }
  if (sampleSet.derived !== true || sampleSet.rebuildable !== true) {
    throw new Error('propagation front samples must remain derived and rebuildable');
  }
  bounded(sampleSet.phase, 0, 1, 'propagation front sample phase');
  boundedInteger(sampleSet.sampleCount, 2, MAX_SAMPLES, 'propagation front sampleCount');
  if (!Array.isArray(sampleSet.samples) || sampleSet.samples.length !== sampleSet.sampleCount) {
    throw new Error('propagation front sample cardinality mismatch');
  }
  if (hashValue(sampleSetHashPayload(sampleSet)) !== sampleSet.sampleSetHash) {
    throw new Error('propagation front sample set hash mismatch');
  }

  let minWeight = Infinity;
  let maxWeight = -Infinity;
  for (let index = 0; index < sampleSet.sampleCount; index += 1) {
    const sample = sampleSet.samples[index];
    if (!sample || sample.index !== index) throw new Error(`propagation front sample ${index} identity mismatch`);
    const rawPosition = index / (sampleSet.sampleCount - 1);
    const expectedPosition = round6(rawPosition);
    const expectedWeight = samplePropagationFrontSource(state.propagationFrontSource, rawPosition, sampleSet.phase);
    if (Math.abs(sample.position - expectedPosition) > EPSILON) {
      throw new Error(`propagation front sample ${index} position mismatch`);
    }
    if (Math.abs(sample.weight - expectedWeight) > EPSILON) {
      throw new Error(`propagation front sample ${index} weight mismatch`);
    }
    minWeight = Math.min(minWeight, expectedWeight);
    maxWeight = Math.max(maxWeight, expectedWeight);
  }
  if (Math.abs(sampleSet.minWeight - round6(minWeight)) > EPSILON || Math.abs(sampleSet.maxWeight - round6(maxWeight)) > EPSILON) {
    throw new Error('propagation front sample extrema mismatch');
  }
  return true;
}

export const normalizePropagationFrontSourceHand = hand('fx.animation.propagation-front1d-source-normalize', (state) => {
  const next = deepClone(state);
  const request = next.propagationFrontRequest;
  if (!request || typeof request !== 'object') throw new Error('propagation front requires propagationFrontRequest state');

  const id = String(request.id ?? 'propagation-front').trim();
  if (!id || id.length > 96) throw new Error('propagationFrontRequest.id must be non-empty and <= 96 characters');
  const direction = request.direction ?? 'forward';
  if (!['forward', 'reverse'].includes(direction)) throw new Error('propagationFrontRequest.direction must be forward or reverse');

  next.propagationFrontSource = {
    schema: 'axm.propagation-front-source/v0.1',
    id,
    ...FIXED_SEMANTICS,
    direction,
    frontSoftness: round6(bounded(request.frontSoftness ?? 0.125, 0, 1, 'propagationFrontRequest.frontSoftness')),
    provenance: {
      origin: 'AXM Visual Effect Fabric hand-lab',
      adjacentDonors: [
        'hand-lab/src/parameter-curve.mjs#fx.animation.parameter-curve1d',
        'hand-lab/src/flicker-cycle1d.mjs#fx.animation.flicker-cycle1d',
      ],
      relationship: 'complementary-spatial-propagation',
      sourceReuse: 'none',
    },
  };
  validateNormalizedSource(next.propagationFrontSource);
  next.propagationFrontSourceHash = hashValue(next.propagationFrontSource);

  return {
    state: next,
    evidence: {
      propagationFrontSourceHash: next.propagationFrontSourceHash,
      direction: next.propagationFrontSource.direction,
      frontSoftness: next.propagationFrontSource.frontSoftness,
      spaceDomain: next.propagationFrontSource.spaceDomain,
      phaseDomain: next.propagationFrontSource.phaseDomain,
      sourceReuse: next.propagationFrontSource.provenance.sourceReuse,
    },
  };
}, 'Normalize a renderer-neutral 1D propagation-front source that maps progress across normalized distance without replacing authored parameter curves or procedural flicker.');

export const buildPropagationFrontSamplesHand = hand('fx.animation.propagation-front1d-samples-build', (state, params = {}) => {
  const next = deepClone(state);
  validateSourceState(next);
  const sampleCount = boundedInteger(params.sampleCount ?? 129, 2, MAX_SAMPLES, 'propagationFront.sampleCount');
  const phase = clampUnit(params.phase ?? 0.5, 'propagationFront.phase');
  const samples = [];
  let minWeight = Infinity;
  let maxWeight = -Infinity;

  for (let index = 0; index < sampleCount; index += 1) {
    const rawPosition = index / (sampleCount - 1);
    const weight = samplePropagationFrontSource(next.propagationFrontSource, rawPosition, phase);
    samples.push({ index, position: round6(rawPosition), weight });
    minWeight = Math.min(minWeight, weight);
    maxWeight = Math.max(maxWeight, weight);
  }

  const sampleSet = {
    schema: 'axm.propagation-front-samples/v0.1',
    sourceHash: next.propagationFrontSourceHash,
    phase,
    sampleCount,
    samples,
    minWeight: round6(minWeight),
    maxWeight: round6(maxWeight),
    derived: true,
    rebuildable: true,
  };
  sampleSet.sampleSetHash = hashValue(sampleSetHashPayload(sampleSet));
  next.propagationFrontSamples ??= {};
  next.propagationFrontSamples[next.propagationFrontSource.id] = sampleSet;

  return {
    state: next,
    evidence: {
      propagationFrontSourceHash: next.propagationFrontSourceHash,
      sampleSetHash: sampleSet.sampleSetHash,
      phase,
      sampleCount,
      minWeight: sampleSet.minWeight,
      maxWeight: sampleSet.maxWeight,
      performanceMeasurement: 'NOT_TESTED',
      visualInspection: 'NOT_TESTED',
    },
  };
}, 'Build a bounded rebuildable 1D propagation mask at a selected derived phase without making sample density, renderer mapping, frame cadence, or consumer meaning canonical.');

export const PROPAGATION_FRONT_HANDS = [
  normalizePropagationFrontSourceHand,
  buildPropagationFrontSamplesHand,
];

export const PROPAGATION_FRONT_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.animation.propagation-front1d',
  version: '0.1.0',
  stages: [
    { id: 'normalize-propagation-front-source', hand: 'fx.animation.propagation-front1d-source-normalize', params: {} },
    { id: 'build-propagation-front-samples', hand: 'fx.animation.propagation-front1d-samples-build', params: { phase: 0.5, sampleCount: 129 } },
  ],
});

export function makePropagationFrontState(options = {}) {
  return {
    schema: 'axm.effect-work-state/v0.1',
    propagationFrontRequest: {
      id: options.id ?? 'propagation-front',
      direction: options.direction ?? 'forward',
      frontSoftness: options.frontSoftness ?? 0.125,
    },
    propagationFrontSamples: {},
  };
}
