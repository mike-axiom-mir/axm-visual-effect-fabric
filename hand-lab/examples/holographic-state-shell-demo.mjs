import { mkdir, writeFile } from 'node:fs/promises';
import { createHandRegistry, executeHandGraph } from '../src/hand-runtime.mjs';
import {
  HOLOGRAPHIC_STATE_SHELL_HANDS,
  HOLOGRAPHIC_STATE_SHELL_GRAPH,
  makeHolographicFormState,
  makeAiForm,
} from '../src/holographic-state-shell.mjs';

const registry=createHandRegistry(HOLOGRAPHIC_STATE_SHELL_HANDS);
const run=executeHandGraph({registry,graph:HOLOGRAPHIC_STATE_SHELL_GRAPH,initialState:makeHolographicFormState(makeAiForm(),20260915),context:{callerKind:'deterministic-program'}});
const r=run.finalState.realizations.holographicStateShell;
const out=new URL('../out/',import.meta.url);await mkdir(out,{recursive:true});
await writeFile(new URL('holographic-state-shell-guide-ai.html',out),r.content);
await writeFile(new URL('holographic-state-shell-guide-ai.json',out),JSON.stringify({finalStateHash:run.finalStateHash,renderer:r.renderer,pointCount:r.pointCount,visualLanguage:r.visualLanguage,canonicalFormHash:r.canonicalFormHash,sampleFieldHash:r.sampleFieldHash},null,2)+'\n');
console.log(`HOLOGRAPHIC_STATE_SHELL_OK points=${r.pointCount} hash=${run.finalStateHash}`);
