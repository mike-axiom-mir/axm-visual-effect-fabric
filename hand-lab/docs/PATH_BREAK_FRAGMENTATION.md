# Path break fragmentation

`fx.path.break-fragment2d` is a renderer-neutral path-topology treatment for retained 2D paths. It removes deterministic normalized arc-length gaps and emits separate rebuildable fragments without rewriting the canonical source paths.

It is deliberately different from `fx.path.wave-displace2d` and `fx.path.flow-displace2d`: wave and flow alter derived coordinates while keeping one path topology, whereas break fragmentation derives multiple visible path fragments separated by explicit gaps. Older displacement donors remain useful and unchanged.

## Canonical versus derived state

The input `paths` array remains retained and hash-bound as `pathSourceHash`. `fx.path.break-fragment-source-normalize` records exact source lineage plus the consumer-neutral treatment in `axm.path-break-source/v0.1`:

- `breakCount` per source path;
- `gapWidth` in normalized path-length units;
- normalized phase used only to shift the evenly spaced interior break centers;
- fixed arc-parameterization, placement and gap semantics.

`fx.path.break-fragment-build` writes a separate rebuildable `axm.broken-path-set/v0.1` under `brokenPathSets`. For non-zero breaks, each derived fragment records `sourcePathId`, `fragmentIndex`, and `normalizedArcRange`; source path metadata is copied into the derived fragment while the retained path stays untouched. Boundary points are interpolated at exact normalized arc positions. `breakCount: 0` with `gapWidth: 0` is an exact derived geometry/metadata no-op.

Break placement follows cumulative polyline length, not point index. For `breakCount > 0`, centers are evenly distributed through the path interior and shifted by phase by at most half one spacing. Gap width is capped to 90% of the available spacing so deterministic gaps remain separated and endpoint fragments remain present.

The capability assigns no crack, wound, river, UI dash, trail, destruction, gameplay, product, world or material meaning. Those interpretations belong to later consumers or replaceable renderers.

## Lineage and failure behavior

Before derived construction, the Hand re-hashes the retained path source and normalized break source. It also revalidates the fixed algorithm, arc-parameterization, placement and gap identifiers rather than accepting changed semantics merely because a new self-consistent source hash was computed.

Working-set limits are explicit. The default source ceiling is 4,096 retained points, the default fragment ceiling is 8,192 fragments, and the default derived-point ceiling is 16,384 points; hard accepted ceilings are 16,384 source points, 32,768 fragments and 65,536 derived points. Before interpolation, the Hand computes conservative fragment and derived-point upper bounds from source path count and break count and fails before construction if they exceed the requested budgets.

These are structural operation and working-set limits only. CPU/GPU time, frame rate, memory residency, browser cost, battery, thermals and target-device scalability are **NOT_TESTED**.

## Provenance

The implementation is repository-authored and composes the existing retained 2D path contract and Hand runtime. No external fracture, path-splitting, SVG, shader, geometry or image-processing implementation was imported.

## Evidence boundary

The tests establish caller-neutral determinism, canonical path preservation, exact zero-break no-op behavior, exact known break boundaries, normalized arc-length behavior on uneven point spacing, phase-only derived variation, ordinary lineage drift rejection, self-consistent semantic-source tamper rejection, malformed-control rejection, and explicit source/fragment/derived-point budget failure.

No renderer is introduced here, so no trustworthy raster/browser/device pixels were available to inspect. Visual fracture quality, readability, aliasing, animation behavior, material plausibility and target-device appearance remain **NOT_TESTED**. Green tests or source inspection must not be promoted into an aesthetic-quality claim.

No Universal Creation, game, software, UI or world repository integration is performed by this Hand.
