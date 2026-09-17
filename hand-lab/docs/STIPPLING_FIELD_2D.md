# Field stippling 2D

`fx.stylize.field-stippling2d-static-svg` is a bounded consumer-neutral stylized-treatment graph. It reuses the retained continuous scalar-field donor, then produces a separately rebuildable variable-density stipple point set and one replaceable static SVG inspection realization.

This is intentionally distinct from the existing halftone donor. Halftone keeps one grid-centred mark per cell and encodes scalar value mainly in mark radius. Stippling keeps a constant treatment radius while scalar value changes which seeded, jittered candidate points survive. The result is a density treatment rather than a second halftone implementation.

## State chain

`scalar field source -> stippling treatment source -> rebuildable candidate/point set -> replaceable SVG realization`

The retained stippling source contains treatment meaning only:

- exact scalar-field source hash;
- stable `patternSeed` for deterministic candidate placement/acceptance;
- normal/inverted scalar-value mapping;
- minimum and maximum accepted-point density;
- response power;
- bounded within-cell jitter;
- constant point radius as a fraction of a derived cell.

Grid resolution, candidate count per cell, and maximum candidate budget are derived working-set controls. SVG width, height, and opacity are renderer-only controls.

## Deterministic placement and acceptance

Each derived cell creates a bounded number of candidates. Candidate jitter and acceptance values are deterministically derived from AXM's existing canonical `hashValue` utility using the retained `patternSeed`, cell coordinates, candidate index, and a channel label. No external random-number, stippling, blue-noise, image-processing, shader, or SVG implementation is imported.

A candidate samples the retained continuous scalar field at its jittered normalized position. The retained treatment maps that scalar value to a density threshold. The candidate is retained as a stipple point only when its deterministic acceptance value falls below the threshold.

The derived point set records candidate identity, normalized position, exact sampled field value, resolved density threshold, and deterministic acceptance value. Realization revalidates the scalar source, stippling source, complete point-set hash, and a fully rebuilt expected point set before generating SVG.

## Consumer neutrality

The contract contains no game, terrain, character, world, material, UI, comic-panel, software, or product semantics. Consumers may later interpret the neutral point-density field as print-like shading, graphic treatment, surface breakup, diagnostic visualization, or another effect role through explicit adapters without transferring consumer authority into this repository.

## Budgets and performance honesty

Default working set:

- 40 columns x 28 rows;
- 2 deterministic candidates per cell;
- 2,240 candidate probes;
- accepted point count depends on the retained field and treatment density.

Hard Hand ceilings:

- 256 cells on either axis;
- 4 candidates per cell;
- 16,384 total candidate probes.

The accepted point count can never exceed the candidate count. These are structural working-set limits only. They are not FPS, CPU-time, GPU-time, memory-residency, browser-cost, battery, thermal, or device-scalability measurements. Those remain `NOT_TESTED` until measured on identified targets.

## Provenance

This improvement composes AXM's existing scalar-field sampling contract and `hand-runtime` canonical SHA-256 hashing utility. No third-party stippling algorithm/source is copied or imported. `SOURCE_INTAKE.json` remains the provenance record for the byte-pinned AetherFX runtime donor, which this improvement does not modify.

## Bounded visual observation

A local evidence probe rasterized two deterministic 640x420 SVG artifacts with CairoSVG 2.8.2 on a white background using the same field (`seed=2468`, `frequency=3.25`, `octaves=4`) and stipple pattern (`patternSeed=13579`, `minDensity=0.04`, `maxDensity=0.96`, `jitterCell=0.42`, `radiusCell=0.12`).

- normal mapping: SVG SHA-256 `bf4c07259b205a020078bd8c8550808a04398ece736b334b52ce9d8e10765585`, 1,151 accepted points;
- inverted mapping: SVG SHA-256 `5e0bf3e3a2a2f07cffd2704dd6f6bb274a131aa7c1f75dd34c73f7f908bf4946`, 1,048 accepted points.

The raster inspection established only that both exact artifacts rendered into visible dispersed point fields, that normal and inverted mapping produced visibly different density geography, and that the constant-radius marks remained distinguishable at this raster size. It does **not** establish browser/device parity, attractive stippling, print quality, anti-aliasing quality, accessibility, animation quality, or universal aesthetic success.

## Evidence boundary

Tests may establish caller-neutral determinism, source/derived separation, pattern-seed stability, scalar/treatment/point-set lineage, budget failures, artifact hashing, and replaceable SVG generation. Actual aesthetic acceptance still requires rendered observation tied to the intended renderer/device and consumer context.

## Port boundary

This capability remains in Visual Effect Fabric. It does not port itself into Universal Creation, games, software, worlds, or any other AXM consumer repository. Consumer integration requires an explicit adapter/integration decision.
