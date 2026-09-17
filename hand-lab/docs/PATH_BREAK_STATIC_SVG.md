# Broken path static SVG realization

`fx.path.break-fragment-static-svg` gives the existing renderer-neutral `fx.path.break-fragment2d` family a bounded deterministic inspection realization. It reuses the retained path-break source and rebuildable broken-path set, then projects those verified fragments through the existing neutral static-path SVG core.

The renderer identity is `axm.vfx.path-break-static-svg/v0.1`.

## Why this stays separate from source truth

The retained `paths` array and `axm.path-break-source/v0.1` remain authoritative for this effect treatment. `axm.broken-path-set/v0.1` remains derived and rebuildable. SVG viewport size, padding, stroke width, opacity and serialized markup are disposable renderer state and do not become canonical path or break meaning.

Before serialization, the realization Hand:

1. re-hashes the retained path array and retained break source;
2. validates the selected broken-path set schema, derived/rebuildable flags, self-hash, exact path lineage and exact break-source lineage;
3. checks retained and derived normalized coordinates plus structural cardinalities;
4. verifies fragment source identities for non-zero breaks, or exact source-path identity for the zero-break no-op case;
5. rebuilds the expected broken-path set from retained truth through `fx.path.break-fragment-build` and requires the exact rebuilt path-set hash to match the selected derived set.

A changed fragment set therefore cannot become authoritative merely by recomputing a self-consistent derived hash.

## Shared projection core without weakening topology rules

The existing `path-static-svg-core.mjs` deliberately expects its base and derived arrays to have identical path topology. Flow and wave displacement satisfy that contract, but break fragmentation intentionally changes path cardinality and identity.

This realization does **not** weaken that shared-core invariant and does not invent a second projection system. Instead it passes the already verified fragment set through the shared projection/serialization core as a derived-only view and forces `showBase: false`. A canonical source-path underlay is therefore never mislabeled as if it had one-to-one fragment topology.

The output has no crack, wound, trail, UI, destruction, material, game, software or world meaning. Those interpretations remain downstream consumer responsibilities.

## Structural budgets and performance truth

The break build keeps its existing default ceilings of 4,096 retained source points, 8,192 fragments and 16,384 derived points, with hard accepted ceilings of 16,384 / 32,768 / 65,536 for source verification. The SVG projection core defaults to a 4,096-point realization ceiling and has a hard accepted maximum of 16,384 rendered points. SVG width and height remain bounded to 64–4,096 pixels.

Source-truth verification intentionally pays for one exact broken-set rebuild before realization. SVG emission then performs one bounded normalized projection and serialization pass over the selected fragment points. These are structural work/working-set limits only. CPU/GPU time, frame rate, memory residency, browser cost, battery, thermals and target-device scalability are **NOT_TESTED**.

## Provenance

This wrapper is repository-authored and composes existing AXM Visual Effect Fabric Hands plus the existing shared path SVG projection core. No external fracture, SVG renderer, geometry, shader or image-processing implementation was imported.

## Evidence boundary

The targeted tests challenge caller-neutral determinism, exact zero-break behavior, disposable renderer controls, materially different path forms, canonical drift, self-consistent derived tampering, self-consistent semantic-source tampering, XML escaping, layout limits, point budgets and the explicit refusal to render a false canonical base underlay.

The tests can establish deterministic SVG source and exact lineage behavior. They do not provide trustworthy rasterized browser/device pixels. Visual fracture readability, aesthetics, anti-aliasing, compositing and target-device appearance therefore remain **NOT_TESTED** and must not be inferred from green CI or SVG source inspection.

No Universal Creation, game, software, UI or world repository integration is performed by this capability.
