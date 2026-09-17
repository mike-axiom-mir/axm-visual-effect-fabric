# Branch Growth 2D

`fx.growth.branching2d-static-svg` is a consumer-neutral deterministic branching-growth Hand graph. It adds a bounded organic/fractal-growth primitive without assigning game, root, tree, crack, vein, river, UI, or product meaning to the retained state.

## Canonical source truth

`axm.branch-growth-source2d/v0.1` retains only the rule source:

- source id;
- normalized 2D origin;
- initial heading in turns;
- base requested length;
- per-generation length decay;
- one to four branch heading offsets;
- one to eight generations;
- explicit `clip` boundary mode.

The source is hashed as `branchGrowthSourceHash`. A caller kind is not part of the source, so human, machine, and deterministic-program callers use the same controls.

## Rebuildable derived network

`fx.growth.branching2d-network-build` expands the source into `axm.branch-growth-network2d/v0.1`. Each segment records stable parent/child lineage, generation, requested length, actual post-clip length, normalized endpoints, heading, clipping, and terminal state. The complete network is hash-addressed and marked `derived: true` / `rebuildable: true`.

Boundary handling uses parametric line clipping against the unit square. A clipped segment terminates rather than silently spawning children from a renderer-created point. Changing only `maxSegments` cannot alter a network that fits the budget; an insufficient budget fails loudly.

The default graph budget is 2,048 segments. The Hand hard ceiling is 4,096 segments. These are structural working-set ceilings, not FPS, CPU, GPU, memory, thermal, battery, or device-performance measurements.

## Replaceable realization

`fx.growth.branching2d-static-svg-realize` validates retained source and derived-network hashes before generating `axm.vfx.branch-growth-static-svg/v0.1`. Viewport, stroke, opacity, and origin-marker controls are realization-only and do not rewrite source or network truth. Source-derived ids are XML-escaped before entering the SVG artifact.

The SVG exists to make topology inspectable. It does not make a claim that SVG is the preferred renderer or that the effect has passed aesthetic acceptance. Other renderers may consume the same network later without replacing the canonical source.

## Verification boundary

Tests challenge:

- human/machine caller neutrality;
- source preservation across working-set and renderer changes;
- materially different symmetric and asymmetric branching forms;
- exact parent/child continuity;
- parametric boundary clipping and requested-versus-actual length honesty;
- source and derived-network drift rejection;
- structural budget failure;
- SVG attribute escaping;
- exact artifact hash/lineage coupling.

Green tests prove deterministic structural behavior only. Browser/device appearance, motion, compositing, accessibility, and target-device performance remain separate evidence questions.

## Provenance

This implementation was authored in the Visual Effect Fabric Hand lab from generic branching geometry. No external branching, L-system, fractal-growth, shader, renderer, or simulation source code was copied or imported. Existing repository Hands supplied only the local conventions for source hashing, caller-neutral execution, derived-state receipts, bounded work, and replaceable realizations.

## Port boundary

This is not automatically a Universal Creation, game, software, or world integration. Consumer-specific adapters belong outside the neutral source/network contract and should be added only when a real consumer requests them.
