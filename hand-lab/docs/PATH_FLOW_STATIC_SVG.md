# Path flow static SVG

`fx.path.flow-displaced-static-svg` is a replaceable static inspection realization for the existing renderer-neutral `fx.path.flow-displace2d` capability. It does not introduce a second deformation system. It consumes the retained canonical path topology, retained scalar/vector-flow sources and the separately rebuildable `axm.flow-guided-path-set/v0.1` donor.

## Canonical versus derived versus renderer state

The canonical input `paths` array remains unchanged beside the deformation result and keeps its exact `pathSourceHash`. Scalar-field, vector-flow and displacement-source hashes are retained unchanged. `fx.path.flow-displacement-build` remains the only stage that derives the displaced path geometry.

`fx.path.flow-static-svg-realize` is renderer-only. Width, height, padding, stroke width, opacity, optional base-path underlay and renderer point budget do not become source truth and do not change the selected path-set hash. The SVG carries the selected derived path-set hash and all retained lineage hashes.

Before realization the Hand re-hashes the retained paths, scalar source, vector-flow source, displacement source and selected path set. It then rebuilds the expected flow-guided path set from retained truth and requires the exact derived hash to match. A self-consistent edit to derived geometry plus its stored hash therefore still fails instead of being promoted into renderer truth.

The optional base-path underlay is only an inspection aid. It does not imply that the derived path set replaced the retained topology, and disabling it does not change canonical or derived state.

## Consumer neutrality

The realization assigns no electrical, crack, root, vein, river, trail, brush, game, UI, software or world meaning. Existing path donors remain independently useful. Consumer-specific interpretation belongs in separate adapters and no Universal Creation or other consumer repository is modified by this capability.

## Structural bounds and performance honesty

The renderer defaults to a 640 x 420 SVG and a 4,096-point selected-set ceiling. The hard accepted renderer ceiling is 16,384 points, matching the existing displacement Hand's hard derived-point ceiling. Viewport size is bounded to 64-4,096 pixels per axis. These are structural guards only.

No FPS, CPU/GPU time, memory residency, browser cost, battery, thermal or target-device scalability measurement is established by those ceilings. Performance remains **NOT_TESTED** outside the structural bounds.

## Evidence boundary

Tests challenge:

- human/machine caller neutrality and deterministic artifacts;
- unchanged canonical paths and exact path-set lineage;
- zero-amplitude exact derived no-op behavior;
- renderer-only control changes without source or derived-state mutation;
- gradient-versus-tangent deformation from the same retained path/scalar truth;
- materially different diagonal and near-vertical path forms;
- canonical drift and self-consistent derived tampering;
- XML attribute escaping plus layout and point-budget failures;
- exact deterministic artifact hashing.

The SVG is a deterministic generated artifact, but CI/source inspection alone does not prove visual hierarchy, deformation readability, anti-aliasing, accessibility, compositing quality, physical flow accuracy or target-device aesthetics. Those remain **NOT_TESTED** until the exact output is rasterized or observed on an identified renderer/device and reviewed as such.

No external deformation, SVG, vector-field or renderer implementation is imported by this change. It composes existing AXM path-flow and Hand-runtime contracts.
