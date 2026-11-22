# Programmatic JSON IR, Patch & Lens Slicer Specification (`v0.4.0`)

This document is the canonical engineering specification for the **Auteur Script Programmatic JSON Engine** implemented inside the pure TypeScript core:

- `src/core/irSchemas.ts` — Zod source-of-truth schemas & `getAuteurJsonSchemas()` JSON Schema registry
- `src/core/ir.ts` — Lossless IR codec (`toAuteurIR`, `fromAuteurIR`, `toAuteurEnvelope`, `compileAuteurDraft`, `computeSnapshotHash`)
- `src/core/patch.ts` — Public patch facade (`applyAuteurPatch`, `projectAuteurPatchPreview`) backed by modular `src/core/patch/*` internals (`types.ts`, `applyOp.ts`, `diagnostics.ts`, `irHelpers.ts`, `preview.ts`, `ops/stagingOps.ts`, `ops/executionOps.ts`)
- `src/core/slicer.ts` — Composable Lens Slicer (`AUDIT_LENS_PRESETS`, `sliceAuteurEnvelope`, `sliceAuteurScript`) & `validateAuteurReview`

It defines how automated pipelines, conversational editing agents, full-draft generators, and multi-lens Script Supervisor evaluators **create**, **read**, **edit**, **preview**, and **evaluate** Pure Auteur Scripts while preserving **Plain-Text-as-Truth** for the human editor.

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
         └──────────┬─────────────┬────────┘  │  • projectAuteurPatchPreview │
                    │             │           └─────────▲────────────────────┘
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
| **Execution Sub-State ($s_i$)** | `S<macroStateIndex>.<1-based subIndex>` | `S1.1` (`[CAM 01]`), `S1.2` (`[ACT]`), `S1.3` (`<foley>`) |

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
          { "id": "S1.1", "dimension": "camera", "subStateTag": "CAM", "identifier": "01", "content": "MS, OTS Miller" },
          { "id": "S1.2", "dimension": "action", "subStateTag": "ACT", "content": "Miller slides the folder forward with his left palm" },
          { "id": "S1.3", "dimension": "dialogue", "speaker": "Miller", "modifiers": "(quiet)", "line": "Look at the dates." },
          { "id": "S1.4", "dimension": "foley", "sound": "paper scrape" }
        ]
      }
    ]
  }
}
```

### 3.1 Phase 1: Staging Macro-Blocks (`stagingMacroBlocks[]`)

Headers validate against `StagingHeaderSchema` (`MACRO_HEADER_NAME_REGEX`, explicitly rejecting reserved Phase 2 Execution headers `EXECUTION`, `TIMELINE`, `BEATS`, `SHOTLIST`). Blocks are discriminated on `format`:

- **`format: "prose"`** — Used for `INTENT`, `LOGIC`, `OPENING`, `CONTINUITY PROTOCOL`, `CHARACTERS`, `REFERENCES`, `STAGE`, and any Open Block `CUSTOM` header.
  - Preserves `@ref as Name (voice: @audio)` reference bindings canonically inside `body`.
- **`format: "key_value"`** — Used for `AESTHETIC`.
  - Each line parses into `{ id, key: string | null, value: string }`.
  - Lines without a `Key:` prefix are preserved losslessly with `key: null`.
  - Shorthand token mappings (`Description -> TOKEN`, including semicolon-delimited multi-token lines) live canonically inside `entry.value` so there is never a dual source of truth.

### 3.2 Phase 2: Execution Sub-States (`SubStateIR` — 11 Dimensions)

`executionMacroBlock` validates `header` via `ExecutionHeaderSchema` (defaults to `"EXECUTION"` in `ExecutionMacroBlockDraftSchema`). Sub-States are discriminated on `dimension` and deterministically compiled via `renderSubState()`:

| `dimension` | Schema Fields | Canonical `v0.4.0` Output |
|---|---|---|
| `camera` | `subStateTag: "CAM"`, `identifier: string \| null` (`/^\d+[A-Z]?$/i`, normalized uppercase on compile), `content: string` | `[CAM 01] MS, OTS Miller` · `[CAM 01]` (bare hold/recall) · `[CAM] WS` (montage when `identifier: null`) |
| `action` | `subStateTag: "ACT"`, `content: string` *(non-empty in Draft)* | `[ACT] <content>` |
| `block` | `subStateTag: "BLOCK"`, `content: string` *(non-empty in Draft)* | `[BLOCK] <content>` |
| `light` | `subStateTag: "LIGHT"`, `content: string` *(non-empty in Draft)* | `[LIGHT] <content>` |
| `state_boundary` | `subStateTag: "STATE IN" \| "STATE OUT"`, `content: string` *(non-empty in Draft)* | `[STATE IN] <content>` / `[STATE OUT] <content>` |
| `tier2` | `subStateTag: string` (`MACRO_HEADER_NAME_REGEX`, e.g., `PROP`, `FOCUS`, `SPEED`, `ENV`, `CROWD`, `VFX`, `TRANS`), `content: string` | `[<TAG>] <content>` |
| `dialogue` | `speaker: string`, `language?: string`, `modifiers?: string`, `line: string` | `Speaker says [in Language] [modifiers] {line}` |
| `foley` | `sound: string` | `<sound>` |
| `score` | `cue: string` | `(cue)` |
| `onscreen_text` | `text: string` | `【text】` |
| `plain` | `content: string` | `<content>` (lossless fallback) |

> **Camera `identifier` Note**: Separating `subStateTag: "CAM"` from `identifier` (`"01"`, `"02"`, `"02A"`, or `null`) lets programmatic consumers distinguish continuous multi-camera coverage slots from discontinuous montage shots (`identifier: null`) and bare holds/recalls (`content: ""`) without regex parsing.

---

## 4. Read-Only Derived Envelope (`AuteurEnvelope`)

Built via `toAuteurEnvelope(rawText, ruleOverrides?)`. Wraps the mutable `document` with read-only intelligence computed deterministically from `extractor.ts` and `linter.ts` (honoring any per-rule `LintRuleOverrides` severities when provided):

- **`snapshotHash`**: Pure 8-character lowercase FNV-1a 32-bit hex digest (`computeSnapshotHash`) of `\n`-normalized `rawText` used for optimistic concurrency control during patching.
- **`derived.referenceBindings`**: Extracted `@ref as Name (voice: @audio)` entries linked to `sourceMacroBlockId` (`MB#`) and `sourceMacroBlock`.
- **`derived.tokenMappings`**: Extracted `Description -> TOKEN` mappings linked to `[AESTHETIC]` `entryId` (`MB#.#`) and `category`.
- **`derived.hasContinuationContext`**: `true` when `[CONTINUITY PROTOCOL]` or `@video*` / `@PREVIOUS_CLIP` is present.
- **`derived.sceneTopology`**: Deterministic classification: `'continuous_oner' | 'multi_camera_coverage' | 'discontinuous_montage' | 'mixed' | 'empty'`.
- **`derived.cameraSlots`**: Map keyed by camera `identifier` (e.g., `"01"`) storing `{ subStateTag: "CAM", identifier, establishedAt: "S1", initialFraming }`.
- **`derived.macroStateContinuity`**: Per-Macro-State resolved continuity array:
  - `macroStateId`: `"S1"`, `"S2"`, …
  - `activeCameraIdentifier`: `"01"` | `null`
  - `cameraTransition`: `'ESTABLISH' | 'HOLD' | 'CUT' | 'RECALL' | 'MONTAGE' | 'NONE'`
  - `currentDescriptor`: raw camera descriptor on this Macro-State (`""` on bare hold/recall)
  - `effectiveFraming`: deterministically inherited camera framing:
    - On `ESTABLISH` / `CUT`: records the slot's base framing (`currentDescriptor`).
    - On bare `HOLD` / `RECALL` (`currentDescriptor === ""`): inherits the slot's last known framing verbatim.
    - On moving-oner operator transitions (`HOLD` / `RECALL` with non-empty descriptor such as `PAN LEFT to Rosa`): compounds `<baseFraming> | <operatorMove>` (or `<operatorMove>` if base was empty) and updates the slot's last framing.
    - On `NONE` (Macro-State omitting any `[CAM]` Sub-State): inherits the preceding Macro-State's `effectiveFraming`.
    - On `MONTAGE` (`identifier: null`): severs inheritance and uses `currentDescriptor` directly.
  - `referencedTokens`: shorthand `[AESTHETIC]` tokens referenced inside this Macro-State.
- **`derived.diagnostics`**: Deterministic Script Supervisor `DerivedDiagnosticIR[]` (`{ id, ruleId, ruleName, lens, severity, targetPhase, targetId, message, repairHint, excerpt? }`), mapped to snapshot `targetId` (`MB#` or `S#`).

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
  // result.diagnostics  -> DerivedDiagnosticIR[]
} else {
  // result.errors       -> [{ path, message }] from Zod
}
```

### 5.2 Edit — Transactional Semantic Patch Engine (`applyAuteurPatch`)

All patches validate against `AuteurPatchSchema` (`getAuteurJsonSchemas().patch`) and resolve every snapshot ID (`MB#`, `MB#.#`, `S#`, `S#.#`) against the initial snapshot before compiling once back to canonical plain text. Deleting `S1`, editing `S3.2`, and inserting after `S2` in the same batch produces **zero index drift**.

Post-patch diagnostic diffing (`src/core/patch/diagnostics.ts`: `buildAfterToOriginTargetMap` + `diffDiagnostics`) maps surviving post-compilation `MB#` and `S#` IDs back to their pre-patch origin IDs and normalizes `S#` references in diagnostic messages, ensuring index shifts never trigger false `LINT_ERROR_INTRODUCED` rejections or false resolutions.

#### Complete Patch Operations Table (`14` Operations)

| Operation (`op`) | Required Fields | Behavior |
|---|---|---|
| `set_macro_block` | `macroBlockId` or `header`; `body` (prose) or `entries` (`key_value`) | Replaces the body or `[AESTHETIC]` entries of an existing Staging Macro-Block. *(On `key_value` `[AESTHETIC]`, providing `body` instead of `entries` parses lines via `parseAestheticLine()`.)* |
| `insert_macro_block` | `afterMacroBlockId: string \| null`, `macroBlock` | Inserts a new Staging Macro-Block (`null` inserts at index 0). |
| `delete_macro_block` | `macroBlockId` or `header` | Removes a Staging Macro-Block. |
| `set_aesthetic_entry` | `entryId` or `key`; `value` | Updates an `[AESTHETIC]` entry (optional `key` renames when `entryId` is used; upserts case-insensitively by `key` and creates `[AESTHETIC]` if missing). |
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
// res.nextEnvelope         -> Post-patch AuteurEnvelope (present once compilation succeeds)
// res.appliedOpsCount      -> Number of committed ops (0 on failure)
// res.diagnosticsBefore    -> Pre-patch DerivedDiagnosticIR[]
// res.diagnosticsAfter     -> Post-patch DerivedDiagnosticIR[]
// res.introducedErrors     -> Newly introduced severity="error" diagnostics
// res.introducedWarnings   -> Newly introduced severity="warning" diagnostics
// res.resolvedDiagnostics  -> Previously active diagnostics resolved by this patch
// res.errors               -> VALIDATION_ERROR | SNAPSHOT_MISMATCH | TARGET_NOT_FOUND | INVALID_OPERATION | LINT_ERROR_INTRODUCED
```

#### 5.2.1 Non-Mutating Patch Preview (`projectAuteurPatchPreview`)

`projectAuteurPatchPreview(rawText, rawPatch)` (`src/core/patch.ts` / `src/core/patch/preview.ts`) purely projects a candidate `AuteurPatch` onto pre-patch Staging Macro-Block indices (`MB#`), Execution Macro-State indices (`S#`), and insertion seams without mutating the script. Returns `null` if the patch fails Zod validation, mismatches `expectedSnapshotHash`, or errors on any operation.

| `PatchPreviewProjection` Field | Element Type | Purpose |
|---|---|---|
| `stagingChanges` | `StagingPatchPreviewChange[]` | Pre-patch Staging Macro-Blocks marked `kind: 'modify' \| 'delete'` with `blockIndex`, `blockId`, `header`, `afterHeader?`, `beforeBody`, `afterBody?`. |
| `stagingInsertions` | `StagingPatchPreviewInsertion[]` | New Staging Macro-Blocks anchored at `afterBlockIndex` (`-1` inserts before `MB0`, `k >= 0` after `MB<k>`) with `header` and `body`. |
| `executionChanges` | `ExecutionPatchPreviewChange[]` | Pre-patch Execution Macro-States marked `kind: 'modify' \| 'delete' \| 'reorder'` with 1-based `beatIndex` *(internal TS Macro-State index)*, `macroStateId`, `beforeText`, `afterText?`, and `movedToBeatIndex?`. |
| `executionInsertions` | `ExecutionPatchPreviewInsertion[]` | New Execution Macro-States anchored at `afterBeatIndex` (`0` inserts before `S1`, `k >= 1` after `S<k>`) with post-patch `insertedBeatIndex` and rendered `text`. |

### 5.3 Evaluate — Composable Dimension Slicer & Review Validator

`sliceAuteurEnvelope(envelope, spec)` and `sliceAuteurScript(rawText, specOrPreset, ruleOverrides?)` extract minimal, low-noise JSON projections tailored to any craft dimension while preserving original `S#` and `S#.#` IDs so evaluator findings can target exact nodes.

#### Surgical Slicing Options (`LensSliceSpec`)
- **`macroStateIds?: string[]`**: Restricts `macroStates[]` strictly to the requested Macro-State IDs (case-insensitive, normalized uppercase e.g. `["S3", "S4"]`) while still computing `resolvedCamera` from the full-envelope `derived.macroStateContinuity` so camera inheritance from earlier unsliced states (`S1..S(k-1)`) stays 100% accurate.
- **`includeStaging?: boolean`**: When set to `false`, omits `stagingMacroBlocks` (`[]`) for compact execution-only inspection.

#### Example: Isolate `[ACT]` Only Against Resolved `[CAM]` Framing

```ts
import { sliceAuteurScript } from '../src/core/index.ts';

const slice = sliceAuteurScript(rawText, {
  includeStaging: true,
  macroBlocks: ['LOGIC', 'OPENING'],
  macroStateIds: ['S2', 'S3'],
  dimensions: ['action'],
  includeResolvedCamera: true,
});
```

Every `macroStates[]` item in `slice` contains strictly `action` Sub-States paired with `resolvedCamera: { subStateTag: "CAM", identifier, transition, currentDescriptor, effectiveFraming }`—so even on bare `[CAM 01]` holds or recalls (or when slicing only `S3`), the evaluator immediately knows what the camera frames.

#### Built-In Script Supervisor Audit Lens Presets (`AUDIT_LENS_PRESETS`)

| Preset ID | Included Staging Context | Included Execution Dimensions / Tags | Extra Context |
|---|---|---|---|
| `lens1_spatial_optics` | `LOGIC`, `OPENING`, `CONTINUITY PROTOCOL` | `camera`, `block`, `action` | `resolvedCamera`, referenced `tokenMappings`, `sceneTopology` + `hasContinuationContext`, Lens 1 diagnostics |
| `lens2_temporal_pacing_wear` | `INTENT`, `LOGIC`, `OPENING` | `action`, `state_boundary`, tag `SPEED` | `resolvedCamera`, `sceneTopology` + `hasContinuationContext`, Lens 2 diagnostics |
| `lens3_props_inventory` | `LOGIC`, `OPENING`, `AESTHETIC` (`Wardrobe`, `Location` only) | `action`, tag `PROP` | `resolvedCamera`, Lens 3 diagnostics |
| `lens4_acoustics_voice` | `AESTHETIC` (`Audio` only) | `dialogue`, `foley`, `score` | `referenceBindings`, `endsOnDialogue`, Lens 4 diagnostics |
| `lens5_blocks_grammar` | All Staging Macro-Blocks | All Sub-States | `resolvedCamera`, all `tokenMappings`, `referenceBindings`, `sceneTopology` + `hasContinuationContext`, all diagnostics |

#### Validating Evaluator Output & Applying `suggestedPatch`

Use `getAuteurJsonSchemas().review` to constrain automated Script Supervisor evaluations, then validate with `validateAuteurReview(output)` (returning `{ ok: true, review: AuteurReview } | { ok: false, errors }`):

- **`AuteurReview`**: `{ overallSummary?: string, issues: AuteurReviewIssue[] }`
- **`AuteurReviewIssue`**: `{ id?, lens, severity, targetLevel: 'document' | 'macro_block' | 'aesthetic_entry' | 'macro_state' | 'sub_state', targetId, message, rationale, repairHint, suggestedPatch? }`
- Any `issue.suggestedPatch` (`AuteurPatch`) executes directly via `applyAuteurPatch(rawText, issue.suggestedPatch, { rejectOnNewErrors: true })`.

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
