# AXM Visual Effect Fabric

Standalone local-first visual/procedural effect machine. The initial body is the verified AXM AetherFX v1.3 runtime copied byte-for-byte from the pinned Collaboration Platform source recorded in `SOURCE_INTAKE.json`.

The Collaboration Platform is **not** a runtime dependency and was not modified. `runtime/` is the imported canonical source snapshot; root files are standalone integration and growth surfaces.

## Run

```sh
npm run verify
npm start
npm run cli -- --help
```

`runtime/OPEN_STUDIO.html` remains the local creator UI. The portable runtime, CLI, module registry, recipes, snapshots and adapters can also be used without that UI.

## Direction

This repository is broader than lighting. It exists to grow reusable procedural and special effects callable by humans, AI and deterministic programs and realizable across websites, apps, games, image/video, animation and later 3D/spatial targets. See `GROWTH_DIRECTION.md`.

## Truth / agency boundary

Importing source does not grant execution, publication, merge or CANON authority. Saved recipes and canonical effect state stay distinct from renderer-specific output. Public licensing of AXM-authored source is not inferred merely because this repository is public; retained third-party notices/licenses remain binding.
