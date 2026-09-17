# Shared derived-path static SVG realization

`path-static-svg-core.mjs` is a small consumer-neutral projection/markup core for already-derived 2D path sets. It does **not** decide how paths are generated or what they mean. Source-family wrappers remain responsible for validating their own retained lineage and rebuilding the expected derived set before the shared renderer is allowed to emit SVG.

This bounded change keeps the established `fx.path.flow-displaced-static-svg` capability and adds `fx.path.wave-displaced-static-svg` for the existing renderer-neutral `fx.path.wave-displace2d` donor. Flow and wave therefore share disposable projection mechanics without merging their source contracts or creating a new universal path authority.

## Truth boundary

Canonical `paths` remain retained beside both families. The flow wrapper still verifies path, scalar-field, vector-flow and displacement-source hashes, then rebuilds `axm.flow-guided-path-set/v0.1` from those retained sources. The wave wrapper verifies path and wave-treatment hashes, then rebuilds `axm.wave-displaced-path-set/v0.1` from retained path + wave truth. Both require the rebuilt path-set hash to equal the selected derived set before rendering.

A derived path set is therefore not trusted merely because an edited payload carries a freshly recomputed self-consistent hash. The source-family rebuild remains the authority check. The shared core only validates normalized geometry/identity, bounded renderer controls, projection and deterministic SVG assembly after that check succeeds.

## Replaceable renderer state

The shared core owns only disposable realization controls:

- SVG width and height;
- padding;
- stroke width and opacity;
- optional retained-base underlay and its opacity;
- renderer point budget;
- normalized 2D projection and SVG escaping.

Those controls do not rewrite canonical paths, flow/wave treatment state, or derived path geometry. The existing flow renderer identity remains `axm.vfx.path-flow-static-svg/v0.1`. The new wave renderer identity is `axm.vfx.path-wave-static-svg/v0.1`.

## Consumer neutrality and donor continuity

The renderer core assigns no electrical, crack, root, vein, river, trail, water, rope, shockwave, UI, game, software, world or product meaning. A caller may interpret a retained path family later through a separate adapter. The older flow displacement/renderer donor remains available and keeps its graph/Hand identifiers; wave displacement remains independently reusable without a renderer.

No Universal Creation, game, software, UI or world repository is modified by this work.

## Structural bounds and performance honesty

The default renderer point ceiling is 4,096 and the hard accepted ceiling is 16,384, matching the bounded derived-path Hands. SVG width and height are each restricted to 64-4,096 pixels. Rendering performs one bounded projection/serialization pass per retained base or selected derived point, depending on whether the base underlay is enabled. Source verification also pays the cost of rebuilding the selected path family once before realization.

These are structural operation limits only. No FPS, CPU/GPU timing, memory residency, browser cost, battery, thermal behavior or target-device scalability is established here. Performance beyond the structural bounds remains **NOT_TESTED**.

## Evidence boundary

Targeted tests challenge:

- human/machine caller neutrality and deterministic wave SVG artifacts;
- unchanged canonical paths and exact wave path-set lineage;
- zero-amplitude exact derived no-op behavior;
- renderer-only control changes without source or derived-state mutation;
- one shared projection core producing the same projected zero-displacement geometry for flow and wave while preserving distinct renderer/source lineage;
- materially different path forms;
- canonical drift, self-consistent derived tampering and forged wave semantics;
- XML attribute escaping plus layout and point-budget failures;
- continued execution of the pre-existing flow renderer tests after its internal projection mechanics move into the shared core.

The generated SVG is a real deterministic artifact, but source/CI inspection does not establish how it looks after rasterization in a browser or on a target device. Wave readability, aliasing, visual hierarchy, compositing, accessibility, animation feel and aesthetic quality remain **NOT_TESTED** until exact rendered pixels are observed in an identified renderer/device context.

## Provenance

The shared renderer core and wave wrapper are repository-authored and compose existing AXM Hand/runtime/path contracts. No external SVG renderer, deformation implementation, shader, geometry library or image-processing source is imported by this change. The byte-pinned AetherFX runtime remains a separate donor and is not intentionally modified.
