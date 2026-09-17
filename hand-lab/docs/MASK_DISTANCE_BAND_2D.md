# Mask distance band 2D

Capability IDs:

- `fx.field.mask-distance-band2d`
- `fx.field.mask-distance-band2d-cellular`

This bounded field operator proves a concrete reusable consumer for the retained signed-mask-distance donor. It turns source-honest signed distance into an asymmetric inner/outer coverage band without assigning UI, game, material, terrain, world, product, glow, outline, or other consumer authority.

## Truth boundary

Retained source state is:

`continuous scalar source -> coverage-mask source -> mask-distance source -> mask-distance-band source`

Derived working state is:

`coverage-mask grid -> signed-distance grid -> distance-band grid`

The band source retains only the selected signed-distance source hash plus treatment meaning: inner width, outer width, softness, sign mapping, transfer identity and softness profile. Sampling width/height are deliberately excluded from retained truth, so a consumer can rebuild at another resolution without rewriting effect meaning.

The band build Hand does not trust a signed-distance grid merely because its own hash is self-consistent. Before applying the band transfer it invokes the existing signed-distance build Hand at the same working-set bounds. That donor in turn rebuilds the coverage mask from retained scalar-field + mask-transfer truth. The exact rebuilt distance-grid hash must match the selected derived distance grid. A modified distance grid with a freshly recomputed self-hash therefore cannot silently become canonical input truth.

## Band transfer

The signed-distance convention is inherited unchanged:

- positive distance = inside the coverage class;
- negative distance = outside the coverage class.

The retained band treatment has independent normalized-domain widths for the two sides:

- `innerWidth` applies to positive signed distance;
- `outerWidth` applies to negative signed distance.

Coverage is `1` while the absolute signed distance is within the applicable side width. When `softness > 0`, coverage then falls from `1` to `0` over one additional `softness` interval using a fixed cubic smoothstep profile. At and beyond `width + softness`, coverage is `0`.

This is a neutral distance-band transfer. A later adapter may use it as outline support, glow support, mask expansion/contraction support, a transition region, distortion falloff, or another purpose, but those meanings are not promoted into this capability.

## Multi-family reuse

The same band Hands compose with both existing signed-distance bootstrap paths:

- fBm continuous scalar source -> coverage mask -> signed distance -> band
- cellular nearest-feature scalar source -> coverage mask -> signed distance -> band

The upstream source families retain their own identities. The band operator only consumes the exact signed-distance lineage after source-truth revalidation.

## Bounded work

The band transfer itself performs one bounded scalar transform per selected distance-grid cell. Its hard ceiling is the signed-distance donor ceiling of `4,096` cells.

Source-truth verification deliberately rebuilds the selected signed-distance grid before band derivation. Therefore verification also inherits the signed-distance donor's explicit comparison ceiling of `8,388,608` nearest-opposite-cell comparisons.

These are structural operation bounds only. They are **not** FPS, CPU/GPU timing, memory-residency, thermal, battery, browser-cost, or device-scalability measurements. Those remain `NOT_TESTED` until measured on identified targets.

## Provenance

No external SDF band, outline, glow, morphology, shader, image-processing, renderer, or geometry implementation is imported. This implementation is repository-local and composes the existing AXM scalar-field, coverage-mask and signed-distance donors. The byte-pinned AetherFX runtime remains a separate older donor and is not modified by this capability.

## Renderer and consumer boundary

No renderer is added here. The output is a neutral derived coverage grid with explicit lineage, intended for later renderer- or consumer-specific adapters.

Nothing in this capability is ported automatically into Universal Creation, games, software, worlds, or other AXM consumers.

## Evidence and non-claims

Tests cover:

- human/machine caller neutrality and deterministic lineage;
- explicit asymmetric inner/outer transfer and smoothstep softness behavior;
- band-treatment changes without rewriting scalar, mask or signed-distance source truth;
- rebuildable sampling resolution without retained band-source rewrite;
- fBm and cellular signed-distance families through the same neutral band contract;
- deterministic band-grid sampling and normalized-domain bounds;
- rejection of self-consistent derived distance-grid tampering by recursive source-truth rebuild;
- rejection of self-consistent band-source semantic tampering, invalid controls and structural cell-budget overflow.

No rendered output is produced by this capability. Outline appearance, glow appearance, readability, accessibility, anti-aliasing, compositing quality and target-device aesthetics therefore remain `NOT_TESTED` rather than being inferred from tests or source inspection.
