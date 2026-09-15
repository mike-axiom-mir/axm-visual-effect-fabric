import { mkdir, writeFile } from 'node:fs/promises';
import { renderHolographicAi, inspectHolographicAiPackage } from '../src/holographic-ai-package.mjs';

const out = new URL('../out/', import.meta.url);
await mkdir(out, { recursive: true });
const seed = 20260915;
const state = 'idle';
const outputs = {};
for (const mode of ['state-native', 'cinematic', 'calm']) {
  const result = renderHolographicAi({ mode, seed, state, callerKind: 'deterministic-program' });
  outputs[mode] = result;
  await writeFile(new URL(`../out/holographic-ai-${mode}.html`, import.meta.url), result.realization.content);
}

const inspection = inspectHolographicAiPackage(seed, state);
await writeFile(new URL('../out/holographic-ai-package.json', import.meta.url), JSON.stringify(inspection, null, 2) + '\n');

const cards = [
  ['state-native', 'Default', 'Normal interactive use. Reusable GPU working set + small state deltas.'],
  ['cinematic', 'Cinematic', 'High-cost ray-marched donor for stronger hardware or bounded shots.'],
  ['calm', 'Calm fallback', 'Animated SVG presence for weak hardware or quiet software surfaces.'],
].map(([mode, label, copy]) => `<a class="card" href="holographic-ai-${mode}.html"><strong>${label}</strong><span>${mode}</span><p>${copy}</p></a>`).join('');
const index = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AXM Holographic AI Package</title><style>html,body{margin:0;min-height:100%;background:#02050b;color:#c9fbff;font:14px/1.5 ui-monospace,monospace}main{max-width:960px;margin:auto;padding:48px 20px}h1{font-size:26px;letter-spacing:.08em}.sub{color:#80dce7aa;margin-bottom:28px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px}.card{display:block;padding:20px;border:1px solid #5df5ff33;background:#07111a;text-decoration:none;color:inherit;min-height:150px}.card:hover{border-color:#5df5ff88;background:#091824}.card strong{display:block;font-size:18px}.card span{display:block;color:#a58aff;margin-top:3px}.card p{color:#93d7deaa}.foot{margin-top:28px;color:#6eb5be88}</style><main><h1>AXM // HOLOGRAPHIC AI</h1><div class="sub">One canonical procedural AI state · three render expressions</div><div class="grid">${cards}</div><div class="foot">identity: original-guide-01 · seed: ${seed} · state: ${state}</div></main>`;
await writeFile(new URL('../out/holographic-ai-package.html', import.meta.url), index);

console.log(`HOLOGRAPHIC_AI_PACKAGE_OK modes=${Object.keys(outputs).length} anatomy=${inspection.modes['state-native'].anatomyHash}`);
