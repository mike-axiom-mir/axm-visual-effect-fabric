# AXM Visual Effect Fabric — Game Runtime Contract

This folder is the game-facing runtime boundary inside `axm-visual-effect-fabric`.

It exists so gameplay systems can request effects without owning effect internals or depending on one renderer.

## Contracts

- `axm.game-vfx-request/v1` — one gameplay-side effect request.
- `axm.game-vfx-plan/v1` — deterministic canonical execution plan.
- `axm.game-vfx-receipt/v1` — replay/evidence digest.
- `axm.game-vfx-interruption/v1` — immutable runtime interruption bound to one exact plan digest.
- `axm.game-vfx-contact-effect-binding/v1` — one impact-style VFX request bound to an exact external hit-result receipt and contact.
- `axm.game-vfx-render-plan/v1` — renderer-profile adaptation bound to one exact canonical plan digest.

## Effect families

- particle burst
- continuous particle emitter
- trail
- beam
- decal
- distortion pulse
- procedural lightning

Particle effects retain seeded spawn/lifetime/motion state, explicit particle budgets, gravity and deterministic time sampling through `samplePlanAt(plan, absoluteTime)`. This gives renderer adapters a canonical runtime state for sparks, smoke, fire-like emitters, dust and debris without making one renderer the source of truth.

When a requested particle count exceeds `budget.maxParticles`, the canonical plan records both the requested and retained counts plus `truncated: true`; degradation is therefore inspectable rather than silent.

## Renderer fallback profiles

`adaptPlanForRenderer(plan, profile)` in `src/renderer-adapter.mjs` turns an already verified canonical VFX plan into a deterministic renderer-facing plan without modifying the canonical source plan.

A renderer profile may declare supported effect kinds and explicit limits for:

- particles;
- trail samples;
- beam segments;
- procedural-lightning segments;
- procedural-lightning branches.

When a limit is lower than the canonical plan, the render plan records an explicit adaptation reason and keeps the original timing, anchor, source evidence and canonical plan digest. Particle and lightning reduction is deterministic and keeps the first and last scheduled/structural samples so temporal/path coverage is not silently collapsed to only the beginning of an effect.

If a profile does not support an effect kind, the result is an explicit `renderable: false` render plan with an `unsupported-kind` reason. The adapter does not silently substitute a different visual effect family. This keeps renderer limitations inspectable while preserving the canonical effect plan for another renderer or later replay.

Renderer adaptation is a device/runtime execution boundary, not a quality judgement. Passing its verification proves deterministic bounded degradation and source-plan integrity; it does not prove that a low-budget rendering looks good or meets a performance target on real hardware.

## Collision-contact impact binding

`createContactEffectBinding(hitBinding, options)` consumes the Ability Fabric `axm.game-ability-hit-result-binding/v1` shape and produces a normal VFX request whose anchor comes from one externally supplied collision contact.

The adapter intentionally supports impact-style families only: particle burst, particle emitter, decal and distortion pulse. The selected contact must provide a finite `position` and a finite non-zero `normal`.

The binding preserves:

- the exact hit-result binding digest;
- the originating collision-query digest;
- the external collision system and receipt reference;
- the selected contact index and contact digest;
- the original contact payload;
- a world-contact anchor containing position, normal and optional target/collider identifiers.

`compileRequest()` carries `sourceEvidence` into the canonical plan, so the collision provenance is not dropped when the effect is compiled.

This does **not** make VFX authoritative for collision truth. The adapter rejects misses, mismatched external/query hashes, modified bindings without a matching receipt, missing contacts, zero normals and unsupported effect families. A structurally valid binding still does not prove that the external collision system was physically correct.

## Cancel / interruption behavior

Gameplay systems may bind an external interruption time to an already compiled VFX plan with `createInterruption(plan, absoluteTime, reason)` and pass that immutable control record into `samplePlanAt(plan, absoluteTime, interruption)`.

The VFX runtime does **not** decide whether gameplay is allowed to cancel an action. It only realizes the supplied interruption boundary.

Interruption semantics are explicit per effect family:

- particle burst / emitter: the spawn schedule becomes half-open at the cutoff (`spawnTime < interruption.localTime`); particles already spawned before the cutoff keep their canonical lifetime and motion instead of disappearing;
- trail / beam / distortion / procedural lightning: the transient effect is inactive at and after the interruption boundary;
- decal: already-created persistent marks keep their normal lifetime.

The interruption record is bound to the exact `planSha256`, carries its own digest, and is rejected if the plan or interruption record is modified without a matching digest. The original VFX plan remains unchanged.

These are canonical request/plan/runtime families, not claims that every target renderer already realizes them at final production quality.

## Run

```sh
cd game-runtime
npm test
npm run example
npm run example:smoke
npm run example:interrupt
```

## Boundary

The game runtime consumes effect requests and creates deterministic canonical effect plans, contact-bound impact requests, interruption controls, renderer-profile render plans and time samples. Renderer implementations remain replaceable. Passing these tests proves structural determinism, evidence binding, interruption binding, bounded lifecycle behavior and deterministic renderer degradation only; it does not prove external collision correctness, final visual quality, artistic acceptance, balance, game feel or GPU performance.
