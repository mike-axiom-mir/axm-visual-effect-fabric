import { deepClone, hashValue } from './hand-runtime.mjs';
import { makeScalarFieldState, normalizeScalarFieldRequestHand, sampleFbmSource } from './field-operators.mjs';
import { makeFieldFlowState, normalizeFlowFieldRequestHand, sampleFlowFieldSource } from './field-flow-operators.mjs';

const round6 = (value) => Number(Number(value).toFixed(6));
const clamp01 = (value) => Math.max(0, Math.min(1, Number(value)));

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

function normalizedCoordinate(value, label) {
  return bounded(value, 0, 1, label);
}

function normalizeBaseField(request) {
  if (!request || typeof request !== 'object') throw new Error('domain warp requires fieldRequest state');
  const normalized = normalizeScalarFieldRequestHand.execute({
    schema: 'axm.effect-work-state/v0.1',
    fieldRequest: deepClone(request),
    scalarFields: {},
  }, {});
  return {
    source: normalized.state.fieldSource,
    sourceHash: normalized.state.fieldSourceHash,
  };
}

function normalizeFlowInput(fieldRequest, flowRequest) {
  if (!fieldRequest || typeof fieldRequest !== 'object') throw new Error('domain warp requires flowFieldRequest state');
  if (!flowRequest || typeof flowRequest !== 'object') throw new Error('domain warp requires flowRequest state');
  const normalized = normalizeFlowFieldRequestHand.execute({
    schema: 'axm.effect-work-state/v0.1',
    fieldRequest: deepClone(fieldRequest),
    flowRequest: deepClone(flowRequest),
    vectorFields: {},
  }, {});
  return {
    scalarSource: normalized.state.fieldSource,
    scalarSourceHash: normalized.state.fieldSourceHash,
    flowSource: normalized.state.flowSource,
    flowSourceHash: normalized.state.flowSourceHash,
  };
}

function validateWarpLineage(baseFieldSource, flowFieldSource, flowSource, warpSource) {
  if (!baseFieldSource || baseFieldSource.schema !== 'axm.scalar-field-source/v0.1') {
    throw new Error('domain warp requires normalized base scalar field source');
  }
  if (!flowFieldSource || flowFieldSource.schema !== 'axm.scalar-field-source/v0.1') {
    throw new Error('domain warp requires normalized flow scalar field source');
  }
  if (!flowSource || flowSource.schema !== 'axm.vector-flow-source/v0.1') {
    throw new Error('domain warp requires normalized vector flow source');
  }
  if (!warpSource || warpSource.schema !== 'axm.domain-warp-source/v0.1') {
    throw new Error('domain warp requires normalized warp source');
  }
  const liveBaseHash = hashValue(baseFieldSource);
  const liveFlowScalarHash = hashValue(flowFieldSource);
  const liveFlowHash = hashValue(flowSource);
  if (liveBaseHash !== warpSource.baseSource.sourceHash) throw new Error('domain warp base source hash mismatch');
  if (liveFlowScalarHash !== flowSource.scalarSource.sourceHash) throw new Error('domain warp flow scalar source hash mismatch');
  if (liveFlowScalarHash !== warpSource.flowSource.scalarSourceHash) throw new Error('domain warp retained flow scalar source hash mismatch');
  if (liveFlowHash !== warpSource.flowSource.sourceHash) throw new Error('domain warp flow source hash mismatch');
}

export function sampleDomainWarpSource(baseFieldSource, flowFieldSource, flowSource, warpSource, u, v) {
  validateWarpLineage(baseFieldSource, flowFieldSource, flowSource, warpSource);
  const sampleU = normalizedCoordinate(u, 'sample.u');
  const sampleV = normalizedCoordinate(v, 'sample.v');
  const vector = sampleFlowFieldSource(flowFieldSource, flowSource, sampleU, sampleV);
  const warpedU = round6(clamp01(sampleU + vector.x * warpSource.amplitude));
  const warpedV = round6(clamp01(sampleV + vector.y * warpSource.amplitude));
  return {
    value: sampleFbmSource(baseFieldSource, warpedU, warpedV),
    warpedU,
    warpedV,
    displacementX: round6(warpedU - sampleU),
    displacementY: round6(warpedV - sampleV),
  };
}

export const normalizeDomainWarpRequestHand = hand('fx.field.domain-warp-source-normalize', (state) => {
  const next = deepClone(state);
  const request = next.warpRequest;
  if (!request || typeof request !== 'object') throw new Error('domain warp requires warpRequest state');
  const id = String(request.id ?? 'domain-warp').trim();
  if (!id) throw new Error('warpRequest.id must be non-empty');

  const base = normalizeBaseField(next.fieldRequest);
  const flow = normalizeFlowInput(next.flowFieldRequest, next.flowRequest);
  next.fieldSource = base.source;
  next.fieldSourceHash = base.sourceHash;
  next.flowFieldSource = flow.scalarSource;
  next.flowFieldSourceHash = flow.scalarSourceHash;
  next.flowSource = flow.flowSource;
  next.flowSourceHash = flow.flowSourceHash;
  next.warpSource = {
    schema: 'axm.domain-warp-source/v0.1',
    id,
    algorithm: 'scalar-sample-vector-domain-warp2d',
    baseSource: {
      id: base.source.id,
      sourceHash: base.sourceHash,
    },
    flowSource: {
      id: flow.flowSource.id,
      sourceHash: flow.flowSourceHash,
      scalarSourceHash: flow.scalarSourceHash,
    },
    amplitude: round6(bounded(request.amplitude ?? 0.12, 0, 0.5, 'warpRequest.amplitude')),
  };
  next.warpSourceHash = hashValue(next.warpSource);

  return {
    state: next,
    evidence: {
      fieldSourceHash: next.fieldSourceHash,
      flowFieldSourceHash: next.flowFieldSourceHash,
      flowSourceHash: next.flowSourceHash,
      warpSourceHash: next.warpSourceHash,
      amplitude: next.warpSource.amplitude,
    },
  };
}, 'Derive a renderer-neutral scalar domain-warp source from retained scalar truth plus retained vector-flow truth without choosing a grid resolution.');

export const buildDomainWarpGridHand = hand('fx.field.domain-warp-grid-build', (state, params = {}) => {
  const next = deepClone(state);
  if (!next.fieldSource || !next.fieldSourceHash) throw new Error('domain-warp-grid-build requires normalized base scalar source');
  if (!next.flowFieldSource || !next.flowFieldSourceHash) throw new Error('domain-warp-grid-build requires normalized flow scalar source');
  if (!next.flowSource || !next.flowSourceHash) throw new Error('domain-warp-grid-build requires normalized flow source');
  if (!next.warpSource || !next.warpSourceHash) throw new Error('domain-warp-grid-build requires normalized warp source');
  if (hashValue(next.fieldSource) !== next.fieldSourceHash) throw new Error('domain warp base source state hash mismatch');
  if (hashValue(next.flowFieldSource) !== next.flowFieldSourceHash) throw new Error('domain warp flow scalar source state hash mismatch');
  if (hashValue(next.flowSource) !== next.flowSourceHash) throw new Error('domain warp flow source state hash mismatch');
  if (hashValue(next.warpSource) !== next.warpSourceHash) throw new Error('domain warp source state hash mismatch');
  validateWarpLineage(next.fieldSource, next.flowFieldSource, next.flowSource, next.warpSource);

  const width = boundedInteger(params.width ?? 48, 4, 128, 'domainWarp.width');
  const height = boundedInteger(params.height ?? 32, 4, 128, 'domainWarp.height');
  const maxCells = boundedInteger(params.maxCells ?? 16384, 16, 16384, 'domainWarp.maxCells');
  if (width * height > maxCells) {
    throw new Error(`domainWarp cell budget exceeded: ${width * height} > ${maxCells}`);
  }

  const values = [];
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let maxDisplacement = 0;
  for (let y = 0; y < height; y += 1) {
    const v = y / (height - 1);
    for (let x = 0; x < width; x += 1) {
      const u = x / (width - 1);
      const sample = sampleDomainWarpSource(next.fieldSource, next.flowFieldSource, next.flowSource, next.warpSource, u, v);
      values.push(sample.value);
      min = Math.min(min, sample.value);
      max = Math.max(max, sample.value);
      sum += sample.value;
      maxDisplacement = Math.max(maxDisplacement, Math.hypot(sample.displacementX, sample.displacementY));
    }
  }

  const grid = {
    schema: 'axm.domain-warp-grid/v0.1',
    warpSourceHash: next.warpSourceHash,
    baseSourceHash: next.fieldSourceHash,
    flowSourceHash: next.flowSourceHash,
    flowScalarSourceHash: next.flowFieldSourceHash,
    width,
    height,
    values,
    min: round6(min),
    max: round6(max),
    mean: round6(sum / values.length),
    maxDisplacement: round6(maxDisplacement),
    derived: true,
    rebuildable: true,
  };
  grid.fieldHash = hashValue({
    schema: grid.schema,
    warpSourceHash: grid.warpSourceHash,
    baseSourceHash: grid.baseSourceHash,
    flowSourceHash: grid.flowSourceHash,
    flowScalarSourceHash: grid.flowScalarSourceHash,
    width: grid.width,
    height: grid.height,
    values: grid.values,
  });

  next.domainWarpFields ??= {};
  next.domainWarpFields[next.warpSource.id] = grid;

  return {
    state: next,
    evidence: {
      fieldSourceHash: next.fieldSourceHash,
      flowFieldSourceHash: next.flowFieldSourceHash,
      flowSourceHash: next.flowSourceHash,
      warpSourceHash: next.warpSourceHash,
      fieldHash: grid.fieldHash,
      width,
      height,
      cells: values.length,
      min: grid.min,
      max: grid.max,
      mean: grid.mean,
      maxDisplacement: grid.maxDisplacement,
    },
  };
}, 'Sample a bounded rebuildable scalar grid through retained vector-flow domain displacement while keeping grid resolution derived.');

export const DOMAIN_WARP_HANDS = [
  normalizeDomainWarpRequestHand,
  buildDomainWarpGridHand,
];

export const DOMAIN_WARP_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.field.domain-warp2d',
  version: '0.1.0',
  stages: [
    { id: 'normalize-domain-warp-source', hand: 'fx.field.domain-warp-source-normalize', params: {} },
    { id: 'build-domain-warp-grid', hand: 'fx.field.domain-warp-grid-build', params: { width: 48, height: 32, maxCells: 16384 } },
  ],
});

export function makeDomainWarpState(options = {}) {
  const base = makeScalarFieldState(options.field ?? {});
  const flow = makeFieldFlowState({
    id: options.flow?.id ?? 'domain-warp-flow',
    mode: options.flow?.mode ?? 'tangent',
    sampleStep: options.flow?.sampleStep ?? 0.015625,
    strength: options.flow?.strength ?? 1,
    field: options.flowField ?? { id: 'domain-warp-flow-source', seed: 7331, frequency: 3.5 },
  });
  return {
    schema: 'axm.effect-work-state/v0.1',
    fieldRequest: base.fieldRequest,
    flowFieldRequest: flow.fieldRequest,
    flowRequest: flow.flowRequest,
    warpRequest: {
      id: options.id ?? 'domain-warp',
      amplitude: options.amplitude ?? 0.12,
    },
    domainWarpFields: {},
  };
}
