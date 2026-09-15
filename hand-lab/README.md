# Special-effect Hand lab

This is the bounded proof area for visual effects built from caller-neutral executable Hands with editable deterministic state between stages.

## Existing effect donors

`fx.electric-storm` proves deterministic effect topology, checkpoint edits, downstream replay, and replaceable realization.

`fx.holographic-panel-reveal` is retained as an earlier flat/interface-oriented hologram experiment. It is not the target holographic quality, but remains useful as a calmer UI treatment and composable donor.

`fx.volumetric-hologram-projection` is the stronger spatial hologram family. It preserves projection depth, emitter/light-spill intent, projection motes, depth scan planes, signal breakup, parallax, materialize/float/collapse motion, and an animated WebGL2 realization.

## Finished bounded holographic AI package

The holographic AI has one canonical self-made procedural identity, `original-guide-01`, and three replaceable render expressions. The AI body/state is not owned by any one renderer.

### 1. State-native default

`fx.holographic-ai-entity-state-native`

Normal interactive path. The canonical anatomy is materialized once into a reusable GPU point working set. `idle`, `listen`, `speak`, `think`, `alert`, materialize and collapse changes are small state/uniform deltas rather than body rebuilds. Frame-time feedback can reduce working-set detail and backing resolution, and hidden pages pause rendering.

### 2. Cinematic donor

`fx.holographic-ai-entity`

Higher-cost ray-marched WebGL path. It remains available for stronger hardware, bounded shots, future offline rendering, and as a donor for visual ideas that should later be transferred into cheaper renderers. It is no longer the normal default.

### 3. Calm fallback

`fx.holographic-ai-entity-calm`

Low-cost animated SVG realization built from the same procedural anatomy. It keeps the emitter, head/body silhouette, raised hand, halo, eye/core glow, fragments, idle float, and pulse while requiring no WebGL.

### Semantic behavior contract

Future software/games can drive semantic events instead of bespoke animation code:

- `wake` -> `materialize`
- `ready` -> `idle`
- `attention` -> `listen`
- `speechStart` -> `speak`
- `speechEnd` -> `idle`
- `deliberate` -> `think`
- `warning` -> `alert`
- `settle` -> `idle`
- `dismiss` -> `collapse`

## Generic holographic state projector v0.1

`fx.holographic-state-projector` moves the architecture underneath the AI into a generic form projector.

The canonical form is truth. The holographic point/splat body is derived state that can be rebuilt or replaced. The projector itself does not know whether a form is an AI, planet, vehicle, UI object, or future game/world object.

The bounded form contract currently supports `sphere` / `ellipsoid`, `capsule`, `torus`, `box`, polyline, and explicit point samples. A form is deterministically sampled into `axm.holographic-sample-field/v0.1`, then optional creative modulation (`rings`, `waves`, `grid`, `noise`) changes the derived projection expression without changing canonical form meaning.

The first proof runs the exact same Hand graph and WebGL point/splat renderer for three unrelated forms:

- `guide-ai`
- `strategy-globe`
- `recon-rover`

This combines three existing AXM directions without merging their authorities:

- Collaboration Platform/Foundation-world style **canonical state -> disposable projection** semantics;
- Universal Creation Creative Precision's **deterministic bounded creative primitives and compositional patterns**;
- Render Fabric's **canonical state -> rebuildable working set -> state delta** rendering model.

The projector intentionally contains no bright descending scan bar. Motion is limited to subtle float, parallax, shimmer, and bounded breakup.

## Reconstructed holographic surface v0.5

`fx.holographic-state-surface` changes the visible body from direct point rendering into a reconstructed screen-space light surface.

The existing deterministic sample field stays as internal state/render input. Each frame the state points are splatted into a disposable low-resolution RGBA8 density/depth/role field. A second fullscreen resolve pass samples that field, smooths local density, estimates screen-space gradients, and resolves one continuous translucent shell with internal light volume and edge transmission.

The intended hierarchy is now:

`canonical form -> sample field -> density/depth field -> reconstructed translucent shell -> restrained signal noise`

Points are therefore no longer the primary visible object. The density texture is disposable GPU working data and can be rebuilt from the retained sample field. The first proof uses the same surface renderer for the guide AI, strategy globe, rover, and explicit point-defined forms.

This is deliberately described as **screen-space density reconstruction**, not a geometric mesh reconstruction. It does not claim true volumetric light transport, physical holography, semantic meshing, or topology recovery. The goal is the smallest real step from a readable particle sculpture toward an object that visually reads as one projected holographic body while preserving state-native performance and morph/state compatibility.

## Run

```sh
npm --prefix hand-lab test
npm --prefix hand-lab run demo:holographic-ai
npm --prefix hand-lab run demo:holographic-ai:state-native
npm --prefix hand-lab run demo:holographic-ai:raymarch
npm --prefix hand-lab run demo:holographic-state-projector
npm --prefix hand-lab run demo:holographic-state-surface
npm --prefix hand-lab run demo
```

`demo:holographic-state-projector` writes a hub, three form realizations, and evidence under `hand-lab/out/`.

`demo:holographic-state-surface` writes reconstructed-surface versions of the guide AI, strategy globe and rover plus a surface evidence report.

Generated evidence is derived output rather than canonical source state.

## Port boundary

The holographic projector stays in Visual Effect Fabric while being proven. It does not mutate the paused Collaboration Platform, Universal Creation, or Render Fabric. Future adapters may translate their canonical state into this projector contract without making this repository authoritative over those source systems.

## Truth boundary

Tests can prove deterministic orchestration, caller-neutral state, canonical-form hashing, derived sample-field generation, disposable density-field reconstruction contracts, one-renderer/many-form reuse, and generated renderer source. They do not prove arbitrary future geometry is already supported, identical aesthetic quality across every form, physical holography, or frame-time behavior on every browser/GPU. The byte-pinned AetherFX runtime remains separate and unchanged.
