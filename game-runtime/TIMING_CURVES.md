# Deterministic VFX timing curves

`src/timing-curves.mjs` adds plan-bound scalar timing envelopes without rewriting the canonical VFX plan.

A curve set is bound to the exact `planSha256` and carries its own receipt. Channels are author-defined names such as `intensity`, `emissive`, `widthScale`, `radiusScale`, or `opacity`. Values are finite scalars sampled over normalized plan time (`0..1`).

Supported interpolation modes:

- `linear`
- `step`
- `smoothstep`

Example:

```js
const timing = createTimingCurveSet(plan, {
  intensity: {
    interpolation: "smoothstep",
    keys: [
      { t: 0, value: 0 },
      { t: 0.2, value: 1 },
      { t: 0.8, value: 1 },
      { t: 1, value: 0 }
    ]
  },
  emissive: {
    interpolation: "linear",
    keys: [
      { t: 0, value: 0.2 },
      { t: 0.25, value: 2 },
      { t: 1, value: 0 }
    ]
  }
});

const sample = samplePlanWithTiming(plan, timing, absoluteTime, interruption);
```

`samplePlanWithTiming()` composes the existing canonical runtime sample with the timing sample. Existing interruption semantics remain authoritative: a stopped transient stays stopped even though its timing channels remain inspectable at the sampled time.

This capability proves deterministic scalar envelope authoring, exact plan binding, replay, interpolation, and tamper rejection. It does not prove that a renderer maps a channel well, that the chosen curve looks good, or that the resulting effect has good game feel. Vector/color curves and renderer-specific channel mappings are intentionally outside this bounded step.
