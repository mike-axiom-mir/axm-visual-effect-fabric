# AXM Visual Effect Fabric — Game Runtime Contract

This folder is the game-facing runtime boundary inside `axm-visual-effect-fabric`.

It exists so gameplay systems can request effects without owning effect internals or depending on one renderer.

## Contracts

- `axm.game-vfx-request/v1` — one gameplay-side effect request.
- `axm.game-vfx-plan/v1` — deterministic canonical execution plan.
- `axm.game-vfx-receipt/v1` — replay/evidence digest.
- `axm.game-vfx-interruption/v1` — immutable runtime interruption bound to one exact plan digest.

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

## Cancel / interruption behavior

Gameplay systems may now bind an external interruption time to an already compiled VFX plan with `createInterruption(plan, absoluteTime, reason)` and pass that immutable control record into `samplePlanAt(plan, absoluteTime, interruption)`.

The VFX runtime does **not** decide whether gameplay is allowed to cancel an action. It only realizes the supplied interruption boundary.

Interruption semantics are explicit per effect family:

- particle burst / emitter: the spawn schedule becomes half-open at the cutoff (`spawnTime < interruption.localTime`); particles already spawned before the cutoff keep their canonical lifetime and motion instead of disappearing;
- trail / beam / distortion / procedural lightning: the transient effect is inactive at and after the interruption boundary;
- decal: already-created persistent marks keep their normal lifetime.

The interruption record is bound to the exact `planSha256`, carries its own digest, and is rejected if the plan or interruption record is tampered with. The original VFX plan remains unchanged.

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

The game runtime consumes effect requests and creates deterministic canonical effect plans, interruption controls and time samples. Renderer adapters remain replaceable. Passing these tests proves structural determinism, interruption binding and bounded lifecycle behavior only; it does not prove final visual quality, artistic acceptance, balance, game feel or GPU performance.
