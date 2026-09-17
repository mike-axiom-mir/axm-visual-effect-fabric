# Transient impulse curve-selected static SVG

`fx.transient-impulse.parameter-curve-static` gives the existing renderer-neutral transient-impulse + parameter-curve integration one replaceable inspection realization without creating another SVG engine.

## Boundary

The canonical transient event remains under `eventCanonicalHash`. The base impulse field remains separately derived/rebuildable under its existing `geometryHash`. The ordinary `axm.transient-envelope/v0.1` remains retained and unchanged as the base timing envelope. The normalized parameter curve remains independent source truth under `parameterCurveSourceHash`.

The existing `axm.transient-impulse-curve-envelope/v0.1` remains a separate rebuildable result. This selector validates its canonical-event, field-geometry, base-envelope and parameter-curve lineage before rendering, then rechecks each selected sample against the retained curve source and base envelope. Invalid or drifted selected data fails instead of silently becoming renderer truth.

## Replaceable renderer reuse

The selector does not replace `next.impulseEnvelope`. It builds a disposable render view whose envelope samples are copied from the validated curve-modulated envelope, then invokes the existing `fx.impulse.static-svg-realize` donor.

The resulting `axm.vfx.transient-impulse-curve-static-svg/v0.1` realization records:

- canonical transient-event hash;
- retained field-geometry hash;
- exact retained base-envelope hash;
- exact selected curve-envelope hash;
- exact parameter-curve source hash;
- the donor-selected static peak time, intensity and expansion.

A constant-one parameter curve is required to produce SVG content byte-identical to the ordinary static donor while still retaining separate selected-envelope lineage. A non-identity valid curve must change the rendered artifact without rewriting the event, field or base envelope.

## Evidence exercised

Tests challenge:

- human/machine caller-neutral determinism;
- exact retention of canonical event, base field, base envelope and parameter-curve source;
- byte identity with the ordinary static donor for a constant-one curve;
- artifact difference for a shaped curve while base truth remains unchanged;
- one selector across materially different directional and highly symmetric impulse forms;
- parameter-curve source drift, base-envelope drift, selected-sample drift and selected-stat drift.

## Performance truth

The bounded graph uses the existing 17-sample transient envelope, the existing base-envelope allowance of 5–33 samples, the parameter-curve source's 2–64 keyframe ceiling, and the static impulse field ceilings of 8 rings, 18 spokes and 42 fragments used by this graph. These are structural working-set bounds only. They are not FPS, CPU/GPU time, memory residency, battery, thermal or device-performance measurements.

## Provenance

No external renderer, shader, timing or VFX implementation is imported. The selector composes existing AXM Hands and preserves the parameter-curve capability's existing concept-donor provenance with no source reuse. The imported AetherFX runtime remains outside this change and is expected to remain byte-unchanged under the repository proof gate.

## Visual truth boundary

This capability produces a real deterministic SVG artifact, but successful source inspection, byte comparison or CI execution does not prove visual hierarchy, timing feel, glow quality, accessibility, compositing quality or target-device aesthetics. Those remain `NOT_TESTED` until the SVG is actually rendered and inspected on an identified renderer/device.

## Consumer boundary

This remains inside Visual Effect Fabric. It does not port into Universal Creation, a game, software product, world or other consumer repository. Consumers may later choose the renderer-neutral effect state or a replaceable realization without moving consumer meaning back into this Hand.

## Next bounded target

The transient impulse curve chain should not gain another selector abstraction after this. The next useful target is direct base-vs-curve-selected SVG pixel observation on an identified renderer/device. If that observation path is unavailable, treat this chain as saturated and move to a materially different reusable VFX family rather than creating architecture churn.
