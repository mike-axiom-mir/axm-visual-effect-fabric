# Special-effect Hand lab

This is the bounded proof area for visual effects built from caller-neutral executable Hands with editable deterministic state between stages.

## Existing proofs

`fx.electric-storm` proves deterministic effect topology, checkpoint edits, downstream replay, and replaceable realization.

`fx.holographic-panel-reveal` is retained as an earlier flat/interface-oriented experiment. It is useful as a checkpoint/orchestration proof, but it is **not** treated as the target holographic visual quality and is not a UC promotion candidate.

## Volumetric hologram projection v0.2

`fx.volumetric-hologram-projection` is the stronger hologram direction. It is deliberately not a transparent panel skin. Seven Hands build and preserve:

1. a real 3D projection volume with depth;
2. projector/emitter cone and source ring intent;
3. a deterministic 3D projection-mote cloud;
4. scan planes moving through projection depth;
5. depth-aware breakup bands;
6. materialize / float / collapse motion envelopes;
7. an animated WebGL2 realization.

The WebGL realization ray-marches a 3D rounded projection body and adds spatial parallax, moving volumetric scan behavior, projection light spill, rising motes, signal breakup, emissive edge/fresnel response, internal projected structure, and interactive materialize/collapse behavior. Pointer movement changes viewing parallax; click toggles the projection state.

The canonical state stays separate from the renderer: volume dimensions, emitter settings, fields, particle state, motion, seed, tint, and accent remain editable and hashed. A checkpoint edit can change the projection geometry and replay only downstream breakup/motion/realization stages.

## Run

```sh
npm --prefix hand-lab test
npm --prefix hand-lab run demo:volumetric-hologram
npm --prefix hand-lab run demo
```

Generated evidence lives under `hand-lab/out/` and is derived evidence rather than canonical source state.

## Port boundary

Hologram work stays in Visual Effect Fabric while being proven. Nothing in this work is copied into Universal Creation. UC only receives an explicit later port if the effect is actually worth carrying.

## Truth boundary

The Hand/runtime tests prove deterministic orchestration, caller-neutral state, depth-bearing canonical data, checkpoint replay, and animated WebGL source generation. They do not by themselves prove aesthetic quality on every GPU/browser. The byte-pinned AetherFX runtime remains separate and unchanged.
