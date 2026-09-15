# Special-effect Hand lab

This is the bounded proof area for visual effects built from caller-neutral executable Hands with editable deterministic state between stages.

## Existing effect donors

`fx.electric-storm` proves deterministic effect topology, checkpoint edits, downstream replay, and replaceable realization.

`fx.holographic-panel-reveal` is retained as an earlier flat/interface-oriented hologram experiment. It is not the target holographic quality, but remains useful as a calmer UI treatment and composable donor.

`fx.volumetric-hologram-projection` is the stronger spatial hologram family. It preserves projection depth, emitter/light-spill intent, projection motes, depth scan planes, signal breakup, parallax, materialize/float/collapse motion, and an animated WebGL2 realization.

## Finished bounded holographic AI package

The holographic AI now has one canonical self-made procedural identity, `original-guide-01`, and three replaceable render expressions. The AI body/state is not owned by any one renderer.

### 1. State-native default

`fx.holographic-ai-entity-state-native`

Normal interactive path. The canonical anatomy is materialized once into a reusable GPU point working set. `idle`, `listen`, `speak`, `think`, `alert`, materialize and collapse changes are small state/uniform deltas rather than body rebuilds. Frame-time feedback can reduce working-set detail and backing resolution, and hidden pages pause rendering.

### 2. Cinematic donor

`fx.holographic-ai-entity`

Higher-cost ray-marched WebGL path. It remains available for stronger hardware, bounded shots, future offline rendering, and as a donor for visual ideas that should later be transferred into cheaper renderers. It is no longer the normal default.

### 3. Calm fallback

`fx.holographic-ai-entity-calm`

Low-cost animated SVG realization built from the same procedural anatomy. It keeps the emitter, head/body silhouette, raised hand, halo, eye/core glow, scan treatment, fragments, idle float, and pulse while requiring no WebGL.

### Semantic behavior contract

Future software/games do not need bespoke animation code for every use. They can drive semantic events:

- `wake` -> `materialize`
- `ready` -> `idle`
- `attention` -> `listen`
- `speechStart` -> `speak`
- `speechEnd` -> `idle`
- `deliberate` -> `think`
- `warning` -> `alert`
- `settle` -> `idle`
- `dismiss` -> `collapse`

That makes the effect suitable later for things such as a faction intelligence appearing over an RTS command surface without making the RTS own a second hologram animation system.

## Run

```sh
npm --prefix hand-lab test
npm --prefix hand-lab run demo:holographic-ai
npm --prefix hand-lab run demo:holographic-ai:state-native
npm --prefix hand-lab run demo:holographic-ai:raymarch
npm --prefix hand-lab run demo
```

`demo:holographic-ai` writes a small package hub plus all three expressions under `hand-lab/out/`.

Generated evidence is derived output rather than canonical source state.

## Port boundary

The finished bounded package stays in Visual Effect Fabric. Nothing in this finish pass is copied into Universal Creation. A later port should be explicit and preserve the renderer/state distinction rather than copying one rendered implementation as if it were the AI itself.

## Truth boundary

Tests can prove deterministic orchestration, caller-neutral state, identity continuity across render expressions, checkpoint replay, state-native working-set behavior, and generated renderer source. They do not prove identical aesthetic quality or frame time on every browser/GPU. The byte-pinned AetherFX runtime remains separate and unchanged.
