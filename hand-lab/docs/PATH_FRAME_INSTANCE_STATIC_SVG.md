# Path-frame instance static SVG

`fx.geometry.path-frame-instances2d-static-svg-realize` is a bounded replaceable realization of the existing renderer-neutral `axm.path-frame-instance-transform-set2d/v0.1` contract.

## Why this donor exists

The preceding instancing donor intentionally stopped before binding any prototype or renderer. This donor tests whether that transform interface has practical downstream value without making SVG, a marker shape, or a consumer-specific object canonical.

The audit found existing path/particle SVG realizers, but none consumes the verified path-frame rigid bases while keeping prototype geometry external. Reusing a particle renderer would discard the tangent/normal transform information; creating another canonical instancing model would duplicate the existing donor. This therefore stays a narrow renderer adapter.

## External prototype contract

The caller must provide all three renderer-only fields:

- `prototypeId`: a non-empty identity label;
- `prototypePoints`: 2..32 local polyline points, each coordinate bounded to `[-4,4]`;
- `prototypeProvenance`: a non-empty caller declaration.

The Hand records a deterministic prototype hash and the declaration, but marks provenance as `CALLER_DECLARED_NOT_VERIFIED_BY_HAND`. It does not claim ownership, license status, or source verification for caller-supplied geometry.

Prototype geometry is never added to canonical effect state. It lives only in the realization record and SVG content.

## Renderer mapping

The fixed disposable mapping is `path-frame-instance-static-svg/v0.1`:

1. verified normalized translation is projected into the padded SVG viewport;
2. verified tangent and normal basis columns are axis-scaled for the viewport and independently unit-normalized;
3. caller-local polyline points are expressed through those projected basis columns at a bounded `markerSize` in SVG pixels;
4. the result is serialized as one SVG polyline per selected verified instance.

This projection is renderer-specific. A Canvas, WebGL, game-engine, raster, or 3D adapter may use a different projection while consuming the same verified transform set.

## Canonical-state boundary

Before prototype binding or SVG serialization, `validatePathFrameInstanceTransformSet(...)` revalidates the retained path and sweep-frame sources, rebuilds the selected frame set from retained truth, and rebuilds the selected instance transforms from those verified frames.

Consequences:

- a self-consistently rehashed altered frame/instance transform is still rejected;
- retained path drift is rejected even if an old instance set remains present;
- changing marker size or prototype geometry changes only the replaceable realization;
- SVG projection, colors, stroke width, opacity, viewport dimensions, and prototype identity never become canonical effect truth.

The realization records exact path, sweep-source, frame-set and instance-set hashes plus the prototype hash and content hash.

## Consumer neutrality

The adapter does not assign sprite, particle, mesh, weapon, UI, product, character, world, collision, physics, or gameplay meaning. A prototype is simply a caller-supplied local polyline. Local-to-world placement remains outside this donor.

Nothing is ported into Universal Creation or any consumer.

## Structural bounds and performance truth

Inherited source verification remains bounded by the upstream path-frame donor:

- hard retained-point ceiling: **16,384**;
- default verification point budget: **4,096**;
- hard instance ceiling: **16,384**;
- default instance budget: **4,096**.

This renderer adds:

- prototype point count: **2..32**;
- default output-point budget: **65,536**;
- hard output-point ceiling: **524,288**.

SVG expansion is therefore bounded by `instanceCount × prototypePointCount` after the exact upstream rebuild/verification pass. These are structural limits only. CPU/GPU time, FPS, memory residency, browser cost, mobile cost, battery, thermals, and device scalability are **NOT_TESTED**.

## Provenance

External source/code reuse by this implementation: **none**.

Internal donor reuse:

- `hand-lab/src/path-frame-instances2d.mjs#fx.geometry.path-frame-instances2d`
- through that donor, the existing verified `fx.geometry.path-sweep-frame2d` lineage.

Caller-supplied prototype provenance is recorded but not verified by this Hand. Older path-frame, ribbon, particle, and SVG donors remain independently useful and unchanged.

## Visual evidence boundary

This Hand produces deterministic SVG source and hashes it, but repository CI/source inspection is not raster/browser/device inspection. No trustworthy pixels from this exact new realization were inspected in this bounded change. Marker readability, overlap, aliasing, apparent orientation under different viewport aspect ratios, compositing, accessibility, aesthetic quality, and target-device appearance are therefore **NOT_TESTED**.

## Next bounded target

This closes the smallest defensible `verified path frames -> neutral instance transforms -> external prototype -> replaceable SVG` chain. Do not add another SVG/prototype wrapper merely to extend the chain.

The next audit should move to the remaining geometry-realization question: whether existing retained 2D ribbon boundaries can justify a small renderer-neutral indexed strip/mesh descriptor without inventing joins, caps, self-intersection validity, UVs, materials, or 3D surface authority. If the present ribbon truth cannot justify that safely, report geometry saturation instead of forcing mesh architecture.
