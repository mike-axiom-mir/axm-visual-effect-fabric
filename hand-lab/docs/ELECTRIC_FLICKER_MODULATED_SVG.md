# Flicker-modulated electric static SVG

## Capability

`fx.electric-storm.flicker-cycle-modulated-svg` gives the existing renderer-neutral flicker/electric bridge one replaceable static SVG realization. It does not create another electric topology system, another flicker system, or a consumer-specific effect.

The retained sources remain independent:

- editable electric paths remain canonical electric topology/energy state;
- `axm.flicker-cycle-source/v0.1` remains canonical periodic modulation truth;
- `axm.electric-flicker-modulation-source/v0.1` remains the retained binding contract;
- `axm.electric-flicker-modulated-path-set/v0.1` remains derived and rebuildable at a selected normalized phase;
- `axm.vfx.electric-flicker-modulated-svg/v0.1` is disposable renderer output.

The realization reuses `hand-lab/src/electric-hands.mjs#fx.electric.svg-preview`. It creates a temporary render view containing the already verified derived path set and never overwrites the retained electric paths.

## Truth boundary

`fx.electric.flicker-modulated-svg-realize` refuses to render until the selected derived path set passes `validateElectricFlickerModulatedPathSet(...)`.

That validation checks retained hashes and fixed semantics, then rebuilds the expected flicker-modulated electric path set from retained electric + flicker + binding truth at the recorded phase. A changed derived set does not become authoritative merely because its `pathSetHash` and `modulatedSetHash` were recomputed consistently.

The SVG donor must also report `derivedFromTopologyHash` equal to the selected derived path-set hash. The realization records the independent base-path, flicker-cycle, binding-source, derived-set, and SVG-content hashes.

## Caller neutrality and consumer neutrality

The Hand is deterministic, caller-neutral, offline, and network-forbidden. Human, model, or deterministic-machine callers use the same graph and controls.

No game, software, UI, world, damage, light-source, material, or product semantics are introduced here. A later consumer may interpret the realization, but that interpretation is outside this VFX donor.

## Replaceable renderer boundary

The SVG is inspection/output state only. A Canvas, WebGL, engine, raster, video, or geometry renderer may replace it later without rewriting electric topology, flicker truth, binding truth, or the derived phase sample.

The existing SVG donor currently maps trunk/branch path state according to its own renderer rules. This wrapper does not silently improve, reinterpret, or aestheticize those rules.

## Structural performance evidence

The inherited flicker-electric source validator accepts at most:

- 64 electric paths;
- 4,096 retained path points.

For one requested phase, source verification performs one bounded flicker sample plus one exact rebuild of the derived energy path set. SVG realization then performs one bounded projection/serialization pass through the existing electric SVG donor. These are structural operation bounds only.

FPS, CPU/GPU timing, memory residency, browser cost, mobile cost, battery, thermals, animation cadence, and device scalability are `NOT_TESTED`.

## Provenance

All composition in this capability is internal AXM donor reuse:

- electric topology/energy: `hand-lab/src/electric-hands.mjs`;
- flicker source: `hand-lab/src/flicker-cycle1d.mjs`;
- electric/flicker derived binding: `hand-lab/src/electric-flicker-modulation.mjs`;
- SVG realization donor: `hand-lab/src/electric-hands.mjs#fx.electric.svg-preview`.

External source reuse: `none`.

Imported `runtime/` AetherFX content is not changed by this Hand-lab improvement. No Universal Creation, game, software, UI, or world port is part of this capability.

## Evidence / non-claims

Automated tests can prove deterministic source lineage, exact phase rebuilding, caller neutrality, byte identity in no-op cases, derived-state rejection, and successful SVG construction. Those facts do not prove the effect is attractive or comfortable to watch.

Unless an exact generated artifact is rasterized and visually inspected, the following remain `NOT_TESTED`: aesthetic quality, perceived flicker quality, temporal feel, readability, compositing quality, aliasing, accessibility/photosensitivity suitability, and target-device appearance.

## Next bounded target

If trustworthy raster/browser observation of this exact source-verified realization is available, inspect at least a no-op phase/strength case and one materially different flicker phase without changing canonical state. Otherwise stop this flicker-realization branch and audit a genuinely different reusable VFX gap rather than adding a generic binding or renderer framework.
