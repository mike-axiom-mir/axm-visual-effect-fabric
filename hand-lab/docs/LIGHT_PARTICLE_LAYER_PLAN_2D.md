# Light + particle layer plan 2D

`fx.composition.light-particle-layer-plan2d` is the smallest consumer-neutral composition bridge between the existing verified mask-guided light-ray donor and the existing verified flow-advected particle donor.

It is deliberately **not** a general compositor, material graph, blend stack, renderer, scene graph, depth solver, game effect, UI effect, weather system, or Universal Creation adapter. Its only new authority is a rebuildable two-layer ordering choice.

## Why this is a real gap rather than another donor

Visual Effect Fabric already has:

- continuous scalar-field composition (`fx.field.compose2d`), which combines scalar values rather than effect layers;
- retained/derived mask-guided light rays with independent field/mask/ray lineage;
- retained particle seeds plus derived flow-advection trajectories;
- separate replaceable SVG inspection renderers for rays and particles.

Those capabilities did not provide a neutral contract saying how two independently verified effect lineages may be ordered together without merging their source state or assigning material/blend meaning. The growth direction explicitly allows later reusable graphs combining light and particles while preserving source truth and renderer replaceability. This bounded bridge fills only that missing ordering contract.

## State and authority boundary

The input work state keeps the two donor states nested and independent:

```text
lightRayState
  retained scalar field
  retained coverage mask
  retained light-ray source
  derived/rebuildable ray set

particleFlowState
  retained particle seeds
  retained scalar/vector flow sources
  retained particle-flow source
  derived/rebuildable particle set

            -> axm.effect-layer-plan2d/v0.1
```

Nesting is intentional. Both donor families use generic keys such as field sources; flattening them into one work state would risk accidental source-key collision or implied lineage merger.

The plan is `derived: true` and `rebuildable: true`. It creates **no new canonical composition source**. The supported order choices are only:

- `rays-under-particles`
- `particles-under-rays`

Changing order changes the derived plan hash while leaving both donor source/set lineages untouched.

Fixed non-authorities are explicit:

- blend mode: `none`
- opacity meaning: `none`
- material meaning: `none`
- renderer choice: `none`
- consumer meaning: `none`
- geometry mutation: `none`
- source merge: `none`

A later replaceable realization may choose how to draw these layers, but that choice must not silently become effect-source truth.

## Truth revalidation

Before a layer plan is built or accepted, both donor working sets are rebuilt from their retained source truth using the existing donor Hands at the selected densities/bounds.

For light rays, the bridge requires the rebuilt `raySetHash` to equal the selected `axm.mask-guided-light-ray-set/v0.1` hash. For particles, it requires the rebuilt `particleSetHash` to equal the selected `axm.flow-advected-particle-set/v0.1` hash.

The layer plan validator then freshly rebuilds the expected two-layer plan and compares its hash. Self-consistently rehashing an altered ray set, particle set, or layer descriptor therefore does not promote the alteration into accepted truth.

## Evidence exercised

Focused tests challenge:

- human/machine caller neutrality;
- preservation of both nested donor states plus unrelated caller state;
- order reversal changing only derived ordering while exact donor lineages stay unchanged;
- two materially different light/particle forms through the same contract;
- self-consistently rehashed light-ray working-set tampering;
- self-consistently rehashed particle working-set tampering;
- self-consistently rehashed layer-plan tampering;
- forged blend authority;
- invalid order modes, missing donor derivation, and attempted third-layer expansion.

The repository proof path remains the existing Special-effect Hands workflow: all Hand tests, the complete checkpoint/demo chain, and the imported AetherFX `runtime/` unchanged guard.

## Structural performance truth

This bridge adds only a two-entry derived plan, but verification intentionally pays for donor rebuilds:

- light-ray rebuild: selected `rayCount × samplesPerRay`, bounded by the existing hard ceiling of **32,768 coverage probes**;
- particle rebuild: selected `particleCount × (steps + 1)`, bounded by the existing hard ceiling of **262,144 trajectory samples**;
- layer-plan construction/validation: constant-size two-layer bookkeeping after those donor checks.

These are structural operation/sample bounds, not timings. FPS, CPU/GPU time, memory residency, browser/mobile cost, battery use, thermals, and device scalability remain `NOT_TESTED`.

## Provenance and continuity

External source/code reuse: **none**.

Internal reuse is limited to the existing mask-guided light-ray and flow-advected particle Hands. Their older standalone renderers and all other donors remain independently useful and unchanged. The imported AetherFX runtime remains protected by the repository verification guard.

No Universal Creation, game, software, UI, website, product, or world repository is changed or assumed authoritative.

## Visual truth boundary

This improvement adds no renderer and generates no new trustworthy pixel artifact. Layer readability, occlusion, blend behavior, glow, particle/ray hierarchy, compositing quality, accessibility, motion feel, and aesthetic quality are therefore **NOT_TESTED**.

Green tests can establish lineage, bounded rebuilding, deterministic ordering and failure boundaries. They cannot establish that the eventual composition looks good.

## Next bounded target

Only continue this branch if one existing replaceable renderer can consume this exact two-layer plan without inventing canonical blend/material semantics. A minimal inspection realization could, for example, place two independently produced SVG groups in the verified order while keeping style/blend entirely renderer-local.

If that requires a generic compositor framework, shader/material authority, depth semantics, or consumer-specific meaning, stop this branch as structurally sufficient and audit a different VFX family instead of adding architecture churn.
