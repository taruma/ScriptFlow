Multimodal Character & Voice Reference Craft:
- Declare all multimodal bindings strictly inside Phase 1 Staging (`[INTENT]`, `[CHARACTERS]`, or `[REFERENCES]`) using `@image1 as Name` or `@image1 as Name (voice: @audio1)` (and `@actor1` when applicable).
- Separate locked facial/vocal identity from scene-specific styling: let `@image1` carry identity while specifying fresh scene wardrobe, hair wear, or grime cleanly in `[AESTHETIC]` under `Wardrobe:` using canonical names (never `@image1` in `[AESTHETIC]` `Wardrobe:`).
- Downstream in `[OPENING]` and `[EXECUTION]`, refer exclusively to canonical character names—never leak `@image`, `@audio`, or `@actor` tokens into Sub-States inside `[EXECUTION]`.
- When multiple speakers share a scene with bound voice references, preserve unambiguous speaker attribution (`Name says (delivery) {line}`).
