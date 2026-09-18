# Path Sweep Indexed Strip 2D

## Bounded improvement

`fx.geometry.path-sweep-indexed-strip2d` adds the smallest renderer-neutral connectivity layer that the existing verified 2D ribbon boundaries can justify.

The existing `fx.geometry.path-sweep-ribbon2d` donor already supplies rebuildable left/right boundary pairs for every verified path point. This donor does **not** invent another path, sweep, ribbon, join, cap, material, renderer, or consumer model. It only gives adjacent boundary pairs deterministic local vertex indices and two triangle-list connectivity records per path span.

No new canonical geometry source is introduced. The indexed strip is derived and rebuildable because every emitted vertex and index is fully determined by the already verified ribbon set.

## Why connectivity is justified but a general mesh claim is not

For a path with boundary pairs `left_i/right_i` and `left_next/right_next`, the donor emits local vertices in `left, right` order and connectivity:

- `[left_i, right_i, left_next]`
- `[right_i, right_next, left_next]`

This is enough to let a later replaceable renderer or geometry adapter consume explicit triangle connectivity. It is **not** enough to claim that every resulting strip is a valid non-self-intersecting surface.

The fixed topology semantics therefore keep these authorities absent:

- path bridging: forbidden;
- joins: none;
- caps: none;
- clipping: none;
- UVs: none;
- material: none;
- renderer: none;
- front-face/winding validity: none;
- manifold validity: none;
- self-intersection resolution: none.

The geometry-validity claim is explicitly `connectivity-only`. Zero-width ribbons remain valid structural inputs and produce degenerate triangles; this donor does not silently promote them into non-degenerate surface geometry.

## Canonical and derived boundaries

Canonical authority remains upstream:

- retained path state and `pathSourceHash`;
- retained `axm.path-sweep-frame-source/v0.1` and its source hash.

Derived, rebuildable upstream state remains separate:

- `axm.path-sweep-frame-set/v0.1`;
- `axm.path-sweep-ribbon-set/v0.1`.

The new `axm.path-sweep-indexed-strip-set/v0.1` records exact lineage to the retained path/sweep sources plus the selected verified frame-set and ribbon-set hashes. It stores per-path vertices and triangle lists so unrelated paths are never bridged.

Creating a retained mesh or strip request would duplicate information already determined by verified upstream state, so no such canonical object is added.

## Verification boundary

Before indexed connectivity is built or accepted, the Hand invokes `validatePathSweepRibbonSet(...)`. That path revalidates retained path/sweep truth, verifies the selected frame set, and freshly rebuilds the complete ribbon boundary set.

The indexed-strip validator then checks:

- exact path, sweep, frame, and ribbon lineage;
- expected path/point/vertex/triangle/index cardinalities;
- fixed topology semantics and provenance;
- its structural hash;
- a fresh complete indexed-strip rebuild from the verified ribbon set.

Consequences:

- changing a ribbon boundary and recomputing its hash is still rejected upstream;
- changing triangle connectivity and recomputing the indexed-strip hash is still rejected;
- changing topology semantics to grant a renderer or stronger geometry authority is rejected;
- retained path drift invalidates the chain even when old derived sets are still present.

## Structural bounds and performance honesty

The donor inherits the upstream retained-point limits:

- hard retained-point ceiling: **16,384 points**;
- normal graph work budget: **4,096 points**.

For `P` verified ribbon points split across `N` paths, the descriptor contains exactly:

- `2P` local vertices;
- `2(P - N)` triangle records;
- `6(P - N)` scalar triangle indices.

Construction is one bounded pass over verified ribbon points after the existing upstream verification/rebuild work. Validation intentionally performs another exact bounded reconstruction.

These are structural facts, not timing measurements. CPU/GPU time, FPS, memory residency, upload cost, browser cost, mobile cost, battery use, thermals, and device scalability are **NOT_TESTED**.

## Provenance and donor preservation

External source/code reuse: **none**.

Internal donor reuse is explicit:

- `hand-lab/src/path-sweep-ribbon2d.mjs#fx.geometry.path-sweep-ribbon2d`;
- through it, the existing verified sweep-frame lineage.

The frame, ribbon, instancing, particle, SVG, and holographic donors remain independently useful and unchanged. The existing holographic surface reconstruction is renderer-specific and explicitly does not claim a geometric mesh, so this connectivity descriptor does not replace it.

## Consumer-neutral boundary

The indexed strip assigns no game, software, UI, world, object, collision, physics, material, texture, or product meaning. It does not create a renderer or port anything into Universal Creation or any other consumer.

A later adapter may consume the connectivity only through an explicit integration decision that preserves source lineage and keeps renderer/material choices replaceable.

## Evidence boundary

Seven focused tests cover:

- deterministic human/machine caller parity and retained-state preservation;
- exact straight-strip vertex/index connectivity;
- multiple-path isolation and zero-width degenerate connectivity;
- materially different turning geometry with the same neutral topology rule;
- self-consistently rehashed ribbon tamper rejection;
- self-consistently rehashed topology tamper and semantic-forgery rejection;
- missing derivation, retained-path drift, and structural work-budget failure.

There is intentionally no renderer in this change, so there are no new pixels to inspect. Triangle winding appearance, fill behavior, self-intersection behavior, join/cap quality, anti-aliasing, material response, UV behavior, accessibility, aesthetic quality, and target-device appearance are **NOT_TESTED**.

## Next bounded target

This closes the smallest defensible `verified ribbon boundaries -> explicit local triangle connectivity` step without pretending the result is a general-purpose mesh.

The next audit should not add a mesh wrapper merely to rename this descriptor. A stronger next target exists only if current retained effect state can justify one additional consumer-neutral attribute channel—such as a verified per-vertex neutral weight derived from an existing propagation or parameter source—without absorbing renderer/material meaning. If no such reuse is both independent and non-duplicative, report geometry saturation and move to a different VFX gap rather than adding architecture churn.
