# Mask-guided light rays

`fx.light.mask-guided-rays2d-static-svg` adds a reusable light-family capability that turns the existing continuous scalar-field + coverage-mask truth into a bounded 2D ray working set plus one replaceable static SVG inspection realization.

## Source / derived boundary

The retained source chain is:

`fieldRequest -> axm.scalar-field-source/v0.1 -> axm.coverage-mask-source/v0.1 -> axm.mask-guided-light-ray-source/v0.1`

The ray source contains only reusable effect controls and exact lineage:

- normalized origin;
- direction and angular span in turns;
- maximum ray length;
- coverage-to-weight shaping power;
- exact scalar-field and mask-source hashes.

Ray count and samples-per-ray do **not** enter that source contract. They belong to the rebuildable `axm.mask-guided-light-ray-set/v0.1` working set, so a renderer or target may rebuild the same ray truth at another bounded density without silently changing the field, mask, or ray-source meaning.

## Mask guidance

Each derived ray remains inside normalized 2D bounds. The Hand samples the retained continuous coverage-mask source along the ray and records bounded `coverageMin`, `coverageMean`, `coverageMax`, and renderer-neutral `weight` values. Inverting the same mask changes these weights while retaining the same geometric ray request.

This is a procedural guidance effect. It is **not** physical volumetric transport, shadowing, scattering, occlusion, radiometry, or atmospheric simulation.

## Replaceable realization

`fx.light.mask-guided-rays-static-svg-realize` validates field, mask, ray-source, and complete ray-set lineage before producing `axm.vfx.mask-guided-light-rays-static-svg/v0.1`.

The SVG stage owns only disposable renderer controls such as viewport size, stroke width, and opacity range. Changing those controls changes the artifact but does not alter the retained ray source or derived ray set. The realization uses `currentColor` rather than assigning game, software, world, material, or art-direction semantics.

## Evidence exercised

Tests challenge:

- human/machine caller-neutral determinism;
- retention of the original field, mask, and light-ray requests;
- rebuildable low/high ray and sampling densities under identical source hashes;
- one graph across narrow directional and wide radial contexts;
- mask inversion changing weights while geometric ray requests stay equal;
- disposable renderer controls leaving ray truth unchanged;
- scalar/mask/ray-set drift rejection;
- invalid source controls, working-set budgets, and renderer bounds.

## Performance truth

The default graph builds **64 rays × 24 samples = 1,536 coverage probes**. The Hand accepts at most **256 rays**, **128 samples per ray**, and a hard configured sample ceiling of **32,768 probes**. The default SVG contains one `<line>` per retained ray.

These are structural working-set bounds only. They are not measured FPS, CPU/GPU time, memory residency, battery use, thermals, browser cost, or target-device scalability evidence. Those remain `NOT_TESTED` until measured on an identified runtime/device.

## Provenance

No external light-ray, shader, rendering, atmospheric, or simulation source code is imported. The capability reuses AXM's existing scalar-field and coverage-mask Hands and adds original bounded composition/realization code in this repository. The imported AetherFX runtime remains outside the change and should stay byte-unchanged under the repository verification gate.

## Visual truth boundary

The graph produces a real deterministic SVG artifact. Source inspection, deterministic bytes, and green CI do not establish visual hierarchy, glow quality, readability, compositing quality, accessibility, atmospheric realism, or aesthetic acceptance. Those remain `NOT_TESTED` unless the generated SVG is actually rendered and inspected on an identified renderer/device.

## Consumer boundary

The capability contains no game, UI, product, world, weather, weapon, or other consumer-specific meaning. Consumer adapters may later map their own state into this contract, but no Universal Creation, game, software, or world repository is changed here.

## Next bounded target

The strongest next target is actual pixel observation of the generated ray SVG, ideally comparing narrow-fan, radial, normal-mask, and inverted-mask fixtures on an identified browser/device. If the static realization reads poorly, repair the renderer layer from those pixels. If pixel observation remains unavailable, do not add another selector around this chain merely to keep it growing; move to a materially different reusable family such as organic/fractal growth or stylized treatment.
