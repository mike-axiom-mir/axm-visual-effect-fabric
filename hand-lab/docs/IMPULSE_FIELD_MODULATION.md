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

## Next bounded directions

The next step should depend on evidence rather than automatically stacking more field primitives. Useful candidates are:

1. a replaceable realization path that explicitly selects the modulated derived field without overwriting the base field; or
2. applying the same field-toolbox integration pattern to a materially different existing effect family, if doing so closes a real reuse gap rather than duplicating this proof.
