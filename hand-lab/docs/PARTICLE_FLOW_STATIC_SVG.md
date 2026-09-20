# Particle-flow static SVG inspection

`fx.particle.flow-advected-static-svg` is a bounded, caller-neutral inspection realization for the existing renderer-neutral `fx.particle.flow-advect2d` capability.

## Why this exists

The retained particle-flow graph already produces canonical particle seeds plus a separate rebuildable `axm.flow-advected-particle-set/v0.1`. Until this change, that derived motion had no direct realization inside the Hand lab. This renderer adds the smallest standalone visual inspection surface without moving particle truth into SVG and without introducing game, software, world, emitter, collision, smoke, water or other consumer-specific meaning.

## Source / derived-state boundary

Source truth remains outside the renderer:

- `particles` stays the retained canonical seed list;
- `fieldSource` stays the retained scalar-field source;
- `flowSource` stays the retained vector-flow source;
- `particleFlowSource` stays the retained advection contract;
- `flowAdvectedParticleSets[id]` stays a separately hashed, rebuildable derived working set;
- `realizations.particleFlowStaticSvg` is disposable renderer output.

Before rendering, the Hand re-hashes the canonical particles, scalar source, vector source, advection source and selected particle-set payload. It also checks source lineage, particle/trajectory identity, normalized coordinates, final trajectory points and sample cardinality. Drift fails explicitly instead of being silently accepted.

## Realization contract

Renderer id: `axm.vfx.particle-flow-static-svg/v0.1`

The SVG shows:

- one polyline per derived trajectory;
- one marker for each retained start position;
- one marker for each derived final position.

The output is deterministic for the same retained state and renderer parameters. Human, model and deterministic callers use the same Hands.

The renderer now exposes one renderer-local backdrop control:

- `backgroundMode: opaque-inspection` (default) preserves the original standalone dark inspection backdrop;
- `backgroundMode: transparent` omits that backdrop so another replaceable compositor can layer this SVG without hidden occlusion.

This control changes only disposable SVG expression. It does not alter canonical particles, field/flow/advection source state, the derived particle set, or its lineage hashes.

Default realization bounds:

- 640 x 420 logical SVG viewport;
- 2,048 particles;
- 65,536 retained trajectory samples.

The renderer hard-rejects requests above 4,096 particles or 262,144 samples. These are structural working-set ceilings only. They are **not** measured frame-rate, CPU, GPU, memory-residency, battery, thermal or target-device claims.

## Provenance

This renderer is AXM-authored for this repository and reuses only the repository's existing particle-flow and field Hands. No external particle, fluid, SVG, shader or simulation source implementation is imported by this change. The imported AetherFX `runtime/` remains a protected donor snapshot and is not modified by the Hand-lab proof.

## Evidence / non-claims

The automated proof may establish deterministic SVG construction, exact lineage, source-state preservation, bounded working sets, materially different output for materially different derived trajectories, and renderer-local backdrop interchangeability.

It does **not** establish:

- aesthetic quality or readability on an unobserved browser/device;
- physically correct particle transport or fluid behavior;
- animation quality, temporal smoothness, collision behavior, lifetime/emission behavior or compositing quality;
- FPS, CPU/GPU cost, device scalability or power use;
- acceptance by any game, software, world, Universal Creation or other consumer.

Until real pixels from a named renderer/device are inspected, aesthetic quality remains `NOT_TESTED`.

## Next bounded target

Use the transparent renderer-local mode only where a real composition needs it. Preserve the opaque standalone inspection default. Do not promote transparent layering into a visual-quality claim until exact raster/browser/device output is actually inspected.
