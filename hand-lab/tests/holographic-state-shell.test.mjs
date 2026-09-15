import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandRegistry, executeHandGraph } from '../src/hand-runtime.mjs';
import {
  HOLOGRAPHIC_STATE_SHELL_HANDS,
  HOLOGRAPHIC_STATE_SHELL_GRAPH,
  makeHolographicFormState,
  makeAiForm,
} from '../src/holographic-state-shell.mjs';

const registry=createHandRegistry(HOLOGRAPHIC_STATE_SHELL_HANDS);

test('shell hologram remains deterministic and caller-neutral',()=>{
  const initial=makeHolographicFormState(makeAiForm(),20260915);
  const human=executeHandGraph({registry,graph:HOLOGRAPHIC_STATE_SHELL_GRAPH,initialState:initial,context:{callerKind:'human-ui'}});
  const mirror=executeHandGraph({registry,graph:HOLOGRAPHIC_STATE_SHELL_GRAPH,initialState:initial,context:{callerKind:'mirror-deterministic'}});
  assert.equal(human.finalStateHash,mirror.finalStateHash);
  assert.equal(human.finalState.realizations.holographicStateShell.canonicalFormHash,mirror.finalState.realizations.holographicStateShell.canonicalFormHash);
});

test('visual language makes coherent shell primary and sparkle secondary',()=>{
  const run=executeHandGraph({registry,graph:HOLOGRAPHIC_STATE_SHELL_GRAPH,initialState:makeHolographicFormState(makeAiForm(),44)});
  const r=run.finalState.realizations.holographicStateShell;
  assert.equal(r.visualLanguage.primary,'translucent-shell');
  assert.equal(r.visualLanguage.secondary,'volumetric-glow');
  assert.equal(r.visualLanguage.tertiary,'sparse-signal-noise');
  assert.equal(r.visualLanguage.brightSweep,false);
});

test('generated renderer uses alpha shell, additive glow, and no descending scan bar',()=>{
  const run=executeHandGraph({registry,graph:HOLOGRAPHIC_STATE_SHELL_GRAPH,initialState:makeHolographicFormState(makeAiForm(),55)});
  const html=run.finalState.realizations.holographicStateShell.content;
  assert.match(html,/SRC_ALPHA,g\.ONE_MINUS_SRC_ALPHA/);
  assert.match(html,/SRC_ALPHA,g\.ONE/);
  assert.match(html,/SHELL · GLOW · SIGNAL NOISE/);
  assert.match(html,/sparse=step/);
  assert.doesNotMatch(html,/scanWave/);
  assert.doesNotMatch(html,/fract\(time\*\.115\)/);
});
