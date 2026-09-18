# Phase Relationship 1D v0.1

`fx.animation.phase-relationship1d` fills the explicit **phase relationships** gap in `GROWTH_DIRECTION.md` with one bounded renderer-neutral donor for coordinating multiple looping normalized phases.

It does not replace `fx.animation.parameter-curve1d` or `fx.animation.flicker-cycle1d`. Those donors still own authored value-over-time and seeded irregular cyclic signals respectively. This donor owns only a reusable mathematical relationship among loop phases. It deliberately does not bind to a specific effect, renderer, game, UI, product, material, light, audio, or world meaning.

## Why this is distinct

Existing looping donors can each accept or retain a phase, but the repository had no canonical way to say that several independent cyclic signals should remain related, for example one channel completing three cycles while another completes one, with a stable quarter-cycle offset. Repeating `phaseOffset` independently inside every donor would not preserve that relationship as its own reusable truth.

The new retained source is `axm.phase-relationship-source/v0.1` and records:

- a stable neutral relationship id;
- 2–32 uniquely named neutral channels;
- integer `cyclesPerGroup` from 1 through 32 per channel;
- normalized retained `phaseOffset` per channel;
- fixed `normalized-group-cycle` phase domain;
- exact loop wrapping;
- fixed relationship semantics `channel-phase=wrap(group-phase*cycles-per-group+phase-offset)`;
- provenance recording the parameter-curve and flicker-cycle Hands as adjacent complementary donors only, with external source reuse `none`.

Channel requests are sorted by id during normalization, so caller ordering does not create different canonical truth for the same relationship.

## Derived phase snapshot

`fx.animation.phase-relationship1d-resolve` accepts a selected group phase and creates `axm.phase-relationship-set/v0.1`.

The selected group phase and resulting channel phases are explicitly `derived: true` and `rebuildable: true`. Whole-cycle-equivalent group phases resolve identically because the group phase wraps before evaluation. Integer cycle counts guarantee that the complete relationship returns exactly to its starting channel phases after one group cycle.

This stage does **not** sample parameter curves or flicker, and it does not know which downstream donor a channel may eventually drive. A future effect-specific bridge may reference a channel phase and a donor source/hash while keeping both lineages intact. That bridge is intentionally outside this capability.

## Truth validation

`validatePhaseRelationshipSet(...)` does not accept self-consistent hashes as authority. It:

1. re-hashes and semantically validates the retained relationship source;
2. rejects altered algorithm, domain, wrap, or relationship-rule semantics even if the altered source is freshly re-hashed;
3. validates exact source lineage plus derived/rebuildable flags;
4. reconstructs every expected channel phase from retained source truth plus the recorded derived group phase;
5. requires the reconstructed values and phase-set hash to match.

Changing a derived channel phase and recomputing its phase-set hash therefore still fails reconstruction.

## Evidence fixtures

The bounded tests challenge:

- human/machine caller neutrality and untouched unrelated consumer metadata;
- canonical equivalence under different request ordering;
- exact whole-group-cycle seam behavior;
- integer cycle ratios and retained offsets;
- group phase remaining derived rather than rewriting retained relationship truth;
- materially different two- and three-channel relationships under the same contract;
- self-consistent fixed-semantic forgery;
- self-consistent derived-phase tampering;
- duplicate channel identities, invalid cycle counts, and the 32-channel structural ceiling.

## Performance honesty

The retained source is capped at 32 channels. Normalization sorts at most 32 channel descriptors; one phase resolution performs one bounded multiply/add/wrap transform per channel, and validation repeats the same bounded reconstruction.

These are structural operation limits only. No CPU/GPU timing, FPS, memory-residency, browser cost, battery use, thermals, mobile behavior, animation cadence, or device scalability is measured or claimed.

## Visual and perceptual boundary

There is no renderer in v0.1 and therefore no new pixel artifact to inspect. Animation feel, synchronization aesthetics, readability, perceptual comfort, accessibility, compositing, and target-device appearance are `NOT_TESTED`. Green source/tests must not be promoted into an aesthetic or accessibility claim.

## Provenance and port boundary

Implementation is original AXM Visual Effect Fabric hand-lab work. External source/code reuse is `none`. Existing parameter curves, flicker cycles, propagation fronts, transient impulses, growth systems, path effects, field systems, stylization donors, holographic donors, and the imported AetherFX runtime remain unchanged.

The donor is deliberately limited to looping relationships. `fx.animation.propagation-front1d` uses clamped progress rather than loop semantics, so it is **not** silently forced into this phase-group contract. If a future effect needs a loop-to-propagation relationship, that mapping must be an explicit derived bridge with both source lineages visible.

Nothing here ports into Universal Creation, a game, software product, UI, website, or world.

## Next bounded target

Prove one concrete effect-neutral reuse by allowing an existing looping donor—preferably a looping parameter curve and the flicker cycle—to be sampled from independently retained channel phases while preserving all three source lineages. If that requires a generic binding framework, changes a donor's canonical truth, or turns this relationship source into a scheduler, stop this branch instead of adding architecture churn.
