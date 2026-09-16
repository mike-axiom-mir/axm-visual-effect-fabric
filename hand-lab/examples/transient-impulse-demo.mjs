import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHandRegistry, executeHandGraph } from '../src/hand-runtime.mjs';
import {
  TRANSIENT_IMPULSE_GRAPH,
  TRANSIENT_IMPULSE_HANDS,
  makeTransientImpulseState,
} from '../src/transient-impulse-hands.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../out');
await mkdir(outDir, { recursive: true });

const registry = createHandRegistry(TRANSIENT_IMPULSE_HANDS);
const cases = [
  {
    name: 'directional',
    state: makeTransientImpulseState({
      id: 'directional-impulse',
      seed: 20260916,
      origin: [0.47, 0.53],
      direction: [1, -0.18],
      energy: 1.18,
      radius: 0.31,
      duration: 0.76,
      tint: [0.16, 0.9, 1],
      accent: [1, 0.48, 0.16],
      controls: {
        symmetry: 0.14,
        directionality: 0.96,
        fragmentation: 0.82,
        ringWeight: 0.64,
        spokeWeight: 1.18,
      },
    }),
  },
  {
    name: 'symmetric',
    state: makeTransientImpulseState({
      id: 'symmetric-impulse',
      seed: 20260916,
      origin: [0.5, 0.5],
      direction: [0, -1],
      energy: 0.88,
      radius: 0.34,
      duration: 1.05,
      tint: [0.34, 0.7, 1],
      accent: [0.82, 0.42, 1],
      controls: {
        symmetry: 0.98,
        directionality: 0.12,
        fragmentation: 0.03,
        ringWeight: 1.22,
        spokeWeight: 0.38,
      },
    }),
  },
];

const evidence = {
  schema: 'axm.vfx.transient-impulse-demo-evidence/v0.1',
  graph: TRANSIENT_IMPULSE_GRAPH.id,
  cases: [],
  truthBoundary: [
    'The event state is canonical input for this bounded effect graph; rings, spokes, fragments, envelope samples and SVG are derived/rebuildable.',
    'These SVGs prove deterministic generation and provide inspectable visual artifacts; aesthetic quality is not promoted unless a human/device actually inspects the rendered output.',
    'The two cases are consumer-neutral shape challenges, not game/UI integration acceptance.',
  ],
};

for (const item of cases) {
  const run = executeHandGraph({
    registry,
    graph: TRANSIENT_IMPULSE_GRAPH,
    initialState: item.state,
    context: { callerKind: 'demo' },
  });
  const realization = run.finalState.realizations.transientImpulseSvg;
  await writeFile(resolve(outDir, `transient-impulse-${item.name}.svg`), realization.content, 'utf8');
  evidence.cases.push({
    name: item.name,
    finalStateHash: run.finalStateHash,
    canonicalEventHash: run.finalState.eventCanonicalHash,
    fieldGeometryHash: run.finalState.impulseField.geometryHash,
    counts: run.finalState.impulseField.counts,
    renderer: realization.renderer,
    bytes: Buffer.byteLength(realization.content),
  });
}

await writeFile(
  resolve(outDir, 'transient-impulse-evidence.json'),
  `${JSON.stringify(evidence, null, 2)}\n`,
  'utf8',
);

console.log(JSON.stringify(evidence, null, 2));
