import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHandRegistry, executeHandGraph } from '../src/hand-runtime.mjs';
import { makeTransientImpulseState } from '../src/transient-impulse-hands.mjs';
import {
  TRANSIENT_IMPULSE_CANVAS_GRAPH,
  TRANSIENT_IMPULSE_CANVAS_HANDS,
} from '../src/transient-impulse-canvas.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../out');
await mkdir(outDir, { recursive: true });
const registry = createHandRegistry(TRANSIENT_IMPULSE_CANVAS_HANDS);

const cases = [
  {
    name: 'directional',
    state: makeTransientImpulseState({
      id: 'directional-canvas-impulse', seed: 20260916, origin: [0.47, 0.53], direction: [1, -0.18], energy: 1.18, radius: 0.31, duration: 0.76,
      tint: [0.16, 0.9, 1], accent: [1, 0.48, 0.16],
      controls: { symmetry: 0.14, directionality: 0.96, fragmentation: 0.82, ringWeight: 0.64, spokeWeight: 1.18 },
    }),
  },
  {
    name: 'symmetric',
    state: makeTransientImpulseState({
      id: 'symmetric-canvas-impulse', seed: 20260916, origin: [0.5, 0.5], direction: [0, -1], energy: 0.88, radius: 0.34, duration: 1.05,
      tint: [0.34, 0.7, 1], accent: [0.82, 0.42, 1],
      controls: { symmetry: 0.98, directionality: 0.12, fragmentation: 0.03, ringWeight: 1.22, spokeWeight: 0.38 },
    }),
  },
];

const evidence = {
  schema: 'axm.vfx.transient-impulse-canvas-demo-evidence/v0.1',
  graph: TRANSIENT_IMPULSE_CANVAS_GRAPH.id,
  cases: [],
  truthBoundary: [
    'Canvas2D consumes the same canonical transient-event contract, derived field geometry and envelope as the SVG path.',
    'The generated HTML is a replaceable renderer artifact; it is not source truth and does not upgrade the effect into a consumer-specific event.',
    'Successful generation and tests do not prove aesthetic quality, target-device readability or frame-time performance until directly observed/measured.',
  ],
};

for (const item of cases) {
  const run = executeHandGraph({ registry, graph: TRANSIENT_IMPULSE_CANVAS_GRAPH, initialState: item.state, context: { callerKind: 'demo' } });
  const realization = run.finalState.realizations.transientImpulseCanvas2d;
  await writeFile(resolve(outDir, `transient-impulse-canvas-${item.name}.html`), realization.content, 'utf8');
  evidence.cases.push({
    name: item.name,
    finalStateHash: run.finalStateHash,
    canonicalEventHash: run.finalState.eventCanonicalHash,
    fieldGeometryHash: run.finalState.impulseField.geometryHash,
    counts: run.finalState.impulseField.counts,
    envelopeSamples: run.finalState.impulseEnvelope.samples.length,
    renderer: realization.renderer,
    derivedFromStateHash: realization.derivedFromStateHash,
    bytes: Buffer.byteLength(realization.content),
  });
}

await writeFile(resolve(outDir, 'transient-impulse-canvas-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(evidence, null, 2));
