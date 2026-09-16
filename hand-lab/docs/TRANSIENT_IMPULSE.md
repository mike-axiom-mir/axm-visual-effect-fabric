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

The field geometry and envelope are derived, rebuildable effect state. The first renderer is an animated SVG preview; it is not source truth and can be replaced by Canvas, WebGL, game-particle, geometry, video or other adapters later.

## Bounded default working set

The v0.1 graph limits field construction to:

- 8 rings
- 18 spokes
- 42 fragments
- 17 temporal envelope samples

Those are construction ceilings for the current proof, not universal recommended quality settings.

## Reuse proof

The same graph is challenged by two deliberately different neutral shapes:

- **directional** — low symmetry, strong directionality and fragmentation;
- **symmetric** — ring-led, high symmetry, very low fragmentation.

Neither case claims a game hit, shield, portal, UI notification or world event. Those meanings belong to future consumer adapters.

## Truth boundary

Tests prove deterministic caller-neutral construction, bounded finite derived geometry, canonical/derived separation, renderer-only replay and invalid source-coordinate rejection. Generated SVGs are inspectable artifacts, but green CI and source inspection do not prove aesthetic quality, device readability, physical impact simulation, gameplay acceptance or target performance.

No Universal Creation or consumer repository is modified by this proof.

## Next bounded directions

Useful follow-ups should be chosen from real evidence rather than assumed automatically. Candidate directions include a second replaceable renderer, composable masking/occlusion, reusable field operators shared with other effects, or a visual-quality repair after direct output inspection.
