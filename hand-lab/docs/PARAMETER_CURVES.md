# Renderer-neutral parameter curves

`fx.animation.parameter-curve1d` turns the older declarative `primitive.motion-curve` capability into an executable caller-neutral Hand graph without changing or importing the AetherFX runtime donor.

## Canonical source

The normalized source is `axm.parameter-curve-source/v0.1`:

- normalized time domain `[0,1]`;
- 2–64 strictly ordered keyframes spanning exactly `t=0` through `t=1`;
- finite values bounded structurally to `[-1,000,000,1,000,000]`;
- outgoing interpolation per keyframe: `linear`, `smoothstep`, or `step`;
- wrap behavior: `clamp` or `loop`;
- explicit provenance noting that the existing `runtime/library/packages/motion.idle-pulse.axmfx.json#primitive.motion-curve` is a concept donor only and that no donor source was reused.

The source hash is canonical. Sampling density is not.

## Derived sample table

`fx.animation.parameter-curve-samples-build` optionally creates a rebuildable `axm.parameter-curve-samples/v0.1` table. The default graph uses 129 samples. The Hand accepts 2–4097 samples.

Changing sample density changes only the derived table hash. It does not change the parameter-curve source or source hash. This keeps renderers and consumers free to sample continuously or rebuild at a resolution appropriate to their own target.

## Sampling semantics

`sampleParameterCurveSource(source, t)` is renderer-independent. Exact keyframe times return exact keyframe values. `clamp` holds the endpoint values outside `[0,1]`. `loop` wraps normalized time; it does not claim endpoint continuity when the first and last values differ.

## Evidence boundary

The tests challenge:

- caller-neutral human/machine determinism;
- source truth remaining identical across different derived sample densities;
- distinct `linear`, `smoothstep`, and `step` behavior plus exact keyframe hits;
- clamp and loop behavior, including wrapped negative and positive times;
- two materially different neutral curve shapes: one-shot rise/decay and looping pulse;
- source-lineage drift, malformed keyframes, unsupported controls, and excessive sample counts.

This proves deterministic curve construction, sampling semantics, lineage checks, and structural working-set limits. It does **not** prove motion quality, pacing quality, accessibility suitability for a specific consumer, frame timing, renderer behavior, CPU/GPU cost, or device performance. No renderer is added here, so aesthetic and perceptual quality are `NOT_TESTED`.

## Performance honesty

The hard derived-table ceiling is 4097 samples and the canonical source ceiling is 64 keyframes. Those are structural limits only. No FPS, CPU, GPU, memory-residency, battery, thermal, or device benchmark is claimed.

## Boundary

This remains inside Visual Effect Fabric. It does not port anything into Universal Creation, a game, a software product, or a world. Consumer-specific binding should be a separate adapter that references the curve source/hash rather than rewriting it.

## Next bounded target

Use one existing reusable effect family to consume a retained parameter curve as **derived modulation** without mutating that family’s canonical effect state. A good candidate is transient impulse intensity/decay because it already has deterministic source truth and replaceable realizations. If no integration can preserve both source lineages cleanly, stop rather than inventing a generic binding layer prematurely.
