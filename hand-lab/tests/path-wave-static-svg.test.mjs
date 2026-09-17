import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph, hashValue } from '../src/hand-runtime.mjs';
import {
  PATH_FLOW_STATIC_SVG_GRAPH,
  PATH_FLOW_STATIC_SVG_HANDS,
  makePathFlowStaticSvgState,
} from '../src/path-flow-static-svg.mjs';
import {
  buildWaveDisplacedPathSetHand,
  makePathWaveDisplacementState,
  normalizePathWaveDisplacementHand,
} from '../src/path-wave-displacement.mjs';
import {
  PATH_WAVE_STATIC_SVG_GRAPH,
  PATH_WAVE_STATIC_SVG_HANDS,
  makePathWaveStaticSvgState,
  pathWaveStaticSvgHand,
} from '../src/path-wave-static-svg.mjs';

const waveRegistry = createHandRegistry(PATH_WAVE_STATIC_SVG_HANDS);
const flowRegistry = createHandRegistry(PATH_FLOW_STATIC_SVG_HANDS);

function runWave(state, callerKind = 'test', graph = PATH_WAVE_STATIC_SVG_GRAPH) {
  return executeHandGraph({ registry: waveRegistry, graph, initialState: state, context: { callerKind } });
}

function runFlow(state, callerKind = 'test', graph = PATH_FLOW_STATIC_SVG_GRAPH) {
  return executeHandGraph({ registry: flowRegistry, graph, initialState: state, context: { callerKind } });
}

function selected(result, id = 'waved') {
  return result.finalState.waveDisplacedPathSets[id];
}

function realization(result) {
  return result.finalState.realizations.pathWaveStaticSvg;
}

function graphWithRendererParams(params) {
  return {
    ...PATH_WAVE_STATIC_SVG_GRAPH,
    stages: [
      PATH_WAVE_STATIC_SVG_GRAPH.stages[0],
      PATH_WAVE_STATIC_SVG_GRAPH.stages[1],
      {
        ...PATH_WAVE_STATIC_SVG_GRAPH.stages[2],
        params: { ...PATH_WAVE_STATIC_SVG_GRAPH.stages[2].params, ...params },
      },
    ],
  };
}

function neutralPaths() {
  return [
    {
      id: 'neutral-a',
      role: 'primary',
      points: [
        { x: 0.08, y: 0.22, tag: 'start' },
        { x: 0.28, y: 0.38 },
        { x: 0.53, y: 0.5 },
        { x: 0.76, y: 0.67 },
        { x: 0.92, y: 0.82, tag: 'end' },
      ],
    },
    {
      id: 'neutral-b',
      role: 'secondary',
      points: [
        { x: 0.14, y: 0.76 },
        { x: 0.39, y: 0.66 },
        { x: 0.66, y: 0.53 },
        { x: 0.86, y: 0.4 },
      ],
    },
  ];
}

function verticalPaths() {
  return [{
    id: 'vertical',
    points: [
      { x: 0.48, y: 0.08 },
      { x: 0.5, y: 0.3 },
      { x: 0.47, y: 0.55 },
      { x: 0.52, y: 0.78 },
      { x: 0.5, y: 0.93 },
    ],
  }];
}

function waveOptions(overrides = {}) {
  return {
    id: 'waved',
    amplitude: 0.06,
    cycles: 2.25,
    phase: 0.125,
    endpointEnvelope: true,
    ...overrides,
  };
}

function derivedPointStrings(svg) {
  return [...svg.matchAll(/<polyline data-layer="derived"[^>]* points="([^"]+)"\/>/g)].map((match) => match[1]);
}

test('wave path SVG is deterministic and caller-neutral while canonical paths stay untouched', () => {
  const paths = neutralPaths();
  const initial = makePathWaveStaticSvgState(paths, waveOptions());
  const canonicalHash = hashValue(initial.paths);
  const human = runWave(initial, 'human');
  const machine = runWave(initial, 'machine');
  const humanSvg = realization(human);
  const machineSvg = realization(machine);

  assert.equal(human.finalStateHash, machine.finalStateHash);
  assert.equal(humanSvg.content, machineSvg.content);
  assert.equal(humanSvg.artifactHash, machineSvg.artifactHash);
  assert.equal(humanSvg.renderer, 'axm.vfx.path-wave-static-svg/v0.1');
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

test('zero-amplitude wave is an exact derived no-op and can render without a base underlay', () => {
  const paths = neutralPaths();
  const result = runWave(
    makePathWaveStaticSvgState(paths, waveOptions({ amplitude: 0, cycles: 19.5, phase: 0.47 })),
    'test',
    graphWithRendererParams({ showBase: false }),
  );
  const waved = selected(result);
  const svg = realization(result);

  assert.deepEqual(waved.paths, paths);
  assert.equal(waved.maxDisplacement, 0);
  assert.deepEqual(result.finalState.paths, paths);
  assert.doesNotMatch(svg.content, /data-layer="base-paths"/);
  assert.equal((svg.content.match(/data-layer="derived"/g) ?? []).length, paths.length);
});

test('renderer controls are disposable and do not rewrite retained or derived wave state', () => {
  const paths = neutralPaths();
  const initial = makePathWaveStaticSvgState(paths, waveOptions());
  const compact = runWave(initial, 'test', graphWithRendererParams({ width: 320, height: 240, strokeWidth: 1, showBase: false }));
  const large = runWave(initial, 'test', graphWithRendererParams({ width: 960, height: 640, strokeWidth: 3.5, showBase: true, baseOpacity: 0.18 }));

  assert.equal(compact.finalState.pathSourceHash, large.finalState.pathSourceHash);
  assert.equal(compact.finalState.pathWaveSourceHash, large.finalState.pathWaveSourceHash);
  assert.equal(selected(compact).pathSetHash, selected(large).pathSetHash);
  assert.deepEqual(compact.finalState.paths, paths);
  assert.deepEqual(large.finalState.paths, paths);
  assert.notEqual(realization(compact).content, realization(large).content);
  assert.notEqual(realization(compact).artifactHash, realization(large).artifactHash);
});

test('one shared static path projection core serves flow and wave families without collapsing lineage', () => {
  const paths = neutralPaths();
  const wave = runWave(
    makePathWaveStaticSvgState(paths, waveOptions({ amplitude: 0 })),
    'test',
    graphWithRendererParams({ showBase: false, width: 700, height: 440, padding: 24 }),
  );
  const flowGraph = {
    ...PATH_FLOW_STATIC_SVG_GRAPH,
    stages: [
      PATH_FLOW_STATIC_SVG_GRAPH.stages[0],
      PATH_FLOW_STATIC_SVG_GRAPH.stages[1],
      {
        ...PATH_FLOW_STATIC_SVG_GRAPH.stages[2],
        params: { ...PATH_FLOW_STATIC_SVG_GRAPH.stages[2].params, showBase: false, width: 700, height: 440, padding: 24 },
      },
    ],
  };
  const flow = runFlow(makePathFlowStaticSvgState(paths, {
    id: 'guided',
    amplitude: 0,
    endpointEnvelope: true,
    field: { id: 'shared-core-field', seed: 2026, frequency: 5.5, octaves: 4, lacunarity: 2, gain: 0.5 },
    flow: { id: 'shared-core-flow', mode: 'tangent', strength: 1, sampleStep: 0.015625 },
  }), 'test', flowGraph);

  const waveSvg = realization(wave);
  const flowSvg = flow.finalState.realizations.pathFlowStaticSvg;
  assert.deepEqual(derivedPointStrings(waveSvg.content), derivedPointStrings(flowSvg.content));
  assert.notEqual(waveSvg.renderer, flowSvg.renderer);
  assert.notEqual(waveSvg.displacementSourceHash, flowSvg.displacementSourceHash);
  assert.equal(waveSvg.pathSourceHash, flowSvg.pathSourceHash);
  assert.deepEqual(wave.finalState.paths, paths);
  assert.deepEqual(flow.finalState.paths, paths);
});

test('shared wave realization handles materially different path forms without consumer-specific meaning', () => {
  const diagonal = runWave(makePathWaveStaticSvgState(neutralPaths(), waveOptions()));
  const vertical = runWave(makePathWaveStaticSvgState(verticalPaths(), waveOptions()));

  assert.equal(realization(diagonal).renderer, realization(vertical).renderer);
  assert.notEqual(selected(diagonal).pathSetHash, selected(vertical).pathSetHash);
  assert.notEqual(realization(diagonal).artifactHash, realization(vertical).artifactHash);
  assert.deepEqual(diagonal.finalState.paths, neutralPaths());
  assert.deepEqual(vertical.finalState.paths, verticalPaths());
});

test('wave renderer rejects canonical drift, self-consistent derived tampering and forged semantics', () => {
  const paths = neutralPaths();
  const normalized = normalizePathWaveDisplacementHand.execute(makePathWaveDisplacementState(paths, waveOptions()), {}).state;
  const built = buildWaveDisplacedPathSetHand.execute(normalized, {}).state;

  const pathDrift = structuredClone(built);
  pathDrift.paths[0].points[1].x += 0.01;
  assert.throws(() => pathWaveStaticSvgHand.execute(pathDrift, {}), /path-wave SVG base path hash mismatch/);

  const derivedDrift = structuredClone(built);
  derivedDrift.waveDisplacedPathSets.waved.paths[0].points[1].x = 0.123456;
  const tamperedSet = derivedDrift.waveDisplacedPathSets.waved;
  const payload = structuredClone(tamperedSet);
  delete payload.pathSetHash;
  tamperedSet.pathSetHash = hashValue(payload);
  assert.throws(
    () => pathWaveStaticSvgHand.execute(derivedDrift, {}),
    /path-wave SVG selected path set does not match retained sources/,
  );

  const semanticTamper = structuredClone(built);
  semanticTamper.pathWaveSource.tangentMethod = 'forward-only';
  semanticTamper.pathWaveSourceHash = hashValue(semanticTamper.pathWaveSource);
  semanticTamper.waveDisplacedPathSets.waved.displacementSourceHash = semanticTamper.pathWaveSourceHash;
  const forgedPayload = structuredClone(semanticTamper.waveDisplacedPathSets.waved);
  delete forgedPayload.pathSetHash;
  semanticTamper.waveDisplacedPathSets.waved.pathSetHash = hashValue(forgedPayload);
  assert.throws(
    () => pathWaveStaticSvgHand.execute(semanticTamper, {}),
    /path wave tangent method mismatch/,
  );
});

test('wave renderer escapes retained ids and fails explicitly on invalid layout or point budgets', () => {
  const paths = [{
    id: `wave<&"'`,
    points: [
      { x: 0.1, y: 0.2 },
      { x: 0.45, y: 0.52 },
      { x: 0.9, y: 0.78 },
    ],
  }];
  const rendered = runWave(makePathWaveStaticSvgState(paths, waveOptions()));
  assert.match(realization(rendered).content, /data-path-id="wave&lt;&amp;&quot;&apos;"/);

  assert.throws(
    () => runWave(makePathWaveStaticSvgState(neutralPaths(), waveOptions()), 'test', graphWithRendererParams({ maxPoints: 4 })),
    /pathWaveSvg point budget exceeded/,
  );
  assert.throws(
    () => runWave(makePathWaveStaticSvgState(paths, waveOptions()), 'test', graphWithRendererParams({ width: 63 })),
    /pathWaveSvg\.width must be an integer within \[64,4096\]/,
  );
  assert.throws(
    () => runWave(makePathWaveStaticSvgState(paths, waveOptions()), 'test', graphWithRendererParams({ width: 100, height: 100, padding: 50 })),
    /pathWaveSvg\.padding must leave a positive drawable area/,
  );
  assert.throws(
    () => runWave(makePathWaveStaticSvgState(paths, waveOptions()), 'test', graphWithRendererParams({ showBase: 'yes' })),
    /pathWaveSvg\.showBase must be boolean/,
  );
});
