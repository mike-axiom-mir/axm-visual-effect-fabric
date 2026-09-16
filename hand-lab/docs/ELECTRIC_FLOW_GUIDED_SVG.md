# Electric Flow-Guided SVG

`fx.electric-storm.flow-guided-svg` is a bounded realization adapter that proves the reusable `fx.path.flow-displace2d` capability can drive an existing electric renderer without replacing canonical electric topology or creating a parallel SVG implementation.

## Contract

The graph builds and retains the normal electric trunk/branch/energy paths, normalizes a scalar field plus vector-flow source, builds a separate `axm.flow-guided-path-set/v0.1`, and selects that derived path set only inside a disposable render view passed to the existing `fx.electric.svg-preview` donor.

The retained `paths` array remains the base electric donor. The flow-guided set remains separately rebuildable under `flowGuidedPathSets`. Renderer selection records exact hashes for:

- retained base paths,
- selected flow-guided path-set payload,
- selected path coordinates,
- scalar field source,
- vector-flow source,
- path-displacement source.

Selection re-hashes those live sources and rejects drift rather than silently rendering altered lineage.

## Evidence boundary

The tests verify caller-neutral determinism, retained-base preservation, exact zero-displacement SVG parity with the existing donor, artifact difference for non-zero displacement, diagonal and near-vertical electric forms, and explicit rejection of source/derived-state drift.

The path working-set ceiling remains the inherited `fx.path.flow-displace2d` structural limit: the graph requests at most 4,096 path points and the underlying Hand hard-limits accepted requests to 16,384 points. These are structural bounds only. They are not measured CPU, GPU, frame-time, memory-residency, thermal, battery, or device-scale claims.

The generated SVG is a real renderer artifact, but CI/source inspection alone does not establish visual quality. Until rendered pixels are inspected on an identified browser/device, aesthetic hierarchy, branch readability, apparent motion language, glow quality and target-device behavior remain `NOT_TESTED`.

## Provenance and reuse

No external shader, vector-field, fluid, path or SVG implementation is introduced. The adapter reuses AXM's retained electric donor, reusable field/flow Hands and existing SVG renderer. Older electric, field, holographic and impulse donors remain available.

This change does not port anything into Universal Creation, a game, software product or world repository.

## Next bounded target

Prefer direct base-vs-flow-guided SVG pixel observation on a trustworthy render target. If that remains unavailable, stop growing this selector chain and move to a materially different reusable VFX family rather than adding another electric/path abstraction without new evidence.
