# Mask distance field 2D

Capability IDs:

- `fx.field.mask-distance2d`
- `fx.field.mask-distance2d-cellular`

This bounded field operator turns an existing retained coverage-mask contract into a rebuildable signed distance grid. It fills the distance-transform gap in the Visual Effect Fabric without introducing a second mask system or assigning game, UI, terrain, material, world, or product meaning.

## Truth boundary

Retained source state is:

`continuous scalar source -> coverage-mask source -> mask-distance source`

Derived working state is:

`coverage-mask grid -> signed-distance grid`

The mask-distance source retains only the selected coverage-mask source hash, an iso level, sign convention, metric, bounded algorithm identity, and a finite no-boundary policy. Grid width/height are deliberately excluded from retained source truth so consumers can rebuild at a different sampling resolution without rewriting the effect meaning.

The build Hand does not trust a derived coverage grid merely because its own hash is self-consistent. Before deriving distance values it rebuilds the expected coverage grid from the retained scalar source plus retained coverage transfer at the same recorded resolution and requires the rebuilt mask hash to match. A modified grid with a freshly recomputed derived hash therefore cannot silently become canonical input truth.

## Distance contract

For each sampled cell, coverage greater than or equal to `isoLevel` is inside and receives a positive distance. Coverage below the iso level is outside and receives a negative distance.

Distance is the exact Euclidean distance, in normalized 0..1 domain coordinates, from that sampled cell center to the nearest sampled cell center in the opposite class. This is exact over the retained sampled grid; it is **not** claimed to be the continuous analytic distance to the underlying fBm/cellular field or to a physical surface.

If the sampled grid contains only one class, no opposite sampled cell exists. The explicit finite policy is the normalized domain diagonal `sqrt(2)` with the appropriate sign. That policy is retained in the distance source and validated before execution.

## Multi-family reuse

The same distance Hands compose with both existing coverage-mask bootstrap paths:

- fBm continuous scalar source -> coverage mask -> signed distance
- cellular nearest-feature scalar source -> coverage mask -> signed distance

The cellular source is not converted into an fBm-shaped source. Its identity remains in the upstream coverage lineage; the distance operator only consumes the neutral retained coverage contract after verifying the exact source-truth rebuild.

## Bounded work

Default coverage resolution remains `48 x 32 = 1,536` cells.

The distance Hand has a stricter hard ceiling of `4,096` cells because this first implementation intentionally uses a simple exact sampled-cell search instead of importing or prematurely adding a more complex Euclidean-distance-transform implementation.

For a grid with `inside` and `outside` sampled cells, exact comparison work is:

`2 * inside * outside`

The hard comparison ceiling is `8,388,608`, which is the worst balanced-class case at 4,096 cells. The Hand calculates this count before the nearest-opposite-cell loops and fails before that work if a lower caller budget would be exceeded.

These are structural operation bounds only. They are **not** FPS, CPU/GPU timing, memory-residency, thermal, battery, browser-cost, or device-scalability measurements. Those remain `NOT_TESTED` until measured on identified targets.

## Provenance

No external EDT, signed-distance-field, shader, renderer, image-processing, or geometry implementation is imported. This implementation is repository-local and composes the existing AXM scalar-field and coverage-mask donors. Useful older donors remain unchanged.

## Renderer and consumer boundary

No renderer is added here. The signed-distance grid is intended as a reusable donor for later bounded uses such as outlines, glow bands, erosion/dilation-like treatments, controlled distortion falloff, mask expansion/contraction, or contour support, but those consumers must remain separate adapters and must not retroactively make this field canonical product/world truth.

Nothing in this capability is ported automatically to Universal Creation, games, software, or worlds.

## Evidence and non-claims

Tests cover:

- human/machine caller neutrality and determinism;
- exact sampled-cell signed-distance behavior on a known fixture;
- finite no-boundary behavior;
- rebuildable resolution without retained-source rewrite;
- fBm and cellular coverage families through the same distance contract;
- deterministic sampling and domain bounds;
- rejection of self-consistent derived-mask tampering by source-truth rebuild;
- rejection of self-consistent distance-source semantic tampering;
- cell and comparison work-budget failures.

No rendered output is produced by this capability. Aesthetic quality, readability, accessibility, compositing quality, renderer behavior, and target-device appearance therefore remain `NOT_TESTED` rather than being inferred from tests or source inspection.
