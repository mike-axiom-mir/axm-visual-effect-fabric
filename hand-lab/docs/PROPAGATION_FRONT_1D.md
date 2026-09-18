# Propagation Front 1D v0.1

`fx.animation.propagation-front1d` adds one renderer-neutral propagation donor for moving bounded progress across normalized distance.

This closes the explicit **propagation** gap in `GROWTH_DIRECTION.md` without turning authored parameter curves or seeded flicker into a second job. Parameter curves still own authored value-over-time shapes; flicker still owns periodic seeded irregular modulation. The propagation front maps a selected derived progress phase over a neutral 1D spatial domain.

## Retained truth

The normalized retained source is `axm.propagation-front-source/v0.1`.

It records:

- stable source id;
- fixed algorithm identity `normalized-propagation-front1d/v0.1`;
- normalized-distance spatial domain;
- normalized-progress phase domain with explicit clamping;
- `forward` or `reverse` direction;
- `frontSoftness` in `[0,1]`;
- fixed `smoothstep3-behind-front` profile;
- neutral `[0,1]` output range;
- internal provenance and `sourceReuse: none`.

No opacity, emissive energy, color, sound, damage, UI importance, gameplay probability, material meaning, world meaning, frame rate or renderer identity is canonicalized.

## Derived state

`fx.animation.propagation-front1d-samples-build` creates `axm.propagation-front-samples/v0.1` at a caller-selected phase and sample density.

The sample table is explicitly `derived: true` and `rebuildable: true`. Phase selection and sample count are realization/work choices, not retained effect truth. The builder accepts 2-4097 samples.

Phase values clamp to `[0,1]`:

- phase `0` produces all-zero neutral weights;
- phase `1` produces all-one neutral weights;
- intermediate phases advance from the selected direction;
- `frontSoftness: 0` gives an exact sharp step;
- nonzero softness uses the fixed cubic smoothstep profile behind the front.

A later consumer may choose to interpret these weights as reveal, growth, path activation, particle influence, light contribution, material modulation or something else. That interpretation is outside this donor.

## Truth validation

`validatePropagationFrontSampleSet(...)` does not accept an internally self-consistent derived hash as authority. It:

1. re-hashes and semantically validates the retained source;
2. validates exact source lineage and derived/rebuildable flags;
3. recomputes every expected normalized position and weight from retained source truth plus the recorded derived phase;
4. checks extrema and the sample-set hash.

Changing fixed source semantics and recomputing the source hash still fails semantic validation. Changing a derived weight and recomputing an internally consistent sample-set hash still fails reconstruction.

## Evidence fixtures

The bounded tests challenge:

- human/machine caller neutrality;
- forward and reverse use of one contract;
- exact sharp-front endpoint behavior;
- smooth bounded transition behavior;
- phase and sampling resolution remaining derived;
- explicit clamping before/after the normalized phase domain;
- self-consistent retained-semantic forgery;
- self-consistent derived-sample tampering;
- malformed controls and excessive derived work.

## Performance boundary

Only structural work is established by this donor. A build performs one bounded scalar transform per requested sample, for at most 4097 samples. Validation performs the same bounded reconstruction plus comparisons.

No FPS, CPU/GPU timing, browser cost, memory residency, battery use, thermals, animation cadence or target-device scalability has been measured by this capability.

## Visual boundary

There is no renderer in v0.1. Therefore propagation readability, visual quality, motion feel, aliasing, compositing, accessibility and target-device appearance remain `NOT_TESTED` until a real realization is inspected.

## Provenance and port boundary

Implementation is original AXM Visual Effect Fabric hand-lab work. External source reuse is `none`. Existing parameter-curve and flicker-cycle donors remain intact and are recorded only as adjacent complementary donors.

Nothing in this capability ports itself into Universal Creation, a game, software product, UI or world repository.

## Next bounded target

Before adding more propagation architecture, prove one concrete consumer-neutral reuse against an existing retained topology or effect donor, while keeping the propagation source independent. If no existing donor can consume the neutral weights without inventing a generic binding framework or absorbing consumer meaning, stop this branch and move to a different reusable VFX gap.
