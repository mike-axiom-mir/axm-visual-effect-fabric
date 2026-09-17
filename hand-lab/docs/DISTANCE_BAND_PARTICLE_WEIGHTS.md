# Distance-band particle weighting v0.1

`fx.particle.distance-band-weight2d` is a consumer-neutral composition that samples the existing retained mask-distance band at retained particle point positions and emits a rebuildable scalar weight per particle.

It exists to make the signed-distance/band donor useful to particle-oriented effects without deciding what a consumer must do with that weight. A game may later use it for edge sparks, software may use it for boundary motes, an image renderer may use it for stippled outlines, and another effect graph may use it as a selection/modulation signal. Those integrations remain separate decisions.

## State chain

fBm path:

`fBm scalar source -> coverage mask source -> signed mask distance source -> distance band source -> particle weight source`

Cellular path:

`cellular scalar source -> coverage mask source -> signed mask distance source -> distance band source -> particle weight source`

Derived working data remains separate:

`coverage grid -> signed-distance grid -> distance-band grid -> per-particle weight set`

The retained particle source is the caller-supplied point set plus its hash. The weighting source retains only exact particle lineage, exact distance-band lineage, particle count, band id, and the bounded `band-coverage-power-v0.1` exponent transfer. Grid resolution is not retained in the particle-weight source.

## Neutral output contract

The derived `axm.distance-band-particle-weight-set/v0.1` contains normalized source positions and one `[0,1]` `weight` per particle. The operator does **not** call that value opacity, size, color, emission rate, damage, gameplay probability, UI salience, or material intensity.

That meaning belongs to a later renderer or consumer adapter.

## Canonical truth boundary

Before weights are emitted, the Hand:

1. re-hashes the retained particle source;
2. re-hashes and semantically validates the retained distance-band source;
3. validates the selected derived band-grid hash and lineage;
4. rebuilds the expected distance-band grid through the existing signed-distance/coverage/scalar chain;
5. requires the exact rebuilt band-grid hash to match the candidate grid;
6. only then samples particle positions.

This rejects a modified derived band grid even when someone recomputes a self-consistent derived hash. It does not pretend that derived grids are canonical field truth.

## Caller neutrality

Human, machine, and deterministic callers use the same Hands:

- `fx.particle.distance-band-weight-source-normalize`
- `fx.particle.distance-band-weight-build`

The fBm and cellular bootstraps join the same particle-weight contract after their existing upstream scalar-source differences.

## Structural work bounds

Hard accepted ceilings for this operator are:

- 4,096 retained particles;
- 4,096 selected band-grid cells;
- 8,388,608 nearest-opposite-cell comparisons inherited by the source-truth signed-distance rebuild.

The particle weighting pass itself performs one bilinear band sample plus one bounded exponent transform per particle.

These are structural operation ceilings only. They are **not** FPS, CPU/GPU timing, memory-residency, browser-cost, battery, thermal, or device-scalability evidence.

## Provenance

No external particle, morphology, signed-distance, shader, renderer, or image-processing implementation is imported by this change. It composes repository-local Hands and the existing source-honest distance-band donor. The byte-pinned AetherFX `runtime/` body is not modified.

## Visual evidence and non-claims

This capability has no renderer. Therefore there are no new pixels to inspect and no aesthetic claim is made.

`NOT_TESTED`:

- particle readability;
- attractive edge-spark/mote behavior;
- opacity/size/color mappings;
- compositing quality;
- anti-aliasing;
- animation feel;
- accessibility;
- target-device performance or appearance.

Green CI proves only the tested state, lineage, deterministic execution, failure boundaries, and repository runtime-integrity guard.

## Port boundary

Nothing is automatically ported to Universal Creation, a game, a software product, a world, or the pinned AetherFX runtime. Consumer-specific adapters remain outside this contract.

## Next bounded target

If this donor is reused again, the strongest next step is one replaceable realization or an existing particle/path effect that consumes the neutral weight without absorbing game/UI/world semantics. If no concrete reuse justifies that step, stop this chain rather than adding another abstraction layer.
