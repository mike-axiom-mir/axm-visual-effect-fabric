# Holographic modulated projector

`fx.holographic-state-projector.modulated-webgl` is a replaceable realization path for the generic holographic state projector. It reuses the existing `axm.vfx.holographic-state-projector/v0.1` WebGL donor while selecting one separately retained composed-field-modulated holographic sample field through a disposable render view.

## State boundary

The canonical holographic `form` remains source truth. The ordinary `sampleField` remains the retained rebuildable base sample field. Scalar composition produces a separate entry under `modulatedHolographicSampleFields`; only the selected derived field's intensity channel is used by the temporary render view. The base `sampleField` is not overwritten.

The realization records and rechecks:

- canonical form hash;
- retained base sample-field hash;
- selected modulated sample-points hash;
- temporary render sample-field hash;
- both scalar input-source hashes;
- composition-source hash;
- holographic modulation-source hash.

The selected derived field must preserve base point count, stride, canonical-form lineage, position, size, role, and phase. Silent drift in the base field, selected field, scalar inputs, composition source, or modulation source is rejected before renderer reuse.

## Renderer reuse

The new Hand does not implement another WebGL projector. It passes a disposable render view to `fx.hologram.state-projector-webgl`, then retains that donor's HTML artifact and modeled working-set evidence under renderer identity `axm.vfx.holographic-modulated-state-projector/v0.1`.

A zero-strength modulation therefore produces byte-identical HTML to the ordinary state projector for the same form, sample state, and projection parameters. Non-zero modulation can change the embedded point-intensity data without changing canonical form or the retained base sample field.

## Performance boundary

The path inherits the existing generic projector's 20,000-point ceiling. Its GPU buffer model remains `pointCount * 7 * 4` bytes for the selected stride-7 Float32 point data. The adapter additionally retains the base and derived JavaScript point arrays while constructing the disposable render view.

These are structural/modelled bounds only. They are **not** measured CPU time, GPU time, frame rate, memory residency, battery use, thermal behavior, or device scalability claims.

## Evidence boundary

The tests verify deterministic caller-neutral execution, exact lineage, base-state preservation, zero-strength artifact equivalence, non-zero artifact change, reuse across strategy-globe and recon-rover forms, and rejection of source drift.

The generated artifact is real HTML/WebGL source, but no browser/device pixels from this candidate are visually inspected by this proof. Aesthetic quality, readability, physical holography, semantic reconstruction, device compatibility, and runtime performance remain `NOT_TESTED` unless separately observed or measured on an identified target.

No Universal Creation, game, software, or world repository is touched. No external algorithm or source code is introduced by this adapter; it composes existing in-repository Hands and donors, preserving their provenance and rollback history.
