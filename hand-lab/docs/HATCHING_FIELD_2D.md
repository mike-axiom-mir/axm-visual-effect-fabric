# Field-guided hatching 2D

`fx.stylize.field-guided-hatching2d-static-svg` is a bounded consumer-neutral stylized-treatment graph. It composes the existing continuous scalar-field donor with the existing continuous vector-flow donor, then produces a separately rebuildable hatch-stroke working set and one replaceable static SVG inspection realization.

## State chain

`scalar field source -> vector flow source -> hatching treatment source -> rebuildable stroke set -> replaceable SVG realization`

The retained hatching source contains treatment meaning only:

- exact scalar-field source hash;
- exact vector-flow source hash;
- normal/inverted scalar-value mapping;
- minimum and maximum stroke length as a fraction of a derived cell;
- response power;
- fallback angle used only when sampled flow has no usable direction.

Grid density is not canonical treatment truth. `columns`, `rows`, and `maxStrokes` belong to the derived stroke working set. SVG width, height, opacity, and stroke width belong only to the replaceable realization.

Each derived stroke retains its grid identity, normalized center, exact scalar sample, sampled flow magnitude, resolved normalized direction, treatment-derived length, and normalized endpoints. Realization revalidates the scalar source, vector-flow source, hatching source, complete stroke-set hash, and every stroke against the retained continuous donors before producing SVG.

## Reuse boundary

This capability does not encode game, UI, world, material, comic-panel, character, terrain, or product meaning. Consumers may interpret the neutral hatch field as shading, motion texture, graphic treatment, diagnostic visualization, or another effect role through separate adapters without transferring consumer authority into this repository.

The vector-flow mode remains owned by the existing donor: `gradient` follows scalar change and `tangent` rotates that direction by 90 degrees. Hatching does not fork or rewrite that flow algorithm.

## Budgets and performance honesty

Default working set:

- 48 columns x 32 rows;
- 1,536 derived hatch strokes.

Hard Hand ceilings:

- 256 cells on either axis;
- 16,384 total strokes.

These are structural working-set limits only. They are not measurements of FPS, CPU time, GPU time, memory residency, browser cost, battery use, thermals, or device scalability. Those remain `NOT_TESTED` until measured on identified targets.

## Provenance

No external hatching, engraving, shader, SVG, image-processing, or line-field implementation is imported. The implementation composes AXM's existing `fx.field.fbm2d` / continuous scalar source and `fx.field.flow2d` / continuous vector-flow source through their public Hand contracts. `SOURCE_INTAKE.json` remains the provenance record for the byte-pinned AetherFX runtime donor; this improvement does not mutate that imported runtime.

## Evidence boundary

Tests may establish deterministic caller-neutral execution, source/derived separation, scalar/flow/treatment lineage, bounded working-set behavior, artifact hashing, and replaceable SVG generation. They do not establish attractive hatching, comic/engraving quality, accessibility, anti-aliasing quality, print behavior, animation quality, or device performance.

Actual aesthetic claims require rendered-pixel observation tied to an identified renderer/device. Until such evidence exists, visual quality stays `NOT_TESTED`.

## Port boundary

This capability remains in Visual Effect Fabric. It does not port itself into Universal Creation, games, software, worlds, or other AXM consumer repositories. Consumer integration requires an explicit adapter/integration decision.
