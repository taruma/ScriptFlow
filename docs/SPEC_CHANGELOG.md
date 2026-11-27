# Specification Changelog — Auteur Script

This changelog tracks versions of the portable, 100% platform- and model-agnostic **Auteur Script Specification** (plain-text inline grammar, domain vocabulary, Scene Topologies, deterministic Script Supervisor linter, 5-Lens audit methodology, Programmatic JSON IR / Patch / Lens Slicer contracts, and bundled Craft Knowledge Pack).

> **Note**: Releases of the **ScriptFlow** editor application (`v1.0.0`+) are tracked separately in the repository root [`CHANGELOG.md`](../CHANGELOG.md).

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the specification adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.4.0] — Canonical Inline Syntax (Locked Baseline)

Locked baseline specification for **Auteur Script `v0.4.0`** (`AUTEUR_IR_SCHEMA_VERSION = "0.4.0"`).

### Added

- **3-Level Structural Hierarchy & Pure Vocabulary** (`docs/GLOSSARY.md`):
  - Strictly partitioned document hierarchy: **Macro-Block (`MB#`)** → **Macro-State (`S#`, Staging = `S0`)** → **Sub-State (`S#.#`)**, with leading bracketed **Sub-State Tags** (`[CAM 01]`, `[CAM]`, `[ACT]`, `[BLOCK]`, `[LIGHT]`, `[STATE IN]`, `[STATE OUT]`, plus Tier-2 precision tags `[FOCUS]`, `[SPEED]`, `[PROP]`, `[ENV]`, `[CROWD]`, `[VFX]`, `[TRANS]`).
  - Locked two-phase **Phase Partition Law** (**Phase 1: STAGING** vs. **Phase 2: EXECUTION**) and **Single-Dimension Law** (each `->`-chained Sub-State directs strictly one optical, physical, or acoustic dimension).
  - Canonical 27-term framework dictionary covering Staging Architecture, State Mathematics & Timeline, and Directorial Craft & Continuity.
- **Canonical Inline Delimiters & `[AESTHETIC]` Lookbook Grammar** (`docs/GRAMMAR_CONTRACT.md`):
  - Locked standalone Macro-Block header regex (`/^\[([A-Z0-9 _-]+)\]$/`) and Open Block Principle staging extensions (`[INTENT]`, `[LOGIC]`, `[AESTHETIC]`, `[OPENING]`, `[CONTINUITY PROTOCOL]`, `[CHARACTERS]`, `[REFERENCES]`, `[STAGE]`, `[UNUSED MATERIALS]`, and custom uppercase headers).
  - Overloaded chaining operator (`->` / `→`): splits atomic Sub-States inside `[EXECUTION]` while declaring shorthand lookbook token mappings (`Description -> TOKEN`, semicolon-delimited) inside `[AESTHETIC]`.
  - Structured `[AESTHETIC]` `Key: Value` rows with lossless freeform fallback (`key: null`).
  - Canonical inline Sub-State delimiters: curly-brace spoken dialogue (`Speaker says [in Language] [modifiers] {line}`), diegetic `<foley>`, opt-in `(score)`, and opt-in `【on-screen text】`.
  - Phase 1 multimodal reference bindings (`@ref as Name (voice: @audio)`).
  - Non-destructive whitespace formatter (`formatAuteurScript()`), canonical plain-text export (`exportPlainText()`), and tagless export (`exportTagless()`) with automatic bare-camera-hold cleanup so lines never start with a dangling `->`.
- **4 Scene Topologies** (`docs/GLOSSARY.md`, `docs/SCRIPT_SUPERVISOR_AUDIT_RULES.md`):
  - **Continuous Oner** (`continuous_oner`, Moving Oner Law), **Multi-Camera Coverage** (`multi_camera_coverage`), **Parallel Cross-Cutting** ($A_k \parallel B_k$, dual independent State Ledgers classified structurally under `multi_camera_coverage`), and **Discontinuous Montage** (`discontinuous_montage`), plus deterministic IR edge states `'mixed'` and `'empty'`.
- **Deterministic Script Supervisor Linter & 5-Lens Audit Methodology** (`docs/SCRIPT_SUPERVISOR_AUDIT_RULES.md`):
  - Declarative `LINT_RULE_REGISTRY` with 5 isolated, pure rules across `Lens 1`–`Lens 5`:
    1. `viewport-coordinate-purity` (`Lens 1`, default `error`)
    2. `camera-redefinition-guard` (`Lens 1`, default `warning`)
    3. `macro-state-resolution` (`Lens 4`, default `warning`)
    4. `multimodal-reference-isolation` (`Lens 5`, phase-contextual default: Staging `warning` / Execution `error`)
    5. `frozen-first-frame-purity` (`Lens 5`, default `error`)
  - Per-rule severity override contract (`LintRuleOverrides`: `'off' | 'warning' | 'error'`) applied consistently across live editing, `toAuteurEnvelope()`, `compileAuteurDraft()`, `applyAuteurPatch()`, and `sliceAuteurScript()`.
  - Complete 5-Lens Script Supervisor checklist and genre tempo / cut-latency calibration table.
- **Programmatic JSON IR, Transactional Patch Engine & Composable Lens Slicer** (`docs/JSON_IR_SPEC.md`):
  - Lossless `AuteurScriptIR` (`schemaVersion: "0.4.0"`) with 11 discriminated `SubStateIR` dimensions, deterministic snapshot IDs (`MB#`, `MB#.#`, 1-based `S#` Macro-States, and 1-based `S#.#` Execution Sub-States `S1.1`, `S1.2`, …), and verified round-trip parity (`fromAuteurIR(toAuteurIR(raw)) === exportPlainText(raw)`).
  - Read-only `AuteurEnvelope` wrapping `document` with FNV-1a 32-bit `snapshotHash`, extracted `referenceBindings`, `tokenMappings`, `cameraSlots`, inherited `macroStateContinuity` (`effectiveFraming`), `sceneTopology`, and `DerivedDiagnosticIR[]`.
  - Transactional `AuteurPatch` engine (`applyAuteurPatch()`, 14 semantic operations across Staging and Execution) with optimistic concurrency (`expectedSnapshotHash`), origin-ID diagnostic diffing, and optional `rejectOnNewErrors` lint gate.
  - Non-mutating `projectAuteurPatchPreview()` returning `PatchPreviewProjection` across Staging and Execution changes and insertion seams.
  - Composable `sliceAuteurEnvelope()` / `sliceAuteurScript()` supporting surgical `macroStateIds` filtering (preserving inherited `resolvedCamera` from earlier unsliced states) and `includeStaging` toggling alongside 5 built-in `AUDIT_LENS_PRESETS` (`lens1_spatial_optics` through `lens5_blocks_grammar`), `validateAuteurReview()`, and Zod-derived JSON Schema registry (`getAuteurJsonSchemas()` exporting `draft`, `ir`, `envelope`, `patch`, `review`).
- **Craft Knowledge Pack, Quick Scan Rule Catalog & Reference Scripts**:
  - Versioned Craft Knowledge Pack baseline (`AUTEUR_KNOWLEDGE_VERSION = "0.4.0-k6"`) bundling foundational craft rules (including Beginner & Power-User Adaptation) and 7 modular skills (`draft_craft`, `draft_interview`, `video_continuation`, `token_mapping`, `character_reference`, `temporal_calibration`, `spatial_fences`).
  - Declarative atomic semantic Quick Scan catalog (`QUICK_SCAN_RULES_VERSION = "0.4.0-qs2"`) with 15 topology- and presence-gated binary (`true`/`false`) rules across `Lens 1`–`Lens 5` and `brief` (`document`, `macro_state`, and `sub_state` scopes).
  - 6 verbatim JSON bundled example families (10 scripts in `src/data/examples/catalog.json`) plus canonical zero-false-positive test exemplars in `tests/fixtures/craftExemplars.ts`.

### Changed & Deprecated (vs. Pre-`0.4.0` Drafts)

- **Removed legacy `[AUDIO]` and `[DIAL]` blocks/tags**: Replaced by inline `Speaker says (delivery) {line}`, `<foley>`, opt-in `(score)`, and `[AESTHETIC]` `Audio:` room-tone isolation.
- **Removed quotation-mark spoken dialogue**: Spoken lines now exclusively use curly braces (`{line}`), eliminating quote-escaping ambiguity with narrative prose.
- **Standardized pure hierarchy terminology**: Replaced informal `"beats"` and `"steps"` with **Macro-State** and **Sub-State** across grammar, diagnostics, JSON IR, and craft documentation; banned `"MS"` as shorthand for Macro-State because it collides with cinematography **Medium Shot**.
- **Banned theatrical proscenium directions**: Deprecated `stage-left` and `stage-right` in favor of camera-viewport coordinates (`frame-left`/`frame-right`, `screen-left`/`screen-right`) separated from anatomical yaw (`facing screen-left/right`), enforced as a default `error`.
- **Execution & Intent header aliases**: `[TIMELINE]`, `[BEATS]`, and `[SHOTLIST]` remain supported parser aliases for Phase 2 Execution (and `[GOAL]` for `[INTENT]`) under the Open Block Principle, while `[EXECUTION]` and `[INTENT]` are the canonical `v0.4.0` headers.
