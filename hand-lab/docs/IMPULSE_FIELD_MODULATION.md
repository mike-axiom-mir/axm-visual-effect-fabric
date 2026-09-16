# Transient impulse composed-field modulation v0.1

`fx.transient-impulse.composed-field-modulation` is a bounded integration proof between two already-existing reusable Visual Effect Fabric capabilities:

- the consumer-neutral transient impulse family; and
- the continuous two-field scalar composition operators.

Its purpose is to prove that the scalar-field toolbox can influence a real existing effect family without absorbing that effect's canonical source state or introducing game, software, UI, world, damage, shield, portal, weather or other consumer meaning.

## State chain

```text
canonical transient event
  -> base derived impulse field

canonical scalar field A + canonical scalar field B
  -> canonical composition source

neutral modulation controls
  -> modulation source

base impulse field + continuous composed scalar field + modulation source
  -> separate rebuildable modulated impulse field
```

The adapter never overwrites the normalized transient event or the existing base `impulseField`.

The resulting `axm.transient-impulse-modulated-field/v0.1` retains exact lineage to:

- canonical transient-event hash;
- base impulse geometry hash;
- scalar composition-source hash;
- input field A source hash;
- input field B source hash; and
- modulation-source hash.

## Bounded modulation contract

The v0.1 proof uses the composed scalar field only to modulate **derived detail intensity**:

- rings remain byte-for-byte equivalent to the base derived impulse geometry;
- spoke intensity can be attenuated by the sampled composed field;
- fragment intensity can be attenuated by the sampled composed field;
- primitive counts and placement remain unchanged.

Each spoke/fragment gets a deterministic local `[u,v]` probe derived from its existing polar geometry. The composed field is sampled continuously, so this adapter does not require a retained grid resolution and does not turn a grid into source truth.

The neutral controls are:

- `strength` in `[0,1]` — blends between no modulation and full scalar modulation;
- `floor` in `[0,1]` — lower bound applied to the sampled attenuation.

At `strength = 0`, detail intensity is unchanged. This is useful as an explicit no-op boundary fixture and proves the adapter can remain present without silently altering the base effect.

## Reuse boundary

This is an effect-owned derived adapter. It does not claim what the modulation *means* to a future consumer.

A game could later map the result to a hit-like visual, software could map it to a notification-like pulse, a world could map it to an environmental event, or another effect could use it as one layer in a larger composition. Those integrations own their meanings and acceptance criteria.

No Universal Creation or consumer repository is changed by this proof.

## Evidence boundary

Tests can prove:

- deterministic caller-neutral execution;
- canonical transient event preservation;
- base impulse-field preservation;
- exact two-field composition lineage;
- separate rebuildable modulated geometry;
- materially different scalar algebra producing different derived modulation;
- reuse across directional and symmetric impulse contexts;
- bounded no-op behavior at zero strength; and
- explicit failure for invalid controls or broken source lineage.

This proof does **not** prove that the modulation looks better, that it is readable on a device, that it improves any consumer product, or that it has a particular frame-time/FPS cost. No rendered artifact is added by this adapter, so aesthetic quality is `NOT_TESTED` rather than inferred from source code or CI.

## Modulated static realization v0.1

`fx.transient-impulse.modulated-static` adds the smallest replaceable realization proof for the modulated field without changing the canonical event, replacing the retained base `impulseField`, or introducing consumer-specific meaning.

The realization chain is:

```text
canonical transient event
  -> retained base impulseField
  -> separately retained modulatedImpulseField

retained base temporal envelope
  + explicit modulated-field selection
  -> disposable static-SVG render view
  -> transientImpulseModulatedStaticSvg realization
```

The implementation deliberately reuses the proven `fx.impulse.static-svg-realize` renderer as a donor. A temporary render view selects the modulated geometry for that renderer, but this render view is never promoted back into canonical or retained base state. The final state still contains the original base field and the separate modulated field side by side.

The realization records exact lineage for:

- canonical transient-event hash;
- retained base impulse geometry hash;
- selected modulated geometry hash and modulation id;
- field-composition source hash;
- input A and B source hashes;
- modulation-source hash; and
- the retained envelope's base-field geometry hash.

The zero-strength fixture is intentionally important: the selected modulated field still has its own derived lineage because it carries modulation evidence, but its rendered static SVG is byte-identical to the base static SVG when detail intensities are unchanged. Non-zero modulation produces a different renderer artifact while the base impulse geometry remains unchanged.

This proves **renderer selection and state lineage**, not aesthetic improvement. Generated SVG markup is a real renderer artifact, but it has not been visually inspected on a browser/device in this bounded run. Visual quality and readability therefore remain `NOT_TESTED`; no frame-time/FPS claim is made from source structure or CI.

The original static SVG, animated SVG, Canvas2D and older effect donors remain available. This proof does not port anything into Universal Creation, a game, software product, or world repository.

## Next bounded directions

After the modulated field has a replaceable realization, the highest-value next step should be chosen from observed evidence rather than automatically duplicating every renderer. Prefer direct browser/device inspection of the generated base-versus-modulated artifacts when such observation is available. If no visual observer is available, a materially different effect-family integration is a better reuse test than stacking another near-identical renderer.
