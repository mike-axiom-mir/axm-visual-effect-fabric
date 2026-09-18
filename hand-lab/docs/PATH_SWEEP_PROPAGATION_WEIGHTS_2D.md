# Path sweep propagation weights 2D

`fx.geometry.path-sweep-propagation-weights2d` is a bounded bridge between the verified indexed-strip geometry donor and the neutral 1D propagation-front donor.

## What it adds

The bridge derives `axm.path-sweep-propagation-weight-set2d/v0.1`. For each verified indexed-strip vertex it records:

- the source point index and left/right side;
- normalized distance along that retained path, measured by cumulative Euclidean polyline length;
- one neutral propagation weight in `[0,1]` sampled from the retained propagation-front source at a selected derived phase.

Left and right vertices from the same source point intentionally receive the same normalized distance and weight. Each path normalizes independently from `0` to `1`; no ordering, timing or distance relationship is invented across separate paths.

## Truth boundary

No new canonical binding source is created. The output is derived and rebuildable from:

1. retained path truth and sweep-frame source truth;
2. the verified derived indexed-strip set;
3. retained propagation-front source truth;
4. the selected phase, which remains derived-only.

Before deriving or validating weights, the Hand runs the indexed-strip validator, which recursively verifies and rebuilds the upstream frame/ribbon/strip chain. It separately verifies the propagation source hash and calls the propagation donor sampler so that donor's fixed semantics and provenance checks remain authoritative. Validation then freshly rebuilds the complete weight set. Rehashing altered strip geometry or altered weights therefore cannot elevate those changes into source truth.

## Deliberately absent authority

The scalar is consumer-neutral. This donor does **not** decide that the weight means opacity, emission, visibility, damage, reveal, particle activation, material strength, UI importance or any other product meaning. It does not mutate geometry, select a renderer, assign a material, define a shader, generate UVs or create a game/software/world adapter.

The fixed semantics explicitly keep material, renderer and consumer authority at `none`.

## Work bounds and performance honesty

The bridge inherits the upstream hard ceiling of 16,384 retained path points / 32,768 indexed-strip vertices. Its normal graph defaults are 4,096 points and 8,192 vertices. After upstream verification, derivation performs one path-length pass plus one propagation sample per output vertex; validation intentionally performs the bounded reconstruction again.

No CPU/GPU timings, FPS, memory residency, upload cost, browser/mobile cost, battery use, thermals or target-device scalability have been measured. `performanceMeasurement` remains `NOT_TESTED`.

## Visual evidence

This improvement has no renderer and produces no new trustworthy pixel artifact. Readability, interpolation appearance, material response, aliasing, compositing, animation feel, accessibility and aesthetic quality remain `NOT_TESTED` rather than being inferred from deterministic execution or CI.

## Provenance and portability

External source/code reuse: **none**. Internal donors are the existing AXM indexed-strip and propagation-front modules. Older donors remain independently usable. Nothing in this bridge is automatically ported into Universal Creation, a game, UI, website, software product or world consumer.

## Next bounded question

Only if a real downstream consumer needs it, test one replaceable realization that maps this neutral scalar to a disposable renderer attribute while retaining both source lineages. If that requires canonical material meaning, a generic binding framework, or consumer-specific policy inside the fabric, stop this branch and move to another VFX gap instead.
