# Flow-guided branch curves v0.1

`fx.growth.branching2d-flow-guided-static-svg` composes two retained reusable donors without transferring authority between them:

- `fx.growth.branching2d-static-svg` supplies canonical branching-rule truth plus its derived branch network;
- `fx.field.flow2d` supplies canonical scalar/flow source truth and continuous vector sampling.

The new composition does **not** rewrite the retained branch source, branch endpoints, parent/child identity, scalar-field source, or vector-flow source. It creates a separate rebuildable quadratic-curve working set whose control point is displaced by the sampled flow at each segment midpoint.

## State chain

`branch growth request -> retained branch source -> derived branch network`

`scalar field request -> retained scalar source -> retained vector-flow source`

`branch + flow lineages -> retained guidance source -> rebuildable guided curve set -> replaceable static SVG`

The guidance source retains the exact branch-source hash, base-network hash, scalar-source hash and flow-source hash plus two neutral controls:

- `curvatureScale` in `[0, 2]` scales flow displacement relative to each segment's actual length;
- `maxControlOffset` in `[0, 0.5]` caps normalized control-point displacement.

A `curvatureScale` of `0` is a geometric no-op: every curve keeps the exact retained branch endpoints and uses the exact segment midpoint as its quadratic control point. Gradient and tangent flow modes can produce different derived curvature while the same branch network remains unchanged.

## Canonical / derived boundary

Canonical or retained truth:

- branch growth source and source hash;
- scalar-field source and source hash;
- vector-flow source and source hash;
- guidance source and source hash.

Derived and rebuildable:

- base branch network;
- flow-guided quadratic curve set;
- static SVG realization.

The derived curve set keeps one curve per retained branch segment and preserves `segmentId`, `parentId`, `generation`, `start`, and `end`. Only the quadratic control point is flow-guided. Renderer size, stroke width, opacity and origin-marker controls remain disposable realization state.

## Performance boundary

The default graph accepts at most `2,048` guided curves. The Hand hard ceiling is `4,096`, matching the branch-network hard ceiling. These are structural working-set bounds only. They are **not** evidence of FPS, CPU/GPU time, memory residency, battery use, thermals, browser cost, or target-device scalability.

## Provenance

No external L-system, vector-field, path-bending, SVG, shader or renderer implementation is imported. This capability composes AXM's existing branch-growth and flow-field donors through their explicit state contracts. Their original source identity remains intact.

## Evidence / non-claims

Tests cover caller neutrality, zero-curvature geometry, gradient/tangent divergence, guidance-only derived changes, materially different branching forms, source/network/flow/curve lineage rejection, budget failures and exact SVG artifact hashing.

The generated SVG is a deterministic inspection realization. Unless its pixels are actually observed on an identified renderer/device, visual hierarchy, curve readability, aesthetic quality, animation quality, compositing behavior, accessibility and target-device performance remain `NOT_TESTED`.

## Port boundary

This stays inside Visual Effect Fabric. It does not port itself into Universal Creation, games, software, worlds or product repositories. A consumer-specific adapter remains a separate integration decision.
