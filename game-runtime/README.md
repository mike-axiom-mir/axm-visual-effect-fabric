# AXM Visual Effect Fabric — Game Runtime Contract

This folder is the game-facing runtime boundary inside `axm-visual-effect-fabric`.

It exists so gameplay systems can request effects without owning effect internals or depending on one renderer.

## Contracts

- `axm.game-vfx-request/v1` — one gameplay-side effect request.
- `axm.game-vfx-plan/v1` — deterministic canonical execution plan.
- `axm.game-vfx-receipt/v1` — replay/evidence digest.

## Initial effect families

- particle burst
- trail
- beam
- decal
- distortion pulse
- procedural lightning

These are canonical request/plan families, not claims that every target renderer already realizes them at final production quality.

## Run

```sh
cd game-runtime
npm test
npm run example
```

## Boundary

The game runtime consumes effect requests and creates deterministic canonical effect plans. Renderer adapters remain replaceable. Passing these tests does not prove final visual quality or GPU performance.
