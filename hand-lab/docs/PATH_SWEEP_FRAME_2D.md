# Path Sweep Frame 2D

## Bounded improvement

`fx.geometry.path-sweep-frame2d` is the smallest geometry-realization donor currently justified by the retained 2D path state.

It does **not** generate a mesh, choose a renderer, assign a material, create UVs, infer 3D torsion, or port anything into a game, UI, world, website, or Universal Creation. It derives a bounded local frame descriptor from path truth so later replaceable realizers can decide whether to make a ribbon, stroke, mesh strip, or another compatible expression.

## Retained truth

`axm.path-sweep-frame-source/v0.1` retains:

- the exact retained path hash and path/point cardinality;
- a neutral constant `halfWidth` in path-coordinate units;
- fixed profile semantics: `symmetric-ribbon2d`;
- fixed frame policy: `left-normal-bisector2d`;
- fixed reversal fallback: `outgoing-segment`;
- fixed width mode: `constant-half-width`;
- provenance declaring no external source reuse and no renderer/mesh authority.

The source refuses unsupported 3D/tube/Frenet semantics instead of pretending the 2D donor contains information it does not have.

## Derived geometry descriptor

`axm.path-sweep-frame-set/v0.1` is rebuildable derived state. For each retained path point it records:

- source position;
- local tangent;
- left normal;
- neutral half-width.

Interior tangents use the normalized bisector of adjacent non-zero polyline spans. Exact 180-degree reversals use the explicitly retained outgoing-segment fallback. Consecutive duplicate points are rejected because a zero-length span does not provide a defensible local frame.

No derived frame becomes canonical path truth. Validation rebuilds the expected frame set from retained paths plus retained sweep-source semantics and rejects altered frame data even when its derived hash is recomputed.

## Bounds and performance honesty

- hard path ceiling: 1,024 paths;
- hard retained-point ceiling: 16,384 points;
- normal graph work budget: 4,096 points;
- one linear frame-derivation pass over retained points;
- validation intentionally pays for one bounded exact rebuild.

These are structural work bounds only. No CPU/GPU timings, FPS, memory-residency figures, browser costs, mobile costs, thermals, battery behavior, or device scalability were measured.

## Provenance and donor relationship

External code/source reuse: **none**.

Adjacent retained donors remain independent and useful:

- `fx.path.flow-displace2d`;
- `fx.path.wave-displace2d`;
- `fx.path.break-fragment2d`.

The new donor consumes ordinary 2D path truth and does not rewrite those donors or require their use.

## Evidence boundary

The targeted tests cover deterministic human/machine caller parity, straight and corner frames, zero-width behavior, explicit reversal fallback, retained-path drift, self-consistently rehashed source-semantic forgery, self-consistently rehashed derived-frame tampering, malformed/unsupported geometry requests, zero-length spans, and structural work-budget failure.

There is no renderer in this improvement, so there is no new rendered output to inspect. Sweep appearance, join quality, cap quality, silhouette quality, anti-aliasing, material response, 3D usefulness, UV quality, animation deformation behavior, accessibility, and target-device appearance are **NOT_TESTED**.

## No-premature-port boundary

Nothing in this donor grants automatic authority to Universal Creation or any other consumer. A later consumer may import it only through an explicit adapter/port decision that preserves the retained path and sweep lineages.

## Next bounded target

The strongest next target is one **replaceable derived realization** that consumes this verified frame set without changing source truth. The smallest defensible candidate is a renderer-neutral 2D ribbon-outline/strip descriptor from the frame positions/normals, still stopping before triangulated mesh generation. If that adds no reusable information beyond the current frames, stop this branch and audit a separate geometry gap such as instancing rather than creating architecture churn.
