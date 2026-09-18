# Light + particle layer static SVG v0.1

## Purpose

`fx.composition.light-particle-layer-static-svg-realize` is the smallest replaceable realization of the verified `axm.effect-layer-plan2d/v0.1` bridge. It proves that one independently verified mask-guided light-ray donor and one independently verified flow-advected particle donor can reach a common renderer in the plan's exact derived order without merging their retained source truth.

This is an inspection realization, not a new canonical effect source and not a generic compositor.

## Reuse instead of parallel machinery

The Hand reuses the existing renderers directly:

- `fx.light.mask-guided-rays-static-svg-realize` / `axm.vfx.mask-guided-light-rays-static-svg/v0.1`
- `fx.particle.flow-static-svg-realize` / `axm.vfx.particle-flow-static-svg/v0.1`

Their produced SVG documents are embedded verbatim as nested SVG subdocuments. The composition Hand does not regenerate ray lines, particle trajectories, or markers and does not parse/rewrite either subrenderer output.

## Truth boundary

Before rendering, `validateLightParticleLayerPlan(...)` must accept the selected plan. That validator rebuilds both donor working sets from retained donor truth. The two subrenderers then perform their own lineage checks, and the composition Hand requires each produced realization to match the exact lineage recorded by the verified plan.

The output is:

- schema: `axm.vfx.light-particle-layer-static-svg/v0.1`
- derived: `true`
- replaceable: `true`
- order authority: `verified-layer-plan-only`
- subrealization mutation: `none`
- blend-mode authority: `none`
- opacity authority: `none`
- material authority: `none`
- canonical authority: `none`
- consumer authority: `none`
- source merge: `none`

Changing renderer-local dimensions, ray stroke/opacity controls, particle padding, or marker radius changes only this disposable realization. It does not rewrite the retained light source, mask/field sources, particle/advection sources, donor working sets, or layer plan.

## SVG order semantics

The plan supports only the two already-verified order modes:

- `rays-under-particles`
- `particles-under-rays`

The outer SVG emits the two nested subdocuments in that exact order. No blend mode, cross-layer opacity, depth model, material model, mask, clipping rule, or consumer meaning is added.

The current particle SVG donor contains its own opaque inspection background. This compositor intentionally does **not** strip or restyle that background. Therefore `rays-under-particles` may visually obscure the ray subdocument in a browser. That is an honest replaceable-renderer limitation, not evidence that the verified effect plan is wrong and not permission to silently mutate the older donor.

## Bounds and performance honesty

The composition inherits the upstream hard donor ceilings:

- light rays: at most 256 rays and 32,768 coverage samples;
- flow-advected particles: at most 4,096 particles and 262,144 trajectory samples.

The renderer also applies caller-selectable particle budgets and a final SVG byte budget (`maxSvgBytes`, default 1 MiB, hard maximum 16 MiB). It validates the plan, invokes both existing renderers, hashes their complete output, concatenates two nested SVG subdocuments, and hashes the final document.

No CPU/GPU timing, FPS, memory residency, browser cost, mobile cost, battery use, thermals, or device scaling was measured. `performanceMeasurement` remains `NOT_TESTED`.

## Provenance and consumer boundary

External source/code reuse: **none**. This Hand only composes AXM donor outputs already in this repository. Existing light-ray and particle realizers remain independently usable and unchanged.

No Universal Creation, game, UI, website, software-product, or world adapter is introduced.

## Visual evidence boundary

Tests verify deterministic SVG construction, exact subrenderer content reuse, layer order, lineage rejection, caller neutrality, renderer-local disposability, escaping, and budgets. CI/source inspection is not an aesthetic-quality claim.

Unless a trustworthy raster/browser/device render of the exact produced SVG is separately inspected, compositing readability, ray visibility under the particle background, aliasing, color response, motion feel, accessibility, and aesthetic quality remain `NOT_TESTED`.

## Next bounded target

This closes the structural light + particle composition chain at `verified independent donors -> verified order plan -> unchanged replaceable subrenderers -> ordered inspection SVG`.

Do not add a generic compositor, shader graph, material stack, or more light/particle wrappers just to grow architecture. The next run should audit a genuinely separate VFX gap. If later pixel evidence shows that opaque-background preservation makes a required inspection case unusable, repair that as a renderer-local transparency capability in the owning particle renderer rather than changing canonical composition truth.
