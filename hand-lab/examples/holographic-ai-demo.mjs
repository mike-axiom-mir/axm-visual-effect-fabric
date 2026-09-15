import { mkdir, writeFile } from 'node:fs/promises';
import { createHandRegistry, executeHandGraph } from '../src/hand-runtime.mjs';
import { HOLOGRAPHIC_AI_HANDS, HOLOGRAPHIC_AI_GRAPH, makeHolographicAiInitialState } from '../src/holographic-ai-hands.mjs';

const registry=createHandRegistry(HOLOGRAPHIC_AI_HANDS);
const run=executeHandGraph({
  registry,
  graph:HOLOGRAPHIC_AI_GRAPH,
  initialState:makeHolographicAiInitialState(20260915,'idle'),
  context:{callerKind:'deterministic-program'},
});

await mkdir(new URL('../out/',import.meta.url),{recursive:true});
await writeFile(new URL('../out/holographic-ai.html',import.meta.url),run.finalState.realizations.holographicAi.content);
await writeFile(new URL('../out/holographic-ai-state.json',import.meta.url),JSON.stringify({
  graph:run.graph,
  finalStateHash:run.finalStateHash,
  ai:run.finalState.ai,
  effect:run.finalState.effect,
  emitter:run.finalState.emitter,
  motion:run.finalState.motion,
},null,2)+'\n');

console.log(`HOLOGRAPHIC_AI_OK stages=${run.executedStageIds.length} hash=${run.finalStateHash}`);
