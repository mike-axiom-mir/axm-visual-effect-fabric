import { deepClone, hashValue } from './hand-runtime.mjs';

const round6 = (value) => Number(Number(value).toFixed(6));
const SUPPORTED_INTERPOLATIONS = Object.freeze(['linear', 'smoothstep', 'step']);
const SUPPORTED_WRAP_MODES = Object.freeze(['clamp', 'loop']);
const MAX_KEYFRAMES = 64;
const MAX_ABS_VALUE = 1_000_000;

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

function normalizeInterpolation(value, label) {
  const interpolation = String(value ?? 'linear').trim();
  if (!SUPPORTED_INTERPOLATIONS.includes(interpolation)) {
    throw new Error(`${label} must be one of ${SUPPORTED_INTERPOLATIONS.join(', ')}`);
  }
  return interpolation;
}

function validateNormalizedSource(source) {
  if (!source || source.schema !== 'axm.parameter-curve-source/v0.1') {
    throw new Error('parameter curve requires normalized source');
  }
  if (!SUPPORTED_WRAP_MODES.includes(source.wrapMode)) throw new Error('parameter curve source wrap mode is invalid');
  if (!Array.isArray(source.keyframes) || source.keyframes.length < 2 || source.keyframes.length > MAX_KEYFRAMES) {
    throw new Error(`parameter curve source must contain 2..${MAX_KEYFRAMES} keyframes`);
  }
  if (source.keyframes[0].t !== 0 || source.keyframes.at(-1).t !== 1) {
    throw new Error('parameter curve source must span normalized time exactly from 0 to 1');
  }
  let previousT = -Infinity;
  for (const [index, keyframe] of source.keyframes.entries()) {
    if (!keyframe || typeof keyframe !== 'object') throw new Error(`parameter curve keyframe ${index} must be an object`);
    const t = bounded(keyframe.t, 0, 1, `parameter curve keyframe ${index}.t`);
    bounded(keyframe.value, -MAX_ABS_VALUE, MAX_ABS_VALUE, `parameter curve keyframe ${index}.value`);
    normalizeInterpolation(keyframe.interpolation, `parameter curve keyframe ${index}.interpolation`);
    if (t <= previousT) throw new Error('parameter curve keyframe times must be strictly increasing');
    previousT = t;
  }
}

function wrapTime(t, wrapMode) {
  const time = finite(t, 'sample.t');
  if (wrapMode === 'loop') {
    const wrapped = ((time % 1) + 1) % 1;
    return round6(wrapped);
  }
  return Math.max(0, Math.min(1, time));
}

function interpolateValue(a, b, localT, interpolation) {
  if (interpolation === 'step') return a;
  const u = interpolation === 'smoothstep'
    ? localT * localT * (3 - 2 * localT)
    : localT;
  return a + (b - a) * u;
}

export function sampleParameterCurveSource(source, t) {
  validateNormalizedSource(source);
  const sampleT = wrapTime(t, source.wrapMode);
  if (source.wrapMode === 'clamp' && sampleT >= 1) return round6(source.keyframes.at(-1).value);
  if (sampleT <= 0) return round6(source.keyframes[0].value);
  const exact = source.keyframes.find((keyframe) => keyframe.t === sampleT);
  if (exact) return round6(exact.value);

  for (let index = 0; index < source.keyframes.length - 1; index += 1) {
    const current = source.keyframes[index];
    const next = source.keyframes[index + 1];
    if (sampleT <= next.t) {
      const span = next.t - current.t;
      const localT = span === 0 ? 0 : (sampleT - current.t) / span;
      return round6(interpolateValue(current.value, next.value, localT, current.interpolation));
    }
  }
  return round6(source.keyframes.at(-1).value);
}

export const normalizeParameterCurveHand = hand('fx.animation.parameter-curve-source-normalize', (state) => {
  const next = deepClone(state);
  const request = next.parameterCurveRequest;
  if (!request || typeof request !== 'object') throw new Error('parameter curve requires parameterCurveRequest state');
  const id = String(request.id ?? 'parameter-curve').trim();
  if (!id) throw new Error('parameterCurveRequest.id must be non-empty');
  const wrapMode = String(request.wrapMode ?? 'clamp').trim();
  if (!SUPPORTED_WRAP_MODES.includes(wrapMode)) {
    throw new Error(`parameterCurveRequest.wrapMode must be one of ${SUPPORTED_WRAP_MODES.join(', ')}`);
  }
  if (!Array.isArray(request.keyframes) || request.keyframes.length < 2 || request.keyframes.length > MAX_KEYFRAMES) {
    throw new Error(`parameterCurveRequest.keyframes must contain 2..${MAX_KEYFRAMES} entries`);
  }

  const keyframes = request.keyframes.map((keyframe, index) => {
    if (!keyframe || typeof keyframe !== 'object') throw new Error(`parameterCurveRequest.keyframes[${index}] must be an object`);
    return {
      t: round6(bounded(keyframe.t, 0, 1, `parameterCurveRequest.keyframes[${index}].t`)),
      value: round6(bounded(keyframe.value, -MAX_ABS_VALUE, MAX_ABS_VALUE, `parameterCurveRequest.keyframes[${index}].value`)),
      interpolation: normalizeInterpolation(keyframe.interpolation, `parameterCurveRequest.keyframes[${index}].interpolation`),
    };
  });

  if (keyframes[0].t !== 0 || keyframes.at(-1).t !== 1) {
    throw new Error('parameterCurveRequest.keyframes must span normalized time exactly from 0 to 1');
  }
  for (let index = 1; index < keyframes.length; index += 1) {
    if (keyframes[index].t <= keyframes[index - 1].t) {
      throw new Error('parameterCurveRequest keyframe times must be strictly increasing');
    }
  }

  next.parameterCurveSource = {
    schema: 'axm.parameter-curve-source/v0.1',
    id,
    domain: 'normalized-time',
    wrapMode,
    keyframes,
    provenance: {
      origin: 'AXM Visual Effect Fabric hand-lab',
      donorConcept: 'runtime/library/packages/motion.idle-pulse.axmfx.json#primitive.motion-curve',
      sourceReuse: 'none',
    },
  };
  validateNormalizedSource(next.parameterCurveSource);
  next.parameterCurveSourceHash = hashValue(next.parameterCurveSource);

  return {
    state: next,
    evidence: {
      parameterCurveSourceHash: next.parameterCurveSourceHash,
      keyframeCount: keyframes.length,
      wrapMode,
      domain: next.parameterCurveSource.domain,
      donorConcept: next.parameterCurveSource.provenance.donorConcept,
      sourceReuse: next.parameterCurveSource.provenance.sourceReuse,
    },
  };
}, 'Normalize a caller-neutral renderer-independent 1D parameter curve as canonical timing/value truth while retaining the older declarative motion-curve donor as provenance only.');

export const buildParameterCurveSamplesHand = hand('fx.animation.parameter-curve-samples-build', (state, params = {}) => {
  const next = deepClone(state);
  if (!next.parameterCurveSource || !next.parameterCurveSourceHash) {
    throw new Error('parameter-curve-samples-build requires normalized parameter curve source');
  }
  if (hashValue(next.parameterCurveSource) !== next.parameterCurveSourceHash) {
    throw new Error('parameter curve source state hash mismatch');
  }
  validateNormalizedSource(next.parameterCurveSource);

  const sampleCount = boundedInteger(params.sampleCount ?? 129, 2, 4097, 'parameterCurve.sampleCount');
  const samples = [];
  let minValue = Infinity;
  let maxValue = -Infinity;
  for (let index = 0; index < sampleCount; index += 1) {
    const t = index / (sampleCount - 1);
    const value = sampleParameterCurveSource(next.parameterCurveSource, t);
    samples.push({ t: round6(t), value });
    minValue = Math.min(minValue, value);
    maxValue = Math.max(maxValue, value);
  }

  const sampleSet = {
    schema: 'axm.parameter-curve-samples/v0.1',
    sourceHash: next.parameterCurveSourceHash,
    sampleCount,
    samples,
    minValue: round6(minValue),
    maxValue: round6(maxValue),
    derived: true,
    rebuildable: true,
  };
  sampleSet.sampleSetHash = hashValue(sampleSet);

  next.parameterCurveSamples ??= {};
  next.parameterCurveSamples[next.parameterCurveSource.id] = sampleSet;

  return {
    state: next,
    evidence: {
      parameterCurveSourceHash: next.parameterCurveSourceHash,
      sampleSetHash: sampleSet.sampleSetHash,
      sampleCount,
      minValue: sampleSet.minValue,
      maxValue: sampleSet.maxValue,
      performanceMeasurement: 'NOT_TESTED',
      visualInspection: 'NOT_TESTED',
    },
  };
}, 'Build a bounded rebuildable sample table from canonical 1D parameter-curve truth without making sample resolution canonical or selecting a renderer.');

export const PARAMETER_CURVE_HANDS = [
  normalizeParameterCurveHand,
  buildParameterCurveSamplesHand,
];

export const PARAMETER_CURVE_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.animation.parameter-curve1d',
  version: '0.1.0',
  stages: [
    { id: 'normalize-parameter-curve-source', hand: 'fx.animation.parameter-curve-source-normalize', params: {} },
    { id: 'build-parameter-curve-samples', hand: 'fx.animation.parameter-curve-samples-build', params: { sampleCount: 129 } },
  ],
});

export function makeParameterCurveState(options = {}) {
  return {
    schema: 'axm.effect-work-state/v0.1',
    parameterCurveRequest: {
      id: options.id ?? 'parameter-curve',
      wrapMode: options.wrapMode ?? 'clamp',
      keyframes: deepClone(options.keyframes ?? [
        { t: 0, value: 0, interpolation: 'smoothstep' },
        { t: 1, value: 1, interpolation: 'linear' },
      ]),
    },
    parameterCurveSamples: {},
  };
}
