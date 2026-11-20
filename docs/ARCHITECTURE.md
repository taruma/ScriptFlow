# Architecture — Auteur Script Editor

## 1. Plain-Text-as-Truth Data Flow

The editor treats the **canonical plain-text Auteur Script** as the single source of truth so Live Mode, Source Mode, clipboard exports, and `localStorage` persistence can never drift out of sync:

```text
                       ┌────────────────────────────────────┐
                       │  history.present: rawText (Truth)  │
                       │  (src/core/history.ts)             │
                       │  + useEditorSettings() (Display)   │
                       └─────────────────┬──────────────────┘
                                         │
              ┌──────────────────────────┼──────────────────────────┐
              ▼                          ▼                          ▼
   [ Pure Synchronous Pipeline ]   [ Pure UI Mutations ]   [ Programmatic JSON Engine ]
   1. parseAuteurScript(raw)       (src/core/serializer)   (src/core/ir, patch, slicer)
   2. extractMetadata(doc)         • insert/update/delete  • toAuteurIR / fromAuteurIR
   3. lintDocument(doc, meta, rules)  & reorder Staging     • toAuteurEnvelope / Draft
   4. tokenize* (highlighter)      • insert/update/delete  • applyAuteurPatch (tx+lint)
   5. parseAestheticRows             ExecutionBeat/Sub…    • sliceAuteurEnvelope (L1–L5)
                                   • reorderExecutionBeats • getAuteurJsonSchemas (Zod)
                                   • exportTagless
              │                          ▲                          ▲
              ▼                          │                          │
   [ Thin React + Tailwind UI (src/components/) ] ────────┘   [ AI / Automated Callers ]
   • ErrorBoundary -> App              • TopSlateBar -> FileMenuDropdown / SettingsPopover
   • LiveDocument -> StagingPane / ExecutionPane (SortableList + HoverInsertSeam)
   • StagingBlockCard -> Registry      • ExecutionBeatRow       • SourceEditor
   • LiveHighlightedEditor             • ScriptLibraryModal     • ConfirmDialog / DiagnosticDot
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
| **Core Serializer** | `src/core/serializer.ts` | Lossless pure string mutation functions (`insertStagingBlock`, `updateStagingBlock`, `deleteStagingBlock`, `reorderStagingBlocks`, Execution beat/sub-state CRUD & reorder) plus `exportPlainText()` and `exportTagless()`. |
| **Core Linter** | `src/core/linter.ts` | Declarative deterministic Script Supervisor engine (`LINT_RULE_REGISTRY`, `lintDocument(doc, meta?, ruleOverrides?)`) with 5 isolated pure rule functions mapped to `Lens 1`–`Lens 5` and per-rule `'off' \| 'warning' \| 'error'` overrides. |
| **Core History** | `src/core/history.ts` | Pure document-level Undo/Redo stack over `rawText` with coalesced typing bursts, structural checkpoints, and a monotonic `revision` counter for active-draft resyncs. |
| **JSON IR & Schemas** | `src/core/irSchemas.ts`, `src/core/ir.ts` | Zod-validated glossary-aligned JSON IR (`toAuteurIR`, `fromAuteurIR`, `toAuteurEnvelope`, `compileAuteurDraft`), Camera `identifier` separation, `[AESTHETIC]` `key: value` parsing, and standard JSON Schema registry (`getAuteurJsonSchemas`). See `docs/JSON_IR_SPEC.md`. |
| **Patch Engine & Lens Slicer** | `src/core/patch.ts`, `src/core/slicer.ts` | Transactional ID-addressed `applyAuteurPatch()` with optimistic concurrency & lint gating, plus composable `sliceAuteurEnvelope()` / `AUDIT_LENS_PRESETS` and `validateAuteurReview()`. See `docs/JSON_IR_SPEC.md`. |
| **Bundled Examples & Presets** | `src/data/examples/catalog.json`, `src/data/examples/*.txt`, `src/data/examples/index.ts`, `src/data/presets.ts` | File-based catalog of the four canonical `v0.4.0` worked scripts (*Interrogation Room Coverage*, *Subway Train Fight Oner*, *POV Forest Horror*, *1970s Heist Montage*) loaded eagerly via Vite `import.meta.glob(..., { query: '?raw' })`, re-exported through `presets.ts` (`SCRIPT_PRESETS`, `DEFAULT_PRESET`, `BLANK_SCRIPT_TEMPLATE`) for full backwards compatibility. |
| **Script Library & File I/O** | `src/ui/scriptLibraryDb.ts`, `src/ui/scriptStorage.ts`, `src/ui/scriptLibraryCodec.ts`, `src/ui/scriptFileIO.ts`, `src/ui/scriptLibraryView.ts` | Zero-dependency IndexedDB script library (`updatedAt` index, CRUD + `bulkPut`, graceful fallback, one-time legacy `localStorage` migration), lightweight `localStorage` `activeScriptId` pointer & crash-recovery mirror (`ErrorBoundary`), single-script `.txt`/Tagless/JSON Envelope exporters, single-file import parser (`.txt`/`.md`/Envelope/IR/Draft/Backup), versioned full-library backup codec with pure smart non-destructive merge, and pure Library view/search/pagination/fast-beat-count helpers. |
| **Display Settings & Tokens** | `src/ui/editorSettings.ts`, `src/ui/theme.ts`, `src/ui/textSize.ts`, `src/ui/clauseGuides.ts`, `src/ui/lintRules.ts`, `src/ui/tokens/ui.ts`, `src/index.css` | Unified persisted display & linter settings store (`useEditorSettings`), 4-mode shell theme engine (`light`, `warm`, `dark`, `oled`), script text-size presets (`13px`–`16px`), toggleable clause guides, persisted per-rule Script Supervisor overrides, and centralized `UI_TOKENS`. |
| **UI State & Stability Helpers** | `src/ui/beatFocus.ts`, `src/ui/stagingCollapse.ts`, `src/ui/historyShortcuts.ts`, `src/ui/clipboard.ts`, `src/ui/referenceStability.ts`, `src/ui/useStableValue.ts` | Pure step-focus reconciliation, index-tracked Staging & Execution collapse transitions, Undo/Redo shortcut matching, clipboard adapter, and structural reference stabilization for memoized Live Mode rendering. |
| **UI Labels SSOT** | `src/ui/labels.ts` | Single Source of Truth for all interface strings: `APP_META`, `MACRO_BLOCK_META` (canonical Macro-Block captions & badge classes), and `UI_LABELS` (toolbar, File menu, Script Library, read-only banner, settings, phase headings, staging, execution, confirmations, tooltips, aria-labels, toasts, error boundary). |
| **Staging Block Registry** | `src/components/stagingBlockRegistry.ts` | Pluggable registry mapping `MacroBlockKind` to specialized structured editors (such as `AestheticBlockEditor`) and collapsed header metadata formatters, falling back to `LiveHighlightedEditor`. |
| **UI Components** | `src/components/*.tsx` | Thin presentational React components (`ErrorBoundary`, `TopSlateBar`, `FileMenuDropdown`, `SettingsPopover`, lazy `ScriptLibraryModal`, `LiveDocument` → `StagingPane` / `ExecutionPane`, shared `SortableList` & `HoverInsertSeam`, `StagingBlockCard`, `AestheticBlockEditor`, `AddStagingBlockPicker`, `ExecutionBeatRow`, `LiveHighlightedEditor`, `SourceEditor`, `DiagnosticDot`, `ConfirmDialog`). |
| **Debug Inspector *(Optional)*** | `src/components/debug/JsonIrDebugDrawer.tsx` | Decoupled, zero-cost-when-closed modal for inspecting `AuteurEnvelope`/IR, testing composable Lens Slicers, dry-running/committing `AuteurPatch` payloads (commit actions guarded in read-only example mode), compiling JSON drafts, and exporting Zod JSON Schemas. |
| **Tests** | `tests/core/*.test.ts`, `tests/ui/uiState.test.ts`, `tests/ui/scriptLibrary.test.ts` | Vitest unit suite verifying parser round-trips, multi-block detection, aesthetic lookbook codec, live syntax & clause tokenizer losslessness, serializer edits, Tagless export, metadata extraction, all 5 linter rules, document history, JSON IR round-trips, transactional patches, Lens Slicers, UI state/stability helpers, bundled example catalog loading, IndexedDB fallback & migration, single-file import/export, smart non-destructive library backup merge, and Library view/filtering/pagination helpers. |

---

## 3. Pure Serializer Mutation Contracts

Every mutation function in `src/core/serializer.ts` obeys three invariants:
1. **Immutability**: Takes `(raw: string, ...args)` and returns a new canonical `string` without mutating inputs.
2. **Block Orthogonality**: Inserting (`insertStagingBlock`), editing (`updateStagingBlock`), deleting (`deleteStagingBlock`), or reordering (`reorderStagingBlocks`) a Staging block preserves every other Staging block and all Execution beats untouched; editing, inserting, deleting, or reordering Execution beats never alters Staging blocks. `insertStagingBlock` also rejects reserved Execution headers (`EXECUTION`, `TIMELINE`, `BEATS`, `SHOTLIST`).
3. **Single-Line Beat Guarantee**: `updateExecutionBeat` and `insertExecutionBeat` normalize accidental internal newlines into single spaces so each Macro-State remains one clean line inside `[EXECUTION]`.

---

## 4. Global Document Guards (Paste-and-Hydrate & Undo/Redo)

In `src/App.tsx`, two document-level listeners coordinate frictionless script ingestion and history navigation without colliding with active inline inputs or open modals:

### Paste-and-Hydrate Guard
Uses `isMultiBlockAuteurScript()` from `src/core/parser.ts`:
- **Modals open (`isDebugOpen`, `isLibraryOpen`, `confirmRequest`, or any `[aria-modal="true"]`)**: Ignored so modal inputs/interactions are never intercepted.
- **Read-only bundled examples**: Intercepts document-level pastes without mutating the read-only example and displays a gentle toast guiding the user to click **Fork to Edit** or create a **New Blank Script**.
- **Pasting outside any focused input/textarea (custom script)**: Immediately replaces `rawText` in place (as an undoable `'checkpoint'` history entry), parses the script, switches to Live Mode, and displays a subtle toast.
- **Pasting a multi-block Auteur Script (2+ canonical Macro-Block headers)** while inside a focused single-block or beat editor in Live Mode: Blurs the active field and hydrates the entire script.
- **Pasting a normal inline snippet** while focused inside a Staging block, Execution beat, Scene Title, or Source Mode editor: Passes through natively without interception.

### Document-Level Undo / Redo Guard
Uses `matchHistoryShortcut()` (`src/ui/historyShortcuts.ts`) and `src/core/history.ts`:
- **Commit Modes & Lifecycle Reset**: Rapid typing commits with `mode: 'coalesce'` + a scoped `groupKey` (auto-checkpointing on bulk edits > 32 chars or pauses > 800ms); structural actions (splits, merges, inserts, deletes, reorders, paste-hydrate, debug commits) commit with `mode: 'checkpoint'`. Switching scripts, forking an example, importing a script, or creating a blank script resets history cleanly via `createDocumentHistory()`.
- **Read-Only, Modal & Native-Input Isolation**: Skips shortcuts when viewing a read-only bundled example, whenever a modal is open (`isDebugOpen`, `isLibraryOpen`, `confirmRequest`, or any `[aria-modal="true"]` element), or when focus sits inside a `[data-native-undo="true"]` input (Scene Title, custom Staging header field, Library search/rename inputs).
- **Active-Draft Resync**: Stepping Undo/Redo increments `history.revision`, prompting memoized Live Mode editors (`StagingBlockCard`, `AestheticBlockEditor`, `ExecutionBeatRow`) to immediately resync their local drafts even while focused.

### Multi-Script Persistence & Crash-Recovery Mirror
- **Mount Hydration**: On mount, `App.tsx` runs `scriptLibraryDb.migrateFromLegacyLocalStorage()`, loads the IndexedDB library list, and opens the active custom script or bundled example (falling back to `DEFAULT_PRESET`).
- **Debounced IndexedDB Save + `localStorage` Mirror**: Edits and title renames on custom scripts debounce-save to `scriptLibraryDb.put()` (flushed synchronously before script switches, backups, or unmount) while immediately calling `mirrorActiveScriptToLocalStorage()` so `ErrorBoundary` crash recovery stays intact. Bundled examples remain strictly read-only and never auto-create IndexedDB records until the user explicitly clicks **Fork to Edit** (or **Fork** in the Library).

---

## 5. Programmatic JSON IR, Patch & Lens Slicer Layer

To support model-agnostic **Create**, **Edit**, and **Evaluate** pipelines without breaking **Plain-Text-as-Truth**, `src/core/` exposes a pure TypeScript + Zod programmatic interchange layer (fully specified in `docs/JSON_IR_SPEC.md`):

- **Create**: `compileAuteurDraft(input)` validates untrusted JSON drafts against `AuteurScriptDraftSchema`, compiles deterministically to canonical `v0.4.0` plain text via `fromAuteurIR()`, and returns Script Supervisor diagnostics.
- **Edit**: `applyAuteurPatch(rawText, patch, options)` executes multi-op batches transactionally against snapshot-stable IDs (`MB#`, `MB#.#`, `S#`, `S#.#`) with optional `expectedSnapshotHash` concurrency checks and a `rejectOnNewErrors` deterministic lint gate.
- **Evaluate**: `sliceAuteurEnvelope()` / `sliceAuteurScript()` isolate arbitrary dimensions (plus 5 built-in `AUDIT_LENS_PRESETS`) paired with deterministically inherited `resolvedCamera.effectiveFraming`, and `validateAuteurReview()` validates structured findings with executable `suggestedPatch` payloads.

