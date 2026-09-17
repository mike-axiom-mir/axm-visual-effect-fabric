# Reusable coverage mask operator v0.2

`fx.field.coverage-mask2d` converts one retained continuous scalar-field source into a renderer-neutral coverage definition plus a bounded rebuildable mask grid. The same coverage-mask Hands now accept either of the repository's current continuous scalar-source families:

- `axm.scalar-field-source/v0.1` (`fbm`);
- `axm.cellular-field-source/v0.1` (`cellular`).

The original fBm graph remains available unchanged as `fx.field.coverage-mask2d`. A second bootstrap graph, `fx.field.coverage-mask2d-cellular`, normalizes the retained cellular source and then uses the **same** coverage-transfer and grid-building Hands. This is an interoperability extension, not a second mask system.

It is intentionally not a smoke effect, dissolve effect, visibility verdict, geometry occlusion solver, gameplay hit mask, UI clipping policy, material choice, or product adapter. Consumers may later interpret coverage values for their own effects without transferring that meaning into Visual Effect Fabric.

## State chain

```text
retained supported continuous scalar-field source
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

The transfer does not copy fBm octaves, cellular feature points, or another field family's internal parameters. It binds to the exact retained source hash and id. If a work state contains more than one supported scalar source, normalization fails unless `maskRequest.fieldSourceKind` explicitly selects `fbm` or `cellular`; the chosen source hash remains the authority afterward.

Mask width and height are not canonical truth. They are working-set choices supplied to the grid-building Hand. Rebuilding the same field + transfer at another resolution therefore retains the same source hash and `coverageMaskSourceHash` while producing a resolution-specific `maskHash`.

## Transfer behavior

For softness `0`, the transfer is a deterministic hard threshold. Values below the threshold map to `0` and values at/above it map to `1`.

For softness above `0`, the transfer uses a bounded smooth threshold centered on the threshold value. This allows continuous coverage between `0` and `1` without assigning semantic meaning to that coverage. `invert` complements the transfer without rewriting the scalar source.

`sampleCoverageSource()` evaluates either supported canonical continuous source plus the retained coverage transfer directly at normalized coordinates. It requires the supplied source id/hash to match the mask's retained lineage. `sampleCoverageMask()` bilinearly samples an already-retained coverage grid. Out-of-domain coordinates fail explicitly rather than silently wrapping or clamping.

## Bounded working set

The default proof builds a `48 x 32` coverage grid. Per-dimension ceilings are `128 x 128`, and the configured cell budget cannot exceed 16,384 retained values.

For fBm input, field sampling retains the existing bounded octave count from the canonical fBm donor. For cellular input, each coverage cell performs the cellular donor's fixed 5x5 nearest-feature search: 25 feature-distance probes per coverage sample. Therefore the default 1,536-cell cellular mask rebuild performs 38,400 feature-distance probes, and the hard 16,384-cell ceiling implies at most 409,600 such probes.

These are structural operation/work bounds only. They do not prove frame time, CPU/GPU cost, memory residency, thermal behavior, battery use, browser cost, target-device scalability, or visual quality.

## Reuse evidence

The same coverage-transfer and grid-building Hands are challenged by materially different source families and transfer contexts:

- fBm plus a soft continuous mask;
- fBm plus a hard inverted mask;
- cellular nearest-feature distance/inverse-distance sources;
- the same cellular source + mask transfer rebuilt at different grid resolutions;
- the same transfer settings over fBm and cellular sources, where source lineage and derived mask hashes must remain distinct.

When both normalized source families are present in one state, implicit source selection is rejected. An explicit source-kind selector is required so a convenient state layout cannot silently change canonical lineage.

## Truth boundary

Tests can prove deterministic caller-neutral mask construction, multi-family source lineage, canonical-transfer / derived-grid separation, hard/soft/inverted transfer behavior, bounded working-set failure, normalized finite coverage, direct continuous sampling, retained-grid sampling, ambiguity rejection, and rejection of self-consistent but unsupported cellular algorithm state.

They do **not** prove that a mask is visually pleasing, represents physical visibility, solves geometric occlusion, improves smoke/fire/weather/materials, or is accepted by any game/software/world consumer. No renderer output is introduced in this bounded proof, so aesthetic quality is `NOT_TESTED`.

This change does not make existing fBm-only downstream families automatically cellular-aware. Each downstream consumer must adopt the broader source contract explicitly and verify its own lineage assumptions. No Universal Creation or consumer repository is modified.

## Provenance

The implementation in `hand-lab/src/field-mask-operators.mjs` was written in-repository for this proof. It composes the existing AXM fBm and cellular donors and imports no external shader, mask, noise, cellular, occlusion, renderer, or image-processing implementation. Older donors remain available and are not destructively replaced.

## Next bounded directions

Prefer one evidence-backed downstream consumer that benefits from the now-broader mask source contract, rather than mass-converting every effect family. Strong candidates are:

- make mask-guided light rays accept the same retained multi-family coverage lineage without faking cellular state into fBm keys;
- let contour or one stylized treatment consume a generic retained continuous source only if that closes a concrete reuse gap;
- obtain real target-renderer pixels when a visual consumer uses these masks, while keeping CI/source evidence separate from aesthetic claims.
