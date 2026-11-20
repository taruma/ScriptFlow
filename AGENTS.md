# AGENTS.md — Auteur Script Editor Engineering Contract

This document is the operational Single Source of Truth (SSOT) for AI agents and engineers maintaining the **Auteur Script Editor** (`v0.4.0` Canonical Inline Syntax, 100% platform- and model-agnostic).

### Canonical Workspace Documentation (`docs/`)
- **`docs/GLOSSARY.md`**: Authoritative Pure Auteur Script vocabulary (explicit disambiguation of **Macro-Block**, **Macro-State**, **Sub-State**, **Sub-State Tag**, and inline `[BLOCK]`, plus all 27 grounded framework terms mapped to `src/core/types.ts`). **Read first** when interpreting user domain terminology.
- **`docs/GRAMMAR_CONTRACT.md`**: Locked `v0.4.0` regexes, parsing edge cases, Tagless export rules, and deterministic linter contracts.
- **`docs/SCRIPT_SUPERVISOR_AUDIT_RULES.md`**: Human-readable checklist of all 4 Scene Topologies, all 5 live deterministic linter rules, all 5 Script Supervisor Audit Lenses (`Lens 1`–`Lens 5`), temporal calibration, and pass/fail examples.
- **`docs/ARCHITECTURE.md`**: Plain-Text-as-Truth data flow, module map, pure serializer mutation contracts, and global paste/history guards.
- **`docs/JSON_IR_SPEC.md`**: Programmatic JSON IR (`AuteurScriptIR`, `AuteurEnvelope`), Zod/JSON Schema contracts, transactional `AuteurPatch` engine, and composable Script Supervisor Lens Slicer (`AUDIT_LENS_PRESETS`).
- **`docs/UI_PHILOSOPHY.md`**: Asymmetric `40/60` Live workspace & single-document Source mode principles, Undo/Redo & crash recovery, 2-column Lookbook & Waterfall editing, shared DnD, unified Settings popover, and 4-mode theme system.
- **`docs/UI_LABELING.md`**: Human-readable UI copy & labeling contract (`APP_META`, `MACRO_BLOCK_META`, `UI_LABELS` namespaces, domain-to-UI vocabulary bridge, and theme labels).
- **`docs/AI_ASSISTANT_WALKTHROUGH.md`**: End-to-end user & operator walkthrough for the Unified Transparent AI Assistant (BYOK setup, `Auto`/`Draft`/`Refine`/`Audit` focus routing, collapsible `Brief / Refs` tray & Draft Wrapper Template, all 6 local AI tools, 3-state skill machine, pre-send Context Inspector, suggestion cards, and Trace Inspector).

---

## 1. Before Writing Code (Operating Protocol)

1. **Read First**: Inspect the relevant source modules and matching `docs/*.md` contracts before proposing or editing code. Check `docs/GLOSSARY.md` whenever domain terminology appears in a request.
2. **Clarify Ambiguous Features**: If a casual or underspecified feature request (e.g., *"add X"*) involves non-trivial UX, data-model, or architectural tradeoffs—and the user has not explicitly asked to execute immediately—briefly propose a **plain-English plan** and ask **1–3 focused clarifying questions** before modifying files.
3. **Root-Cause Bugfixes**: For any bug report (e.g., *"fix Y"*), trace the actual root cause first, implement the minimal architectural fix, and add a focused **regression test** in `tests/core/` or `tests/ui/` that would have caught the bug.

---

## 2. Where New Code Belongs

| Directory | Ownership & Rules |
|---|---|
| **`src/core/`** | **100% pure TypeScript** domain engine: AST types, parser, `[AESTHETIC]` codec, live/clause tokenizer, metadata extractor, lossless serializer, deterministic linter, Undo/Redo history, and Zod JSON IR / Patch / Lens Slicer. **Zero** React, DOM, `localStorage`, or CSS imports. |
| **`src/ui/`** | Pure UI state helpers, browser adapters, IndexedDB script library & File I/O hook/codecs (`useScriptLibrary.ts`, `scriptLibraryDb.ts`, `scriptStorage.ts`, `scriptLibraryCodec.ts`, `scriptFileIO.ts`, `scriptLibraryView.ts`), settings/theme/token/AI-skills stores (`aiSettings.ts`, `aiSkillsStore.ts`), labeling SSOT (`labels.ts`), keyboard matchers (`historyShortcuts.ts`), focus/collapse transitions (`beatFocus.ts`, `stagingCollapse.ts`), and structural reference stabilization (`referenceStability.ts`, `useStableValue.ts`). |
| **`src/components/`** | Thin, `memo()`-friendly React + Tailwind presentational views (`LiveDocument` → `StagingPane` / `ExecutionPane`, `StagingBlockCard`, `ExecutionBeatRow`, `SortableList`, `LiveHighlightedEditor`, `TopSlateBar`, `FileMenuDropdown`, `SettingsPopover`, lazy `ScriptLibraryModal`, lazy `AiAssistantSidebar` / `AiContextInspectorModal` / `AiSettingsModal` / `AiTraceModal`, `ConfirmDialog`, `ErrorBoundary`, optional `debug/`). |
| **`src/services/`** | AI knowledge registry & context composer (`auteurKnowledge.ts`, zero React/DOM/`localStorage`), local staging/read-only script tools & dynamic skill loader (`scriptTools.ts`), and streaming provider client (`geminiInteractions.ts`). Keeps prompt craft, tool orchestration, and SDK adapters decoupled from `src/core/` (pure domain) and `src/components/` (thin UI). |

---

## 3. Non-Negotiable Architecture Invariants

1. **Zero-React Core (`src/core/`)**:
   - Every file in `src/core/` (`types.ts`, `parser.ts`, `aesthetic.ts`, `highlighter.ts`, `extractor.ts`, `serializer.ts`, `linter.ts`, `history.ts`, `irSchemas.ts`, `ir.ts`, `patch.ts`, `slicer.ts`, `index.ts`) MUST remain pure TypeScript with zero React, DOM (`window`, `document`, `localStorage`), or CSS imports. Inject clock values (`timestamp`) from callers.
2. **Plain-Text-as-Truth & Undo/Redo History (`src/core/history.ts`)**:
   - `history.present` (`rawText` in `src/App.tsx`) is the sole reactive source of truth; AST, metadata, continuity links, diagnostics, and JSON envelopes derive synchronously via pure functions. Never introduce a parallel mutable UI document tree.
   - Every Live Mode edit flows through `src/core/serializer.ts` (and programmatic/AI edits through `applyAuteurPatch()` / `compileAuteurDraft()`), committed via `commitRawText` with explicit history semantics:
     - **`mode: 'coalesce'`** (with a scoped `groupKey` such as `'staging:<idx>'`, `'beat:<n>:step:<i>'`, `'source'`) for rapid typing bursts (bulk deltas > 32 chars or pauses > 800ms auto-checkpoint).
     - **`mode: 'checkpoint'`** for structural mutations (splits, merges, inserts, deletes, drag-reorders, preset/blank switches, paste-hydrate, Debug IR commits).
   - **Active-Draft Resync (`historyRevision`)**: `history.revision` increments strictly on Undo/Redo. Any stateful Live Mode editor holding local draft state (`StagingBlockCard`, `AestheticBlockEditor`, `ExecutionBeatRow`, or future plugins) MUST accept `historyRevision` and resync its local draft whenever `historyRevision` changes—even while focused.
3. **Memoization & Reference-Stability Discipline (`src/ui/referenceStability.ts`)**:
   - Pure derivations return fresh arrays/maps on every keystroke. Reconcile derived collections with `useStableValue` + stabilizers (`stabilizeStagingBlocks`, `stabilizeExecutionBeats`, `stabilizeBeatLinks`, `stabilizeAestheticTokens`, `stabilizeCharacters`, `stabilizeDiagnosticsMap`, `stabilizeStringArray`) and reuse shared `EMPTY_*` constants (`EMPTY_DIAGNOSTICS`, `EMPTY_AESTHETIC_TOKENS`, `EMPTY_BEATS`).
   - Never pass freshly allocated `[]` or unmemoized inline handlers into `memo()`'d rows (`StagingBlockCard`, `ExecutionBeatRow`, `AestheticBlockEditor`, `SortableRow`).
4. **Keyboard & Modal Guards**:
   - Every modal/dialog MUST carry `aria-modal="true"` so global document Undo/Redo (`Cmd/Ctrl+Z`, `Cmd/Ctrl+Shift+Z`, `Ctrl+Y`) and Paste-and-Hydrate handlers never intercept modal interactions.
   - Every non-document text input (e.g., Scene Title, custom Macro-Block header input) MUST set `data-native-undo="true"` so native browser input undo stays intact instead of triggering document-level Undo/Redo.
5. **100% Platform- & Model-Agnostic Purity**:
   - Never add generative video vendor names, model identifiers, or external wrapper dialects anywhere in source code, presets, UI copy, tests, or documentation.
6. **Canonical `v0.4.0` Syntax Lock**:
   - Spoken dialogue uses curly braces (`Speaker says (delivery) {line}`), never quotation marks.
   - Foley uses `<sound>`, opt-in score uses `(score)`, opt-in on-screen text uses `【text】`. Never reintroduce legacy `[AUDIO]` or `[DIAL]`.

---

## 4. Safe Extension Recipes

### Adding a New Inline Sub-State Tag or Highlight Rule
1. Update `SubStateKind` in `src/core/types.ts` (only if distinct AST semantics beyond `'tier2'` are needed) and classify it in `parseSubState` (`src/core/parser.ts`).
2. If adding a distinct `dimension`, update `SubStateDraftSchema` / `SubStateIRSchema` (`src/core/irSchemas.ts`) and `subStateNodeToIR` / `renderSubState` (`src/core/ir.ts`) so `fromAuteurIR(toAuteurIR(raw))` stays 100% lossless.
3. Add lossless pure tokenization in `src/core/highlighter.ts` (character-for-character concatenation must equal input), then map the new `HighlightSpanKind` in `src/components/LiveHighlightedEditor.tsx` using semantic CSS custom properties in `src/index.css` (never hardcoded hex colors, and never alter proportional `font-weight`/`font-style`/`padding` on Live Mode overlay spans).

### Registering a New Structured Staging Macro-Block Editor
1. Keep block-specific parsing/serialization pure in `src/core/` (following `src/core/aesthetic.ts`) with Vitest coverage in `tests/core/`.
2. Implement the memoized editor conforming to `StagingBlockEditorProps` (`rawBody`, `aestheticTokens`, `historyRevision?`, `autoFocus?`, `onClearAutoFocus?`, `onCommit: (nextBody, options?: StagingBlockCommitOptions) => void`, `onFocusChange`), honoring `historyRevision` resync and `'coalesce'` vs. `'checkpoint'` commit options.
3. Register the plugin (and optional `summarizeMeta` collapsed header formatter) in `STAGING_BLOCK_REGISTRY` inside `src/components/stagingBlockRegistry.ts`. Never add `block.kind === '...'` conditionals to `StagingBlockCard.tsx`.

### Adding a New Persisted Display / Editor Setting
1. Add the option/DOM applier primitive under `src/ui/` (following `theme.ts`, `textSize.ts`, or `clauseGuides.ts`) and wire it into `EditorSettings`, `loadEditorSettings`, `applyEditorSettings`, and `useEditorSettings` in `src/ui/editorSettings.ts`.
2. Add user-facing labels under `UI_LABELS.topBar` in `src/ui/labels.ts` and render the control inside `src/components/SettingsPopover.tsx`.

### Extending the Programmatic JSON IR, Patch Engine, or Lens Slicer
1. Update the Zod source-of-truth schemas in `src/core/irSchemas.ts` (`getAuteurJsonSchemas()` derives JSON Schema automatically—never hand-maintain duplicate JSON Schemas).
2. Implement pure codecs, transactional patch ops, or slicer presets in `src/core/ir.ts`, `src/core/patch.ts`, or `src/core/slicer.ts`, keeping field names strictly aligned with `docs/GLOSSARY.md`.

### Adding a New Deterministic Linter Rule
1. Implement an **isolated, exported pure function** in `src/core/linter.ts` returning `LintDiagnostic[]` tagged with `Lens 1`–`Lens 5`, `severity` (`'error'` | `'warning'`), `message`, and `repairHint`, then compose it inside `lintDocument()`.
2. Add positive (violation caught) and negative (valid construct passes) tests in `tests/core/linter.test.ts`, and verify all 4 canonical presets in `src/data/presets.ts` pass with zero false positives.

---

## 5. UI Minimalism, Labels & Theme Guardrails

- Preserve the calm asymmetric `40/60` Live Mode (`StagingPane` / `ExecutionPane`) and centered `~820px` Source Mode—**zero** permanent sidebars, telemetry dashboards, or cluttered IDE chrome.
- **UI Labeling SSOT (`src/ui/labels.ts`)**: Never hardcode user-facing copy, Macro-Block captions, placeholders, tooltips, or `aria-label`s in JSX. Define all strings in `APP_META`, `MACRO_BLOCK_META`, or `UI_LABELS`.
- Centralize reusable UI chrome classes in `src/ui/tokens/ui.ts` (`UI_TOKENS`) and reference semantic CSS variables (`bg-surface`, `border-border-main`, `text-text-main`) so all 4 themes (`Light`, `Warm`, `Dark`, `Pure Black OLED`) maintain full contrast parity.
- Route every destructive confirmation through `ConfirmDialog`—never `window.confirm` or `window.alert`. Keep top-level crash recovery inside `ErrorBoundary` and quiet right-margin diagnostics inside `DiagnosticDot` with zero horizontal layout shift.

---

## 6. Definition of Done & Doc Sync Map

Before concluding any task, update every affected doc and test suite mapped below, then run all verification commands:

| Category of Change | Required `docs/*.md` Updates | Required Test Suite |
|---|---|---|
| **Core modules / history / serializer / extractor / paste & undo guards** | `docs/ARCHITECTURE.md` (and `docs/GLOSSARY.md` if new domain terms) | `tests/core/` (`history`, `serializer`, `extractor`, `aesthetic`, etc.) |
| **Grammar / regex / inline tags / Tagless export / highlighting** | `docs/GRAMMAR_CONTRACT.md`, `docs/GLOSSARY.md` | `tests/core/parser.test.ts`, `highlighter.test.ts`, `serializer.test.ts`, `ir.test.ts` |
| **Deterministic linter rules / audit lenses** | `docs/SCRIPT_SUPERVISOR_AUDIT_RULES.md`, `docs/GRAMMAR_CONTRACT.md` | `tests/core/linter.test.ts` (positive, negative & 4 presets clean) |
| **JSON IR / Patch Engine / Lens Slicer / Zod schemas** | `docs/JSON_IR_SPEC.md` (and `docs/ARCHITECTURE.md` if new workflows) | `tests/core/ir.test.ts`, `patch.test.ts`, `slicer.test.ts` |
| **UI interactions / layout / settings / DnD / focus / collapse / recovery** | `docs/UI_PHILOSOPHY.md` (and `docs/ARCHITECTURE.md` if new module/guard) | `tests/ui/uiState.test.ts` (for pure UI state, shortcuts & stability helpers) |
| **`UI_LABELS` / `MACRO_BLOCK_META` / theme labels** | `docs/UI_LABELING.md` | `npm run lint` + `npm run build` |

### Verification Commands (All Must Exit `0`)

```bash
npm test          # Runs the Vitest unit suite for src/core/ and src/ui/
npm run lint      # Runs strict TypeScript type-checking (tsc --noEmit)
npm run build     # Runs tsc --noEmit && vite build
```

---

## 7. Plain-English Summary (Handoff Rule)

Always conclude completed work with a concise, plain-English summary covering:
1. **What changed** (user-visible behavior and architectural rationale).
2. **How to verify in the UI** (short concrete steps to exercise the change).
3. **Tests & docs updated** (exact test suites run/added and `docs/*.md` files synced).
4. **Assumptions or tradeoffs** (anything inferred or intentionally deferred).
