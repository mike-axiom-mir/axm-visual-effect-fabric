# Reusable coverage mask operator v0.1

`fx.field.coverage-mask2d` converts one canonical continuous scalar-field source into a renderer-neutral coverage definition plus a bounded rebuildable mask grid.

It is intentionally not a smoke effect, dissolve effect, visibility verdict, geometry occlusion solver, gameplay hit mask, UI clipping policy, material choice, or product adapter. Consumers may later interpret coverage values for their own effects without transferring that meaning into Visual Effect Fabric.

## State chain

```text
canonical scalar-field source
  + canonical coverage transfer
  -> rebuildable bounded coverage grid
  -> replaceable consumer / renderer use
```

The coverage transfer contains:

- mask identity;
- exact scalar-field source identity/hash;
- transfer identity (`smooth-threshold`);
- threshold;
- softness;
- invert flag.

Mask width and height are not canonical truth. They are working-set choices supplied to the grid-building Hand. Rebuilding the same field + transfer at another resolution therefore retains the same `fieldSourceHash` and `coverageMaskSourceHash` while producing a resolution-specific `maskHash`.

## Transfer behavior

For softness `0`, the transfer is a deterministic hard threshold. Values below the threshold map to `0` and values at/above it map to `1`.

For softness above `0`, the transfer uses a bounded smooth threshold centered on the threshold value. This allows continuous coverage between `0` and `1` without assigning a semantic meaning to that coverage. `invert` complements the transfer without rewriting the scalar field.

`sampleCoverageSource()` evaluates the canonical continuous field and coverage transfer directly at normalized coordinates. `sampleCoverageMask()` bilinearly samples an already-retained coverage grid. Out-of-domain coordinates fail explicitly rather than silently wrapping or clamping.

## Bounded working set

The default proof builds a `48 x 32` coverage grid. Per-dimension ceilings are `128 x 128`, and the configured cell budget cannot exceed 16,384 retained values.

These are structural memory/work bounds only. They do not prove frame time, GPU cost, device scalability, or visual quality.

## Reuse evidence

The same operator is challenged by materially different transfer contexts over the same field machinery:

- a soft continuous mask with intermediate coverage values;
- a hard inverted mask with binary coverage values.

Tests also rebuild the same canonical field + transfer at different grid resolutions and require the field and transfer hashes to stay stable while the derived mask hash changes.

## Truth boundary

Tests can prove deterministic caller-neutral mask construction, field/mask source lineage, canonical-transfer / derived-grid separation, hard/soft/inverted transfer behavior, bounded working-set failure, normalized finite coverage, direct continuous sampling, and retained-grid sampling.

They do **not** prove that a mask is visually pleasing, represents physical visibility, solves geometric occlusion, improves smoke/fire/weather/materials, or is accepted by any game/software/world consumer. No renderer output is introduced in this bounded proof, so aesthetic quality is `NOT_TESTED`.

No Universal Creation or consumer repository is modified.

## Provenance

The implementation in `hand-lab/src/field-mask-operators.mjs` was written in-repository for this proof. It reuses the existing AXM fBm field source and imports no external shader, mask, noise, or occlusion implementation.

## Next bounded directions

Useful follow-ups should remain evidence-driven. Strong candidates are:

- a bounded domain-warp operator that composes scalar fields without changing canonical source truth;
- an explicit derived adapter allowing one existing VFX family to consume coverage while preserving that effect's canonical semantics;
- a generic two-field composition operator (`min`, `max`, multiply, add/clamp) if a concrete reuse case needs it;
- renderer/device inspection only after a real visual consumer uses the mask.
