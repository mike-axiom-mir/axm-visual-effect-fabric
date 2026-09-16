# Holographic composed-field modulation v0.1

`fx.holographic-state-projector.composed-field-modulation` is a renderer-neutral adapter between the reusable scalar-field composition toolbox and the generic holographic sample-field donor.

It does not change canonical form meaning and it does not replace the retained `sampleField`.

## State chain

```text
canonical holographic form
  -> retained derived sampleField
  + scalar field source A
  + scalar field source B
  + neutral composition source
  + holographic intensity-modulation source
  -> separate rebuildable modulated holographic sample field
```

The modulated field changes only point intensity (stride channel 6). Position, size, role and phase remain byte-for-value identical to the retained base sample field.

## Neutral mapping

The adapter projects each retained sample point onto one explicitly selected axis pair:

- `xy`
- `xz`
- `yz`

The selected two coordinates are normalized across the current retained sample-field bounds before the continuous composed scalar field is sampled. A collapsed axis maps to `0.5` rather than inventing displacement.

Axis choice is part of the modulation source, not canonical form truth.

## Controls

- `strength` — blend from untouched base intensity (`0`) to full scalar modulation (`1`)
- `floor` — minimum shaped scalar contribution before strength blending

Both are bounded to `[0,1]`.

## Lineage

The derived modulated sample field records exact hashes for:

- canonical form;
- retained base sample field;
- scalar source A;
- scalar source B;
- scalar composition source;
- holographic modulation source.

Live hashes are rechecked before modulation so edited source or retained derived state cannot silently pass under stale lineage.

## Working-set boundary

This operator inherits the generic projector's existing maximum of 20,000 sampled points and creates one additional derived point array of the same stride. That is a bounded structural statement, not a CPU/GPU frame-time or memory-residency measurement.

## Reuse proof

Tests challenge the same graph with materially different generic forms:

- strategy globe;
- recon rover.

The operator does not know or encode either meaning.

## Truth boundary

Tests prove deterministic caller-neutral construction, exact lineage, base-form/sample preservation, intensity-only modulation, alternate axis pairs, alternate neutral scalar composition, zero-strength no-op behavior and explicit drift rejection.

This run adds no renderer. It therefore does **not** prove improved holographic appearance, readability, browser/device behavior, physical holography, semantic reconstruction, frame time, GPU cost or consumer acceptance. Aesthetic quality remains `NOT_TESTED`.

No Universal Creation, game, software or world repository is modified by this proof. Existing holographic, electric, transient-impulse and field donors remain available.

## Next bounded target

If this derived adapter verifies cleanly, a later bounded step may let one existing replaceable holographic realization select the modulated sample field through a disposable render view while retaining the base sample field beside it. Direct visual claims should still wait for trustworthy rendered-pixel observation.
