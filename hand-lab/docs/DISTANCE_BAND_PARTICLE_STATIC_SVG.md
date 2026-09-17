# Distance-band particle static SVG v0.1

## Capability

`fx.particle.distance-band-weighted-static-svg` adds one replaceable static SVG inspection realization to the existing neutral distance-band particle-weight chain.

The retained chain remains:

`scalar field source -> coverage mask source -> signed mask distance source -> distance band source -> retained particles + particle weight source`

The rebuildable chain remains:

`coverage grid -> signed distance grid -> distance band grid -> particle weight set`

The SVG is a disposable realization of the separately retained weighted particle set. It does not become canonical particle truth.

A cellular bootstrap, `fx.particle.distance-band-weighted-static-svg-cellular`, swaps only the upstream scalar-field donor. It rejoins the same mask, distance, band, particle-weight and SVG realization Hands.

## Renderer boundary

The renderer maps neutral `[0,1]` particle weights to circle radius and opacity only for this inspection expression. The following are renderer-only controls:

- viewport width and height;
- padding;
- minimum and maximum circle radius;
- minimum and maximum circle opacity;
- point and background colors.

Those choices do not add opacity, size, color, emission, gameplay, UI, world, material or product meaning to the retained particle-weight source. Another renderer may map the same weights differently.

Before SVG emission the realization Hand:

1. validates the retained particle, distance-band and particle-weight source hashes and lineage;
2. validates the selected derived weighted set and its summary values;
3. rebuilds the expected weighted particle set through the existing source-truth chain at the retained working resolution;
4. requires the exact rebuilt weighted-set hash to match the selected set;
5. only then emits deterministic SVG markup and an artifact hash.

This rejects a derived weighted set that has been modified and then given a freshly recomputed self-consistent hash.

## Budgets and performance truth

Hard accepted ceilings are:

- 4,096 particles;
- 4,096 distance-band grid cells;
- 8,388,608 inherited nearest-opposite-cell comparisons during source-truth rebuild;
- viewport axes between 64 and 4,096 pixels.

SVG emission itself is one bounded circle projection per selected particle. The source-truth verification intentionally pays for one fresh distance-band / particle-weight rebuild before realization.

These are structural work limits only. They do **not** establish FPS, CPU time, GPU time, memory residency, browser cost, battery use, thermals or target-device scalability. Those remain `NOT_TESTED` until measured in an exact runtime/device context.

## Evidence and non-claims

The test contract challenges:

- human/machine caller neutrality and deterministic artifact hashing;
- retained source preservation;
- renderer controls changing only disposable realization state;
- reuse over materially different fBm and cellular scalar donors;
- source-truth rejection of self-consistent derived weighted-set tampering;
- XML attribute escaping;
- invalid viewport/style controls and explicit particle budgets.

The SVG content is structurally generated and verified, but this proof does not supply trustworthy raster/browser/device pixels for the new realization. Readability, aesthetic quality, anti-aliasing, compositing, accessibility and target-device appearance therefore remain `NOT_TESTED` rather than inferred from source inspection or green CI.

## Provenance and consumer boundary

This realization is repository-authored and composes existing AXM Hands. No external particle renderer, SVG implementation, signed-distance implementation, shader, texture or image-processing source is imported by this capability.

The imported AetherFX runtime remains a useful byte-pinned donor and is not modified by this Hand-lab proof. No Universal Creation, game, software, UI or world repository is ported or changed. Any future consumer adapter must remain separate from this consumer-neutral VFX contract.

## Next bounded target

Prefer actual raster/browser observation of the same retained weighted set under at least two renderer mappings and both fBm/cellular upstream donors. If that observation path is unavailable, stop extending this distance-band particle chain unless a distinct existing effect can consume the neutral weights without adding consumer authority.
