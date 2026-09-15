# Special-effect Hand lab

This is the bounded proof area for visual effects built from caller-neutral executable Hands with editable deterministic state between stages.

## Existing proofs

`fx.electric-storm` proves deterministic effect topology, checkpoint edits, downstream replay, and replaceable realization.

`fx.holographic-panel-reveal` is retained as an earlier flat/interface-oriented experiment. It is not the target holographic quality, but it remains useful as a calmer UI effect, orchestration proof, and composable donor rather than being deleted.

`fx.volumetric-hologram-projection` is the stronger spatial hologram family. It preserves real projection depth, emitter/light-spill intent, projection motes, depth scan planes, signal breakup, parallax, materialize/float/collapse motion, and an animated WebGL2 realization. This is the current reusable spatial hologram base.

## Original holographic AI v0.1

`fx.holographic-ai-entity` composes the volumetric projection Hands with a completely self-made procedural humanoid AI body. It is the same broad sci-fi category as a tiny projected assistant, but it does not copy an existing character model, mesh, image, or animation.

Nine stages build and preserve:

1. original humanoid anatomy with an asymmetric raised-hand silhouette;
2. projector/emitter field;
3. projection-mote cloud;
4. scan planes through depth;
5. depth-aware signal breakup;
6. editable body-fragment/shard state;
7. semantic AI behavior (`idle`, `listen`, `speak`, `think`, `alert` plus materialize/collapse profiles);
8. projection motion envelopes;
9. an animated ray-marched WebGL2 realization.

The body itself is procedural geometry: head, torso, pelvis, limbs, hands, central light core, face/sensor glow, and a distinct halo structure. The realization adds idle float/yaw, raised-hand motion, voice/core pulse, projection breakup, scan waves, emitter light, particles, parallax, and interactive materialize/collapse behavior. No generated image is embedded in the effect.

The weaker panel family and the stronger volumetric family remain available together so later effects can combine flat/interface treatments with spatial projection rather than losing earlier work.

## Run

```sh
npm --prefix hand-lab test
npm --prefix hand-lab run demo:volumetric-hologram
npm --prefix hand-lab run demo:holographic-ai
npm --prefix hand-lab run demo
```

Generated evidence lives under `hand-lab/out/` and is derived evidence rather than canonical source state.

## Port boundary

Hologram work stays in Visual Effect Fabric while being proven. Nothing in this work is copied into Universal Creation. UC only receives an explicit later port if an effect is actually worth carrying.

## Truth boundary

The Hand/runtime tests prove deterministic orchestration, caller-neutral state, procedural body/projection data, checkpoint replay, and animated WebGL source generation. They do not by themselves prove aesthetic quality on every GPU/browser. The byte-pinned AetherFX runtime remains separate and unchanged.
