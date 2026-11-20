# Programmatic JSON IR, Patch & Lens Slicer Specification (`v0.4.0`)

This document is the canonical engineering specification for the **Auteur Script Programmatic JSON Engine** implemented inside the pure TypeScript core (`src/core/irSchemas.ts`, `src/core/ir.ts`, `src/core/patch.ts`, `src/core/slicer.ts`).

It defines how automated pipelines, conversational editing agents, full-draft generators, and multi-lens Script Supervisor evaluators **create**, **read**, **edit**, and **evaluate** Pure Auteur Scripts while preserving **Plain-Text-as-Truth** for the human editor.

---

## 1. Core Design Invariants

1. **Plain-Text-as-Truth**: Canonical `v0.4.0` plain text (`rawText`) remains the sole persisted source of truth. The JSON IR is a lossless, deterministic interchange representation:
   `fromAuteurIR(toAuteurIR(rawText)) === exportPlainText(rawText)`.
2. **Zero-React, Pure TypeScript Core**: Every module in the JSON engine depends strictly on pure TypeScript and `zod`, with zero React, DOM, or browser API imports.
3. **100% Platform- & Model-Agnostic**: All schemas export standard JSON Schema objects via `getAuteurJsonSchemas()` without vendor-specific wrappers or model identifiers.
4. **Glossary-Aligned Vocabulary**: Every field name maps 1-to-1 to `docs/GLOSSARY.md` (`Macro-Block`, `Macro-State`, `Sub-State`, `Sub-State Tag`, Camera `identifier`, `tokenMappings`, `referenceBindings`, `Lens 1`–`Lens 5`).
5. **Strict Separation of Mutable IR vs. Read-Only Derived Context**: The editable document (`AuteurScriptIR`) contains zero redundant or computed fields. Computed continuity, extracted bindings, and diagnostics live strictly in the sibling `derived` object of `AuteurEnvelope`.

```text
                ┌──────────────────────────────────────────────────┐
                │      rawText: string (Plain-Text-as-Truth)       │
                └──────────┬────────────────────────────▲──────────┘
                           │                            │
                toAuteurEnvelope()                fromAuteurIR()
             (parse + extract + lint)       (canonical v0.4.0 compiler)
                           │                            │
                           ▼                            │
         ┌─────────────────────────────────┐  ┌─────────┴────────────────────┐
         │         AuteurEnvelope          │  │     applyAuteurPatch()       │
         │  • snapshotHash                 │  │  • Zod validation            │
         │  • document: AuteurScriptIR     │  │  • Snapshot ID resolution    │
         │  • derived: Continuity + Lint   │  │  • Post-patch lint gate      │
         └──────────┬─────────────┬────────┘  └─────────▲────────────────────┘
                    │             │                     │
                    │             ▼                     │
                    │  ┌─────────────────────────┐      │
                    │  │   sliceAuteurEnvelope() │      │
                    │  │  • Custom filter specs  │      │
                    │  │  • 5 Audit Lens presets │      │
                    │  └──────────┬──────────────┘      │
                    │             │                     │
                    ▼             ▼                     │
         ┌───────────────────────────────────────────────────────────┐
         │             Zod Contracts & JSON Schema Registry          │
         │   draft (Create) • patch (Edit) • review (Evaluate + Fix) │
         └───────────────────────────────────────────────────────────┘
```

---

## 2. Deterministic Addressing Scheme

Every addressable element receives a deterministic snapshot ID derived from the parsed document:

| Glossary Term | Snapshot ID Format | Example |
|---|---|---|
| **Staging Macro-Block** | `MB<0-based index>` | `MB0` (`INTENT`), `MB1` (`LOGIC`), `MB2` (`AESTHETIC`), `MB3` (`OPENING`) |
| **`[AESTHETIC]` Lookbook Entry** | `MB<blockIndex>.<0-based entryIndex>` | `MB2.0` (`Medium`), `MB2.2` (`Location`) |
| **Execution Macro-State ($S_n$)** | `S<1-based index>` | `S1`, `S2`, `S3` |
| **Execution Sub-State ($s_i$)** | `S<beatIndex>.<0-based subIndex>` | `S1.0` (`[CAM 01]`), `S1.1` (`[ACT]`), `S1.2` (`<foley>`) |

---

## 3. Canonical Document IR (`AuteurScriptIR`)

Produced by `toAuteurIR(rawText)` and compiled back to canonical `v0.4.0` plain text by `fromAuteurIR(ir)`.

```json
{
  "schemaVersion": "0.4.0",
  "preamble": [],
  "stagingMacroBlocks": [
    {
      "id": "MB0",
      "header": "INTENT",
      "kind": "INTENT",
      "format": "prose",
      "body": "Create a tense interrogation featuring @image1 as Miller (voice: @audio1)..."
    },
    {
      "id": "MB1",
      "header": "LOGIC",
      "kind": "LOGIC",
      "format": "prose",
      "body": "Keep the table as the 180-degree axis. No subtitles appear on screen."
    },
    {
      "id": "MB2",
      "header": "AESTHETIC",
      "kind": "AESTHETIC",
      "format": "key_value",
      "entries": [
        { "id": "MB2.0", "key": "Medium", "value": "35mm film, 2.39:1 anamorphic" },
        { "id": "MB2.1", "key": "Location", "value": "concrete interrogation room -> LOC01; wet alley -> LOC02" },
        { "id": "MB2.2", "key": "Audio", "value": "fluorescent ballast hum, muffled footsteps" }
      ]
    },
    {
      "id": "MB3",
      "header": "OPENING",
      "kind": "OPENING",
      "format": "prose",
      "body": "MS at eye level, framed over Miller's shoulder toward Ray..."
    }
  ],
  "executionMacroBlock": {
    "header": "EXECUTION",
    "macroStates": [
      {
        "id": "S1",
        "subStates": [
          { "id": "S1.0", "dimension": "camera", "subStateTag": "CAM", "identifier": "01", "content": "MS, OTS Miller" },
          { "id": "S1.1", "dimension": "action", "subStateTag": "ACT", "content": "Miller slides the folder forward with his left palm" },
          { "id": "S1.2", "dimension": "dialogue", "speaker": "Miller", "modifiers": "(quiet)", "line": "Look at the dates." },
          { "id": "S1.3", "dimension": "foley", "sound": "paper scrape" }
        ]
      }
    ]
  }
}
```

### 3.1 Phase 1: Staging Macro-Blocks (`stagingMacroBlocks[]`)

Discriminated on `format`:

- **`format: "prose"`** — Used for `INTENT`, `LOGIC`, `OPENING`, `CONTINUITY PROTOCOL`, `CHARACTERS`, `REFERENCES`, `STAGE`, and any Open Block `CUSTOM` header.
  - Preserves `@ref as Name (voice: @audio)` reference bindings canonically inside `body`.
- **`format: "key_value"`** — Used for `AESTHETIC`.
  - Each line parses into `{ id, key: string | null, value: string }`.
  - Lines without a `Key:` prefix are preserved losslessly with `key: null`.
  - Shorthand token mappings (`Description -> TOKEN`, including semicolon-delimited multi-token lines) live canonically inside `entry.value` so there is never a dual source of truth.

### 3.2 Phase 2: Execution Sub-States (`SubStateIR` — 11 Dimensions)

Discriminated on `dimension`, deterministically compiled via `renderSubState()`:

| `dimension` | Schema Fields | Canonical `v0.4.0` Output |
|---|---|---|
| `camera` | `subStateTag: "CAM"`, `identifier: string \| null` (`^\d+[A-Z]?$`), `content: string` | `[CAM 01] MS, OTS Miller` · `[CAM 01]` (bare hold/recall) · `[CAM] WS` (montage when `identifier: null`) |
| `action` | `subStateTag: "ACT"`, `content: string` | `[ACT] <content>` |
| `block` | `subStateTag: "BLOCK"`, `content: string` | `[BLOCK] <content>` |
| `light` | `subStateTag: "LIGHT"`, `content: string` | `[LIGHT] <content>` |
| `state_boundary` | `subStateTag: "STATE IN" \| "STATE OUT"`, `content: string` | `[STATE IN] <content>` / `[STATE OUT] <content>` |
| `tier2` | `subStateTag: string` (any uppercase tag, e.g. `PROP`, `FOCUS`, `SPEED`, `ENV`, `CROWD`, `VFX`, `TRANS`), `content: string` | `[<TAG>] <content>` |
| `dialogue` | `speaker: string`, `language?: string`, `modifiers?: string`, `line: string` | `Speaker says [in Language] [modifiers] {line}` |
| `foley` | `sound: string` | `<sound>` |
| `score` | `cue: string` | `(cue)` |
| `onscreen_text` | `text: string` | `【text】` |
| `plain` | `content: string` | `<content>` (lossless fallback) |

> **Camera `identifier` Note**: Separating `subStateTag: "CAM"` from `identifier` (`"01"`, `"02"`, `"02A"`, or `null`) lets programmatic consumers distinguish continuous multi-camera coverage slots from discontinuous montage shots (`identifier: null`) and bare holds/recalls (`content: ""`) without regex parsing.

---

## 4. Read-Only Derived Envelope (`AuteurEnvelope`)

Built via `toAuteurEnvelope(rawText, ruleOverrides?)`. Wraps the mutable `document` with read-only intelligence computed deterministically from `extractor.ts` and `linter.ts` (honoring any per-rule `LintRuleOverrides` severities when provided):

- **`snapshotHash`**: Pure FNV-1a 32-bit hex digest of normalized `rawText` used for optimistic concurrency control during patching.
- **`derived.referenceBindings`**: Extracted `@ref as Name (voice: @audio)` entries linked to `sourceMacroBlockId` (`MB#`) and `sourceMacroBlock`.
- **`derived.tokenMappings`**: Extracted `Description -> TOKEN` mappings linked to `[AESTHETIC]` `entryId` (`MB#.#`) and `category`.
- **`derived.hasContinuationContext`**: `true` when `[CONTINUITY PROTOCOL]` or `@video*` / `@PREVIOUS_CLIP` is present.
- **`derived.sceneTopology`**: Deterministic classification: `'continuous_oner' | 'multi_camera_coverage' | 'discontinuous_montage' | 'mixed' | 'empty'`.
- **`derived.cameraSlots`**: Map keyed by camera `identifier` (e.g. `"01"`) storing `{ subStateTag: "CAM", identifier, establishedAt: "S1", initialFraming }`.
- **`derived.macroStateContinuity`**: Per-Macro-State resolved continuity array:
  - `macroStateId`: `"S1"`, `"S2"`, …
  - `activeCameraIdentifier`: `"01"` | `null`
  - `cameraTransition`: `'ESTABLISH' | 'HOLD' | 'CUT' | 'RECALL' | 'MONTAGE' | 'NONE'`
  - `currentDescriptor`: raw camera descriptor on this Macro-State (`""` on bare hold/recall)
  - `effectiveFraming`: deterministically inherited camera framing:
    - On `ESTABLISH` / `CUT`: records the slot's base framing.
    - On bare `HOLD` / `RECALL` (`currentDescriptor === ""`): inherits the slot's last known framing verbatim.
    - On moving-oner operator transitions (`HOLD` / `RECALL` with non-empty descriptor such as `PAN LEFT to Rosa`): compounds `<baseFraming> | <operatorMove>` so evaluators see both the established optical setup and the active camera movement.
    - On `MONTAGE` (`identifier: null`): severs inheritance and uses `currentDescriptor` directly.
  - `referencedTokens`: shorthand `[AESTHETIC]` tokens referenced inside this Macro-State.
- **`derived.diagnostics`**: Deterministic Script Supervisor `LintDiagnostic[]` mapped to snapshot `targetId` (`MB#` or `S#`).

---

## 5. Workflows & API Reference

### 5.1 Create — Full-Draft Compilation (`compileAuteurDraft`)

Use `AuteurScriptDraftSchema` (exported via `getAuteurJsonSchemas().draft`), where snapshot IDs (`id`), `schemaVersion`, and `preamble` are optional so generators never invent boilerplate IDs:

```ts
import { compileAuteurDraft, getAuteurJsonSchemas } from '../src/core/index.ts';

const { draft: draftJsonSchema } = getAuteurJsonSchemas();
// Pass draftJsonSchema to any structured-output generator, then compile (optionally passing ruleOverrides):
const result = compileAuteurDraft(untrustedJsonFromModel, ruleOverrides);

if (result.ok) {
  // result.rawText      -> Canonical v0.4.0 plain text
  // result.ir           -> Addressed AuteurScriptIR
  // result.envelope     -> Full AuteurEnvelope
  // result.diagnostics  -> Script Supervisor LintDiagnostic[]
} else {
  // result.errors       -> [{ path, message }] from Zod
}
```

### 5.2 Edit — Transactional Semantic Patch Engine (`applyAuteurPatch`)

All patches validate against `AuteurPatchSchema` (`getAuteurJsonSchemas().patch`) and resolve every snapshot ID (`MB#`, `MB#.#`, `S#`, `S#.#`) against the initial snapshot before compiling once back to canonical plain text. Deleting `S1`, editing `S3.1`, and inserting after `S2` in the same batch produces **zero index drift**.

#### Complete Patch Operations Table

| Operation (`op`) | Required Fields | Behavior |
|---|---|---|
| `set_macro_block` | `macroBlockId` or `header`; `body` (prose) or `entries` (`key_value`) | Replaces the body or `[AESTHETIC]` entries of an existing Staging Macro-Block. |
| `insert_macro_block` | `afterMacroBlockId: string \| null`, `macroBlock` | Inserts a new Staging Macro-Block (`null` inserts at index 0). |
| `delete_macro_block` | `macroBlockId` or `header` | Removes a Staging Macro-Block. |
| `set_aesthetic_entry` | `entryId` or `key`; `value` | Updates an `[AESTHETIC]` entry (upserts by `key` and creates `[AESTHETIC]` if missing). |
| `delete_aesthetic_entry` | `entryId` or `key` | Removes an entry from `[AESTHETIC]`. |
| `upsert_token_mapping` | `category`, `description`, `token` | Updates `description -> TOKEN` in place if `token` exists, moves it if `category` changed, or appends cleanly to `[AESTHETIC]`. |
| `delete_token_mapping` | `token` | Removes the matching `-> TOKEN` segment from `[AESTHETIC]` (and drops the entry if empty). |
| `replace_macro_state` | `macroStateId`, `subStates[]` | Replaces all Sub-States of `S#`. |
| `insert_macro_state` | `afterMacroStateId: string \| null`, `subStates[]` | Inserts a new Macro-State (`null` inserts at top; creates `[EXECUTION]` if missing). |
| `delete_macro_state` | `macroStateId` | Removes `S#` from `[EXECUTION]`. |
| `reorder_macro_states` | `macroStateId`, `afterMacroStateId: string \| null` | Moves `S#` immediately after another Macro-State (or to `S1` when `null`). |
| `replace_sub_state` | `subStateId`, `subState` | Replaces a single typed Sub-State `S#.#`. |
| `insert_sub_state` | `macroStateId`, `afterSubStateId: string \| null`, `subState` | Inserts a Sub-State inside `S#` (`null` prepends at index 0). |
| `delete_sub_state` | `subStateId` | Deletes `S#.#` (and deletes the parent Macro-State cleanly if it was the last Sub-State). |

#### Concurrency & Deterministic Lint Gate

```ts
import { applyAuteurPatch } from '../src/core/index.ts';

const res = applyAuteurPatch(rawText, patchFromModel, {
  rejectOnNewErrors: true,
  ruleOverrides, // Optional per-rule Script Supervisor severity overrides
});

// res.ok                   -> boolean
// res.nextRawText          -> Committed canonical v0.4.0 plain text (unchanged on failure)
// res.candidateRawText     -> Compiled text even when rejected by rejectOnNewErrors (for self-repair)
// res.introducedErrors     -> Newly introduced severity="error" diagnostics
// res.introducedWarnings   -> Newly introduced severity="warning" diagnostics
// res.resolvedDiagnostics  -> Previously active diagnostics resolved by this patch
// res.errors               -> VALIDATION_ERROR | SNAPSHOT_MISMATCH | TARGET_NOT_FOUND | INVALID_OPERATION | LINT_ERROR_INTRODUCED
```

### 5.3 Evaluate — Composable Dimension Slicer & Review Validator

`sliceAuteurEnvelope(envelope, spec)` and `sliceAuteurScript(rawText, specOrPreset, ruleOverrides?)` extract minimal, low-noise JSON projections tailored to any craft dimension while preserving original `S#` and `S#.#` IDs so evaluator findings can target exact nodes.

#### Example: Isolate `[ACT]` Only Against Resolved `[CAM]` Framing

```ts
import { sliceAuteurScript } from '../src/core/index.ts';

const slice = sliceAuteurScript(rawText, {
  macroBlocks: ['LOGIC', 'OPENING'],
  dimensions: ['action'],
  includeResolvedCamera: true,
});
```

Every `macroStates[]` item in `slice` contains strictly `action` Sub-States paired with `resolvedCamera: { subStateTag: "CAM", identifier, transition, currentDescriptor, effectiveFraming }`—so even on bare `[CAM 01]` holds or recalls, the evaluator immediately knows what the camera frames.

#### Built-In Script Supervisor Audit Lens Presets (`AUDIT_LENS_PRESETS`)

| Preset ID | Included Staging Context | Included Execution Dimensions / Tags | Extra Context |
|---|---|---|---|
| `lens1_spatial_optics` | `LOGIC`, `OPENING`, `CONTINUITY PROTOCOL` | `camera`, `block`, `action` | `resolvedCamera`, referenced `tokenMappings`, `sceneTopology`, Lens 1 diagnostics |
| `lens2_temporal_pacing_wear` | `INTENT`, `LOGIC`, `OPENING` | `action`, `state_boundary`, tag `SPEED` | `resolvedCamera`, `sceneTopology`, Lens 2 diagnostics |
| `lens3_props_inventory` | `LOGIC`, `OPENING`, `AESTHETIC` (`Wardrobe`, `Location` only) | `action`, tag `PROP` | `resolvedCamera`, Lens 3 diagnostics |
| `lens4_acoustics_voice` | `AESTHETIC` (`Audio` only) | `dialogue`, `foley`, `score` | `referenceBindings`, `endsOnDialogue`, Lens 4 diagnostics |
| `lens5_blocks_grammar` | All Staging Macro-Blocks | All Sub-States | `resolvedCamera`, all `tokenMappings`, `referenceBindings`, `sceneTopology`, all diagnostics |

#### Validating Evaluator Output & Applying `suggestedPatch`

Use `getAuteurJsonSchemas().review` to constrain automated Script Supervisor evaluations, then validate with `validateAuteurReview(output)`. Each `issue` can optionally include a ready-to-execute `suggestedPatch` (`AuteurPatch`) directly executable via `applyAuteurPatch(rawText, issue.suggestedPatch, { rejectOnNewErrors: true })`.

---

## 6. JSON Schema Export Registry (`getAuteurJsonSchemas`)

`getAuteurJsonSchemas()` exports five standard JSON Schema objects generated directly from the Zod source-of-truth definitions:

| Key | Zod Schema | Primary Purpose |
|---|---|---|
| `draft` | `AuteurScriptDraftSchema` | Full-draft script generation (**Create**) |
| `ir` | `AuteurScriptIRSchema` | Complete addressed document representation |
| `envelope` | `AuteurEnvelopeSchema` | Document + read-only derived continuity & diagnostics |
| `patch` | `AuteurPatchSchema` | Transactional semantic edits (**Edit** & auto-repair) |
| `review` | `AuteurReviewSchema` | Structured Script Supervisor findings + optional `suggestedPatch` (**Evaluate**) |
