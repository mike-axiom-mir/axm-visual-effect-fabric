# Electric flicker-cycle modulation

`fx.electric-storm.flicker-cycle-modulation` is a bounded downstream reuse of two existing Visual Effect Fabric donors:

- `fx.electric.energy-profile` retains editable electric paths with renderer-neutral energy;
- `fx.animation.flicker-cycle1d` retains seeded periodic scalar modulation independently of any electric, light, UI, game, or renderer meaning.

The bridge does not replace either donor. It records a small electric-specific binding source and derives a phase-selected electric path set whose path energies are multiplied by one bounded flicker factor.

## Canonical vs derived boundary

Retained/source truth:

- profiled electric `paths`, captured by `electricBasePathsHash`;
- `axm.flicker-cycle-source/v0.1` and its independent hash;
- `axm.electric-flicker-modulation-source/v0.1`, containing only the binding semantics (`path-energy`, range normalization, strength, floor, constant-range no-op policy) plus internal-donor provenance.

Derived/rebuildable working state:

- selected normalized cycle phase;
- sampled flicker value and normalized sample;
- final scalar factor;
- `axm.electric-flicker-modulated-path-set/v0.1` and its hashes.

The selected phase is intentionally not canonical electric or flicker truth. Phase `0` and phase `1` rebuild the same derived set. A constant flicker source range maps to unity so the bridge does not invent arbitrary variation from a source that contains none. `strength: 0` is also an exact path-energy no-op.

## Truth validation

The bridge revalidates both retained lineages before construction. The flicker donor sampler validates its own fixed algorithm, wrapping, interpolation, and slot-derivation semantics. The electric binding separately validates its fixed mapping semantics. The derived path set carries both source hashes and the retained electric path hash.

`validateElectricFlickerModulatedPathSet` does not accept a derived set merely because its hashes are internally consistent. It rebuilds the expected set at the recorded phase from the retained electric paths, flicker source, and binding source, then requires the exact rebuilt set hash. A changed derived path with a freshly recomputed derived hash is therefore rejected.

## Performance boundary

Structural ceilings are explicit:

- at most 64 electric paths;
- at most 4,096 retained path points;
- one flicker sample and one scalar energy multiply per path for each requested phase;
- validation intentionally pays for one exact rebuild of that bounded derived set.

These are operation/working-set bounds only. CPU/GPU timing, FPS, memory residency, browser cost, thermals, battery use, animation cadence, and device scalability are `NOT_TESTED`.

## Provenance and consumer boundary

No external implementation, random-number source, electric effect, shader, renderer, or animation code was imported for this bridge. It composes existing AXM hand-lab donors and declares `externalSourceReuse: none`. The imported AetherFX `runtime/` is not part of the change.

The bridge contains no game rules, UI meaning, product behavior, world semantics, damage, visibility, lighting acceptance, or Universal Creation port. No renderer is added here. Therefore visual flicker quality, perceptual comfort/photosensitivity suitability, compositing, aliasing, temporal smoothness, and target-device appearance remain `NOT_TESTED` rather than being inferred from source inspection or CI.

## Bounded next target

Only continue this branch if a replaceable existing electric realization can consume the source-verified derived path set without overwriting retained electric or flicker truth. Otherwise stop here and move to a different missing reusable VFX capability rather than creating a generic binding framework.
