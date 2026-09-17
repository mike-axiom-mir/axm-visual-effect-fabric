# Field-driven halftone treatment

`fx.stylize.halftone-field2d-static-svg` adds a consumer-neutral stylized-treatment family without making an SVG renderer authoritative over effect truth.

## Retained source truth

The graph first uses the existing `fx.field.fbm-source-normalize` Hand. The retained `axm.scalar-field-source/v0.1` remains the continuous scalar-field source and keeps its own hash.

The new `axm.halftone-source2d/v0.1` retains only treatment meaning:

- an id;
- the exact scalar-field source hash it consumes;
- `valueMode` (`normal` or `invert`);
- minimum and maximum radius as fractions of a cell;
- a bounded response power.

Grid density, viewport dimensions and SVG opacity are not part of that source truth.

## Derived working set

`fx.stylize.halftone2d-dot-set-build` samples the retained continuous field at deterministic cell centers. It creates a separately hashed `axm.halftone-dot-set2d/v0.1` containing each dot's grid identity, normalized center, sampled field value and normalized cell-relative radius.

Changing columns or rows rebuilds the dot set while retaining the same field and halftone source hashes. The default graph uses 48 x 32 = 1,536 dots. A Hand invocation may use at most 16,384 dots and at most 256 cells along either axis. These are structural working-set limits only; they are not FPS, CPU, GPU, memory, battery, thermal or device measurements.

Before realization the Hand re-hashes both retained sources and the full dot set, then recomputes each dot's expected cell center, field sample and radius. Source or derived-state drift fails instead of becoming renderer truth.

## Replaceable realization

`fx.stylize.halftone2d-static-svg-realize` emits a static SVG inspection artifact containing one circle per derived dot. Viewport size and opacity remain disposable renderer controls. The realization records the exact field-source hash, halftone-source hash, dot-set hash and SVG artifact hash and is explicitly marked derived and replaceable.

This renderer is an inspection realization, not the canonical halftone representation. Canvas, WebGL, raster, print, game-engine, material or future 3D realizations may consume the same retained source and rebuildable dot-set contract without inheriting SVG authority.

## Consumer neutrality and non-claims

The contract contains no game, UI, world, image-editor, print, weapon, material or product semantics. Consumers may decide how or whether to use the treatment through their own adapters.

The implementation does **not** claim photographic halftone reproduction, print-screen simulation, physical ink behavior, color separation, anti-aliasing quality, accessibility suitability or universal aesthetic quality. Green tests prove deterministic structure and lineage only. Actual visual-quality claims require inspection of rendered pixels in an identified renderer/device context.

## Provenance

No external halftone, stippling, shader, renderer or image-processing implementation was copied or imported. The implementation uses AXM's existing scalar-field Hand only as an internal donor and records its exact source lineage. No Universal Creation, game, software-product or world repository is modified or automatically ported.
