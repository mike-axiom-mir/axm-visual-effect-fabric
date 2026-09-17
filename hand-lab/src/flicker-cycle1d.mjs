import { deepClone, hashValue } from './hand-runtime.mjs';

const MAX_UINT32 = 4_294_967_295;
const MAX_SLOTS = 256;
const MAX_SAMPLES = 4097;
const MAX_ABS_VALUE = 1_000_000;
const HASH52_MAX = 4_503_599_627_370_495;
const EPSILON = 1e-6;
const round6 = (value) => Number(Number(value).toFixed(6));

const FIXED_SEMANTICS = Object.freeze({
  algorithm: 'periodic-slot-noise1d/v0.1',
  phaseDomain: 'normalized-cycle',
  wrapMode: 'loop',
  interpolation: 'smoothstep3',
  slotDerivation: 'axm.hashValue-sha256-first52/v0.1',
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

function wrapUnit(value, label) {
  const number = finite(value, label);
  const wrapped = ((number % 1) + 1) % 1;
  const rounded = round6(wrapped);
  return rounded >= 1 ? 0 : rounded;
}

function validateNormalizedSource(source) {
  if (!source || source.schema !== 'axm.flicker-cycle-source/v0.1') {
    throw new Error('flicker cycle requires normalized source');
  }
  if (typeof source.id !== 'string' || source.id.length < 1 || source.id.length > 96) {
    throw new Error('flicker cycle source id is invalid');
  }
  if (source.algorithm !== FIXED_SEMANTICS.algorithm) throw new Error('flicker cycle source algorithm is invalid');
  if (source.phaseDomain !== FIXED_SEMANTICS.phaseDomain) throw new Error('flicker cycle source phase domain is invalid');
  if (source.wrapMode !== FIXED_SEMANTICS.wrapMode) throw new Error('flicker cycle source wrap mode is invalid');
  if (source.interpolation !== FIXED_SEMANTICS.interpolation) throw new Error('flicker cycle source interpolation is invalid');
  if (source.slotDerivation !== FIXED_SEMANTICS.slotDerivation) throw new Error('flicker cycle source slot derivation is invalid');
  boundedInteger(source.seed, 0, MAX_UINT32, 'flicker cycle source seed');
  boundedInteger(source.slotCount, 2, MAX_SLOTS, 'flicker cycle source slotCount');
  const minValue = bounded(source.minValue, -MAX_ABS_VALUE, MAX_ABS_VALUE, 'flicker cycle source minValue');
  const maxValue = bounded(source.maxValue, -MAX_ABS_VALUE, MAX_ABS_VALUE, 'flicker cycle source maxValue');
  if (maxValue < minValue) throw new Error('flicker cycle source maxValue must be >= minValue');
  bounded(source.responsePower, 0.25, 4, 'flicker cycle source responsePower');
  const phaseOffset = bounded(source.phaseOffset, 0, 1, 'flicker cycle source phaseOffset');
  if (phaseOffset >= 1) throw new Error('flicker cycle source phaseOffset must be < 1');
  if (!source.provenance || source.provenance.sourceReuse !== 'none') {
    throw new Error('flicker cycle source provenance must declare sourceReuse none');
  }
}

function validateSourceState(next) {
  if (!next.flickerCycleSource || !next.flickerCycleSourceHash) {
    throw new Error('flicker cycle requires normalized source state');
  }
  if (hashValue(next.flickerCycleSource) !== next.flickerCycleSourceHash) {
    throw new Error('flicker cycle source state hash mismatch');
  }
  validateNormalizedSource(next.flickerCycleSource);
}

function slotUnit(source, slotIndex) {
  const digest = hashValue({
    schema: 'axm.flicker-slot-seed/v0.1',
    seed: source.seed,
    slotIndex,
  });
  return Number.parseInt(digest.slice(0, 13), 16) / HASH52_MAX;
}

function buildSlotValues(source) {
  return Array.from({ length: source.slotCount }, (_, slotIndex) => slotUnit(source, slotIndex));
}

function smoothstep3(value) {
  return value * value * (3 - 2 * value);
}

function sampleWithSlots(source, phase, slots) {
  const wrapped = ((finite(phase, 'flicker phase') + source.phaseOffset) % 1 + 1) % 1;
  const scaled = wrapped * source.slotCount;
  const floor = Math.floor(scaled);
  const slotA = floor % source.slotCount;
  const slotB = (slotA + 1) % source.slotCount;
  const local = scaled - floor;
  const u = smoothstep3(local);
  const noise = slots[slotA] + (slots[slotB] - slots[slotA]) * u;
  const shaped = noise ** source.responsePower;
  return round6(source.minValue + (source.maxValue - source.minValue) * shaped);
}

export function sampleFlickerCycleSource(source, phase) {
  validateNormalizedSource(source);
  const slotAValue = (() => {
    const wrapped = ((finite(phase, 'flicker phase') + source.phaseOffset) % 1 + 1) % 1;
    const scaled = wrapped * source.slotCount;
    const floor = Math.floor(scaled);
    const slotA = floor % source.slotCount;
    const slotB = (slotA + 1) % source.slotCount;
    const local = scaled - floor;
    const u = smoothstep3(local);
    const a = slotUnit(source, slotA);
    const b = slotUnit(source, slotB);
    return a + (b - a) * u;
  })();
  const shaped = slotAValue ** source.responsePower;
  return round6(source.minValue + (source.maxValue - source.minValue) * shaped);
}

function sampleSetHashPayload(sampleSet) {
  return {
    schema: sampleSet.schema,
    sourceHash: sampleSet.sourceHash,
    sampleCount: sampleSet.sampleCount,
    samples: sampleSet.samples,
    minValue: sampleSet.minValue,
    maxValue: sampleSet.maxValue,
    derived: sampleSet.derived,
    rebuildable: sampleSet.rebuildable,
  };
}

export function validateFlickerCycleSampleSet(state, sampleSet) {
  validateSourceState(state);
  if (!sampleSet || sampleSet.schema !== 'axm.flicker-cycle-samples/v0.1') {
    throw new Error('flicker cycle sample validation requires derived sample set');
  }
  if (sampleSet.sourceHash !== state.flickerCycleSourceHash) throw new Error('flicker cycle sample source lineage mismatch');
  if (sampleSet.derived !== true || sampleSet.rebuildable !== true) throw new Error('flicker cycle samples must remain derived and rebuildable');
  boundedInteger(sampleSet.sampleCount, 2, MAX_SAMPLES, 'flicker cycle sampleCount');
  if (!Array.isArray(sampleSet.samples) || sampleSet.samples.length !== sampleSet.sampleCount) {
    throw new Error('flicker cycle sample cardinality mismatch');
  }
  if (hashValue(sampleSetHashPayload(sampleSet)) !== sampleSet.sampleSetHash) {
    throw new Error('flicker cycle sample set hash mismatch');
  }

  const slots = buildSlotValues(state.flickerCycleSource);
  let minValue = Infinity;
  let maxValue = -Infinity;
  for (let index = 0; index < sampleSet.sampleCount; index += 1) {
    const sample = sampleSet.samples[index];
    if (!sample || sample.index !== index) throw new Error(`flicker cycle sample ${index} identity mismatch`);
    const rawPhase = index / (sampleSet.sampleCount - 1);
    const expectedPhase = round6(rawPhase);
    const expectedValue = sampleWithSlots(state.flickerCycleSource, rawPhase, slots);
    if (Math.abs(sample.phase - expectedPhase) > EPSILON) throw new Error(`flicker cycle sample ${index} phase mismatch`);
    if (Math.abs(sample.value - expectedValue) > EPSILON) throw new Error(`flicker cycle sample ${index} value mismatch`);
    minValue = Math.min(minValue, expectedValue);
    maxValue = Math.max(maxValue, expectedValue);
  }
  if (Math.abs(sampleSet.minValue - round6(minValue)) > EPSILON || Math.abs(sampleSet.maxValue - round6(maxValue)) > EPSILON) {
    throw new Error('flicker cycle sample extrema mismatch');
  }
  return true;
}

export const normalizeFlickerCycleSourceHand = hand('fx.animation.flicker-cycle1d-source-normalize', (state) => {
  const next = deepClone(state);
  const request = next.flickerCycleRequest;
  if (!request || typeof request !== 'object') throw new Error('flicker cycle requires flickerCycleRequest state');

  const id = String(request.id ?? 'flicker-cycle').trim();
  if (!id || id.length > 96) throw new Error('flickerCycleRequest.id must be non-empty and <= 96 characters');
  const minValue = round6(bounded(request.minValue ?? 0, -MAX_ABS_VALUE, MAX_ABS_VALUE, 'flickerCycleRequest.minValue'));
  const maxValue = round6(bounded(request.maxValue ?? 1, -MAX_ABS_VALUE, MAX_ABS_VALUE, 'flickerCycleRequest.maxValue'));
  if (maxValue < minValue) throw new Error('flickerCycleRequest.maxValue must be >= minValue');

  next.flickerCycleSource = {
    schema: 'axm.flicker-cycle-source/v0.1',
    id,
    ...FIXED_SEMANTICS,
    seed: boundedInteger(request.seed ?? 1337, 0, MAX_UINT32, 'flickerCycleRequest.seed'),
    slotCount: boundedInteger(request.slotCount ?? 12, 2, MAX_SLOTS, 'flickerCycleRequest.slotCount'),
    minValue,
    maxValue,
    responsePower: round6(bounded(request.responsePower ?? 1, 0.25, 4, 'flickerCycleRequest.responsePower')),
    phaseOffset: wrapUnit(request.phaseOffset ?? 0, 'flickerCycleRequest.phaseOffset'),
    provenance: {
      origin: 'AXM Visual Effect Fabric hand-lab',
      adjacentDonor: 'hand-lab/src/parameter-curve.mjs#fx.animation.parameter-curve1d',
      relationship: 'complementary-procedural-cycle',
      sourceReuse: 'none',
    },
  };
  validateNormalizedSource(next.flickerCycleSource);
  next.flickerCycleSourceHash = hashValue(next.flickerCycleSource);

  return {
    state: next,
    evidence: {
      flickerCycleSourceHash: next.flickerCycleSourceHash,
      seed: next.flickerCycleSource.seed,
      slotCount: next.flickerCycleSource.slotCount,
      phaseDomain: next.flickerCycleSource.phaseDomain,
      wrapMode: next.flickerCycleSource.wrapMode,
      adjacentDonor: next.flickerCycleSource.provenance.adjacentDonor,
      sourceReuse: next.flickerCycleSource.provenance.sourceReuse,
    },
  };
}, 'Normalize a seeded renderer-neutral periodic irregular modulation cycle while retaining authored parameter curves as a complementary donor rather than replacing them.');

export const buildFlickerCycleSamplesHand = hand('fx.animation.flicker-cycle1d-samples-build', (state, params = {}) => {
  const next = deepClone(state);
  validateSourceState(next);
  const sampleCount = boundedInteger(params.sampleCount ?? 129, 2, MAX_SAMPLES, 'flickerCycle.sampleCount');
  const slots = buildSlotValues(next.flickerCycleSource);
  const samples = [];
  let minValue = Infinity;
  let maxValue = -Infinity;

  for (let index = 0; index < sampleCount; index += 1) {
    const rawPhase = index / (sampleCount - 1);
    const value = sampleWithSlots(next.flickerCycleSource, rawPhase, slots);
    samples.push({ index, phase: round6(rawPhase), value });
    minValue = Math.min(minValue, value);
    maxValue = Math.max(maxValue, value);
  }

  const sampleSet = {
    schema: 'axm.flicker-cycle-samples/v0.1',
    sourceHash: next.flickerCycleSourceHash,
    sampleCount,
    samples,
    minValue: round6(minValue),
    maxValue: round6(maxValue),
    derived: true,
    rebuildable: true,
  };
  sampleSet.sampleSetHash = hashValue(sampleSetHashPayload(sampleSet));
  next.flickerCycleSamples ??= {};
  next.flickerCycleSamples[next.flickerCycleSource.id] = sampleSet;

  return {
    state: next,
    evidence: {
      flickerCycleSourceHash: next.flickerCycleSourceHash,
      sampleSetHash: sampleSet.sampleSetHash,
      sampleCount,
      canonicalSlotHashCount: next.flickerCycleSource.slotCount,
      minValue: sampleSet.minValue,
      maxValue: sampleSet.maxValue,
      performanceMeasurement: 'NOT_TESTED',
      visualInspection: 'NOT_TESTED',
    },
  };
}, 'Build a bounded rebuildable sample table from canonical flicker-cycle truth without making sample density, frame timing, or renderer behavior canonical.');

export const FLICKER_CYCLE_HANDS = [
  normalizeFlickerCycleSourceHand,
  buildFlickerCycleSamplesHand,
];

export const FLICKER_CYCLE_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.animation.flicker-cycle1d',
  version: '0.1.0',
  stages: [
    { id: 'normalize-flicker-cycle-source', hand: 'fx.animation.flicker-cycle1d-source-normalize', params: {} },
    { id: 'build-flicker-cycle-samples', hand: 'fx.animation.flicker-cycle1d-samples-build', params: { sampleCount: 129 } },
  ],
});

export function makeFlickerCycleState(options = {}) {
  return {
    schema: 'axm.effect-work-state/v0.1',
    flickerCycleRequest: {
      id: options.id ?? 'flicker-cycle',
      seed: options.seed ?? 1337,
      slotCount: options.slotCount ?? 12,
      minValue: options.minValue ?? 0,
      maxValue: options.maxValue ?? 1,
      responsePower: options.responsePower ?? 1,
      phaseOffset: options.phaseOffset ?? 0,
    },
    flickerCycleSamples: {},
  };
}
