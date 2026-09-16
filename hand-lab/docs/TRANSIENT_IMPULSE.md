# Transient impulse effect v0.3

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

The field geometry and envelope are derived, rebuildable effect state. Renderers consume that same retained state and remain disposable.

## Replaceable renderers

Three independent realization paths now exercise the same event/field/envelope contract:

- `axm.vfx.transient-impulse-svg/v0.1` — animated SVG preview.
- `axm.vfx.transient-impulse-canvas2d/v0.1` — Canvas2D one-shot HTML realization driven by the same bounded geometry and temporal samples.
- `axm.vfx.transient-impulse-static-svg/v0.1` — motion-free SVG fallback sampled deterministically from the retained temporal-envelope peak.

Tests require the animated and static paths to retain the same canonical event hash, field geometry hash and temporal envelope for equivalent input. The Canvas path is not an SVG wrapper: it renders through `CanvasRenderingContext2D` and its own animation loop. The static path contains no `<animate>`, script, or animation loop; it is a renderer choice, not a rewrite of the source event.

Renderer-only style or realization changes may occur downstream of the shared `temporal-envelope` checkpoint without changing the canonical event or derived geometry. This is the current proof that the effect body is not owned by one renderer or one motion profile.

## Motion-free fallback boundary

The static renderer chooses the earliest retained envelope sample with the maximum recorded intensity and uses that sample's expansion/intensity as a deterministic snapshot. It does not invent a new event, timing curve or semantic meaning.

This provides a reusable motion-free realization for consumers that need a non-animated option. It is not a claim of accessibility acceptance: no user study, assistive-technology review or target-device visual inspection is implied by the existence of a static fallback.

## Bounded default working set

The v0.3 graphs limit field construction to:

- 8 rings
- 18 spokes
- 42 fragments
- 17 temporal envelope samples

Those are construction ceilings for the current proof, not universal recommended quality settings. The Canvas realization also records these counts in a disposable working-set receipt; this is a structural budget, not measured frame-time evidence. The static renderer emits one SVG artifact and makes no frame-time claim.

## Reuse proof

The same construction and renderer contracts are challenged by two deliberately different neutral shapes:

- **directional** — low symmetry, strong directionality and fragmentation;
- **symmetric** — ring-led, high symmetry, very low fragmentation.

Neither case claims a game hit, shield, portal, UI notification or world event. Those meanings belong to future consumer adapters.

## Truth boundary

Tests prove deterministic caller-neutral construction, bounded finite derived geometry, canonical/derived separation, renderer-only replay, SVG/Canvas state parity, motion-free static parity, generated Canvas runtime execution, and invalid source-coordinate/prerequisite rejection.

Generated SVG and Canvas HTML outputs are inspectable artifacts, but green CI and source inspection do not prove aesthetic quality, device readability, accessibility acceptance, physical impact simulation, gameplay acceptance or target performance. Direct browser/device visual inspection of the transient Canvas artifact remains blocked in the current automated environment by browser administrator policy; no visual-quality claim is promoted from that blocked probe.

No Universal Creation or consumer repository is modified by this proof.

## Next bounded directions

Useful follow-ups should be chosen from real evidence rather than assumed automatically. Candidate directions include composable masking/occlusion, reusable field operators shared with other effects, measured renderer cost on actual targets, or a visual-quality repair after direct output inspection becomes available.
