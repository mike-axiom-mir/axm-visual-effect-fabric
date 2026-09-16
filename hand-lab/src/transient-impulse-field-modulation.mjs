import { deepClone, hashValue } from './hand-runtime.mjs';
import {
  buildImpulseFieldHand,
  makeTransientImpulseState,
  normalizeImpulseEventHand,
} from './transient-impulse-hands.mjs';
import {
  makeFieldCompositionState,
  normalizeFieldCompositionRequestHand,
  sampleComposedFieldSource,
} from './field-composition-operators.mjs';

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

function localUv(x, y) {
  return [
    round6(clamp(0.5 + x * 0.5, 0, 1)),
    round6(clamp(0.5 + y * 0.5, 0, 1)),
  ];
}

function spokeProbeUv(spoke) {
  const radial = (spoke.startScale + spoke.lengthScale) * 0.5;
  const angle = spoke.angle + spoke.bend * 0.5;
  return localUv(Math.cos(angle) * radial, Math.sin(angle) * radial);
}

function fragmentProbeUv(fragment) {
  const tangent = fragment.angle + Math.PI / 2;
  const x = Math.cos(fragment.angle) * fragment.radialScale + Math.cos(tangent) * fragment.tangentScale;
  const y = Math.sin(fragment.angle) * fragment.radialScale + Math.sin(tangent) * fragment.tangentScale;
  return localUv(x, y);
}

function modulationFactor(sample, source) {
  const shapedSample = source.floor + (1 - source.floor) * sample;
  return round6((1 - source.strength) + source.strength * shapedSample);
}

export const normalizeImpulseFieldModulationRequestHand = hand('fx.impulse.field-modulation-source-normalize', (state) => {
  const next = deepClone(state);
  const request = next.fieldModulationRequest;
  if (!request || typeof request !== 'object') {
    throw new Error('impulse field modulation requires fieldModulationRequest state');
  }
  const id = String(request.id ?? 'impulse-field-modulation').trim();
  if (!id) throw new Error('fieldModulationRequest.id must be non-empty');

  next.fieldModulationSource = {
    schema: 'axm.impulse-field-modulation-source/v0.1',
    id,
    mode: 'detail-intensity',
    strength: round6(bounded(request.strength ?? 1, 0, 1, 'fieldModulationRequest.strength')),
    floor: round6(bounded(request.floor ?? 0.18, 0, 1, 'fieldModulationRequest.floor')),
  };
  next.fieldModulationSourceHash = hashValue(next.fieldModulationSource);

  return {
    state: next,
    evidence: {
      fieldModulationSourceHash: next.fieldModulationSourceHash,
      mode: next.fieldModulationSource.mode,
      strength: next.fieldModulationSource.strength,
      floor: next.fieldModulationSource.floor,
    },
  };
}, 'Normalize consumer-neutral scalar-field modulation controls without rewriting the canonical transient event or choosing a renderer.');

export const modulateImpulseWithComposedFieldHand = hand('fx.impulse.composed-field-modulate', (state) => {
  const next = deepClone(state);
  if (!next.event || !next.eventCanonicalHash || !next.impulseField) {
    throw new Error('composed-field-modulate requires normalized transient event + base impulse field');
  }
  if (!next.fieldSources?.a || !next.fieldSources?.b || !next.fieldSourceHashes) {
    throw new Error('composed-field-modulate requires normalized composition input sources');
  }
  if (!next.fieldCompositionSource || !next.fieldCompositionSourceHash) {
    throw new Error('composed-field-modulate requires normalized field composition source');
  }
  if (!next.fieldModulationSource || !next.fieldModulationSourceHash) {
    throw new Error('composed-field-modulate requires normalized field modulation source');
  }
  if (hashValue(next.event) !== next.eventCanonicalHash) {
    throw new Error('canonical transient event hash mismatch');
  }
  if (hashValue(next.impulseField.geometry) !== next.impulseField.geometryHash) {
    throw new Error('base impulse field geometry hash mismatch');
  }
  if (hashValue(next.fieldCompositionSource) !== next.fieldCompositionSourceHash) {
    throw new Error('field composition source hash mismatch');
  }
  if (hashValue(next.fieldModulationSource) !== next.fieldModulationSourceHash) {
    throw new Error('field modulation source hash mismatch');
  }
  if (hashValue(next.fieldSources.a) !== next.fieldSourceHashes.a) {
    throw new Error('composition inputA source hash mismatch');
  }
  if (hashValue(next.fieldSources.b) !== next.fieldSourceHashes.b) {
    throw new Error('composition inputB source hash mismatch');
  }

  const source = next.fieldModulationSource;
  const base = next.impulseField;
  const geometry = deepClone(base.geometry);
  const factors = [];

  geometry.spokes = geometry.spokes.map((spoke) => {
    const uv = spokeProbeUv(spoke);
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
      ...spoke,
      intensity: round6(spoke.intensity * factor),
      scalarModulation: { uv, sample, factor },
    };
  });

  geometry.fragments = geometry.fragments.map((fragment) => {
    const uv = fragmentProbeUv(fragment);
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
      ...fragment,
      intensity: round6(fragment.intensity * factor),
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
    schema: 'axm.transient-impulse-modulated-field/v0.1',
    canonicalEventHash: next.eventCanonicalHash,
    baseFieldGeometryHash: base.geometryHash,
    fieldCompositionSourceHash: next.fieldCompositionSourceHash,
    inputAHash: next.fieldSourceHashes.a,
    inputBHash: next.fieldSourceHashes.b,
    fieldModulationSourceHash: next.fieldModulationSourceHash,
    geometry,
    geometryHash: hashValue(geometry),
    counts: deepClone(base.counts),
    factorStats,
    derived: true,
    rebuildable: true,
  };

  next.modulatedImpulseFields ??= {};
  next.modulatedImpulseFields[source.id] = modulated;

  return {
    state: next,
    evidence: {
      canonicalEventHash: next.eventCanonicalHash,
      baseFieldGeometryHash: base.geometryHash,
      modulatedFieldGeometryHash: modulated.geometryHash,
      fieldCompositionSourceHash: next.fieldCompositionSourceHash,
      fieldModulationSourceHash: next.fieldModulationSourceHash,
      inputAHash: next.fieldSourceHashes.a,
      inputBHash: next.fieldSourceHashes.b,
      counts: modulated.counts,
      factorStats,
    },
  };
}, 'Apply a composed scalar field to derived transient-impulse detail intensity while retaining the canonical event and base impulse field unchanged.');

export const TRANSIENT_IMPULSE_FIELD_MODULATION_HANDS = [
  normalizeImpulseEventHand,
  buildImpulseFieldHand,
  normalizeFieldCompositionRequestHand,
  normalizeImpulseFieldModulationRequestHand,
  modulateImpulseWithComposedFieldHand,
];

export const TRANSIENT_IMPULSE_FIELD_MODULATION_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.transient-impulse.composed-field-modulation',
  version: '0.1.0',
  stages: [
    { id: 'normalize-event', hand: 'fx.impulse.event-normalize', params: {} },
    { id: 'build-base-impulse-field', hand: 'fx.impulse.field-build', params: { maxRings: 8, maxSpokes: 18, maxFragments: 42 } },
    { id: 'normalize-composition-source', hand: 'fx.field.composition-source-normalize', params: {} },
    { id: 'normalize-field-modulation-source', hand: 'fx.impulse.field-modulation-source-normalize', params: {} },
    { id: 'modulate-derived-impulse-field', hand: 'fx.impulse.composed-field-modulate', params: {} },
  ],
});

export function makeTransientImpulseFieldModulationState(options = {}) {
  const impulse = makeTransientImpulseState(options.impulse ?? {});
  const composition = makeFieldCompositionState(options.composition ?? {});
  return {
    ...impulse,
    fieldARequest: composition.fieldARequest,
    fieldBRequest: composition.fieldBRequest,
    compositionRequest: composition.compositionRequest,
    fieldModulationRequest: {
      id: options.id ?? 'impulse-field-modulation',
      strength: options.strength ?? 1,
      floor: options.floor ?? 0.18,
    },
    modulatedImpulseFields: {},
  };
}
