# Transient impulse effect v0.1

`fx.transient-impulse` is the first bounded Hand-lab effect family after the holographic projector work that is intentionally not a hologram.

Its purpose is to provide a reusable short-lived radial/directional event body that future consumers can map to their own meanings without transferring product or gameplay authority into Visual Effect Fabric.

## State chain

```text
canonical transient event
  -> derived impulse field (rings + spokes + fragments)
  -> derived one-shot temporal envelope
  -> replaceable realization
```

The canonical event contains only normalized effect-source state:

- origin
- direction
- seed
- energy
- radius
- duration
- neutral shaping controls (`symmetry`, `directionality`, `fragmentation`, ring/spoke weights)

The field geometry and envelope are derived, rebuildable effect state. Renderers consume those retained derived structures; they do not become source truth.

## Replaceable renderers

Two realization paths now exercise the same canonical event, field geometry and temporal envelope:

1. `axm.vfx.transient-impulse-svg/v0.1` — the original animated SVG preview.
2. `axm.vfx.transient-impulse-canvas2d/v0.1` — a deterministic generated JavaScript artifact containing a bounded Canvas2D effect model and `render(ctx, elapsedSeconds)` entry point.

The alternate Canvas2D graph is `fx.transient-impulse.canvas2d`. It intentionally reuses the existing normalize/build/envelope Hands and changes only the realization stage. The generated Canvas2D artifact keeps exact canonical-event and field-geometry hashes so a caller can verify which effect state it came from.

Canvas2D output is bounded to one operation per derived ring, spoke and fragment plus one core marker. With the default field ceilings that is at most 69 drawing operations in the retained model. This is a construction bound, not a frame-time or device-performance claim.

## Bounded default working set

The v0.1 effect construction limits are:

- 8 rings
- 18 spokes
- 42 fragments
- 17 temporal envelope samples

Those are construction ceilings for the current proof, not universal recommended quality settings.

## Reuse proof

The same effect body is challenged by deliberately different neutral shapes, including directional and symmetric configurations. Renderer-parity tests additionally run the same source state through SVG and Canvas2D graphs and require the canonical event hash, field geometry hash and envelope to remain identical.

Neither renderer claims a game hit, shield, portal, UI notification or world event. Those meanings belong to future consumer adapters.

## Truth boundary

Tests can prove deterministic caller-neutral construction, bounded finite derived geometry, canonical/derived separation, renderer-only replay, invalid source-coordinate rejection, renderer-state hash parity and execution of the generated Canvas2D program against the expected drawing interface.

That does **not** prove aesthetic quality, browser/device readability, physical impact simulation, gameplay acceptance, GPU/CPU frame cost, or visual parity between SVG and Canvas2D. No real browser/device Canvas output has been visually inspected in this bounded change, so Canvas2D aesthetic quality remains `NOT_TESTED`.

Source/runtime inspection is not promoted into a visual-quality claim.

No Universal Creation or consumer repository is modified by this proof.

## Next bounded directions

Useful follow-ups should be chosen from real evidence rather than assumed automatically. Candidate directions include direct browser/device inspection of the Canvas2D realization, composable masking/occlusion, reusable field operators shared with other effects, or a visual-quality repair after direct output inspection.
