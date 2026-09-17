import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph, hashValue } from '../src/hand-runtime.mjs';
import {
  buildFlowGuidedPathSetHand,
  makePathFlowDisplacementState,
  normalizePathFlowDisplacementHand,
} from '../src/path-flow-displacement.mjs';
import {
  PATH_FLOW_STATIC_SVG_GRAPH,
  PATH_FLOW_STATIC_SVG_HANDS,
  makePathFlowStaticSvgState,
  pathFlowStaticSvgHand,
} from '../src/path-flow-static-svg.mjs';

const registry = createHandRegistry(PATH_FLOW_STATIC_SVG_HANDS);

function run(state, callerKind = 'test', graph = PATH_FLOW_STATIC_SVG_GRAPH) {
  return executeHandGraph({ registry, graph, initialState: state, context: { callerKind } });
}

function selected(result, id = 'guided') {
  return result.finalState.flowGuidedPathSets[id];
}

function realization(result) {
  return result.finalState.realizations.pathFlowStaticSvg;
}

function graphWithRendererParams(params) {
  return {
    ...PATH_FLOW_STATIC_SVG_GRAPH,
    stages: [
      PATH_FLOW_STATIC_SVG_GRAPH.stages[0],
      PATH_FLOW_STATIC_SVG_GRAPH.stages[1],
      {
        ...PATH_FLOW_STATIC_SVG_GRAPH.stages[2],
        params: { ...PATH_FLOW_STATIC_SVG_GRAPH.stages[2].params, ...params },
      },
    ],
  };
}

function diagonalPaths() {
  return [
    {
      id: 'diagonal-a',
      role: 'neutral-primary',
      points: [
        { x: 0.08, y: 0.2, tag: 'start' },
        { x: 0.28, y: 0.36, tag: 'mid-a' },
        { x: 0.52, y: 0.54, tag: 'mid-b' },
        { x: 0.9, y: 0.82, tag: 'end' },
      ],
    },
    {
      id: 'diagonal-b',
      role: 'neutral-secondary',
      points: [
        { x: 0.16, y: 0.72 },
        { x: 0.42, y: 0.62 },
        { x: 0.7, y: 0.5 },
      ],
    },
  ];
}

function verticalPaths() {
  return [
    {
      id: 'vertical-a',
      role: 'neutral-primary',
      points: [
        { x: 0.44, y: 0.08 },
        { x: 0.48, y: 0.31 },
        { x: 0.5, y: 0.58 },
        { x: 0.53, y: 0.91 },
      ],
    },
    {
      id: 'vertical-b',
      role: 'neutral-secondary',
      points: [
        { x: 0.66, y: 0.14 },
        { x: 0.63, y: 0.47 },
        { x: 0.6, y: 0.86 },
      ],
    },
  ];
}

function options(overrides = {}) {
  return {
    id: 'guided',
    amplitude: 0.08,
    endpointEnvelope: true,
    field: { id: 'path-svg-field', seed: 90210, frequency: 5.25, octaves: 5, lacunarity: 2.1, gain: 0.52 },
    flow: { id: 'path-svg-flow', mode: 'tangent', strength: 1.15, sampleStep: 0.0125 },
    ...overrides,
  };
}

test('path-flow SVG is deterministic and caller-neutral while retained path truth stays untouched', () => {
  const paths = diagonalPaths();
  const initial = makePathFlowStaticSvgState(paths, options());
  const canonicalHash = hashValue(initial.paths);
  const human = run(initial, 'human');
  const machine = run(initial, 'machine');
  const humanSvg = realization(human);
  const machineSvg = realization(machine);

  assert.equal(human.finalStateHash, machine.finalStateHash);
  assert.equal(humanSvg.content, machineSvg.content);
  assert.equal(humanSvg.artifactHash, machineSvg.artifactHash);
  assert.equal(humanSvg.renderer, 'axm.vfx.path-flow-static-svg/v0.1');
  assert.equal(humanSvg.mediaType, 'image/svg+xml');
  assert.equal(humanSvg.pathSourceHash, canonicalHash);
  assert.equal(humanSvg.derivedFromPathSetHash, selected(human).pathSetHash);
  assert.deepEqual(human.finalState.paths, paths);
  assert.deepEqual(machine.finalState.paths, paths);
  assert.equal(humanSvg.artifactHash, hashValue({ mediaType: humanSvg.mediaType, renderer: humanSvg.renderer, content: humanSvg.content }));
  assert.match(humanSvg.content, /data-layer="base-paths"/);
  assert.match(humanSvg.content, /data-layer="derived-paths"/);
  assert.ok(Buffer.byteLength(humanSvg.content) > 0);
});

test('zero-amplitude displacement remains an exact derived no-op and renders the unchanged path geometry', () => {
  const paths = diagonalPaths();
  const result = run(
    makePathFlowStaticSvgState(paths, options({
      amplitude: 0,
      flow: { id: 'zero-path-svg-flow', mode: 'gradient', strength: 1.4 },
      field: { id: 'zero-path-svg-field', seed: 2026, frequency: 6.5 },
    })),
    'test',
    graphWithRendererParams({ showBase: false }),
  );
  const guided = selected(result);
  const svg = realization(result);

  assert.deepEqual(guided.paths, paths);
  assert.equal(guided.maxDisplacement, 0);
  assert.deepEqual(result.finalState.paths, paths);
  assert.doesNotMatch(svg.content, /data-layer="base-paths"/);
  assert.equal((svg.content.match(/data-layer="derived"/g) ?? []).length, paths.length);
});

test('renderer controls are disposable and do not rewrite retained or derived path state', () => {
  const paths = diagonalPaths();
  const initial = makePathFlowStaticSvgState(paths, options());
  const compact = run(initial, 'test', graphWithRendererParams({ width: 320, height: 240, strokeWidth: 1, showBase: false }));
  const large = run(initial, 'test', graphWithRendererParams({ width: 960, height: 640, strokeWidth: 3.5, showBase: true, baseOpacity: 0.18 }));

  assert.equal(compact.finalState.pathSourceHash, large.finalState.pathSourceHash);
  assert.equal(compact.finalState.fieldSourceHash, large.finalState.fieldSourceHash);
  assert.equal(compact.finalState.flowSourceHash, large.finalState.flowSourceHash);
  assert.equal(compact.finalState.pathFlowSourceHash, large.finalState.pathFlowSourceHash);
  assert.equal(selected(compact).pathSetHash, selected(large).pathSetHash);
  assert.deepEqual(compact.finalState.paths, paths);
  assert.deepEqual(large.finalState.paths, paths);
  assert.notEqual(realization(compact).content, realization(large).content);
  assert.notEqual(realization(compact).artifactHash, realization(large).artifactHash);
});

test('same retained paths and scalar field produce distinct gradient and tangent deformation artifacts', () => {
  const paths = diagonalPaths();
  const common = {
    id: 'guided',
    amplitude: 0.1,
    endpointEnvelope: true,
    field: { id: 'same-render-field', seed: 123, frequency: 6.5, octaves: 4, lacunarity: 2.2, gain: 0.48 },
  };
  const gradient = run(makePathFlowStaticSvgState(paths, {
    ...common,
    flow: { id: 'gradient-render-flow', mode: 'gradient', strength: 1.2, sampleStep: 0.01 },
  }));
  const tangent = run(makePathFlowStaticSvgState(paths, {
    ...common,
    flow: { id: 'tangent-render-flow', mode: 'tangent', strength: 1.2, sampleStep: 0.01 },
  }));

  assert.equal(gradient.finalState.pathSourceHash, tangent.finalState.pathSourceHash);
  assert.equal(gradient.finalState.fieldSourceHash, tangent.finalState.fieldSourceHash);
  assert.notEqual(gradient.finalState.flowSourceHash, tangent.finalState.flowSourceHash);
  assert.notEqual(selected(gradient).pathSetHash, selected(tangent).pathSetHash);
  assert.notEqual(realization(gradient).artifactHash, realization(tangent).artifactHash);
  assert.deepEqual(gradient.finalState.paths, paths);
  assert.deepEqual(tangent.finalState.paths, paths);
});

test('one neutral renderer handles materially different diagonal and near-vertical path forms', () => {
  const common = options({
    field: { id: 'shared-form-field', seed: 5150, frequency: 4.25, octaves: 6, gain: 0.57 },
    flow: { id: 'shared-form-flow', mode: 'tangent', strength: 0.95 },
  });
  const diagonal = run(makePathFlowStaticSvgState(diagonalPaths(), common));
  const vertical = run(makePathFlowStaticSvgState(verticalPaths(), common));

  assert.equal(realization(diagonal).renderer, realization(vertical).renderer);
  assert.equal(realization(diagonal).pathCount, diagonalPaths().length);
  assert.equal(realization(vertical).pathCount, verticalPaths().length);
  assert.notEqual(selected(diagonal).pathSetHash, selected(vertical).pathSetHash);
  assert.notEqual(realization(diagonal).artifactHash, realization(vertical).artifactHash);
  assert.deepEqual(diagonal.finalState.paths, diagonalPaths());
  assert.deepEqual(vertical.finalState.paths, verticalPaths());
});

test('renderer rejects canonical drift and self-consistent derived tampering by rebuilding from retained truth', () => {
  const paths = diagonalPaths();
  const normalized = normalizePathFlowDisplacementHand.execute(makePathFlowDisplacementState(paths, options()), {}).state;
  const built = buildFlowGuidedPathSetHand.execute(normalized, {}).state;

  const pathDrift = structuredClone(built);
  pathDrift.paths[0].points[1].x += 0.01;
  assert.throws(() => pathFlowStaticSvgHand.execute(pathDrift, {}), /path-flow SVG base path hash mismatch/);

  const scalarDrift = structuredClone(built);
  scalarDrift.fieldSource.frequency += 0.25;
  assert.throws(() => pathFlowStaticSvgHand.execute(scalarDrift, {}), /path-flow SVG scalar source hash mismatch/);

  const derivedDrift = structuredClone(built);
  derivedDrift.flowGuidedPathSets.guided.paths[0].points[1].x = 0.123456;
  const tampered = derivedDrift.flowGuidedPathSets.guided;
  const payload = structuredClone(tampered);
  delete payload.pathSetHash;
  tampered.pathSetHash = hashValue(payload);
  assert.throws(
    () => pathFlowStaticSvgHand.execute(derivedDrift, {}),
    /path-flow SVG selected path set does not match retained sources/,
  );
});

test('renderer escapes retained ids and fails explicitly on invalid layout or point budgets', () => {
  const paths = [{
    id: `branch<&"'`,
    points: [
      { x: 0.1, y: 0.2 },
      { x: 0.45, y: 0.52 },
      { x: 0.9, y: 0.78 },
    ],
  }];
  const rendered = run(makePathFlowStaticSvgState(paths, options()));
  assert.match(realization(rendered).content, /data-path-id="branch&lt;&amp;&quot;&apos;"/);

  assert.throws(
    () => run(makePathFlowStaticSvgState(diagonalPaths(), options()), 'test', graphWithRendererParams({ maxPoints: 4 })),
    /pathFlowSvg point budget exceeded/,
  );
  assert.throws(
    () => run(makePathFlowStaticSvgState(paths, options()), 'test', graphWithRendererParams({ width: 63 })),
    /pathFlowSvg\.width must be an integer within \[64,4096\]/,
  );
  assert.throws(
    () => run(makePathFlowStaticSvgState(paths, options()), 'test', graphWithRendererParams({ width: 100, height: 100, padding: 50 })),
    /pathFlowSvg\.padding must leave a positive drawable area/,
  );
  assert.throws(
    () => run(makePathFlowStaticSvgState(paths, options()), 'test', graphWithRendererParams({ showBase: 'yes' })),
    /pathFlowSvg\.showBase must be boolean/,
  );
});
