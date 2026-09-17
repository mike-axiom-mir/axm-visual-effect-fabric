# Path wave displacement

`fx.path.wave-displace2d` is a renderer-neutral spatial deformation Hand for retained 2D paths. It adds deterministic sine-wave displacement along each path's local normal without introducing a field dependency, consumer meaning, or renderer authority.

It is deliberately different from `fx.path.flow-displace2d`: flow displacement samples an existing vector field at each path point, while wave displacement derives a periodic offset from normalized polyline arc length and local path direction. The older flow donor remains useful and unchanged.

## Canonical versus derived state

The input `paths` array is retained unchanged and hashed as `pathSourceHash`. `fx.path.wave-displacement-source-normalize` records exact path lineage and wave treatment in `axm.path-wave-displacement-source/v0.1`:

- amplitude in normalized 2D domain units;
- cycles over normalized polyline length;
- normalized phase in cycles;
- optional endpoint envelope;
- fixed arc-parameterization, tangent, displacement, and clamping semantics.

`fx.path.wave-displacement-build` writes a separate rebuildable `axm.wave-displaced-path-set/v0.1` under `waveDisplacedPathSets`. Path count, point count, path metadata, and non-coordinate point metadata are preserved. Only derived `x`/`y` coordinates can change.

Wave phase follows cumulative polyline length, not point index. Local tangents use centered neighboring points where possible, with a deterministic axis fallback for a fully degenerate path. The displacement direction is the local normal. `endpointEnvelope: true` pins the first and last point exactly and applies a `sin(pi*t)` envelope between them. `amplitude: 0` is an exact derived no-op.

The capability does not assign water, rope, cloth, shockwave, electricity, UI, animation, game, software, or world meaning. Those interpretations belong to later consumers or replaceable realizations.

## Lineage and failure behavior

Before derived construction, the Hand re-hashes the retained path topology and normalized wave source. It also revalidates the fixed algorithm, arc-parameterization, tangent, and clamp identifiers instead of accepting a source merely because an attacker recomputed a self-consistent hash after changing those semantics.

The default derived point ceiling is 4,096 and the hard accepted ceiling is 16,384 points. Construction performs one bounded path-length pass plus bounded local-tangent searches and one wave transform per retained point. This is structural operation evidence only; no CPU/GPU frame time, memory residency, browser cost, battery, thermals, or target-device performance has been measured.

## Provenance

The implementation is repository-authored and composes the existing retained 2D path contract and Hand runtime. No external wave, deformation, shader, SVG, geometry, or image-processing implementation was imported. Existing electric paths are used only as representative test donors because they already provide reusable retained path topology.

## Evidence boundary

The tests establish deterministic caller-neutral construction, canonical path preservation, exact zero-amplitude behavior, local-normal behavior on horizontal and vertical paths, normalized arc-length phase on uneven point spacing, phase/cycle treatment changes without path-source mutation, semantic-source tamper rejection, malformed-input rejection, metadata preservation, and explicit point-budget failure.

No renderer is introduced here, so there is no new trustworthy raster/browser/device output to inspect. Visual attractiveness, aliasing, motion quality, deformation readability, physical wave behavior, and target-device appearance are **NOT_TESTED**. Green tests or source inspection must not be promoted into an aesthetic-quality claim.

No Universal Creation, game, software, UI, or world repository integration is performed by this Hand.
