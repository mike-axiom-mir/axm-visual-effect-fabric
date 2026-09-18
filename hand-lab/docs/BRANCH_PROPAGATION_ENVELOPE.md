# Branch propagation envelope v0.1

## Bounded purpose

`fx.growth.branching2d-propagation-front-envelope-build` is one consumer-neutral downstream reuse of two existing Visual Effect Fabric donors:

- `fx.growth.branching2d-*` supplies retained branching-growth truth plus its rebuildable network;
- `fx.animation.propagation-front1d` supplies retained normalized propagation truth.

The new Hand does not replace either donor and does not introduce a generic binding framework. It derives a propagation envelope over the branch network so later replaceable renderers or consumers can decide what a `[0,1]` weight means.

## State boundary

The retained authorities remain independent:

`axm.branch-growth-source2d/v0.1 -> axm.branch-growth-network2d/v0.1 (derived)`

`axm.propagation-front-source/v0.1`

The bridge produces only:

`axm.branch-propagation-envelope2d/v0.1 (derived, rebuildable)`

Selected phase is derived state. It does not rewrite the branch source, propagation source, branch network, game state, UI state, world state, material state, or product truth.

## Distance semantics

Each segment receives neutral start/end weights at normalized cumulative **root-path actual length**. The normalization denominator is the largest root-to-segment-end distance in the verified network. This deliberately avoids generation number, segment index, screen position, frame number, or renderer coordinates becoming propagation truth.

Fixed derivation semantics are versioned as `branch-root-path-propagation-envelope/v0.1` with `segment-start-end` sample sites. Forward/reverse direction and front softness remain owned by the existing propagation donor.

## Truth verification

Before deriving or validating an envelope, the Hand:

1. re-hashes and structurally validates retained branch-growth source state, including its fixed `clip` boundary semantics;
2. re-hashes the retained propagation source and invokes the donor sampler, which revalidates its fixed algorithm/domain/profile/provenance semantics;
3. rebuilds the branch network from retained branch truth through the existing branch-network Hand and requires the selected derived network to match that fresh rebuild;
4. derives endpoint distances and weights from those verified inputs;
5. hashes the derived envelope; validation performs the same fresh derivation and rejects self-consistent envelope tampering.

A recomputed hash therefore does not turn altered derived network/envelope data or forged fixed semantics into source truth.

## Caller and consumer neutrality

The Hand is deterministic, caller-neutral, network-forbidden, renderer-neutral, and contains no meaning for opacity, reveal, emission, growth completion, damage, gameplay probability, UI importance, material state, or world simulation. Those mappings belong in replaceable downstream adapters.

The same Hand is tested against both a single-path growth network and a branching network. No game/software/world-specific adapter is added here.

## Performance honesty

Structural ceilings only:

- selected/rebuilt network: at most 4,096 segments;
- fresh network source-truth rebuild: bounded by the existing branch-growth Hand;
- envelope pass: one parent-distance lookup plus two propagation samples per segment;
- validation intentionally pays for another bounded source-truth rebuild and envelope derivation.

CPU/GPU time, FPS, memory residency, browser cost, mobile behavior, battery, thermals, and device scalability are **NOT_TESTED**.

## Provenance

External source/code reuse: **none**.

Internal donors reused without replacing them:

- `hand-lab/src/branch-growth2d.mjs`
- `hand-lab/src/propagation-front1d.mjs`
- `hand-lab/src/hand-runtime.mjs`

The imported AetherFX runtime is not changed by this improvement.

## Visual evidence and port boundary

This improvement has no renderer and produces no new rendered artifact. Readability, motion feel, compositing, aliasing, accessibility, aesthetic quality, and target-device appearance are **NOT_TESTED**. Passing source/CI evidence must not be promoted into a visual-quality claim.

Nothing is ported into Universal Creation, a game, software product, UI, or world. The bridge remains inside Visual Effect Fabric until a real consumer-neutral reuse justifies a downstream adapter.

## Next bounded target

If concrete reuse remains useful, the smallest next step is an envelope-aware variant of the **existing** branching static SVG realization: verify the same retained sources/envelope first, then map weights to a disposable SVG-only expression without making that renderer authoritative. If that requires parallel renderer architecture or consumer-specific meaning, stop this branch and move to another distinct animation gap such as decay or phase relationships.
