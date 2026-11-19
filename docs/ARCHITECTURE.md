# Architecture — Auteur Script Editor

## 1. Plain-Text-as-Truth Data Flow

The editor treats the **canonical plain-text Auteur Script** as the single source of truth so Live Mode, Source Mode, clipboard exports, and `localStorage` persistence can never drift out of sync:

```text
                       ┌────────────────────────────────────┐
                       │   rawText: string (Single State)   │
                       │   + useEditorSettings() (Display)  │
                       └─────────────────┬──────────────────┘
                                         │
              ┌──────────────────────────┼──────────────────────────┐
              ▼                          ▼                          ▼
   [ Pure Synchronous Pipeline ]   [ Pure UI Mutations ]   [ Programmatic JSON Engine ]
   1. parseAuteurScript(raw)       (src/core/serializer)   (src/core/ir, patch, slicer)
   2. extractMetadata(doc)         • insert/update/delete  • toAuteurIR / fromAuteurIR
   3. lintDocument(doc, meta)        & reorder Staging     • toAuteurEnvelope / Draft
   4. tokenize* (highlighter)      • insert/update/delete  • applyAuteurPatch (tx+lint)
   5. parseAestheticRows             ExecutionBeat/Sub…    • sliceAuteurEnvelope (L1–L5)
                                   • reorderExecutionBeats • getAuteurJsonSchemas (Zod)
                                   • exportTagless
              │                          ▲                          ▲
              ▼                          │                          │
   [ Thin React + Tailwind UI (src/components/) ] ────────┘   [ AI / Automated Callers ]
   • TopSlateBar -> SettingsPopover    • LiveDocument           • SourceEditor
   • StagingBlockCard -> Registry      • AddStagingBlockPicker  • ExecutionBeatRow
   • LiveHighlightedEditor             • DiagnosticDot          • ConfirmDialog
```

---

## 2. Module Map

| Layer | Path | Responsibility |
|---|---|---|
| **Core AST Types** | `src/core/types.ts` | Pure TypeScript interfaces for `AuteurDocument`, `StagingBlock`, `ExecutionBeat`, `SubStateNode`, `ExtractedMetadata`, and `LintDiagnostic`. Zero React/DOM imports. |
| **Core Parser & Headers** | `src/core/parser.ts` | Lossless `v0.4.0` parser, `CANONICAL_STAGING_HEADERS` / `EXECUTION_HEADERS` catalogs, and `isMultiBlockAuteurScript()` paste detector. |
| **Core Lookbook Codec** | `src/core/aesthetic.ts` | Single Source of Truth for `[AESTHETIC]` `Key: Value` row parsing, lossless serialization, and key counting shared by IR, `AestheticBlockEditor`, and collapsed cards. |
| **Core Live Tokenizer** | `src/core/highlighter.ts` | Pure character-for-character lossless lexical & clause-underline tokenizer (`segmentClauseText`, `tokenizeExecutionLine`, `tokenizeStagingBody`, `tokenizeAestheticValue`, `tokenizeSourceDocument`). |
| **Core Extractor** | `src/core/extractor.ts` | Pure extraction of `@ref as NAME (voice: @audio)` character bindings, `[AESTHETIC]` `Description -> TOKEN` lookup dictionaries, continuation context detection, and beat-to-beat camera transitions (`ESTABLISH`, `HOLD`, `CUT`, `RECALL`, `MONTAGE`). |
| **Core Serializer** | `src/core/serializer.ts` | Lossless pure string mutation functions (`insertStagingBlock`, `updateStagingBlock`, `deleteStagingBlock`, Execution beat/sub-state CRUD & reorder) plus `exportPlainText()` and `exportTagless()`. |
| **Core Linter** | `src/core/linter.ts` | Modular deterministic Script Supervisor engine with 5 isolated V1 rule functions mapped to `Lens 1`–`Lens 5`. |
| **JSON IR & Schemas** | `src/core/irSchemas.ts`, `src/core/ir.ts` | Zod-validated glossary-aligned JSON IR (`toAuteurIR`, `fromAuteurIR`, `toAuteurEnvelope`, `compileAuteurDraft`), Camera `identifier` separation, `[AESTHETIC]` `key: value` parsing, and standard JSON Schema registry (`getAuteurJsonSchemas`). See `docs/JSON_IR_SPEC.md`. |
| **Patch Engine & Lens Slicer** | `src/core/patch.ts`, `src/core/slicer.ts` | Transactional ID-addressed `applyAuteurPatch()` with optimistic concurrency & lint gating, plus composable `sliceAuteurEnvelope()` / `AUDIT_LENS_PRESETS` and `validateAuteurReview()`. See `docs/JSON_IR_SPEC.md`. |
| **Presets** | `src/data/presets.ts` | Four canonical `v0.4.0` worked scripts (*Interrogation Room Coverage*, *Subway Train Fight Oner*, *POV Forest Horror*, *1970s Heist Montage*) plus a clean blank template. |
| **Display Settings & Tokens** | `src/ui/editorSettings.ts`, `src/ui/theme.ts`, `src/ui/textSize.ts`, `src/ui/clauseGuides.ts`, `src/ui/tokens/ui.ts`, `src/index.css` | Unified persisted display settings store (`useEditorSettings`), 4-mode shell theme engine (`light`, `warm`, `dark`, `oled`), script text-size presets (`13px`–`16px`), toggleable clause guides, and centralized `UI_TOKENS`. |
| **UI Labels SSOT** | `src/ui/labels.ts` | Single Source of Truth for all interface strings: `APP_META`, `MACRO_BLOCK_META` (canonical Macro-Block captions & badge classes), and `UI_LABELS` (toolbar, settings, phase headings, staging, execution, confirmations, tooltips, aria-labels, toasts). |
| **Staging Block Registry** | `src/components/stagingBlockRegistry.ts` | Pluggable registry mapping `MacroBlockKind` to specialized structured editors (such as `AestheticBlockEditor`) and collapsed header metadata formatters, falling back to `LiveHighlightedEditor`. |
| **UI Components** | `src/components/*.tsx` | Thin presentational React components (`TopSlateBar`, `SettingsPopover`, `LiveDocument` → `StagingPane` / `ExecutionPane`, shared `SortableList` & `HoverInsertSeam`, `StagingBlockCard`, `AestheticBlockEditor`, `AddStagingBlockPicker`, `ExecutionBeatRow`, `LiveHighlightedEditor`, `SourceEditor`, `DiagnosticDot`, `ConfirmDialog`). |
| **Debug Inspector *(Optional)*** | `src/components/debug/JsonIrDebugDrawer.tsx` | Decoupled, zero-cost-when-closed modal for inspecting `AuteurEnvelope`/IR, testing composable Lens Slicers, dry-running/committing `AuteurPatch` payloads, compiling JSON drafts, and exporting Zod JSON Schemas. |
| **Tests** | `tests/core/*.test.ts` | Vitest unit suite verifying parser round-trips, multi-block detection, aesthetic lookbook codec, live syntax & clause tokenizer losslessness, serializer edits (Staging & Execution), Tagless export, metadata extraction, all 5 linter rules, JSON IR round-trips, transactional patches, and Lens Slicers. |

---

## 3. Pure Serializer Mutation Contracts

Every mutation function in `src/core/serializer.ts` obeys three invariants:
1. **Immutability**: Takes `(raw: string, ...args)` and returns a new canonical `string` without mutating inputs.
2. **Block Orthogonality**: Inserting (`insertStagingBlock`), editing (`updateStagingBlock`), deleting (`deleteStagingBlock`), or reordering (`reorderStagingBlocks`) a Staging block preserves every other Staging block and all Execution beats untouched; editing, inserting, deleting, or reordering Execution beats never alters Staging blocks. `insertStagingBlock` also rejects reserved Execution headers (`EXECUTION`, `TIMELINE`, `BEATS`, `SHOTLIST`).
3. **Single-Line Beat Guarantee**: `updateExecutionBeat` and `insertExecutionBeat` normalize accidental internal newlines into single spaces so each Macro-State remains one clean line inside `[EXECUTION]`.

---

## 4. Paste-and-Hydrate Active-Editor Guard

In `src/App.tsx`, a document-level `paste` handler enables frictionless script ingestion using `isMultiBlockAuteurScript()` from `src/core/parser.ts` while protecting in-progress inline edits:
- **Modals open (`isDebugOpen` or `confirmRequest`)**: Ignored so modal inputs/interactions are never intercepted.
- **Pasting outside any focused input/textarea**: Immediately replaces `rawText`, parses the script, switches to Live Mode, and displays a subtle toast.
- **Pasting a multi-block Auteur Script (2+ canonical Macro-Block headers)** while inside a focused single-block or beat editor in Live Mode: Blurs the active field and hydrates the entire script.
- **Pasting a normal inline snippet** while focused inside a Staging block, Execution beat, Scene Title, or Source Mode editor: Passes through natively without interception.

---

## 5. Programmatic JSON IR, Patch & Lens Slicer Layer

To support model-agnostic **Create**, **Edit**, and **Evaluate** pipelines without breaking **Plain-Text-as-Truth**, `src/core/` exposes a pure TypeScript + Zod programmatic interchange layer (fully specified in `docs/JSON_IR_SPEC.md`):

- **Create**: `compileAuteurDraft(input)` validates untrusted JSON drafts against `AuteurScriptDraftSchema`, compiles deterministically to canonical `v0.4.0` plain text via `fromAuteurIR()`, and returns Script Supervisor diagnostics.
- **Edit**: `applyAuteurPatch(rawText, patch, options)` executes multi-op batches transactionally against snapshot-stable IDs (`MB#`, `MB#.#`, `S#`, `S#.#`) with optional `expectedSnapshotHash` concurrency checks and a `rejectOnNewErrors` deterministic lint gate.
- **Evaluate**: `sliceAuteurEnvelope()` / `sliceAuteurScript()` isolate arbitrary dimensions (plus 5 built-in `AUDIT_LENS_PRESETS`) paired with deterministically inherited `resolvedCamera.effectiveFraming`, and `validateAuteurReview()` validates structured findings with executable `suggestedPatch` payloads.

