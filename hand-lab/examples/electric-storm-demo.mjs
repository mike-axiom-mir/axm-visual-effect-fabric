import { writeFile } from 'node:fs/promises';
import { createHandRegistry, executeHandGraph, resumeHandGraph } from '../src/hand-runtime.mjs';
import { ELECTRIC_HANDS, ELECTRIC_STORM_GRAPH, makeElectricInitialState } from '../src/electric-hands.mjs';

const registry = createHandRegistry(ELECTRIC_HANDS);
const original = executeHandGraph({
  registry,
  graph: ELECTRIC_STORM_GRAPH,
  initialState: makeElectricInitialState(20260915),
  context: { callerKind: 'mirror-deterministic' },
});
const branchCheckpoint = original.checkpoints.find((checkpoint) => checkpoint.stageId === 'grow-branches');
const edited = resumeHandGraph({
  registry,
  graph: ELECTRIC_STORM_GRAPH,
  checkpoint: branchCheckpoint,
  edits: [
    { op: 'set', path: ['effect', 'controls', 'branchEnergyScale'], value: 0.34 },
    { op: 'set', path: ['effect', 'controls', 'glowScale'], value: 0.66 },
    { op: 'set', path: ['paths', 2, 'points', 1, 'x'], value: 0.49 },
  ],
  context: { callerKind: 'deterministic-program' },
});

const outDir = new URL('../out/', import.meta.url);
await writeFile(new URL('electric-storm-original.svg', outDir), original.finalState.realizations.svgPreview.content).catch(async (error) => {
  if (error.code !== 'ENOENT') throw error;
  const { mkdir } = await import('node:fs/promises');
  await mkdir(outDir, { recursive: true });
  await writeFile(new URL('electric-storm-original.svg', outDir), original.finalState.realizations.svgPreview.content);
});
await writeFile(new URL('electric-storm-edited.svg', outDir), edited.finalState.realizations.svgPreview.content);
await writeFile(new URL('electric-storm-run.json', outDir), `${JSON.stringify({ original, edited }, null, 2)}\n`);

console.log(JSON.stringify({
  graph: ELECTRIC_STORM_GRAPH.id,
  hands: ELECTRIC_STORM_GRAPH.stages.length,
  originalHash: original.finalStateHash,
  editedHash: edited.finalStateHash,
  replayedStages: edited.executedStageIds,
  originalPathCount: original.finalState.paths.length,
  editedPathCount: edited.finalState.paths.length,
}, null, 2));
