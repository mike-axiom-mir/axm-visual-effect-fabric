# Path flow displacement

`fx.path.flow-displace2d` is a renderer-neutral adapter between retained 2D path/network topology and the existing `fx.field.flow2d` continuous vector-flow source.

## Canonical versus derived state

The input `paths` array is retained unchanged and hashed as `pathSourceHash`. The scalar source and vector-flow source keep their existing exact hashes. `fx.path.flow-displacement-source-normalize` records those identities in an `axm.path-flow-displacement-source/v0.1` source contract. `fx.path.flow-displacement-build` then writes a separate `axm.flow-guided-path-set/v0.1` under `flowGuidedPathSets`.

The derived path set preserves path count, point count, path metadata and point metadata. Only 2D `x`/`y` coordinates are displaced. `endpointEnvelope: true` applies a neutral `sin(pi*t)` envelope per path so endpoints stay pinned; disabling it permits flow guidance across the full path. `amplitude: 0` is an exact derived no-op.

The adapter does not assign electrical, crack, root, vein, river, trail, particle, brush, game, UI or world meaning. Those meanings remain with callers/consumers. Existing electric paths are used only as representative donor fixtures because they already provide editable retained path topology.

## Lineage and failure behavior

Before derived construction, the Hand re-hashes and verifies:

- retained path topology;
- retained scalar-field source;
- retained vector-flow source;
- the normalized path-flow displacement source.

It rejects drift rather than silently rebuilding against changed source truth. The default derived point ceiling is 4,096 with a hard accepted ceiling of 16,384 points. These are structural working-set bounds only and do not establish CPU, GPU, frame-time, memory, battery or device-performance claims.

## Evidence boundary

The tests establish deterministic/caller-neutral construction, base-state preservation, exact zero-amplitude behavior, endpoint preservation, metadata preservation, materially different diagonal and near-vertical donor forms, gradient-versus-tangent behavior, lineage rejection and point-budget failure.

No renderer is introduced by this capability. Therefore visual hierarchy, aesthetic quality, motion readability, physical flow accuracy and target-device behavior are **NOT_TESTED** until a replaceable realization consumes the derived path set and its actual output is inspected.

No Universal Creation, game, software or world repository integration is performed by this Hand.
