# Renderer-neutral flicker cycle 1D

`fx.animation.flicker-cycle1d` adds a deterministic procedural modulation donor for effects that need irregular cyclic variation without baking in opacity, emission, light, audio, gameplay, UI, product, or world meaning.

It complements rather than replaces `fx.animation.parameter-curve1d`. Parameter curves remain the stronger donor for authored keyframed timing. Flicker cycles cover the distinct case where a consumer needs seeded irregularity that loops exactly and can be sampled continuously or rebuilt at a chosen resolution.

## Canonical source

The retained source is `axm.flicker-cycle-source/v0.1` and records:

- consumer-neutral `id`;
- unsigned 32-bit `seed`;
- `slotCount` from 2 through 256;
- finite `minValue` and `maxValue` with `maxValue >= minValue`;
- `responsePower` from 0.25 through 4;
- normalized retained `phaseOffset`;
- exact fixed semantics: `periodic-slot-noise1d/v0.1`, normalized-cycle domain, loop wrap, cubic smoothstep interpolation, and canonical SHA-256 slot derivation through the existing Hand runtime `hashValue` primitive;
- provenance stating that the older parameter-curve Hand is an adjacent complementary donor and that no donor source code was reused.

The source hash is canonical. Frame rate, seconds, sample density, renderer state, and consumer interpretation are not.

## Deterministic loop semantics

Each retained slot gets a stable scalar derived from the repository's existing canonical SHA-256 `hashValue` primitive using only the retained seed and slot identity. A requested normalized phase is shifted by retained `phaseOffset`, wrapped periodically, and interpolated between adjacent slot values with fixed cubic smoothstep. The shaped scalar is then mapped into the retained `[minValue,maxValue]` range.

Because the final slot wraps back to slot zero, phase `0`, `1`, `-1`, `2`, and any other whole-cycle equivalent sample exactly the same retained signal. A constant range where `minValue === maxValue` is an exact modulation no-op even when seed or slot count changes.

This is a mathematical modulation signal only. It does not claim physical electrical flicker, flame simulation, camera exposure behavior, perceptual comfort, or any device timing model.

## Derived sample table

`fx.animation.flicker-cycle1d-samples-build` optionally creates `axm.flicker-cycle-samples/v0.1` with 2–4097 samples. The default graph builds 129 samples including both cycle endpoints. The table is explicitly `derived: true` and `rebuildable: true`.

Changing sample density changes the derived sample-set hash without rewriting retained flicker truth. `validateFlickerCycleSampleSet` independently recomputes every expected phase and value from retained source truth, so altering a derived value and recomputing an internally self-consistent derived hash is still rejected.

## Caller neutrality and truth boundary

Both Hands are deterministic, caller-neutral, offline, and network-forbidden. Human and machine callers execute the same graph and receive identical retained and derived state for identical requests.

Source validation checks more than source hashing. The fixed algorithm, domain, wrap, interpolation, and slot-derivation semantics are independently revalidated. A forged source whose semantic strings are changed and then freshly re-hashed does not become authoritative merely because its hash is self-consistent.

## Performance honesty

Structural ceilings are:

- at most 256 retained procedural slots;
- at most 4097 derived samples;
- a derived-table build precomputes at most 256 canonical SHA-256 slot hashes, followed by O(sampleCount) interpolation/mapping work;
- derived sample verification performs the same bounded source reconstruction plus O(sampleCount) comparison work.

These are operation and working-set bounds only. CPU time, GPU time, frame rate, memory residency, browser cost, battery use, thermals, mobile behavior, and device scalability are `NOT_TESTED`.

## Visual and perceptual evidence

No renderer is added by this improvement, so there are no new pixels to inspect. Flicker attractiveness, readability, comfort, photosensitivity suitability, animation feel, compositing behavior, and target-device appearance are all `NOT_TESTED`. Green source or CI evidence must not be promoted into any aesthetic or accessibility claim.

## Provenance and boundaries

No external random-number, noise, animation, shader, renderer, or image-processing implementation is imported. The implementation uses the repository's existing canonical `hashValue` primitive and records the existing parameter-curve Hand as an adjacent concept donor only. Existing parameter curves, transient impulses, flow, wave, break, particle, stylization, hologram, and AetherFX runtime donors remain unchanged.

Nothing is ported into Universal Creation, a game, software product, UI, or world. Any consumer-specific mapping from this neutral scalar signal to opacity, brightness, particle rate, sound, material state, or other meaning belongs in a separate adapter or effect-specific derived modulation stage that retains both source lineages.

## Next bounded target

If a concrete existing effect family can consume this retained flicker source without rewriting either side's canonical state, add one derived modulation bridge and prove both lineages. Electric or holographic intensity is a plausible candidate because those families already have replaceable realizations. If no such reuse can preserve canonical truth cleanly, stop this branch rather than inventing a generic binding framework.
