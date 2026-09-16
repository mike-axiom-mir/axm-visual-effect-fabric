# Electric composed-field modulation v0.1

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

## Truth boundary

This proof establishes deterministic caller-neutral state construction, exact source lineage, preservation of the existing electric donor paths, and a separate rebuildable modulated path set.

It does **not** establish:

- physical electricity simulation;
- improved visual quality;
- better readability;
- renderer parity;
- frame time, FPS, GPU or CPU cost on a target device;
- game hit logic, software notification meaning, weather semantics or world authority.

No renderer is added or changed in this bounded proof, so aesthetic quality is `NOT_TESTED`.

No Universal Creation, game, software or world repository is modified. The original `fx.electric-storm` graph and its SVG donor remain intact and usable.

## Next bounded target

The strongest next step is to let one replaceable electric realization explicitly select the modulated derived path set while preserving the base path donor alongside it. That would create renderable cross-family evidence without promoting the derived modulation into canonical electric state.
