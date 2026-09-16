# Particle flow advection v0.1

`fx.particle.flow-advect2d` is a renderer-neutral derived-motion Hand graph for normalized 2D particle seeds.

It reuses the retained `fx.field.flow2d` continuous vector source instead of creating particle-specific noise. Canonical `particles`, scalar-field source and vector-flow source remain retained and hash-addressed. The graph writes a separate rebuildable `axm.flow-advected-particle-set/v0.1` containing derived final positions and trajectories.

## Contract

Canonical input particles are neutral normalized seed points:

```js
{ id: 'seed-0', x: 0.25, y: 0.4, ...callerMetadata }
```

Only derived `x/y` positions change. Other particle metadata is preserved. The v0.1 integration uses deterministic Euler steps with an explicit clamp-to-domain boundary. It does not claim fluid simulation, physical transport, collision response, lifetime/emission policy or renderer quality.

Lineage is retained for:

- canonical particle source hash;
- scalar-field source hash;
- vector-flow source hash;
- particle-advection source hash;
- derived particle-set hash.

## Bounded working set

Default graph limits:

- `2,048` source particles;
- `65,536` retained trajectory samples;
- `16` integration steps per particle by default;
- step size bounded to `[0, 0.25]` in normalized coordinates.

The Hand has hard accepted ceilings of `4,096` particles and `262,144` samples when a caller deliberately supplies a different graph-stage budget. These are structural limits only. They are not measured FPS, CPU/GPU time, memory-residency, battery, thermal or device-scale evidence.

## Evidence boundary

Tests verify caller-neutral determinism, retained source state, metadata preservation, a zero-step exact no-motion case, gradient-vs-tangent divergence, two materially different particle layouts, lineage-drift rejection and explicit working-set failures.

No renderer is added here, so visual hierarchy, apparent motion quality, particle readability, fluid realism and target-device performance remain `NOT_TESTED`.

## Provenance and port boundary

No external particle, fluid, shader or simulation source is imported by this capability. It composes AXM's existing self-contained scalar/vector field Hands. No Universal Creation, game, software or world repository is changed or assumed authoritative.

## Next bounded target

Use this derived particle-set contract in one existing replaceable realization only when a suitable renderer donor exists. If no neutral donor exists, add a minimal inspection renderer rather than folding product/game semantics into the core advection graph.
