import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph, hashValue } from '../src/hand-runtime.mjs';
import {
  buildBrokenPathSetHand,
  makePathBreakFragmentationState,
  normalizePathBreakFragmentationHand,
} from '../src/path-break-fragmentation.mjs';
import {
  PATH_BREAK_STATIC_SVG_GRAPH,
  PATH_BREAK_STATIC_SVG_HANDS,
  makePathBreakStaticSvgState,
  pathBreakStaticSvgHand,
} from '../src/path-break-static-svg.mjs';

const registry = createHandRegistry(PATH_BREAK_STATIC_SVG_HANDS);

function run(state, callerKind = 'test', graph = PATH_BREAK_STATIC_SVG_GRAPH) {
  return executeHandGraph({ registry, graph, initialState: state, context: { callerKind } });
}

function selected(result, id = 'broken') {
  return result.finalState.brokenPathSets[id];
}

function realization(result) {
  return result.finalState.realizations.pathBreakStaticSvg;
}

function graphWithRendererParams(params) {
  return {
    ...PATH_BREAK_STATIC_SVG_GRAPH,
    stages: [
      PATH_BREAK_STATIC_SVG_GRAPH.stages[0],
      PATH_BREAK_STATIC_SVG_GRAPH.stages[1],
      {
        ...PATH_BREAK_STATIC_SVG_GRAPH.stages[2],
        params: { ...PATH_BREAK_STATIC_SVG_GRAPH.stages[2].params, ...params },
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

function options(overrides = {}) {
  return {
    id: 'broken',
    breakCount: 2,
    gapWidth: 0.06,
    phase: 0.3,
    ...overrides,
  };
}

test('broken path SVG is deterministic and caller-neutral while canonical paths stay untouched', () => {
  const paths = neutralPaths();
  const initial = makePathBreakStaticSvgState(paths, options());
  const canonicalHash = hashValue(initial.paths);
  const human = run(initial, 'human');
  const machine = run(initial, 'machine');
  const humanSvg = realization(human);
  const machineSvg = realization(machine);

  assert.equal(human.finalStateHash, machine.finalStateHash);
  assert.equal(humanSvg.content, machineSvg.content);
  assert.equal(humanSvg.artifactHash, machineSvg.artifactHash);
  assert.equal(humanSvg.renderer, 'axm.vfx.path-break-static-svg/v0.1');
  assert.equal(humanSvg.mediaType, 'image/svg+xml');
  assert.equal(humanSvg.pathSourceHash, canonicalHash);
  assert.equal(humanSvg.derivedFromPathSetHash, selected(human).pathSetHash);
  assert.equal(humanSvg.breakSourceHash, human.finalState.pathBreakSourceHash);
  assert.deepEqual(human.finalState.paths, paths);
  assert.deepEqual(machine.finalState.paths, paths);
  assert.equal(humanSvg.artifactHash, hashValue({ mediaType: humanSvg.mediaType, renderer: humanSvg.renderer, content: humanSvg.content }));
  assert.doesNotMatch(humanSvg.content, /data-layer="base-paths"/);
  assert.equal((humanSvg.content.match(/data-layer="derived"/g) ?? []).length, selected(human).fragmentCount);
  assert.ok(Buffer.byteLength(humanSvg.content) > 0);
});

test('zero-break realization is an exact derived no-op rendered without a false canonical underlay', () => {
  const paths = neutralPaths();
  const result = run(makePathBreakStaticSvgState(paths, options({ breakCount: 0, gapWidth: 0, phase: 0.9 })));
  const broken = selected(result);
  const svg = realization(result);

  assert.deepEqual(broken.paths, paths);
  assert.equal(broken.fragmentCount, paths.length);
  assert.equal(broken.pointCount, paths.reduce((sum, path) => sum + path.points.length, 0));
  assert.deepEqual(result.finalState.paths, paths);
  assert.doesNotMatch(svg.content, /data-layer="base-paths"/);
  assert.equal((svg.content.match(/data-layer="derived"/g) ?? []).length, paths.length);
  assert.match(svg.content, /data-path-id="neutral-a"/);
  assert.match(svg.content, /data-path-id="neutral-b"/);
});

test('renderer controls are disposable and do not rewrite retained or broken path state', () => {
  const paths = neutralPaths();
  const initial = makePathBreakStaticSvgState(paths, options());
  const compact = run(initial, 'test', graphWithRendererParams({ width: 320, height: 240, strokeWidth: 1, opacity: 0.7 }));
  const large = run(initial, 'test', graphWithRendererParams({ width: 960, height: 640, strokeWidth: 3.5, opacity: 0.95, padding: 30 }));

  assert.equal(compact.finalState.pathSourceHash, large.finalState.pathSourceHash);
  assert.equal(compact.finalState.pathBreakSourceHash, large.finalState.pathBreakSourceHash);
  assert.equal(selected(compact).pathSetHash, selected(large).pathSetHash);
  assert.deepEqual(compact.finalState.paths, paths);
  assert.deepEqual(large.finalState.paths, paths);
  assert.notEqual(realization(compact).content, realization(large).content);
  assert.notEqual(realization(compact).artifactHash, realization(large).artifactHash);
});

test('one broken-path renderer handles materially different neutral path forms', () => {
  const diagonal = run(makePathBreakStaticSvgState(neutralPaths(), options()));
  const vertical = run(makePathBreakStaticSvgState(verticalPaths(), options({ breakCount: 1, gapWidth: 0.12 })));

  assert.equal(realization(diagonal).renderer, realization(vertical).renderer);
  assert.notEqual(selected(diagonal).pathSetHash, selected(vertical).pathSetHash);
  assert.notEqual(realization(diagonal).artifactHash, realization(vertical).artifactHash);
  assert.deepEqual(diagonal.finalState.paths, neutralPaths());
  assert.deepEqual(vertical.finalState.paths, verticalPaths());
});

test('broken path renderer rejects canonical drift, self-consistent derived tampering and forged semantics', () => {
  const paths = neutralPaths();
  const normalized = normalizePathBreakFragmentationHand.execute(makePathBreakFragmentationState(paths, options()), {}).state;
  const built = buildBrokenPathSetHand.execute(normalized, {}).state;

  const pathDrift = structuredClone(built);
  pathDrift.paths[0].points[1].x += 0.01;
  assert.throws(() => pathBreakStaticSvgHand.execute(pathDrift, {}), /path-break SVG base path hash mismatch/);

  const derivedDrift = structuredClone(built);
  derivedDrift.brokenPathSets.broken.paths[0].points[1].x = 0.123456;
  const tamperedSet = derivedDrift.brokenPathSets.broken;
  const payload = structuredClone(tamperedSet);
  delete payload.pathSetHash;
  tamperedSet.pathSetHash = hashValue(payload);
  assert.throws(
    () => pathBreakStaticSvgHand.execute(derivedDrift, {}),
    /path-break SVG selected path set does not match retained sources/,
  );

  const semanticTamper = structuredClone(built);
  semanticTamper.pathBreakSource.placementMode = 'random';
  semanticTamper.pathBreakSourceHash = hashValue(semanticTamper.pathBreakSource);
  semanticTamper.brokenPathSets.broken.breakSourceHash = semanticTamper.pathBreakSourceHash;
  const forgedPayload = structuredClone(semanticTamper.brokenPathSets.broken);
  delete forgedPayload.pathSetHash;
  semanticTamper.brokenPathSets.broken.pathSetHash = hashValue(forgedPayload);
  assert.throws(
    () => pathBreakStaticSvgHand.execute(semanticTamper, {}),
    /path break placement mode mismatch/,
  );
});

test('broken path renderer escapes derived fragment ids', () => {
  const paths = [{
    id: `break<&"'`,
    points: [
      { x: 0.1, y: 0.2 },
      { x: 0.45, y: 0.52 },
      { x: 0.9, y: 0.78 },
    ],
  }];
  const rendered = run(makePathBreakStaticSvgState(paths, options({ breakCount: 1, gapWidth: 0.1 })));
  assert.match(realization(rendered).content, /data-path-id="break&lt;&amp;&quot;&apos;::fragment:0"/);
});

test('broken path renderer fails explicitly on invalid layout, point budgets and false base-underlay requests', () => {
  assert.throws(
    () => run(makePathBreakStaticSvgState(neutralPaths(), options()), 'test', graphWithRendererParams({ maxPoints: 4 })),
    /pathBreakSvg point budget exceeded/,
  );
  assert.throws(
    () => run(makePathBreakStaticSvgState(verticalPaths(), options({ breakCount: 1, gapWidth: 0.1 })), 'test', graphWithRendererParams({ width: 63 })),
    /pathBreakSvg\.width must be an integer within \[64,4096\]/,
  );
  assert.throws(
    () => run(makePathBreakStaticSvgState(verticalPaths(), options({ breakCount: 1, gapWidth: 0.1 })), 'test', graphWithRendererParams({ width: 100, height: 100, padding: 50 })),
    /pathBreakSvg\.padding must leave a positive drawable area/,
  );
  assert.throws(
    () => run(makePathBreakStaticSvgState(verticalPaths(), options({ breakCount: 1, gapWidth: 0.1 })), 'test', graphWithRendererParams({ showBase: true })),
    /pathBreakSvg\.showBase must remain false/,
  );
});
