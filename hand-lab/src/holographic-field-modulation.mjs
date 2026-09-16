import { deepClone, hashValue } from './hand-runtime.mjs';
import {
  creativeFieldHand,
  makeHolographicFormState,
  normalizeFormHand,
  sampleFormHand,
} from './holographic-state-projector.mjs';
import {
  makeFieldCompositionState,
  normalizeFieldCompositionRequestHand,
  sampleComposedFieldSource,
} from './field-composition-operators.mjs';

const round6 = (value) => Number(Number(value).toFixed(6));
const AXIS_PAIRS = Object.freeze(['xy', 'xz', 'yz']);

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

function axisIndices(pair) {
  if (!AXIS_PAIRS.includes(pair)) {
    throw new Error(`holographicFieldModulationRequest.axes must be one of ${AXIS_PAIRS.join(', ')}`);
  }
  if (pair === 'xy') return [0, 1];
  if (pair === 'yz') return [1, 2];
  return [0, 2];
}

function sampleBounds(points, stride, axes) {
  const [aIndex, bIndex] = axisIndices(axes);
  let aMin = Infinity;
  let aMax = -Infinity;
  let bMin = Infinity;
  let bMax = -Infinity;
  for (let i = 0; i < points.length; i += stride) {
    const a = finite(points[i + aIndex], `sampleField.points[${i + aIndex}]`);
    const b = finite(points[i + bIndex], `sampleField.points[${i + bIndex}]`);
    aMin = Math.min(aMin, a);
    aMax = Math.max(aMax, a);
    bMin = Math.min(bMin, b);
    bMax = Math.max(bMax, b);
  }
  return { aMin, aMax, bMin, bMax };
}

function normalizedCoordinate(value, min, max) {
  const span = max - min;
  if (Math.abs(span) < 1e-12) return 0.5;
  return round6((value - min) / span);
}

function modulationFactor(sample, source) {
  const shaped = source.floor + (1 - source.floor) * sample;
  return round6((1 - source.strength) + source.strength * shaped);
}

export const normalizeHolographicFieldModulationRequestHand = hand('fx.hologram.field-modulation-source-normalize', (state) => {
  const next = deepClone(state);
  const sampleField = next.sampleField;
  if (!sampleField || sampleField.schema !== 'axm.holographic-sample-field/v0.1') {
    throw new Error('holographic field modulation requires a holographic sampleField');
  }
  if (!Array.isArray(sampleField.points) || sampleField.points.length === 0 || sampleField.stride !== 7) {
    throw new Error('holographic field modulation requires non-empty stride-7 sample points');
  }
  if (hashValue(next.form) !== sampleField.canonicalFormHash) {
    throw new Error('holographic sample field canonical form hash mismatch');
  }

  const request = next.holographicFieldModulationRequest;
  if (!request || typeof request !== 'object') {
    throw new Error('holographic field modulation requires holographicFieldModulationRequest state');
  }
  const id = String(request.id ?? 'holographic-field-modulation').trim();
  if (!id) throw new Error('holographicFieldModulationRequest.id must be non-empty');
  const axes = String(request.axes ?? 'xz').trim();
  axisIndices(axes);

  next.holographicFieldModulationSource = {
    schema: 'axm.holographic-field-modulation-source/v0.1',
    id,
    mode: 'point-intensity',
    axes,
    strength: round6(bounded(request.strength ?? 1, 0, 1, 'holographicFieldModulationRequest.strength')),
    floor: round6(bounded(request.floor ?? 0.2, 0, 1, 'holographicFieldModulationRequest.floor')),
  };
  next.holographicFieldModulationSourceHash = hashValue(next.holographicFieldModulationSource);
  next.holographicBaseSampleFieldHash = hashValue(sampleField);

  return {
    state: next,
    evidence: {
      canonicalFormHash: sampleField.canonicalFormHash,
      holographicBaseSampleFieldHash: next.holographicBaseSampleFieldHash,
      holographicFieldModulationSourceHash: next.holographicFieldModulationSourceHash,
      pointCount: sampleField.pointCount,
      axes,
      strength: next.holographicFieldModulationSource.strength,
      floor: next.holographicFieldModulationSource.floor,
    },
  };
}, 'Capture exact holographic sample-field lineage and normalize consumer-neutral scalar intensity modulation without changing canonical form or sampled geometry.');

export const modulateHolographicSampleFieldWithComposedFieldHand = hand('fx.hologram.composed-field-modulate', (state) => {
  const next = deepClone(state);
  const sampleField = next.sampleField;
  if (!sampleField || !next.holographicBaseSampleFieldHash) {
    throw new Error('composed-field-modulate requires captured holographic base sample field');
  }
  if (!next.fieldSources?.a || !next.fieldSources?.b || !next.fieldSourceHashes) {
    throw new Error('composed-field-modulate requires normalized composition input sources');
  }
  if (!next.fieldCompositionSource || !next.fieldCompositionSourceHash) {
    throw new Error('composed-field-modulate requires normalized field composition source');
  }
  if (!next.holographicFieldModulationSource || !next.holographicFieldModulationSourceHash) {
    throw new Error('composed-field-modulate requires normalized holographic field modulation source');
  }
  if (hashValue(next.form) !== sampleField.canonicalFormHash) {
    throw new Error('canonical form hash mismatch');
  }
  if (hashValue(sampleField) !== next.holographicBaseSampleFieldHash) {
    throw new Error('holographic base sample field hash mismatch');
  }
  if (hashValue(next.fieldCompositionSource) !== next.fieldCompositionSourceHash) {
    throw new Error('field composition source hash mismatch');
  }
  if (hashValue(next.holographicFieldModulationSource) !== next.holographicFieldModulationSourceHash) {
    throw new Error('holographic field modulation source hash mismatch');
  }
  if (hashValue(next.fieldSources.a) !== next.fieldSourceHashes.a) {
    throw new Error('composition inputA source hash mismatch');
  }
  if (hashValue(next.fieldSources.b) !== next.fieldSourceHashes.b) {
    throw new Error('composition inputB source hash mismatch');
  }

  const source = next.holographicFieldModulationSource;
  const points = deepClone(sampleField.points);
  const bounds = sampleBounds(points, sampleField.stride, source.axes);
  const [aIndex, bIndex] = axisIndices(source.axes);
  const factors = [];

  for (let i = 0; i < points.length; i += sampleField.stride) {
    const u = normalizedCoordinate(points[i + aIndex], bounds.aMin, bounds.aMax);
    const v = normalizedCoordinate(points[i + bIndex], bounds.bMin, bounds.bMax);
    const sample = sampleComposedFieldSource(
      next.fieldSources.a,
      next.fieldSources.b,
      next.fieldCompositionSource,
      u,
      v,
    );
    const factor = modulationFactor(sample, source);
    const baseIntensity = finite(points[i + 6], `sampleField.points[${i + 6}]`);
    points[i + 6] = round6(baseIntensity * factor);
    factors.push(factor);
  }

  const factorStats = {
    min: round6(Math.min(...factors)),
    max: round6(Math.max(...factors)),
    mean: round6(factors.reduce((sum, value) => sum + value, 0) / factors.length),
    samples: factors.length,
  };

  const modulated = {
    schema: 'axm.holographic-modulated-sample-field/v0.1',
    canonicalFormHash: sampleField.canonicalFormHash,
    baseSampleFieldHash: next.holographicBaseSampleFieldHash,
    fieldCompositionSourceHash: next.fieldCompositionSourceHash,
    inputAHash: next.fieldSourceHashes.a,
    inputBHash: next.fieldSourceHashes.b,
    holographicFieldModulationSourceHash: next.holographicFieldModulationSourceHash,
    stride: sampleField.stride,
    pointCount: sampleField.pointCount,
    points,
    sampleFieldHash: hashValue(points),
    bounds: {
      axes: source.axes,
      min: [round6(bounds.aMin), round6(bounds.bMin)],
      max: [round6(bounds.aMax), round6(bounds.bMax)],
    },
    factorStats,
    derived: true,
    rebuildable: true,
  };

  next.modulatedHolographicSampleFields ??= {};
  next.modulatedHolographicSampleFields[source.id] = modulated;

  return {
    state: next,
    evidence: {
      canonicalFormHash: sampleField.canonicalFormHash,
      baseSampleFieldHash: next.holographicBaseSampleFieldHash,
      modulatedSampleFieldHash: modulated.sampleFieldHash,
      fieldCompositionSourceHash: next.fieldCompositionSourceHash,
      holographicFieldModulationSourceHash: next.holographicFieldModulationSourceHash,
      inputAHash: next.fieldSourceHashes.a,
      inputBHash: next.fieldSourceHashes.b,
      pointCount: modulated.pointCount,
      factorStats,
    },
  };
}, 'Apply a composed scalar field only to derived holographic point intensity while retaining canonical form and base sampled geometry unchanged.');

export const HOLOGRAPHIC_FIELD_MODULATION_HANDS = [
  normalizeFormHand,
  sampleFormHand,
  creativeFieldHand,
  normalizeFieldCompositionRequestHand,
  normalizeHolographicFieldModulationRequestHand,
  modulateHolographicSampleFieldWithComposedFieldHand,
];

export const HOLOGRAPHIC_FIELD_MODULATION_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.holographic-state-projector.composed-field-modulation',
  version: '0.1.0',
  stages: [
    { id: 'normalize-form', hand: 'fx.hologram.form-normalize', params: {} },
    { id: 'sample-form', hand: 'fx.hologram.form-sample', params: {} },
    { id: 'creative-field', hand: 'fx.hologram.creative-field', params: {} },
    { id: 'normalize-composition-source', hand: 'fx.field.composition-source-normalize', params: {} },
    { id: 'normalize-holographic-field-modulation-source', hand: 'fx.hologram.field-modulation-source-normalize', params: {} },
    { id: 'modulate-derived-holographic-sample-field', hand: 'fx.hologram.composed-field-modulate', params: {} },
  ],
});

export function makeHolographicFieldModulationState(form, options = {}) {
  const holographic = makeHolographicFormState(form, options.seed ?? 42);
  const composition = makeFieldCompositionState(options.composition ?? {});
  return {
    ...holographic,
    fieldARequest: composition.fieldARequest,
    fieldBRequest: composition.fieldBRequest,
    compositionRequest: composition.compositionRequest,
    holographicFieldModulationRequest: {
      id: options.id ?? 'holographic-field-modulation',
      axes: options.axes ?? 'xz',
      strength: options.strength ?? 1,
      floor: options.floor ?? 0.2,
    },
    modulatedHolographicSampleFields: {},
  };
}
