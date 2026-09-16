import { deepClone, hashValue } from './hand-runtime.mjs';
import {
  branchPathHand,
  energyHand,
  makeElectricInitialState,
  seedPathHand,
} from './electric-hands.mjs';
import {
  makeFieldCompositionState,
  normalizeFieldCompositionRequestHand,
  sampleComposedFieldSource,
} from './field-composition-operators.mjs';

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

function pathProbeUv(path) {
  if (!Array.isArray(path?.points) || path.points.length === 0) {
    throw new Error('electric field modulation requires non-empty path points');
  }
  let x = 0;
  let y = 0;
  for (const point of path.points) {
    x += bounded(point.x, 0, 1, 'path.point.x');
    y += bounded(point.y, 0, 1, 'path.point.y');
  }
  return [round6(x / path.points.length), round6(y / path.points.length)];
}

function modulationFactor(sample, source) {
  const shaped = source.floor + (1 - source.floor) * sample;
  return round6((1 - source.strength) + source.strength * shaped);
}

export const normalizeElectricFieldModulationRequestHand = hand('fx.electric.field-modulation-source-normalize', (state) => {
  const next = deepClone(state);
  if (!Array.isArray(next.paths) || next.paths.length === 0) {
    throw new Error('electric field modulation requires profiled electric paths');
  }
  const request = next.electricFieldModulationRequest;
  if (!request || typeof request !== 'object') {
    throw new Error('electric field modulation requires electricFieldModulationRequest state');
  }
  const id = String(request.id ?? 'electric-field-modulation').trim();
  if (!id) throw new Error('electricFieldModulationRequest.id must be non-empty');

  next.electricFieldModulationSource = {
    schema: 'axm.electric-field-modulation-source/v0.1',
    id,
    mode: 'path-energy',
    strength: round6(bounded(request.strength ?? 1, 0, 1, 'electricFieldModulationRequest.strength')),
    floor: round6(bounded(request.floor ?? 0.2, 0, 1, 'electricFieldModulationRequest.floor')),
  };
  next.electricFieldModulationSourceHash = hashValue(next.electricFieldModulationSource);
  next.electricBasePathsHash = hashValue(next.paths);

  return {
    state: next,
    evidence: {
      electricBasePathsHash: next.electricBasePathsHash,
      electricFieldModulationSourceHash: next.electricFieldModulationSourceHash,
      pathCount: next.paths.length,
      mode: next.electricFieldModulationSource.mode,
      strength: next.electricFieldModulationSource.strength,
      floor: next.electricFieldModulationSource.floor,
    },
  };
}, 'Capture exact electric path lineage and normalize consumer-neutral scalar modulation controls without changing the retained paths or choosing a renderer.');

export const modulateElectricPathsWithComposedFieldHand = hand('fx.electric.composed-field-modulate', (state) => {
  const next = deepClone(state);
  if (!Array.isArray(next.paths) || next.paths.length === 0 || !next.electricBasePathsHash) {
    throw new Error('composed-field-modulate requires captured electric base paths');
  }
  if (!next.fieldSources?.a || !next.fieldSources?.b || !next.fieldSourceHashes) {
    throw new Error('composed-field-modulate requires normalized composition input sources');
  }
  if (!next.fieldCompositionSource || !next.fieldCompositionSourceHash) {
    throw new Error('composed-field-modulate requires normalized field composition source');
  }
  if (!next.electricFieldModulationSource || !next.electricFieldModulationSourceHash) {
    throw new Error('composed-field-modulate requires normalized electric field modulation source');
  }
  if (hashValue(next.paths) !== next.electricBasePathsHash) {
    throw new Error('electric base path hash mismatch');
  }
  if (hashValue(next.fieldCompositionSource) !== next.fieldCompositionSourceHash) {
    throw new Error('field composition source hash mismatch');
  }
  if (hashValue(next.electricFieldModulationSource) !== next.electricFieldModulationSourceHash) {
    throw new Error('electric field modulation source hash mismatch');
  }
  if (hashValue(next.fieldSources.a) !== next.fieldSourceHashes.a) {
    throw new Error('composition inputA source hash mismatch');
  }
  if (hashValue(next.fieldSources.b) !== next.fieldSourceHashes.b) {
    throw new Error('composition inputB source hash mismatch');
  }

  const source = next.electricFieldModulationSource;
  const factors = [];
  const paths = next.paths.map((path) => {
    const uv = pathProbeUv(path);
    const sample = sampleComposedFieldSource(
      next.fieldSources.a,
      next.fieldSources.b,
      next.fieldCompositionSource,
      uv[0],
      uv[1],
    );
    const factor = modulationFactor(sample, source);
    factors.push(factor);
    return {
      ...deepClone(path),
      energy: round6(finite(path.energy ?? 1, 'path.energy') * factor),
      scalarModulation: { uv, sample, factor },
    };
  });

  const factorStats = factors.length > 0 ? {
    min: round6(Math.min(...factors)),
    max: round6(Math.max(...factors)),
    mean: round6(factors.reduce((sum, value) => sum + value, 0) / factors.length),
    samples: factors.length,
  } : { min: 1, max: 1, mean: 1, samples: 0 };

  const modulated = {
    schema: 'axm.electric-modulated-path-set/v0.1',
    basePathsHash: next.electricBasePathsHash,
    fieldCompositionSourceHash: next.fieldCompositionSourceHash,
    inputAHash: next.fieldSourceHashes.a,
    inputBHash: next.fieldSourceHashes.b,
    electricFieldModulationSourceHash: next.electricFieldModulationSourceHash,
    paths,
    pathSetHash: hashValue(paths),
    factorStats,
    derived: true,
    rebuildable: true,
  };

  next.modulatedElectricPathSets ??= {};
  next.modulatedElectricPathSets[source.id] = modulated;

  return {
    state: next,
    evidence: {
      basePathsHash: next.electricBasePathsHash,
      modulatedPathSetHash: modulated.pathSetHash,
      fieldCompositionSourceHash: next.fieldCompositionSourceHash,
      electricFieldModulationSourceHash: next.electricFieldModulationSourceHash,
      inputAHash: next.fieldSourceHashes.a,
      inputBHash: next.fieldSourceHashes.b,
      pathCount: paths.length,
      factorStats,
    },
  };
}, 'Apply a composed scalar field to derived electric path energy while retaining the editable base path topology and energy profile unchanged.');

export const ELECTRIC_FIELD_MODULATION_HANDS = [
  seedPathHand,
  branchPathHand,
  energyHand,
  normalizeFieldCompositionRequestHand,
  normalizeElectricFieldModulationRequestHand,
  modulateElectricPathsWithComposedFieldHand,
];

export const ELECTRIC_FIELD_MODULATION_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.electric-storm.composed-field-modulation',
  version: '0.1.0',
  stages: [
    { id: 'seed-topology', hand: 'fx.electric.seed-path', params: { segments: 18, jitter: 0.06 } },
    { id: 'grow-branches', hand: 'fx.electric.branch-paths', params: { branchCount: 7, spread: 0.12 } },
    { id: 'profile-energy', hand: 'fx.electric.energy-profile', params: { trunkWidth: 1 } },
    { id: 'normalize-composition-source', hand: 'fx.field.composition-source-normalize', params: {} },
    { id: 'normalize-electric-field-modulation-source', hand: 'fx.electric.field-modulation-source-normalize', params: {} },
    { id: 'modulate-derived-electric-paths', hand: 'fx.electric.composed-field-modulate', params: {} },
  ],
});

export function makeElectricFieldModulationState(options = {}) {
  const electricOptions = options.electric ?? {};
  const electric = makeElectricInitialState(electricOptions.seed ?? options.seed ?? 1337);
  if (electricOptions.source) electric.effect.source = deepClone(electricOptions.source);
  if (electricOptions.target) electric.effect.target = deepClone(electricOptions.target);
  if (electricOptions.controls) {
    electric.effect.controls = { ...electric.effect.controls, ...deepClone(electricOptions.controls) };
  }

  const composition = makeFieldCompositionState(options.composition ?? {});
  return {
    ...electric,
    fieldARequest: composition.fieldARequest,
    fieldBRequest: composition.fieldBRequest,
    compositionRequest: composition.compositionRequest,
    electricFieldModulationRequest: {
      id: options.id ?? 'electric-field-modulation',
      strength: options.strength ?? 1,
      floor: options.floor ?? 0.2,
    },
    modulatedElectricPathSets: {},
  };
}
