# Reusable scalar-derived vector flow v0.1

`fx.field.flow2d` derives a continuous renderer-neutral 2D vector-flow source from the existing deterministic scalar fBm source, then optionally samples that source into a bounded rebuildable vector grid.

It is intentionally not smoke, wind, water, particle motion, brush behavior, gameplay steering, pathfinding, UI motion, or a world rule. Future consumers may assign those meanings outside this capability; the flow body only converts retained scalar-field variation into bounded vectors while preserving exact source lineage.

## State chain

```text
canonical scalar-field source
          +
canonical neutral flow controls
          -> continuous vector-flow source
          -> rebuildable bounded vector grid
          -> replaceable consumer / renderer use
```

Grid width and height remain derived working-set choices. Changing resolution does not rewrite the scalar source or the continuous flow source.

## Modes

- `gradient` points across scalar contours in the local direction of increase.
- `tangent` rotates the same local gradient by 90 degrees, producing a contour-following direction.

Both modes use the same bounded finite-difference sampler. `sampleStep` controls the continuous probe distance and `strength` controls how quickly raw local variation saturates toward a unit vector. Output components remain within `[-1,1]` and vector magnitude within `[0,1]`.

These are mathematical direction fields only. They do not imply physical velocity, force, pressure, fluid transport, turbulence simulation, or correct particle integration.

## Source and derived state

The scalar source is normalized through the existing `fx.field.fbm-source-normalize` implementation; this change does not create a parallel scalar-field definition.

The continuous flow source is `axm.vector-flow-source/v0.1`. It records:

- flow id;
- algorithm identity;
- exact scalar-source id and hash;
- `gradient` or `tangent` mode;
- bounded finite-difference `sampleStep`;
- bounded `strength`.

The retained grid is `axm.vector-flow-grid/v0.1`. It stores interleaved x/y vector components plus exact scalar-source and flow-source hashes and is explicitly `derived` and `rebuildable`.

Before a grid is built, the Hand re-hashes the live scalar source and flow source. Source drift therefore fails explicitly rather than silently changing retained flow output.

## Bounded working set

The default graph builds a `48 x 32` grid: 1,536 cells and 3,072 retained numeric vector components.

Per-dimension ceilings are `128 x 128`, with a hard cell ceiling of 16,384 cells and therefore at most 32,768 retained vector components for this v0.1 grid path.

Those ceilings are structural work/memory bounds only. They are not measured CPU time, GPU time, frame time, device scalability, battery cost, or visual-quality claims.

## Reuse evidence

Tests challenge the same graph through:

- human and machine caller kinds, requiring byte-equivalent deterministic state;
- different retained grid resolutions, requiring scalar-source and flow-source hashes to remain unchanged while derived grid hashes change;
- `gradient` and `tangent` modes over the same scalar truth, requiring orthogonal non-zero directions with equal sampled magnitude;
- materially different broad low-frequency drift and fine high-frequency guidance contexts;
- retained-grid interpolation;
- scalar-source drift, flow-source drift, invalid controls, invalid probe coordinates, and oversized working sets.

The two context fixtures are evidence that the contract is not tied to one narrow effect demo. They are not claims that either fixture already looks like good wind, smoke, water, hair, brushwork, or particle motion.

## Truth boundary

Tests can prove deterministic caller-neutral flow derivation, exact scalar-source lineage, resolution-independent continuous flow truth, bounded vector values, rebuildable grid generation, retained-grid sampling, and explicit failure boundaries.

No renderer is added in this change and there are no new rendered pixels to inspect. Aesthetic quality and motion readability are therefore `NOT_TESTED` rather than inferred from vector data or green CI.

This implementation does not claim Navier-Stokes fluids, physical turbulence, collision-aware motion, incompressibility, conservation laws, stable particle integration, or consumer acceptance.

No Universal Creation, game, software, world, or other consumer repository is modified.

## Provenance

The implementation is written directly in Visual Effect Fabric and reuses the repository's existing AXM-authored deterministic scalar-field normalization and sampling code. No external vector-field, fluid, shader, VFX, or simulation source code is imported.

## Next bounded directions

After this flow primitive is proven, strong evidence-led targets include:

- one existing particle/path-like donor consuming the vector field through a derived adapter while retaining its own canonical state;
- a bounded domain-warp operator that uses a vector field to transform sampling coordinates without rewriting source fields;
- a real vector-field visualization only when an existing replaceable renderer can be reused without architecture duplication;
- direct motion/readability review only after a real consumer produces observable rendered output.
