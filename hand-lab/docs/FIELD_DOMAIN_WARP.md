# Renderer-neutral field domain warp

`fx.field.domain-warp2d` composes the existing canonical fBm scalar-field source and `fx.field.flow2d` vector-flow source into a reusable coordinate-warp operator. It is intentionally consumer-neutral: the operator does not encode smoke, water, wind, particles, cracks, gameplay, UI, or product meaning.

## State boundary

The retained source truth is four independently hashed objects: the base scalar source, the scalar source that drives the flow, the vector-flow source, and the domain-warp source. The warp source stores only lineage plus a bounded amplitude. Sampling displaces normalized coordinates through the retained flow source and then samples the retained base scalar source. Grid width/height are derived working-state choices and are not promoted into source truth.

The derived grid is `axm.domain-warp-grid/v0.1`. It is rebuildable and records the exact base, flow-scalar, flow, and warp hashes. A zero-amplitude warp is an exact no-op against the base scalar sampler. Any source/hash drift fails instead of being silently accepted.

## Bounded working set

The default grid is `48 x 32` (1,536 scalar cells). Width and height are each capped at 128 and the default hard cell budget is 16,384. These are structural ceilings only. They are **not** FPS, CPU, GPU, memory-residency, thermal, battery, or device-scaling claims.

## Evidence and non-claims

The repository tests challenge caller-neutral determinism, resolution-independent source truth, zero-amplitude equivalence, gradient-versus-tangent flow behavior, broad versus fine field contexts, explicit lineage drift rejection, invalid controls, and oversized derived working sets.

No renderer is introduced by this operator. Source/tests can establish deterministic domain displacement and lineage preservation, but they do not establish aesthetic quality, readability, physical fluid behavior, particle stability, or consumer acceptance. Until actual rendered output uses this operator and is inspected on an identified target, those remain `NOT_TESTED`.

## Provenance and integration boundary

The implementation is native repository code built from the existing AXM scalar and vector-field Hands; no external shader, fluid, noise, or domain-warp source implementation is imported. Existing effect donors remain unchanged. This capability stays inside Visual Effect Fabric until an explicit consumer integration decision is made; it is not an automatic Universal Creation, game, software, or world port.
