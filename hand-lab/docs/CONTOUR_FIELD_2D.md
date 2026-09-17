# Field contours 2D

`fx.stylize.field-contours2d-static-svg` is a bounded consumer-neutral graphic-treatment graph. It reuses the retained continuous scalar-field donor, stores a small retained contour treatment source, derives a rebuildable isoline segment set, and provides one replaceable static SVG inspection realization.

This is intentionally distinct from halftone, hatching, and stippling. Those treatments encode scalar value through mark radius, stroke direction/length, or point density. Contours instead extract equal-value lines from the retained scalar field. The result can support graphic, diagnostic, topographic-like, boundary, energy-band, or other line-treatment roles without assigning product/world semantics here.

## State chain

`scalar field source -> contour treatment source -> rebuildable contour segment set -> replaceable SVG realization`

The retained contour source contains only:

- exact scalar-field source hash;
- the explicit ordered contour levels;
- the bounded isoline algorithm identity.

Sampling resolution and work budgets are derived controls. SVG width, height, stroke width, and opacity are renderer-only controls.

## Bounded isoline extraction

Each derived cell samples the retained continuous scalar field at its four corners for each retained contour level. Edge intersections are found by deterministic linear interpolation. Ordinary cells produce zero or one segment. Four-edge saddle cells use the deterministic cell-centre average as a pairing decision and may produce two segments.

The derived segment set records exact level index/value, source cell, saddle branch, intersected edges, normalized endpoints, and segment length. Realization revalidates the scalar source, contour source, complete segment-set hash, and a fully rebuilt expected segment set before producing SVG.

This method is a bounded graphic isoline extractor. It is not a physical boundary solver, terrain reconstruction, semantic segmentation system, or claim that the field represents real-world height, pressure, material, or energy.

## Consumer neutrality

The canonical contract contains no game, terrain, map, material, character, UI, world, software, or product semantics. A consumer may later interpret neutral equal-value lines through an explicit adapter without transferring consumer authority into Visual Effect Fabric.

## Budgets and performance honesty

Default working set:

- 48 x 32 derived cells;
- 3 retained contour levels;
- 4,608 cell-level probes;
- segment count depends on the retained field and levels.

Hard Hand ceilings:

- 256 cells on either axis;
- 8 retained contour levels;
- 65,536 total cell-level probes;
- 32,768 derived contour segments.

These are structural work limits only. They are not FPS, CPU-time, GPU-time, memory-residency, browser-cost, battery, thermal, or device-scalability measurements. Those remain `NOT_TESTED` until measured on identified targets.

## Provenance

The implementation composes AXM's existing scalar-field sampling contract and canonical SHA-256 `hashValue` utility. No third-party marching-squares, contour, shader, SVG, image-processing, mapping, or visualization implementation is copied or imported. `SOURCE_INTAKE.json` remains the provenance record for the byte-pinned AetherFX runtime donor, which this improvement does not modify.

## Evidence boundary

Tests may establish caller-neutral determinism, source/derived separation, contour-level lineage, deterministic intersection geometry, bounded normalized endpoints, budget failures, artifact hashing, and replaceable SVG generation. They do not establish that the contour treatment is attractive, readable at every density, anti-aliased well, accessible, performant on a target, or aesthetically accepted.

No trustworthy target-renderer/browser pixels were inspected for this candidate before PR creation, so aesthetic/readability quality is `NOT_TESTED` rather than inferred from source or CI.

## Port boundary

This capability remains in Visual Effect Fabric. It does not port itself into Universal Creation, games, software, worlds, maps, tools, or any other AXM consumer repository. Consumer integration requires a separate explicit adapter/integration decision.
