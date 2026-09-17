import { deepClone, hashValue } from './hand-runtime.mjs';
import {
  branchPathHand,
  energyHand,
  makeElectricInitialState,
  seedPathHand,
} from './electric-hands.mjs';
import {
  makeFlickerCycleState,
  normalizeFlickerCycleSourceHand,
  sampleFlickerCycleSource,
} from './flicker-cycle1d.mjs';

const MAX_PATHS = 64;
const MAX_POINTS = 4096;
const EPSILON = 1e-6;
const round6 = (value) => Number(Number(value).toFixed(6));

const FIXED_SEMANTICS = Object.freeze({
  mode: 'path-energy',
  mapping: 'normalize-flicker-source-range',
  constantRange: 'unity-no-op',
  phaseDomain: 'derived-normalized-cycle',
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

function wrapPhase(value) {
  const number = finite(value, 'electric flicker phase');
  const wrapped = ((number % 1) + 1) % 1;
  const rounded = round6(wrapped);
  return rounded >= 1 ? 0 : rounded;
}

function validatePathBudget(paths) {
  if (!Array.isArray(paths) || paths.length === 0) {
    throw new Error('electric flicker modulation requires non-empty profiled electric paths');
  }
  if (paths.length > MAX_PATHS) {
    throw new Error(`electric flicker pathCount exceeds structural ceiling ${MAX_PATHS}`);
  }
  let pointCount = 0;
  const ids = new Set();
  for (const [pathIndex, path] of paths.entries()) {
    if (!path || typeof path !== 'object') throw new Error(`electric path ${pathIndex} must be an object`);
    const id = String(path.id ?? '');
    if (!id || ids.has(id)) throw new Error(`electric path ${pathIndex} must have a unique non-empty id`);
    ids.add(id);
    if (!Array.isArray(path.points) || path.points.length < 2) {
      throw new Error(`electric path ${id} requires at least two points`);
    }
    pointCount += path.points.length;
    if (pointCount > MAX_POINTS) {
      throw new Error(`electric flicker pointCount exceeds structural ceiling ${MAX_POINTS}`);
    }
    finite(path.energy, `electric path ${id}.energy`);
    for (const [pointIndex, point] of path.points.entries()) {
      bounded(point?.x, 0, 1, `electric path ${id}.points[${pointIndex}].x`);
      bounded(point?.y, 0, 1, `electric path ${id}.points[${pointIndex}].y`);
    }
  }
  return { pathCount: paths.length, pointCount };
}

function validateFlickerTruth(next) {
  if (!next.flickerCycleSource || !next.flickerCycleSourceHash) {
    throw new Error('electric flicker modulation requires normalized flicker cycle source');
  }
  if (hashValue(next.flickerCycleSource) !== next.flickerCycleSourceHash) {
    throw new Error('flicker cycle source state hash mismatch');
  }
  // The donor sampler independently validates its fixed algorithm/wrap/interpolation semantics.
  sampleFlickerCycleSource(next.flickerCycleSource, 0);
}

function validateModulationSource(source) {
  if (!source || source.schema !== 'axm.electric-flicker-modulation-source/v0.1') {
    throw new Error('electric flicker modulation requires normalized modulation source');
  }
  if (typeof source.id !== 'string' || source.id.length < 1 || source.id.length > 96) {
    throw new Error('electric flicker modulation source id is invalid');
  }
  if (source.mode !== FIXED_SEMANTICS.mode) throw new Error('electric flicker modulation mode is invalid');
  if (source.mapping !== FIXED_SEMANTICS.mapping) throw new Error('electric flicker modulation mapping is invalid');
  if (source.constantRange !== FIXED_SEMANTICS.constantRange) throw new Error('electric flicker constant-range semantics are invalid');
  if (source.phaseDomain !== FIXED_SEMANTICS.phaseDomain) throw new Error('electric flicker phase-domain semantics are invalid');
  bounded(source.strength, 0, 1, 'electric flicker modulation source strength');
  bounded(source.floor, 0, 1, 'electric flicker modulation source floor');
  if (!source.provenance || source.provenance.externalSourceReuse !== 'none') {
    throw new Error('electric flicker modulation provenance must declare externalSourceReuse none');
  }
}

function validateSourceState(next) {
  const budget = validatePathBudget(next.paths);
  if (!next.electricBasePathsHash || hashValue(next.paths) !== next.electricBasePathsHash) {
    throw new Error('electric flicker base path hash mismatch');
  }
  validateFlickerTruth(next);
  if (!next.electricFlickerModulationSource || !next.electricFlickerModulationSourceHash) {
    throw new Error('electric flicker modulation requires normalized modulation source');
  }
  if (hashValue(next.electricFlickerModulationSource) !== next.electricFlickerModulationSourceHash) {
    throw new Error('electric flicker modulation source hash mismatch');
  }
  validateModulationSource(next.electricFlickerModulationSource);
  return budget;
}

function normalizedFlickerValue(source, value) {
  if (Math.abs(source.maxValue - source.minValue) <= EPSILON) return 1;
  return round6(Math.max(0, Math.min(1, (value - source.minValue) / (source.maxValue - source.minValue))));
}

function modulationFactor(unitValue, source) {
  const shaped = source.floor + (1 - source.floor) * unitValue;
  return round6((1 - source.strength) + source.strength * shaped);
}

function modulatedSetHashPayload(set) {
  return {
    schema: set.schema,
    basePathsHash: set.basePathsHash,
    flickerCycleSourceHash: set.flickerCycleSourceHash,
    electricFlickerModulationSourceHash: set.electricFlickerModulationSourceHash,
    phase: set.phase,
    sampleValue: set.sampleValue,
    normalizedSample: set.normalizedSample,
    factor: set.factor,
    paths: set.paths,
    pathSetHash: set.pathSetHash,
    pathCount: set.pathCount,
    pointCount: set.pointCount,
    derived: set.derived,
    rebuildable: set.rebuildable,
  };
}

function buildExpectedSet(next, phase) {
  const budget = validateSourceState(next);
  const normalizedPhase = wrapPhase(phase);
  const sampleValue = sampleFlickerCycleSource(next.flickerCycleSource, normalizedPhase);
  const normalizedSample = normalizedFlickerValue(next.flickerCycleSource, sampleValue);
  const factor = modulationFactor(normalizedSample, next.electricFlickerModulationSource);
  const paths = next.paths.map((path) => ({
    ...deepClone(path),
    energy: round6(finite(path.energy, `electric path ${path.id}.energy`) * factor),
  }));

  const set = {
    schema: 'axm.electric-flicker-modulated-path-set/v0.1',
    basePathsHash: next.electricBasePathsHash,
    flickerCycleSourceHash: next.flickerCycleSourceHash,
    electricFlickerModulationSourceHash: next.electricFlickerModulationSourceHash,
    phase: normalizedPhase,
    sampleValue,
    normalizedSample,
    factor,
    paths,
    pathSetHash: hashValue(paths),
    pathCount: budget.pathCount,
    pointCount: budget.pointCount,
    derived: true,
    rebuildable: true,
  };
  set.modulatedSetHash = hashValue(modulatedSetHashPayload(set));
  return set;
}

export function validateElectricFlickerModulatedPathSet(state, selected) {
  validateSourceState(state);
  if (!selected || selected.schema !== 'axm.electric-flicker-modulated-path-set/v0.1') {
    throw new Error('electric flicker validation requires derived modulated path set');
  }
  if (selected.derived !== true || selected.rebuildable !== true) {
    throw new Error('electric flicker modulated path set must remain derived and rebuildable');
  }
  if (selected.basePathsHash !== state.electricBasePathsHash) throw new Error('electric flicker base path lineage mismatch');
  if (selected.flickerCycleSourceHash !== state.flickerCycleSourceHash) throw new Error('electric flicker cycle lineage mismatch');
  if (selected.electricFlickerModulationSourceHash !== state.electricFlickerModulationSourceHash) {
    throw new Error('electric flicker modulation lineage mismatch');
  }
  if (hashValue(selected.paths) !== selected.pathSetHash) throw new Error('electric flicker derived path set hash mismatch');
  if (hashValue(modulatedSetHashPayload(selected)) !== selected.modulatedSetHash) {
    throw new Error('electric flicker modulated set hash mismatch');
  }

  const expected = buildExpectedSet(state, selected.phase);
  if (expected.modulatedSetHash !== selected.modulatedSetHash) {
    throw new Error('electric flicker derived path set does not rebuild from retained source truth');
  }
  return true;
}

export const normalizeElectricFlickerModulationRequestHand = hand('fx.electric.flicker-modulation-source-normalize', (state) => {
  const next = deepClone(state);
  const budget = validatePathBudget(next.paths);
  validateFlickerTruth(next);
  const request = next.electricFlickerModulationRequest;
  if (!request || typeof request !== 'object') {
    throw new Error('electric flicker modulation requires electricFlickerModulationRequest state');
  }
  const id = String(request.id ?? 'electric-flicker-modulation').trim();
  if (!id || id.length > 96) throw new Error('electricFlickerModulationRequest.id must be non-empty and <= 96 characters');

  next.electricBasePathsHash = hashValue(next.paths);
  next.electricFlickerModulationSource = {
    schema: 'axm.electric-flicker-modulation-source/v0.1',
    id,
    ...FIXED_SEMANTICS,
    strength: round6(bounded(request.strength ?? 1, 0, 1, 'electricFlickerModulationRequest.strength')),
    floor: round6(bounded(request.floor ?? 0.2, 0, 1, 'electricFlickerModulationRequest.floor')),
    provenance: {
      origin: 'AXM Visual Effect Fabric hand-lab',
      electricDonor: 'hand-lab/src/electric-hands.mjs#fx.electric.energy-profile',
      flickerDonor: 'hand-lab/src/flicker-cycle1d.mjs#fx.animation.flicker-cycle1d',
      relationship: 'derived-temporal-energy-modulation',
      externalSourceReuse: 'none',
    },
  };
  validateModulationSource(next.electricFlickerModulationSource);
  next.electricFlickerModulationSourceHash = hashValue(next.electricFlickerModulationSource);

  return {
    state: next,
    evidence: {
      electricBasePathsHash: next.electricBasePathsHash,
      flickerCycleSourceHash: next.flickerCycleSourceHash,
      electricFlickerModulationSourceHash: next.electricFlickerModulationSourceHash,
      pathCount: budget.pathCount,
      pointCount: budget.pointCount,
      strength: next.electricFlickerModulationSource.strength,
      floor: next.electricFlickerModulationSource.floor,
      externalSourceReuse: 'none',
    },
  };
}, 'Bind retained renderer-neutral flicker truth to derived electric path energy without rewriting electric topology, flicker source, renderer state, or consumer meaning.');

export const modulateElectricPathsWithFlickerHand = hand('fx.electric.flicker-cycle-modulate', (state, params = {}) => {
  const next = deepClone(state);
  validateSourceState(next);
  const selected = buildExpectedSet(next, params.phase ?? 0);
  const selectionId = next.electricFlickerModulationSource.id;
  next.flickerModulatedElectricPathSets ??= {};
  next.flickerModulatedElectricPathSets[selectionId] = selected;

  return {
    state: next,
    evidence: {
      basePathsHash: selected.basePathsHash,
      flickerCycleSourceHash: selected.flickerCycleSourceHash,
      electricFlickerModulationSourceHash: selected.electricFlickerModulationSourceHash,
      modulatedPathSetHash: selected.pathSetHash,
      modulatedSetHash: selected.modulatedSetHash,
      phase: selected.phase,
      sampleValue: selected.sampleValue,
      normalizedSample: selected.normalizedSample,
      factor: selected.factor,
      pathCount: selected.pathCount,
      pointCount: selected.pointCount,
      performanceMeasurement: 'NOT_TESTED',
      visualInspection: 'NOT_TESTED',
    },
  };
}, 'Sample retained flicker-cycle truth at a rebuildable phase and apply one bounded global factor to a derived electric path-energy set while preserving both canonical lineages.');

export const ELECTRIC_FLICKER_MODULATION_HANDS = [
  seedPathHand,
  branchPathHand,
  energyHand,
  normalizeFlickerCycleSourceHand,
  normalizeElectricFlickerModulationRequestHand,
  modulateElectricPathsWithFlickerHand,
];

export const ELECTRIC_FLICKER_MODULATION_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.electric-storm.flicker-cycle-modulation',
  version: '0.1.0',
  stages: [
    { id: 'seed-topology', hand: 'fx.electric.seed-path', params: { segments: 18, jitter: 0.06 } },
    { id: 'grow-branches', hand: 'fx.electric.branch-paths', params: { branchCount: 7, spread: 0.12 } },
    { id: 'profile-energy', hand: 'fx.electric.energy-profile', params: { trunkWidth: 1 } },
    { id: 'normalize-flicker-cycle-source', hand: 'fx.animation.flicker-cycle1d-source-normalize', params: {} },
    { id: 'normalize-electric-flicker-modulation-source', hand: 'fx.electric.flicker-modulation-source-normalize', params: {} },
    { id: 'modulate-derived-electric-paths', hand: 'fx.electric.flicker-cycle-modulate', params: { phase: 0 } },
  ],
});

export function makeElectricFlickerModulationState(options = {}) {
  const electricOptions = options.electric ?? {};
  const electric = makeElectricInitialState(electricOptions.seed ?? options.seed ?? 1337);
  if (electricOptions.source) electric.effect.source = deepClone(electricOptions.source);
  if (electricOptions.target) electric.effect.target = deepClone(electricOptions.target);
  if (electricOptions.controls) {
    electric.effect.controls = { ...electric.effect.controls, ...deepClone(electricOptions.controls) };
  }

  const flickerOptions = options.flicker ?? {};
  const flicker = makeFlickerCycleState({
    id: flickerOptions.id ?? 'electric-flicker-cycle',
    seed: flickerOptions.seed ?? 7331,
    slotCount: flickerOptions.slotCount ?? 12,
    minValue: flickerOptions.minValue ?? 0,
    maxValue: flickerOptions.maxValue ?? 1,
    responsePower: flickerOptions.responsePower ?? 1,
    phaseOffset: flickerOptions.phaseOffset ?? 0,
  });

  return {
    ...electric,
    flickerCycleRequest: flicker.flickerCycleRequest,
    flickerCycleSamples: flicker.flickerCycleSamples,
    electricFlickerModulationRequest: {
      id: options.id ?? 'electric-flicker-modulation',
      strength: options.strength ?? 1,
      floor: options.floor ?? 0.2,
    },
    flickerModulatedElectricPathSets: {},
  };
}
