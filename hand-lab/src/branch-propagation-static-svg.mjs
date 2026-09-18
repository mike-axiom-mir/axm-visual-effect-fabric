import { deepClone, hashValue } from './hand-runtime.mjs';
import {
  BRANCH_GROWTH_2D_HANDS,
  makeBranchGrowth2dState,
  realizeBranchGrowthStaticSvgHand,
} from './branch-growth2d.mjs';
import {
  PROPAGATION_FRONT_HANDS,
  makePropagationFrontState,
} from './propagation-front1d.mjs';
import {
  BRANCH_PROPAGATION_HANDS,
  validateBranchPropagationEnvelope,
} from './branch-propagation-envelope.mjs';

const HARD_MAX_SEGMENTS = 4096;
const round6 = (value) => Number(Number(value).toFixed(6));

const FIXED_RENDER_MAPPING = Object.freeze({
  algorithm: 'branch-propagation-static-svg/v0.1',
  segmentWeight: 'mean-endpoint-weight',
  expression: 'svg-line-local-opacity',
  originWeight: 'root-start-weight',
  fullWeightNoOp: 'omit-local-opacity-attribute-at-weight-1',
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

function boundedInteger(value, min, max, label) {
  const number = finite(value, label);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(`${label} must be an integer within [${min},${max}]`);
  }
  return number;
}

function selectionKey(next) {
  const branchId = next.branchGrowthSource?.id;
  const propagationId = next.propagationFrontSource?.id;
  if (!branchId || !propagationId) {
    throw new Error('branch propagation SVG requires retained branch and propagation source state');
  }
  return `${branchId}::${propagationId}`;
}

function localWeight(startWeight, endWeight) {
  return round6((Number(startWeight) + Number(endWeight)) / 2);
}

function applyLocalOpacity(element, weight) {
  if (weight >= 1) return element;
  return element.replace('/>', ` opacity="${weight}"/>`);
}

function mapEnvelopeIntoSvg(baseContent, envelope, showOrigin) {
  let lineIndex = 0;
  const contentWithLines = baseContent.replace(/<line data-segment="[^"]*"[^>]*\/>/g, (line) => {
    const row = envelope.segments[lineIndex];
    if (!row) throw new Error('branch propagation SVG donor emitted more segments than the verified envelope');
    lineIndex += 1;
    return applyLocalOpacity(line, localWeight(row.startWeight, row.endWeight));
  });
  if (lineIndex !== envelope.segmentCount) {
    throw new Error(`branch propagation SVG donor segment count mismatch: expected ${envelope.segmentCount}, got ${lineIndex}`);
  }

  if (!showOrigin) return contentWithLines;
  const root = envelope.segments.find((row) => row.parentId === null);
  if (!root) throw new Error('branch propagation SVG envelope has no root segment');
  let originCount = 0;
  const contentWithOrigin = contentWithLines.replace(/<circle [^>]*\/>/g, (circle) => {
    originCount += 1;
    if (originCount > 1) throw new Error('branch propagation SVG donor emitted multiple origin markers');
    return applyLocalOpacity(circle, root.startWeight);
  });
  if (originCount !== 1) throw new Error('branch propagation SVG donor did not emit the requested origin marker');
  return contentWithOrigin;
}

export const realizeBranchPropagationStaticSvgHand = hand('fx.growth.branching2d-propagation-front-static-svg-realize', (state, params = {}) => {
  const next = deepClone(state);
  const key = selectionKey(next);
  const envelope = next.branchPropagationEnvelopes?.[key];
  if (!envelope) throw new Error(`branch propagation SVG requires derived envelope ${key}`);

  const maxSegments = boundedInteger(params.maxSegments ?? HARD_MAX_SEGMENTS, 1, HARD_MAX_SEGMENTS, 'branchPropagationSvg.maxSegments');

  // This validator rebuilds the selected branch network from retained branch
  // truth and then freshly re-derives the envelope from retained propagation
  // truth at the selected phase. Hash consistency alone is not sufficient.
  validateBranchPropagationEnvelope(next, envelope, { maxSegments });

  const network = next.branchGrowthNetworks?.[next.branchGrowthSource.id];
  if (!network || network.networkHash !== envelope.networkHash) {
    throw new Error('branch propagation SVG selected network lineage mismatch');
  }

  const donorParams = {
    width: params.width ?? 640,
    height: params.height ?? 420,
    strokeWidth: params.strokeWidth ?? 1.5,
    opacity: params.opacity ?? 0.9,
    showOrigin: params.showOrigin === undefined ? true : Boolean(params.showOrigin),
    originRadius: params.originRadius ?? 2.5,
  };

  // Reuse the existing branch SVG renderer in a disposable render view. Its
  // projection, escaping, layout bounds and SVG serialization stay owned by
  // that donor; only the verified neutral envelope is expressed afterward as
  // local opacity. No renderer state is promoted into either retained source.
  const donorResult = realizeBranchGrowthStaticSvgHand.execute(deepClone(next), donorParams, {});
  const donorRealization = donorResult.state.realizations?.branchGrowthStaticSvg;
  if (!donorRealization) throw new Error('branch propagation SVG donor did not produce a realization');
  if (donorRealization.sourceHash !== next.branchGrowthSourceHash) {
    throw new Error('branch propagation SVG donor source lineage mismatch');
  }
  if (donorRealization.networkHash !== envelope.networkHash) {
    throw new Error('branch propagation SVG donor network lineage mismatch');
  }

  const content = mapEnvelopeIntoSvg(donorRealization.content, envelope, donorRealization.renderControls.showOrigin);
  const realization = {
    schema: 'axm.vfx.branch-propagation-static-svg/v0.1',
    mediaType: donorRealization.mediaType,
    renderer: 'axm.vfx.branch-propagation-static-svg/v0.1',
    rendererDonor: 'hand-lab/src/branch-growth2d.mjs#fx.growth.branching2d-static-svg-realize',
    rendererMapping: FIXED_RENDER_MAPPING,
    branchSourceHash: next.branchGrowthSourceHash,
    networkHash: envelope.networkHash,
    propagationSourceHash: next.propagationFrontSourceHash,
    envelopeHash: envelope.envelopeHash,
    phase: envelope.phase,
    renderControls: donorRealization.renderControls,
    derivedFromStateHash: hashValue({
      branchSourceHash: next.branchGrowthSourceHash,
      networkHash: envelope.networkHash,
      propagationSourceHash: next.propagationFrontSourceHash,
      envelopeHash: envelope.envelopeHash,
      phase: envelope.phase,
      rendererMapping: FIXED_RENDER_MAPPING,
      renderControls: donorRealization.renderControls,
    }),
    content,
  };
  realization.contentHash = hashValue(content);

  next.realizations ??= {};
  next.realizations.branchPropagationStaticSvg = realization;

  return {
    state: next,
    evidence: {
      renderer: realization.renderer,
      rendererDonor: realization.rendererDonor,
      branchSourceHash: realization.branchSourceHash,
      networkHash: realization.networkHash,
      propagationSourceHash: realization.propagationSourceHash,
      envelopeHash: realization.envelopeHash,
      phase: realization.phase,
      segmentCount: envelope.segmentCount,
      contentHash: realization.contentHash,
      bytes: Buffer.byteLength(content),
      maxSegments,
      hardMaxSegments: HARD_MAX_SEGMENTS,
      externalSourceReuse: 'none',
      performanceMeasurement: 'NOT_TESTED',
      visualInspection: 'NOT_TESTED',
      targetDevicePerformance: 'NOT_TESTED',
    },
  };
}, 'Render one source-verified branch propagation envelope through the existing replaceable branch SVG donor, mapping neutral weights only into disposable local opacity.');

export const BRANCH_PROPAGATION_STATIC_SVG_HANDS = [
  ...BRANCH_GROWTH_2D_HANDS,
  ...PROPAGATION_FRONT_HANDS,
  ...BRANCH_PROPAGATION_HANDS,
  realizeBranchPropagationStaticSvgHand,
];

export const BRANCH_PROPAGATION_STATIC_SVG_GRAPH = Object.freeze({
  schema: 'axm.hand-graph/v0.1',
  id: 'fx.growth.branching2d-propagation-front-static-svg',
  version: '0.1.0',
  stages: [
    { id: 'normalize-growth-source', hand: 'fx.growth.branching2d-source-normalize', params: {} },
    { id: 'build-growth-network', hand: 'fx.growth.branching2d-network-build', params: { maxSegments: 4096 } },
    { id: 'normalize-propagation-source', hand: 'fx.animation.propagation-front1d-source-normalize', params: {} },
    { id: 'build-propagation-envelope', hand: 'fx.growth.branching2d-propagation-front-envelope-build', params: { phase: 0.5, maxSegments: 4096 } },
    { id: 'realize-propagation-svg', hand: realizeBranchPropagationStaticSvgHand.id, params: { width: 640, height: 420, strokeWidth: 1.5, opacity: 0.9, showOrigin: true } },
  ],
});

export function makeBranchPropagationStaticSvgState(options = {}) {
  const branch = makeBranchGrowth2dState(options);
  const propagation = makePropagationFrontState({
    id: options.propagationId ?? 'branch-propagation-front',
    direction: options.direction ?? 'forward',
    frontSoftness: options.frontSoftness ?? 0.125,
  });
  return {
    ...branch,
    propagationFrontRequest: propagation.propagationFrontRequest,
    propagationFrontSamples: {},
    branchPropagationEnvelopes: {},
  };
}
