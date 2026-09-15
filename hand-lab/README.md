# Special-effect Hand lab v0.1

This is the bounded proof area for visual effects built as sequences of small caller-neutral executable Hands, with editable deterministic state preserved between every execution.

## What it proves

- one Hand performs one bounded transformation;
- a composite Hand graph can execute many Hands in order;
- every stage emits a hashed checkpoint containing editable state;
- a human, AI, Mirror, or ordinary deterministic program can call the same graph;
- caller identity does not change the effect result;
- a caller can edit an intermediate checkpoint and replay only downstream Hands;
- the original upstream checkpoint stays unchanged;
- realization is derived from canonical effect state rather than replacing it;
- core execution is offline and dependency-free.

## Electric storm proof

`fx.electric-storm` runs eight Hands covering deterministic topology, branching, energy, glow/bloom, atmosphere, pulse and SVG realization.

The layer Hands reference existing AetherFX module identities without rewriting the imported AetherFX runtime. The SVG Hand is explicitly a preview adapter; canonical path topology, energy profile, layer intent, seed and controls remain editable.

## Holographic panel proof

`fx.holographic-panel-reveal` is the first interface-oriented effect family. It runs nine Hands:

1. `fx.hologram.panel-form`
2. `fx.hologram.depth-stack`
3. `fx.hologram.scan-field`
4. `fx.hologram.interference-field`
5. `fx.hologram.emission-layers`
6. `fx.hologram.semantic-state`
7. `fx.hologram.motion-envelope`
8. `fx.hologram.svg-preview`
9. `fx.hologram.html-demo`

The canonical body keeps panel geometry, depth slices, scanlines, interference fields, semantic state, material/light intent and normalized motion tracks editable. SVG and interactive HTML are derived realizations.

The semantic states are deliberately useful to software instead of decoration-only: `dormant`, `materialize`, `stable`, `focus`, `alert` and `collapse`. The interactive browser proof starts quiet, materializes only when activated, can enter focus, and can collapse again. Reduced-motion preference is respected by the derived browser realization.

A checkpoint edit after interference generation can change semantic state, glow scale or an individual interference band and replay only the remaining emission/state/motion/realization Hands.

## Run

```sh
npm --prefix hand-lab test
npm --prefix hand-lab run demo
npm --prefix hand-lab run demo:hologram
```

Generated evidence is written under `hand-lab/out/` and is derived evidence, not canonical source state. The hologram demo writes `hologram-panel.svg`, `hologram-panel.html`, and a canonical-state evidence JSON.

## Port boundary

The hologram family stays in Visual Effect Fabric while it is being proven. It is **not** copied into Universal Creation by this work. If the effect family becomes strong enough to reuse there, that should be a later explicit port with provenance and verification intact.

## Boundary

This lab does not declare the byte-pinned AetherFX runtime to be Hand-native, does not transfer authority, and does not turn a visual preview into a physics or quality claim. It proves deterministic orchestration, editable checkpoints, partial replay, caller-neutral invocation and replaceable realization.
