# Electric composed-field modulation v0.2

`fx.electric-storm.composed-field-modulation` is the second materially different existing VFX family to consume the renderer-neutral scalar-field toolbox.

The purpose is not to redefine what an electric effect means. It proves that the same neutral scalar sources and composition operations previously used by transient impulse can modulate an existing editable electric path family without rewriting that donor's retained topology or forcing a renderer choice.

## State chain

```text
existing electric source/target + seed
  -> retained editable trunk/branch paths
  -> retained renderer-neutral energy profile
  -> normalized scalar field A + scalar field B
  -> canonical composition source
  -> electric modulation source (strength + floor)
  -> separate rebuildable modulated electric path set
```

The retained `paths` array remains unchanged. The modulation Hand captures its exact hash before deriving a new path set. Each derived path keeps the same points, width, phase, role, parent and branch topology; only its derived `energy` is attenuated and annotated with the scalar sample/factor used to derive it.

## Neutral modulation contract

The modulation source contains only:

- `mode: path-energy`
- `strength` in `[0,1]`
- `floor` in `[0,1]`

Each electric path probes the composed scalar field at the mean normalized position of its own retained points. This is a bounded deterministic sampling rule, not a physical electricity model.

`strength: 0` is an energy no-op. The derived path set still remains separately identifiable because its scalar lineage metadata is retained.

## Lineage and truth protection

The derived path set records:

- exact base electric paths hash;
- field composition source hash;
- scalar field A and B source hashes;
- electric modulation source hash;
- derived path-set hash;
- bounded factor statistics.

The modulation Hand rejects retained-path drift, scalar-source drift, composition-source drift or modulation-source drift instead of silently accepting changed source meaning.

## Reuse proof

Tests challenge the same graph with:

- diagonal and near-vertical electric path forms;
- `multiply`, `max`, `add-clamp`, and `min` composition contexts;
- human and machine caller kinds;
- zero-strength no-op behavior;
- explicit lineage-failure cases.

This is cross-family evidence that the scalar-field toolbox is not coupled only to transient impulse.

## Replaceable SVG selection

`fx.electric-storm.modulated-svg` closes the next bounded gap without introducing a second electric renderer implementation.

After the modulated path set is derived, `fx.electric.modulated-svg-realize` validates the live base-path, selected-path, scalar-source, composition-source and modulation-source hashes. It then creates a disposable render view whose `paths` point at the selected derived path set and invokes the existing `fx.electric.svg-preview` donor.

The retained `paths` array is never replaced. The selected realization records:

- base electric paths hash;
- selected modulated path-set id and hash;
- scalar field A and B hashes;
- field-composition source hash;
- electric-modulation source hash;
- bounded modulation-factor statistics;
- renderer id and generated SVG bytes.

A zero-strength modulation is an important equivalence fixture: the selected derived path set retains separate scalar lineage, but its SVG content must be byte-identical to the ordinary electric SVG donor because the rendered energy values are unchanged. Non-zero modulation may produce different SVG source while the retained base paths remain byte-for-byte equivalent to the ordinary donor state.

This selection path does not turn the modulated path set into canonical electric state. It is a replaceable realization choice over separately retained derived state.

## Truth boundary

The combined proof establishes deterministic caller-neutral state construction, exact source lineage, preservation of the existing electric donor paths, a separate rebuildable modulated path set, and deterministic selection of that derived set by the existing SVG renderer donor.

It does **not** establish:

- physical electricity simulation;
- improved visual quality;
- better readability;
- cross-renderer visual parity;
- frame time, FPS, GPU or CPU cost on a target device;
- game hit logic, software notification meaning, weather semantics or world authority.

The generated SVG is a real renderer artifact, but source generation and green tests are not visual inspection. Until the exact rendered output is directly observed on a relevant target, aesthetic quality remains `NOT_TESTED`.

No Universal Creation, game, software or world repository is modified. The original `fx.electric-storm` graph, retained paths and SVG donor remain intact and usable.

## Next bounded target

The strongest next step is direct rendered comparison of the ordinary and modulated electric SVG artifacts on an actual browser/device or other trustworthy visual observer. That can reveal whether the scalar attenuation improves, harms, or does nothing useful to electric hierarchy/readability. Any visual repair should follow observed evidence rather than adding more electric renderer-selection machinery by assumption.
