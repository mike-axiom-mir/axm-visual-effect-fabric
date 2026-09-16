# Reusable scalar field operators v0.1

`fx.field.fbm2d` is the first bounded reusable field operator grown directly from the Visual Effect Fabric research direction.

It is intentionally not a smoke effect, fire effect, weather system, material, mask, game event, UI treatment, or product adapter. It provides a deterministic continuous scalar-field source that later effects can sample for turbulence, breakup, masks, distortion, particle density, lighting variation, path guidance, atmosphere, materials, or other derived visual behavior without transferring consumer meaning into the operator.

## State chain

```text
canonical scalar-field source
  -> rebuildable bounded sample grid
  -> replaceable consumer / renderer use
```

The normalized source contains only continuous field definition:

- algorithm identity (`fbm-value-noise-2d`)
- seed
- base frequency
- octave count
- lacunarity
- gain
- domain offset

Grid width and height are **not** canonical field truth. They are working-set choices supplied to the grid-building Hand. Two grids at different resolutions therefore retain the same `fieldSourceHash` while having different derived `fieldHash` values.

## Bounded working set

The default proof builds a `48 x 32` scalar grid. The Hand rejects any requested grid above the configured cell budget and has hard per-dimension ceilings of `128 x 128`.

The default hard ceiling is 16,384 retained scalar samples. This is a structural memory/work bound only; no frame-time, GPU-cost, device-performance, or visual-quality claim follows from that number.

## Reuse evidence

The same operator is challenged by materially different field definitions:

- a low-frequency, multi-octave ambient field;
- a higher-frequency, lower-gain breakup field.

Tests also rebuild one continuous source at different grid resolutions and require the canonical source hash and direct continuous samples to stay identical while the derived grids remain resolution-specific.

`sampleFbmSource()` evaluates the normalized continuous source directly at normalized coordinates. `sampleScalarGrid()` bilinearly samples an already-retained grid. Both reject out-of-domain coordinates instead of silently wrapping or clamping them.

## Truth boundary

Tests can prove deterministic caller-neutral field construction, continuous-source / derived-grid separation, bounded working-set failure, finite normalized samples, seed/parameter sensitivity, and reusable sampling behavior.

They do **not** prove that this field looks good in smoke, fire, water, weather, materials, masks, games, software, or any other future consumer. No renderer output is introduced by this bounded proof, so aesthetic quality is `NOT_TESTED` rather than inferred from scalar statistics or green CI.

No Universal Creation or consumer repository is modified.

## Provenance

The implementation in `hand-lab/src/field-operators.mjs` was written in-repository for this proof. No external source code or copied shader/noise implementation was imported. The operator uses a small deterministic integer lattice hash, smooth interpolation, and octave accumulation expressed directly in AXM source.

## Next bounded directions

The next useful step should come from real repo evidence. Strong candidates are:

- a renderer-neutral mask/occlusion operator consuming scalar fields;
- a bounded domain-warp operator that preserves source/derived separation;
- one real existing effect family consuming the field through an explicit derived adapter without changing its canonical meaning;
- target-device measurement only when an actual runtime consumer exists.
