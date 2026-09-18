# Branch propagation static SVG

`fx.growth.branching2d-propagation-front-static-svg-realize` is a bounded inspection realization for the existing neutral branch-propagation envelope. It does not create a second branching system, a second propagation model, or a generic binding framework.

## Retained truth stays separate

The renderer consumes three already-existing lineages without merging their authority:

- retained `axm.branch-growth-source2d/v0.1` branch truth;
- rebuildable `axm.branch-growth-network2d/v0.1` topology derived from that truth;
- retained `axm.propagation-front-source/v0.1` propagation truth plus the rebuildable `axm.branch-propagation-envelope2d/v0.1` selected at a derived phase.

Before rendering, `validateBranchPropagationEnvelope(...)` verifies both retained sources, rebuilds the branch network from retained branch truth, freshly derives the propagation envelope from retained propagation truth at the selected phase, and requires the selected envelope to match. A modified network or envelope does not become authoritative merely because its hash was recomputed.

## Renderer reuse

Projection, SVG layout, escaping, viewport bounds, stroke controls and serialization remain owned by the existing donor:

`hand-lab/src/branch-growth2d.mjs#fx.growth.branching2d-static-svg-realize`

The new wrapper invokes that donor only in a disposable render view and then maps the already-verified neutral envelope into local SVG opacity:

- each line receives the mean of its verified start/end weights;
- the optional origin marker receives the verified root start weight;
- a weight of exactly `1` adds no local opacity attribute, so phase `1` is byte-identical to the existing branch SVG donor for identical renderer controls.

This mean-endpoint mapping is a lossy static expression owned only by `axm.vfx.branch-propagation-static-svg/v0.1`. It is not canonical propagation truth, not a physical model, and not a requirement for future Canvas/WebGL/game/3D renderers.

## Consumer neutrality

Weights remain neutral `[0,1]` values. This realization interprets them only as disposable SVG opacity for inspection. It assigns no meaning such as reveal, damage, electricity, plant growth, loading progress, UI importance, material state, or world state. Those interpretations belong in consumer-specific adapters outside the retained VFX source contracts.

## Budgets and performance honesty

The source-verification path accepts at most 4,096 branch segments. Rendering then performs one pass over the donor SVG lines to attach local opacity where a verified weight is below `1`. The existing branch SVG donor retains its 16–4,096 px axis bounds and its own renderer-control validation.

These are structural work bounds only. CPU/GPU time, FPS, memory residency, browser cost, battery use, thermals, animation cadence and target-device scalability are `NOT_TESTED` unless separately measured.

## Provenance and boundaries

External source/code reuse: `none`.

Internal donors:

- `branch-growth2d.mjs` for branch truth, derived topology and the replaceable SVG renderer;
- `propagation-front1d.mjs` for neutral propagation-front truth;
- `branch-propagation-envelope.mjs` for root-path-distance envelope derivation and source-truth validation.

The imported AetherFX `runtime/` remains unchanged. This Hand is not a Universal Creation port and does not modify a game, software product, UI, website, or world-specific adapter.

## Evidence boundary

Automated tests may establish deterministic execution, caller neutrality, lineage validation, source rebuilding, byte identity for the full-weight no-op, escaping, and explicit work-budget failures. Successful tests or SVG-string generation do not establish visual attractiveness, perceptual readability, anti-aliasing, animation feel, accessibility, or target-device quality.

If a trustworthy raster/browser artifact from this exact realization is inspected, record that separately. Otherwise visual inspection remains `NOT_TESTED`.
