import fs from 'node:fs';
import path from 'node:path';
import { createHandRegistry, executeHandGraph } from '../src/hand-runtime.mjs';
import { HOLOGRAM_HANDS, HOLOGRAPHIC_PANEL_GRAPH, makeHologramInitialState } from '../src/hologram-hands.mjs';

const registry = createHandRegistry(HOLOGRAM_HANDS);
const run = executeHandGraph({
  registry,
  graph: HOLOGRAPHIC_PANEL_GRAPH,
  initialState: makeHologramInitialState(20260915, 'stable'),
  context: { callerKind: 'deterministic-program' },
});

const out = path.resolve('out');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'hologram-panel.svg'), run.finalState.realizations.svgPreview.content);
fs.writeFileSync(path.join(out, 'hologram-panel.html'), run.finalState.realizations.htmlDemo.content);
fs.writeFileSync(path.join(out, 'hologram-state.json'), JSON.stringify({
  schema: run.schema,
  graph: run.graph,
  finalStateHash: run.finalStateHash,
  executedStageIds: run.executedStageIds,
  canonical: {
    effect: run.finalState.effect,
    geometry: run.finalState.geometry,
    fields: run.finalState.fields,
    layers: run.finalState.layers,
    motion: run.finalState.motion,
  },
}, null, 2) + '\n');

console.log(`HOLOGRAM_DEMO_OK stages=${run.executedStageIds.length} hash=${run.finalStateHash}`);
