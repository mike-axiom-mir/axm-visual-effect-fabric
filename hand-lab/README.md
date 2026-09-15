# Special-effect Hand lab v0.1

This is the first bounded proof that a visual effect can be built as a sequence of small caller-neutral executable Hands, with editable deterministic state preserved between every execution.

## What it proves

- one Hand performs one bounded transformation;
- a composite Hand graph can execute many Hands in order;
- every stage emits a hashed checkpoint containing editable state;
- a human, AI, Mirror, or ordinary deterministic program can call the same graph;
- caller identity does not change the effect result;
- a caller can edit an intermediate checkpoint and replay only downstream Hands;
- the original upstream checkpoint stays unchanged;
- realization is derived from canonical topology rather than replacing it;
- core execution is offline and dependency-free.

## Electric storm proof

`fx.electric-storm` currently runs eight Hands:

1. `fx.electric.seed-path`
2. `fx.electric.branch-paths`
3. `fx.electric.energy-profile`
4. `fx.electric.core-layer`
5. `fx.electric.bloom-layer`
6. `fx.electric.atmosphere-layer`
7. `fx.electric.pulse-motion`
8. `fx.electric.svg-preview`

The layer Hands reference existing AetherFX module identities (`light.neon-edge-glow`, `light.soft-bloom-halo`, `atmosphere.ambient-field`, `motion.idle-pulse`) without rewriting the imported AetherFX runtime.

The SVG Hand is explicitly a preview adapter. The canonical path topology, energy profile, layer intent, seed, and controls remain editable state.

## Mid-process edit

The demo pauses after `grow-branches`, edits branch energy, glow scale, and one branch point, then resumes at `profile-energy`. It does not rerun topology generation. That is the key machine-editable production-loop proof.

## Run

```sh
npm --prefix hand-lab test
npm --prefix hand-lab run demo
```

Generated demo evidence is written under `hand-lab/out/` and should be treated as derived evidence, not canonical source state.

## Boundary

This is an experimental donor pattern for a future standalone AXM Hand Fabric. It does not declare the imported AetherFX runtime to be Hand-native, does not transfer authority, and does not claim electrical/lighting physics. It proves deterministic orchestration, editable checkpoints, partial replay, and caller-neutral invocation.
