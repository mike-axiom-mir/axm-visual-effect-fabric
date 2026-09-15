# Visual Effect Fabric growth direction

The starting AetherFX body already follows `Primitives -> Effects -> Organs -> Molds -> Scenes -> Products`, with reusable modules, recipes, registry, validation, quality adaptation and renderer adapters. Grow that body instead of rebuilding it.

## Cross-surface rule

Prefer `editable recipe -> canonical procedural state/graph -> replaceable realizations`.

A serious lightning effect, for example, should retain branching/path state independently of whether it becomes SVG/CSS on a website, Canvas/WebGL in an app, particles/curves in a game, raster/video frames, or later 3D emissive geometry.

## Research families to grow

1. field operators: turbulence/fBm, Worley/cellular fields, distance transforms, gradients and domain warping;
2. path/network effects: electrical arcs, cracks, roots, veins, rivers and guided trails;
3. light: bloom/glow, mask-guided rays and renderer-aware atmospheric/volumetric realizations;
4. organic/fractal growth: IFS, branching systems and bounded aggregation/growth;
5. flow/vector fields: LIC, brush/stroke direction, wind/water/smoke/particle guidance;
6. deformation: displacement, warp, breaks, waves, turbulence and controlled distortion;
7. painterly/stylized treatment: brush fields, stippling, halftone, graphic, comic and playful treatments while retaining realistic/product choices;
8. animation: deterministic parameter curves, flicker, propagation, growth, decay, looping and phase relationships;
9. geometry realization: curves, sweeps, instancing and mesh realization only when canonical effect state supports it;
10. later special effects: reusable graphs combining light, particles, materials, motion, audio cues and spatial state without pretending one renderer owns source truth.

## Requirements

- offline-first; no AI, account, cloud or paid service required for core execution;
- humans, AI and deterministic programs call the same underlying controls;
- preserve recipes, seeds, parameters, source state, provenance and known losses;
- adapters may degrade expression but must not silently rewrite richer canonical effect truth;
- external/open-source algorithms require explicit provenance and license review before source reuse;
- slow rendering is never accepted as a quality claim;
- perceptual/aesthetic acceptance stays separate from structural execution evidence.
