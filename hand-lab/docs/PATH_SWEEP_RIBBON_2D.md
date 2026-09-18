# Path Sweep Ribbon 2D

## Bounded improvement

`fx.geometry.path-sweep-ribbon2d` is a renderer-neutral derived realization of the verified `fx.geometry.path-sweep-frame2d` donor.

It converts each verified center/frame sample into explicit left/right boundary samples. This adds **no new canonical geometry truth**: the ribbon set is information-equivalent to the verified frame position, normal and half-width. Its reusable value is an interface boundary—later renderers or geometry adapters can consume explicit boundary pairs without becoming authorities over path or sweep truth.

It does **not** join boundary samples into a polygon, generate caps, clip to a viewport, triangulate, create a mesh, assign UVs/materials, select a renderer, or port anything into a game, UI, world, website, or Universal Creation.

## Canonical and derived boundaries

Canonical authority remains upstream:

- retained path state and `pathSourceHash`;
- retained `axm.path-sweep-frame-source/v0.1` and its source hash.

The existing `axm.path-sweep-frame-set/v0.1` remains rebuildable derived state. The new `axm.path-sweep-ribbon-set/v0.1` is also rebuildable derived state and records exact lineage to:

- retained path source hash;
- retained sweep-frame source hash;
- selected verified frame-set hash.

No new retained ribbon source is introduced because the boundary mapping is completely determined by existing verified truth. Creating another canonical request/source for the same information would be architecture churn.

## Boundary derivation

For every verified frame sample:

- `center = frame position`;
- `left = center + normal * halfWidth`;
- `right = center - normal * halfWidth`.

Coordinates are deterministically rounded to six decimal places. The derivation does not clamp output to `[0,1]`; boundary samples may extend outside the retained path coordinate domain. Clipping belongs to a later replaceable realization.

Fixed derived semantics are:

- algorithm: `frame-normal-ribbon-boundary2d/v0.1`;
- profile: `symmetric-ribbon2d`;
- boundary policy: `center-plus-minus-normal-half-width`;
- clipping: `none`;
- join authority: `none`;
- cap authority: `none`;
- triangulation: `none`;
- renderer authority: `none`;
- mesh authority: `none`.

These are **boundary samples**, not a claim that connecting them creates a valid non-self-intersecting strip for every path. Sharp corners, reversals and self-intersections still require an explicit later join/topology policy.

## Verification boundary

Before deriving or validating a ribbon set, the Hand invokes the existing `validatePathSweepFrameSet(...)` boundary. That validator rechecks retained path/source hashes and semantics and freshly rebuilds the expected frame set from retained truth.

Ribbon validation then checks its exact path/sweep/frame lineages, fixed derivation semantics, structural hash, and provenance, and freshly rebuilds the complete expected ribbon set from the verified frame set. Recomputing a hash after altering a frame or ribbon boundary therefore does not elevate modified derived state into canonical truth.

## Bounds and performance honesty

- inherited hard retained-point ceiling: 16,384 points;
- normal graph work budget: 4,096 points;
- one bounded frame-truth verification/rebuild through the existing donor;
- one linear ribbon-boundary derivation pass over verified frame samples;
- validation intentionally performs another bounded ribbon rebuild.

These are structural bounds only. No CPU/GPU timings, FPS, memory-residency figures, browser costs, mobile costs, thermals, battery behavior or device scalability were measured.

## Provenance and reuse

External code/source reuse: **none**.

Internal donor reuse is explicit:

- `hand-lab/src/path-sweep-frame2d.mjs#fx.geometry.path-sweep-frame2d`.

The older frame donor remains independently useful. This wrapper does not rewrite its source, derived frame set or semantics.

## Evidence boundary

Targeted tests cover deterministic human/machine caller parity, retained-state preservation, exact straight-path boundary offsets, exact zero-width collapse, turning geometry, unclipped boundary output, absence of join/cap/triangulation authority, self-consistently rehashed frame tampering, self-consistently rehashed ribbon tampering, forged sweep semantics, retained-path drift, missing frame derivation and structural work-budget failure.

There is no renderer in this improvement, so there is no rendered output to inspect. Ribbon silhouette quality, corner/join quality, cap quality, self-intersection behavior, anti-aliasing, fill behavior, mesh suitability, UV behavior, material response, accessibility and target-device appearance are **NOT_TESTED**.

## No-premature-port boundary

Nothing in this donor grants automatic authority to Universal Creation or any other consumer. A later consumer may import it only through an explicit adapter/port decision that preserves retained path/sweep lineage and keeps renderer or mesh choices replaceable.

## Next bounded target

This closes the smallest defensible `path -> verified local frames -> explicit ribbon boundaries` chain. The next audit should **not** add another ribbon wrapper unless a real consumer-neutral geometry need is demonstrated. The strongest separate geometry gap is instancing: determine whether existing retained point/path/effect state can justify a bounded renderer-neutral transform-instance descriptor without inventing consumer placement semantics. If not, report saturation rather than adding abstraction.
