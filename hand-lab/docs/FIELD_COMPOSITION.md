# Reusable scalar-field composition v0.1

`fx.field.compose2d` combines two existing continuous scalar-field sources through a small renderer-neutral algebra contract.

It is intentionally not a smoke effect, fire effect, weather rule, material blend, visibility solver, game mechanic, UI state, or product adapter. Future consumers may assign those meanings outside this capability; the composition body itself only combines normalized scalar values while retaining exact source lineage.

## State chain

```text
canonical scalar-field source A
          +
canonical scalar-field source B
          +
canonical neutral composition operation
          -> rebuildable bounded composed grid
          -> replaceable consumer / renderer use
```

The composition source stores the exact hashes and identities of both normalized input sources plus one neutral operation. Grid width and height remain derived working-set choices rather than canonical composition truth.

## Supported v0.1 operations

- `min` — lower of the two scalar samples
- `max` — higher of the two scalar samples
- `multiply` — product of the two normalized samples
- `add-clamp` — sum clamped to the normalized `[0,1]` range

These operations are deliberately generic. They can later support patterns such as intersecting influence, union-like coverage, modulation, density shaping, breakup, falloffs, masks or other effect construction without those consumer meanings becoming part of the operator contract.

## Source and derived state

Both input fields are normalized through the existing `fx.field.fbm-source-normalize` implementation. The composition does not copy or invent a parallel field definition.

The canonical composition source is `axm.scalar-field-composition-source/v0.1`. It contains:

- composition id;
- operation identity;
- input A id + exact source hash;
- input B id + exact source hash.

The retained grid is `axm.scalar-field-composed-grid/v0.1`. It records both input hashes and the composition-source hash and is explicitly `derived` and `rebuildable`.

Changing only the grid resolution therefore changes the derived grid hash while leaving both input source hashes and the composition-source hash unchanged.

## Bounded working set

The default graph builds a `48 x 32` grid. Per-dimension ceilings are `128 x 128`, and the default hard cell ceiling is 16,384 retained scalar samples.

Those numbers are structural work/memory bounds only. They are not frame-time, GPU-cost, CPU-cost, mobile-readiness, scalability or visual-quality claims.

## Reuse evidence

The same two canonical field sources are challenged through four materially different composition operations. Tests require the two input source hashes to remain unchanged while composition and grid hashes change with the selected algebra.

Tests also rebuild one composition at different resolutions and require:

- both normalized input sources to remain identical;
- both input source hashes to remain identical;
- the composition source and composition-source hash to remain identical;
- direct continuous composed samples to remain identical;
- the derived retained-grid hashes to differ with resolution.

The continuous sampler rejects source objects whose hashes no longer match the composition lineage rather than silently combining changed source state.

## Truth boundary

Tests can prove deterministic caller-neutral composition, exact two-source lineage, normalized bounded scalar algebra, resolution-independent canonical composition, rebuildable bounded grid generation, retained-grid sampling and explicit failure boundaries.

They do **not** prove that any composition looks good in smoke, fire, water, weather, materials, holograms, games, software or any other future consumer. This bounded change creates no renderer artifact, so aesthetic quality is `NOT_TESTED` rather than inferred from scalar values or green CI.

This is also not geometric occlusion, physical simulation, gameplay collision, semantic masking or visibility truth.

No Universal Creation or consumer repository is modified.

## Provenance

The implementation is written directly in Visual Effect Fabric and reuses the repository's existing deterministic fBm normalization and sampling code. No external noise, shader, VFX or composition source code is imported.

## Next bounded directions

After composition itself is proven, strong evidence-led next targets include:

- a bounded domain-warp operator that composes existing field sources without rewriting them;
- a reusable geometric/radial falloff source that can participate in the same scalar algebra;
- one existing VFX family consuming a composed field through an explicit derived adapter while preserving that effect's canonical meaning;
- direct visual review only once a real renderer consumes the composed field.
