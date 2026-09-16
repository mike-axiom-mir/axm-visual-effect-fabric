# Transient impulse parameter-curve modulation

`fx.transient-impulse.parameter-curve-modulation` composes two existing reusable Visual Effect Fabric capabilities without moving either source of truth into a renderer or consumer: the retained transient-impulse event/field/envelope and `fx.animation.parameter-curve1d`.

## Boundary

The transient event remains canonical under `eventCanonicalHash`. The impulse field remains derived/rebuildable under its existing `geometryHash`. The ordinary `axm.transient-envelope/v0.1` remains present and unchanged as the base envelope. The parameter curve remains an independent normalized-time source under `parameterCurveSourceHash`.

The adapter produces a separate `axm.transient-impulse-curve-envelope/v0.1`. It records the canonical-event hash, field-geometry hash, exact hash of the consumed base envelope, and exact parameter-curve source hash. It changes only derived envelope intensity. Base sample time and expansion are copied unchanged, and each derived sample records the curve multiplier that was applied.

No renderer is selected or modified. The existing SVG, Canvas, static, field-modulated, and other impulse donors remain available.

## Consumer-neutral semantics

For this adapter the parameter curve is an intensity multiplier sampled at the base envelope's normalized time. The generic parameter-curve source stays generic; only this integration constrains accepted sampled multipliers to `[0,2]`. Values outside that range fail rather than being silently clamped or promoted into transient-impulse truth.

A constant-one curve is an exact intensity no-op. Other valid curves can suppress or amplify the derived impulse intensity while leaving expansion and the base envelope intact.

## Evidence exercised

Tests challenge:

- human/machine caller-neutral determinism;
- exact retention of canonical event, base field, base envelope, and curve-source lineages;
- constant-one no-op behavior;
- shaped intensity modulation without expansion rewrite;
- materially different directional and highly symmetric transient-impulse contexts;
- parameter-curve source drift, canonical-event drift, and broken envelope-to-field lineage;
- rejection of transient-impulse curve multipliers outside `[0,2]`.

The graph uses the existing 17-sample transient envelope. The base envelope Hand structurally permits 5–33 samples, while the parameter-curve source retains its independent 2–64 keyframe limit. These are structural bounds only, not CPU/GPU/FPS, memory-residency, battery, thermal, or device-performance measurements.

## Provenance

No external VFX, animation, shader, or timing implementation is imported by this adapter. It composes existing AXM Hands. The parameter-curve source continues to preserve its own concept-donor provenance to `runtime/library/packages/motion.idle-pulse.axmfx.json#primitive.motion-curve` with `sourceReuse: none`. The imported AetherFX runtime is not modified.

## Visual truth boundary

This change produces derived timing/intensity data, not new rendered pixels. Therefore motion quality, pacing quality, readability, compositing quality, aesthetic quality, accessibility suitability, and device behavior remain `NOT_TESTED`. A green test or CI run cannot promote those claims.

## Consumer boundary

This remains inside Visual Effect Fabric. It does not port the capability into Universal Creation, a game, software product, world, or other consumer repository. Any later renderer or consumer binding should reference the retained hashes rather than rewriting the event, base envelope, or curve source.

## Next bounded target

Only if a current replaceable transient-impulse realization can consume the derived curve envelope without duplicating renderer logic should one realization be taught to select it through a disposable render view. Otherwise this integration is complete enough to stop and growth should move to a materially different reusable VFX family.
