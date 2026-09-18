# Path Sweep Propagation Static SVG

`fx.geometry.path-sweep-propagation-static-svg` is a replaceable, consumer-neutral inspection realization for the existing verified 2D sweep + propagation chain.

It does **not** add new canonical geometry, propagation, material, shader, product, game, UI, or world truth. Its only job is to prove that the neutral per-vertex propagation scalar can be consumed downstream without turning that scalar into canonical visual meaning.

## Inputs and truth boundary

The realization consumes the existing retained/derived lineage:

`retained paths -> retained sweep-frame source -> verified frame set -> verified ribbon set -> verified indexed strip -> retained propagation-front source -> derived propagation weight set -> replaceable SVG`

Before rendering, `validatePathSweepPropagationWeightSet(...)` recursively revalidates the retained path/sweep/propagation sources and rebuilds the upstream derived geometry and neutral weights. A self-consistently rehashed derived strip or weight set is therefore not accepted merely because its hash matches its altered contents.

The renderer records all relevant lineage hashes but remains `derived: true` and `replaceable: true`.

## Renderer-local mapping

The indexed strip already contains two triangles for every adjacent path-point pair. The propagation donor already guarantees the left and right vertices for a source point carry the same neutral scalar.

For each strip segment this renderer:

1. takes the verified scalar at the segment start point and end point;
2. computes their arithmetic mean;
3. assigns that one value as local SVG opacity to both triangles in the segment;
4. omits the local opacity attribute when the weight is exactly `1`.

Using one value for both triangles prevents the strip's internal diagonal from receiving two different renderer-local opacity values. This flat segment mapping is explicitly a disposable SVG choice. It does not claim interpolation, emission, visibility, reveal, damage, material response, or any other consumer meaning.

Projection is also renderer-local: normalized 2D strip coordinates are mapped into a padded SVG viewport. Upstream ribbon points are allowed to fall outside `[0,1]`; SVG viewport clipping may therefore occur, but clipping does not rewrite source geometry.

## Structural budgets

The realization inherits the upstream hard ceilings of 16,384 retained path points and 32,768 strip vertices. It additionally bounds:

- strip segments: default 4,096, hard maximum 16,383;
- emitted SVG polygon points: default 24,576, hard maximum 98,304;
- viewport axes: 64..4,096 px;
- padding: 0..512 px while retaining positive drawable area.

For `S` path segments the renderer emits exactly `2S` SVG triangles and `6S` polygon coordinate pairs after upstream verification. These are structural bounds only. CPU/GPU time, FPS, memory residency, browser/mobile cost, battery, thermals, and device scalability are **NOT_TESTED**.

## Provenance and reuse

External source/code reuse: **none**.

Internal donors remain independently useful:

- `fx.geometry.path-sweep-frame2d`
- `fx.geometry.path-sweep-ribbon2d`
- `fx.geometry.path-sweep-indexed-strip2d`
- `fx.animation.propagation-front1d`
- `fx.geometry.path-sweep-propagation-weights2d`

No Universal Creation, game, UI, website, software-product, or world adapter is added.

## Evidence and non-claims

Focused tests cover human/machine caller neutrality, exact segment-opacity mapping, full-weight local no-op behavior, distinct straight/turning and multi-path forms, path isolation and escaped ids, phase-only derived changes, disposable renderer controls, self-consistently rehashed weight tampering, forged propagation semantics, retained-source drift, and renderer work-budget failures.

The tests generate deterministic SVG source, but this change does not supply a trusted raster/browser/device render of that exact artifact. Readability, aliasing, fill quality, self-intersection appearance, clipping appearance, animation feel, accessibility, aesthetic quality, and target-device appearance remain **NOT_TESTED**. Source generation or green CI must not be promoted into an aesthetic-quality claim.

## Stop/next boundary

This closes the smallest defensible chain from verified sweep geometry and neutral propagation weights to one replaceable realization. Do not add another sweep/opacity wrapper just to grow architecture. A later bounded audit should move to a genuinely separate VFX gap unless a different renderer can demonstrate a distinct capability without assigning canonical material/consumer meaning or introducing a generic binding framework.
