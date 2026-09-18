# Phase-Linked Curve + Flicker Sampling v0.1

`fx.animation.phase-linked-curve-flicker` is one deliberately narrow downstream reuse of three existing retained donors:

- `fx.animation.parameter-curve1d` owns authored value-over-time;
- `fx.animation.flicker-cycle1d` owns seeded irregular cyclic modulation;
- `fx.animation.phase-relationship1d` owns the retained mathematical relationship among looping phases.

This bridge does **not** create another timing source, combine the two sampled values, acquire scheduler authority, or rewrite any of those retained sources. Its job is only to prove that independently retained cyclic donors can be sampled from independently resolved relationship channels while all three lineages remain visible.

## Why this is bounded and non-duplicative

The phase-relationship donor intentionally stopped before downstream sampling. A concrete reuse was still missing: there was no source-verified Hand that could take one valid relationship snapshot, select one channel for a looping parameter curve and a different channel for flicker, then sample both donors without turning the relationship into a scheduler or generic binding framework.

The new derived artifact is `axm.phase-linked-curve-flicker-sample/v0.1`. It records:

- the retained phase-relationship source hash;
- the selected derived phase-set hash and group phase;
- the retained parameter-curve source hash;
- the retained flicker-cycle source hash;
- the selected curve channel id, phase, and sampled value;
- the selected flicker channel id, phase, and sampled value;
- fixed `combination: none` and `schedulerAuthority: none` semantics;
- `derived: true` and `rebuildable: true`.

The channel ids are execution parameters, not a new retained binding source. The bridge requires distinct channel ids and refuses a missing channel instead of inventing fallback behavior.

## Loop compatibility boundary

Only a parameter curve whose retained `wrapMode` is `loop` can participate. A clamped curve is valid for its own donor, but it is not silently coerced into the phase relationship's loop semantics. If a future effect needs a relationship between cyclic and clamped progress, that must be an explicit separate bridge with its own stated loss/meaning.

## Canonical-state truth

Before sampling, the bridge:

1. re-hashes the retained parameter-curve source and uses its own sampler to validate its schema, keyframes, interpolation controls, and loop behavior;
2. re-hashes the retained flicker source and uses its own sampler to revalidate the fixed flicker algorithm, wrapping, interpolation, seed/slot/value controls, and provenance;
3. re-hashes the retained phase-relationship source;
4. calls `validatePhaseRelationshipSet(...)`, which independently validates fixed relationship semantics and reconstructs every derived channel phase;
5. samples the two donor sources at those verified phases;
6. hashes the resulting derived sample while retaining all three source lineages.

`validatePhaseLinkedCurveFlickerSample(...)` repeats those checks and rebuilds the expected sample from retained truth. A caller cannot alter a derived value, recompute a self-consistent hash, and thereby promote that edit into source truth.

The bridge also refuses self-consistently rehashed incompatible semantics that matter to this contract: a clamped parameter curve, forged flicker interpolation semantics, or forged phase-relationship semantics remain invalid.

## Caller neutrality

The Hand is deterministic, network-forbidden, and caller-neutral. Human and machine callers use the same parameters and source state. Unrelated consumer metadata is passed through unchanged in the evidence fixtures.

## Performance honesty

This bridge introduces no unbounded work of its own. One sample performs:

- validation/reconstruction of the selected relationship set, structurally capped by that donor at 32 channels;
- one parameter-curve sample, bounded by that donor's maximum 64 keyframes;
- one flicker sample using the retained bounded flicker source;
- one small derived hash/rebuildable snapshot.

Those are structural ceilings only. No CPU/GPU timings, FPS, memory residency, browser cost, battery use, thermals, mobile behavior, animation cadence, or target-device scalability were measured or are claimed.

## Provenance

Implementation is original AXM Visual Effect Fabric hand-lab work. External source/code reuse is `none`. Internal donor reuse is limited to the existing parameter-curve, flicker-cycle, phase-relationship, and Hand-runtime contracts.

No imported AetherFX runtime file is modified. No Universal Creation, game, UI, website, software-product, material, audio, or world-specific adapter is added.

## Visual/perceptual boundary

There is intentionally no renderer in this improvement, so there is no new trustworthy pixel artifact to inspect. Synchronization feel, animation quality, flicker comfort/photosensitivity suitability, readability, compositing, accessibility, aesthetics, and target-device appearance are `NOT_TESTED` and must not be inferred from green source/tests.

## Evidence target

The focused test file challenges:

- human/machine caller neutrality and untouched unrelated state;
- exact independent curve/flicker phases from one relationship snapshot;
- whole-group-cycle seam equivalence;
- selected group phase staying derived while all three retained sources remain unchanged;
- self-consistently rehashed phase-set tampering;
- self-consistently rehashed linked-sample tampering;
- forged retained loop/flicker/relationship semantics;
- ambiguous same-channel, absent-channel, and clamped-curve rejection.

Repository CI remains the integrated authority for execution evidence. Passing tests prove deterministic structural behavior only; they do not prove visual quality.

## Next bounded target

If this bridge verifies cleanly, the phase-relationship branch is structurally mature enough to stop unless a real consumer-neutral need appears. The next Special Effects Architect audit should look for a genuinely separate reusable gap in `GROWTH_DIRECTION.md` or an underdeveloped existing donor. Do **not** generalize this bridge into a universal binding/scheduling framework merely because more combinations are possible.
