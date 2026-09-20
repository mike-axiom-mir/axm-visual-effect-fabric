# AXM Visual Effect Fabric — Game Runtime Contract

This folder is the game-facing runtime boundary inside `axm-visual-effect-fabric`.

It exists so gameplay systems can request effects without owning effect internals or depending on one renderer.

## Contracts

- `axm.game-vfx-request/v1` — one gameplay-side effect request.
- `axm.game-vfx-plan/v1` — deterministic canonical execution plan.
- `axm.game-vfx-receipt/v1` — replay/evidence digest.

## Effect families

- particle burst
- continuous particle emitter
- trail
- beam
- decal
- distortion pulse
- procedural lightning

Particle effects now retain seeded spawn/lifetime/motion state, explicit particle budgets, gravity and deterministic time sampling through `samplePlanAt(plan, absoluteTime)`. This gives renderer adapters a canonical runtime state for sparks, smoke, fire-like emitters, dust and debris without making one renderer the source of truth.

When a requested particle count exceeds `budget.maxParticles`, the canonical plan records both the requested and retained counts plus `truncated: true`; degradation is therefore inspectable rather than silent.

These are canonical request/plan families, not claims that every target renderer already realizes them at final production quality.

## Run

```sh
cd game-runtime
npm test
npm run example
npm run example:smoke
```

## Boundary

The game runtime consumes effect requests and creates deterministic canonical effect plans and time samples. Renderer adapters remain replaceable. Passing these tests proves structural determinism and bounded lifecycle behavior only; it does not prove final visual quality, artistic acceptance or GPU performance.
