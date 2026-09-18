# Path-frame instance transforms 2D

`fx.geometry.path-frame-instances2d` is the smallest renderer-neutral instancing bridge justified by the current retained 2D path/sweep truth.

## Why this donor exists

The Visual Effect Fabric growth direction names **instancing** as a geometry-realization gap, but the fabric must not invent game/world placement, mesh meaning, prototype identity, materials, or renderer ownership merely to say that instancing exists.

The existing `fx.geometry.path-sweep-frame2d` donor already derives verified per-point position, tangent, left normal, and sweep half-width from retained path truth. This donor reuses those verified frames to expose a bounded repeated-transform interface that a later replaceable renderer or consumer can bind to its own prototype.

It does **not** replace the sweep-frame or ribbon donors. It adds no new canonical instance source because every emitted transform is rebuildable from existing retained truth plus a derived sampling choice.

## Derived contract

The output schema is `axm.path-frame-instance-transform-set2d/v0.1`.

For each selected verified frame it records:

- `translation`: the exact verified frame position;
- `basisX`: the verified tangent;
- `basisY`: the verified left normal;
- `scale: {x: 1, y: 1}`: deliberately neutral identity scale;
- `sweepHalfWidth`: the retained sweep width carried only as a neutral downstream hint;
- `frameIndex`: exact lineage back to the selected frame.

No prototype/mesh/sprite/particle/material is bound. `prototypeBinding` is fixed to `external-required`.

The rigid basis is intentionally preferred over an angle in degrees/radians. The tangent/normal pair already exists in verified frame truth, so the instancing bridge does not add trigonometric convention or rotation-wrap ambiguity.

## Density selection is derived, not canonical

`stride` is an execution-time density choice, bounded to `1..256`. It does not rewrite retained paths or sweep-frame truth.

The fixed selection policy is `stride-with-final-frame`:

1. select frame `0`;
2. continue by the requested stride;
3. always include each path's final frame once.

The chosen stride is recorded inside the derived set so the result can be rebuilt and verified exactly.

## Canonical-state boundary

Canonical authority remains with:

1. retained normalized `paths`;
2. `axm.path-sweep-frame-source/v0.1`;
3. the hash-bound relationship between those retained sources.

The frame set and the new instance-transform set are both derived/rebuildable.

Before instance derivation or validation, `validatePathSweepFrameSet(...)` independently revalidates retained path/source hashes, fixed sweep-frame semantics, cardinality, and an exact rebuild of the selected frame set. The instance validator then rebuilds every selected transform from that verified frame truth.

Consequences:

- changing a frame tangent/normal and recomputing its frame-set hash does not make the altered frame authoritative;
- changing a derived translation/basis/width hint and recomputing the instance-set hash does not make the alteration authoritative;
- changing fixed instancing semantics and recomputing the set hash does not make those semantics authoritative;
- changing `stride` is allowed only as a new derived selection, not as a rewrite of canonical path/sweep truth.

## Explicit non-authority

This donor does not decide:

- prototype identity or geometry;
- sprite/particle/mesh/material binding;
- world, game, UI, product, or software placement meaning;
- local-to-world transforms;
- renderer or GPU instance-buffer layout;
- 3D transforms;
- scale based on sweep width;
- clipping, joins, caps, triangulation, collision, physics, or visibility;
- aesthetic acceptance.

Identity scale is intentional. Sweep `halfWidth` only describes the retained cross-path width contract; using it as tangent scale would invent longitudinal geometry that the path truth does not justify.

## Structural bounds and performance truth

The donor inherits the sweep-frame hard ceiling of **16,384 retained points** and the normal graph budget of **4,096 points**. The instance set is separately bounded by `maxInstances` (default **4,096**, hard ceiling **16,384**). Selection and transform projection are linear in selected/source frame count after the bounded upstream frame verification/rebuild.

These are structural limits, **not measured performance claims**. No CPU/GPU timings, FPS, memory residency, browser cost, mobile cost, battery use, thermals, or device scalability were measured.

## Provenance and reuse

External source/code reuse: **none**.

Internal donor reuse:

- `hand-lab/src/path-sweep-frame2d.mjs#fx.geometry.path-sweep-frame2d`

The older sweep-frame and ribbon donors remain useful and unchanged. Nothing is ported into Universal Creation, a game, software product, UI, website, or world consumer.

## Visual evidence boundary

This donor has no renderer and produces no pixels. Therefore prototype appearance, spacing aesthetics, readability, aliasing, overlap, compositing, animation feel, accessibility, and target-device appearance are **NOT_TESTED**. Passing source/CI tests must not be promoted into an aesthetic-quality claim.

## Next bounded target

A useful next test would be one **replaceable realization** that consumes this transform set while keeping the prototype external—for example a minimal static SVG marker adapter that accepts a caller-supplied neutral glyph and proves transform reuse without making SVG canonical.

If such a realization would require binding product/game/world meaning or duplicating an existing particle/SVG renderer, stop this branch and audit the next distinct geometry gap instead of growing generic instancing architecture.
