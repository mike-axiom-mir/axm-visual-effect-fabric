# Mask-guided light rays

`fx.light.mask-guided-rays2d-static-svg` is the existing reusable light-family capability that turns retained continuous scalar-field + coverage-mask truth into a bounded 2D ray working set plus one replaceable static SVG inspection realization. The same downstream ray Hands now accept either supported continuous scalar family: fBm or nearest-feature cellular.

The additive bootstrap graph `fx.light.mask-guided-rays2d-static-svg-cellular` only swaps the scalar-source normalization stage. It does **not** create a second ray architecture.

## Source / derived boundary

The retained source chain is either:

`fieldRequest -> axm.scalar-field-source/v0.1 -> axm.coverage-mask-source/v0.1 -> axm.mask-guided-light-ray-source/v0.1`

or:

`cellularFieldRequest -> axm.cellular-field-source/v0.1 -> axm.coverage-mask-source/v0.1 -> axm.mask-guided-light-ray-source/v0.1`

The ray source contains only reusable effect controls and exact lineage:

- normalized origin;
- direction and angular span in turns;
- maximum ray length;
- coverage-to-weight shaping power;
- exact selected scalar-field and mask-source hashes.

Ray count and samples-per-ray do **not** enter that source contract. They belong to the rebuildable `axm.mask-guided-light-ray-set/v0.1` working set, so a renderer or target may rebuild the same ray truth at another bounded density without silently changing the selected field, mask, or ray-source meaning.

If unrelated fBm and cellular sources coexist in one work state, the ray chain follows the exact field id/hash already retained by the coverage-mask source. It does not choose by convenience or field-family preference.

## Mask guidance

Each derived ray remains inside normalized 2D bounds. The Hand samples the retained continuous coverage-mask source along the ray and records bounded `coverageMin`, `coverageMean`, `coverageMax`, and renderer-neutral `weight` values. Inverting the same mask changes these weights while retaining the same geometric ray request.

The coverage sampler remains the shared mask donor: fBm and cellular keep their own source schemas/algorithms and are not coerced into one another.

This is a procedural guidance effect. It is **not** physical volumetric transport, shadowing, scattering, occlusion, radiometry, or atmospheric simulation.

## Replaceable realization and truth revalidation

`fx.light.mask-guided-rays-static-svg-realize` validates selected field, mask, ray-source, and complete ray-set lineage before producing `axm.vfx.mask-guided-light-rays-static-svg/v0.1`.

The renderer now also rebuilds the expected ray set from retained field + mask + ray truth at the recorded ray/sample density and requires the exact derived hash to match. A modified ray set therefore cannot become renderer truth merely by receiving a freshly recomputed self-consistent hash.

The SVG stage owns only disposable renderer controls such as viewport size, stroke width, and opacity range. Changing those controls changes the artifact but does not alter the retained ray source or derived ray set. The realization uses `currentColor` rather than assigning game, software, world, material, or art-direction semantics.

## Evidence exercised

Tests challenge:

- existing fBm human/machine caller-neutral determinism and request retention;
- cellular human/machine caller-neutral determinism through the same downstream mask/ray/renderer Hands;
- rebuildable low/high ray and sampling densities under identical source hashes;
- one graph across narrow directional and wide radial contexts;
- mask inversion changing weights while geometric ray requests stay equal;
- materially different fBm versus cellular coverage changing weights while the shared geometric ray request stays equal;
- exact cellular selection when an unrelated fBm source is retained alongside it;
- disposable renderer controls leaving ray truth unchanged;
- scalar/mask/ray-set drift rejection;
- self-consistent derived-ray tampering rejection through source-truth rebuild;
- invalid source controls, working-set budgets, and renderer bounds.

## Performance truth

The default graph builds **64 rays × 24 samples = 1,536 coverage probes**. The Hand accepts at most **256 rays**, **128 samples per ray**, and a hard configured sample ceiling of **32,768 probes**. The default SVG contains one `<line>` per retained ray.

Renderer truth validation rebuilds the selected ray set once before SVG emission, so realization performs the same number of coverage probes again. For cellular input, each coverage probe retains the cellular donor's fixed **5×5 = 25 feature-point probes**. A default cellular ray-set build therefore performs **38,400 feature-point probes**, and renderer rebuild validation performs another **38,400**; these are structural operation counts, not timings. Small lineage-validation samples add bounded constant work.

These counts are not measured FPS, CPU/GPU time, memory residency, battery use, thermals, browser cost, or target-device scalability evidence. Those remain `NOT_TESTED` until measured on an identified runtime/device.

## Provenance

No external light-ray, cellular, noise, shader, rendering, atmospheric, or simulation source code is imported by this change. The capability reuses AXM's existing scalar-field, cellular-field, and coverage-mask Hands and extends original bounded composition/realization code in this repository. The imported AetherFX runtime remains outside the change and should stay byte-unchanged under the repository verification gate.

## Visual truth boundary

The graph produces a real deterministic SVG artifact. Source inspection, deterministic bytes, and green CI do not establish visual hierarchy, glow quality, readability, compositing quality, accessibility, atmospheric realism, or aesthetic acceptance. Those remain `NOT_TESTED` unless the generated SVG is actually rendered and inspected on an identified renderer/device.

## Consumer boundary

The capability contains no game, UI, product, world, weather, weapon, or other consumer-specific meaning. Consumer adapters may later map their own state into this contract, but no Universal Creation, game, software, or world repository is changed here.

## Next bounded target

The strongest next target is actual pixel observation of the generated ray SVG under the same retained ray geometry with fBm-backed and cellular-backed masks, ideally alongside normal/inverted coverage. If the static realization reads poorly, repair only the replaceable renderer layer from those pixels. If trustworthy pixel observation remains unavailable, move to a materially different reusable light/deformation need rather than adding another selector or source-family abstraction around this chain.
