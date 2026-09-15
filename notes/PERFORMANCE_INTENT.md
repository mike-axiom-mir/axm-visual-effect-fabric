# Holographic AI performance intent

The first holographic AI proof deliberately prioritized visual capability over runtime efficiency. It ray-marches procedural body geometry per pixel and can be too heavy on integrated/mobile GPUs even when system RAM is plentiful.

Next pass must preserve the effect while reducing GPU pressure through adaptive render resolution, bounded ray steps, frame-budget feedback, visibility pausing, and explicit quality tiers. Performance changes must not alter canonical effect state or caller-neutral Hand behavior.
