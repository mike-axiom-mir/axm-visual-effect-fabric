import { mkdir, writeFile } from 'node:fs/promises';
import { createHandRegistry, executeHandGraph } from '../src/hand-runtime.mjs';
import {
  HOLOGRAPHIC_AI_STATE_NATIVE_HANDS,
  HOLOGRAPHIC_AI_STATE_NATIVE_GRAPH,
  makeHolographicAiInitialState,
} from '../src/holographic-ai-state-native.mjs';

const registry = createHandRegistry(HOLOGRAPHIC_AI_STATE_NATIVE_HANDS);
const run = executeHandGraph({
  registry,
  graph: HOLOGRAPHIC_AI_STATE_NATIVE_GRAPH,
  initialState: makeHolographicAiInitialState(20260915, 'idle'),
  context: { callerKind: 'deterministic-program' },
});

const realization = run.finalState.realizations.holographicAiStateNative;
await mkdir(new URL('../out/', import.meta.url), { recursive: true });
await writeFile(new URL('../out/holographic-ai-state-native.html', import.meta.url), realization.content);
await writeFile(new URL('../out/holographic-ai-state-native.json', import.meta.url), JSON.stringify({
  graph: run.graph,
  finalStateHash: run.finalStateHash,
  effect: run.finalState.effect,
  aiIdentity: run.finalState.ai.identity,
  workingSet: realization.workingSet,
  renderer: realization.renderer,
}, null, 2) + '\n');

console.log(`HOLOGRAPHIC_AI_STATE_NATIVE_OK stages=${run.executedStageIds.length} points=${realization.workingSet.pointCount} bytes=${realization.workingSet.modeledBufferBytes} hash=${run.finalStateHash}`);
