# AGENTS.md — Auteur Script Editor Engineering Contract

This document is the operational Single Source of Truth (SSOT) for AI agents and engineers maintaining the **Auteur Script Editor** (`v0.4.0` Canonical Inline Syntax, 100% platform- and model-agnostic).

### Canonical Workspace Documentation (`docs/`)
- **`docs/GLOSSARY.md`**: Authoritative Pure Auteur Script vocabulary (explicit disambiguation of **Macro-Block**, **Macro-State**, **Sub-State**, **Sub-State Tag**, and inline `[BLOCK]`, plus all 27 grounded framework terms mapped to `src/core/types.ts`). **Read first** when interpreting user domain terminology.
- **`docs/GRAMMAR_CONTRACT.md`**: Locked `v0.4.0` regexes, parsing edge cases, Tagless export rules, and deterministic linter contracts.
- **`docs/SCRIPT_SUPERVISOR_AUDIT_RULES.md`**: Human-readable checklist of all 4 Scene Topologies, all 5 live deterministic linter rules, all 5 Script Supervisor Audit Lenses (`Lens 1`–`Lens 5`), temporal calibration, and pass/fail examples.
- **`docs/ARCHITECTURE.md`**: Plain-Text-as-Truth data flow, module map, and pure serializer mutation contracts.
- **`docs/JSON_IR_SPEC.md`**: Programmatic JSON IR (`AuteurScriptIR`, `AuteurEnvelope`), Zod/JSON Schema contracts, transactional `AuteurPatch` engine, and composable Script Supervisor Lens Slicer (`AUDIT_LENS_PRESETS`).
- **`docs/UI_PHILOSOPHY.md`**: Asymmetric `40/60` Live workspace & single-document Source mode principles, 2-column Lookbook & Waterfall editing, unified Settings popover, and 4-mode theme system.
- **`docs/UI_LABELING.md`**: Human-readable UI copy & labeling contract (`APP_META`, `MACRO_BLOCK_META`, `UI_LABELS` namespaces, domain-to-UI vocabulary bridge, and theme labels).

---

## 1. Non-Negotiable Architecture Invariants

1. **Zero-React Core (`src/core/`)**:
   - Every file in `src/core/` (`types.ts`, `parser.ts`, `aesthetic.ts`, `highlighter.ts`, `extractor.ts`, `serializer.ts`, `linter.ts`, `history.ts`, `irSchemas.ts`, `ir.ts`, `patch.ts`, `slicer.ts`, `index.ts`) MUST remain **100% pure TypeScript** with **zero** imports from `react`, `react-dom`, DOM globals (`window`, `document`, `localStorage`), or CSS/Tailwind.
   - Any new parsing, lookbook row decoding, live syntax/clause tokenization, extraction, serialization, document history, programmatic JSON IR/patching/slicing, or deterministic Script Supervisor linting capability belongs exclusively in `src/core/`.
2. **Plain-Text-as-Truth**:
   - The raw canonical Auteur Script string (`rawText` in `src/App.tsx`) is the sole reactive source of truth.
   - The AST (`AuteurDocument`), extracted metadata (`ExtractedMetadata`), camera continuity links (`HOLD` / `CUT` / `RECALL` / `MONTAGE`), diagnostics (`LintDiagnostic[]`), and programmatic JSON envelopes (`AuteurEnvelope`) are derived synchronously via pure functions.
   - Never introduce a parallel mutable UI document tree. Every Live Mode edit must call a pure serializer helper in `src/core/serializer.ts` (and every programmatic/AI edit must flow through `applyAuteurPatch()` or `compileAuteurDraft()` in `src/core/`) and commit the resulting canonical plain-text string.
3. **100% Platform- & Model-Agnostic Purity**:
   - Never add generative video vendor names, model identifiers, or external wrapper dialects anywhere in source code, presets, UI copy, tests, or documentation.
4. **Canonical `v0.4.0` Syntax Lock**:
   - Spoken dialogue uses curly braces (`Speaker says (delivery) {line}`), never quotation marks.
   - Foley uses angle brackets (`<sound>`), opt-in score uses parentheses (`(score)`), opt-in on-screen text uses lenticular brackets (`【text】`).
   - Do not reintroduce legacy `[AUDIO]` or `[DIAL]` syntax.

---

## 2. How to Safely Extend the Codebase

### Adding a New Inline Sub-State Tag or Highlight Rule
1. Update `SubStateKind` in `src/core/types.ts` (only if the tag needs distinct AST semantics beyond `'tier2'`).
2. Update `parseSubState` in `src/core/parser.ts` to classify the tag cleanly.
3. If introducing a distinct `dimension` beyond `'tier2'`, update `SubStateDraftSchema` / `SubStateIRSchema` in `src/core/irSchemas.ts` and `subStateNodeToIR` / `renderSubState` in `src/core/ir.ts` so `fromAuteurIR(toAuteurIR(raw))` stays 100% lossless.
4. Add pure tokenization in `src/core/highlighter.ts` (maintaining 100% character-for-character concatenation losslessness), then map the new `HighlightSpanKind` in `src/components/LiveHighlightedEditor.tsx` using CSS custom properties defined in `src/index.css` (never hardcoded hex colors in JSX, and never alter proportional `font-weight`/`font-style`/`padding` on Live Mode spans).
5. Add unit tests in `tests/core/parser.test.ts`, `tests/core/highlighter.test.ts`, `tests/core/serializer.test.ts` (including `exportTagless`), and `tests/core/ir.test.ts`.

### Registering a New Structured Staging Macro-Block Editor
1. Keep any block-specific line parsing/serialization pure inside `src/core/` (following `src/core/aesthetic.ts` as the reference pattern) with Vitest coverage in `tests/core/`.
2. Build the editor component conforming to `StagingBlockEditorProps` (`rawBody`, `aestheticTokens`, `autoFocus`, `onClearAutoFocus`, `onCommit`, `onFocusChange`) so it commits canonical plain text back through `updateStagingBlock`.
3. Register the component (and optional `summarizeMeta` collapsed header formatter) in `STAGING_BLOCK_REGISTRY` inside `src/components/stagingBlockRegistry.ts`. Do not add `block.kind === '...'` conditionals to `StagingBlockCard.tsx`.

### Adding a New Persisted Display / Editor Setting
1. Add the option/DOM applier primitive under `src/ui/` (following `theme.ts`, `textSize.ts`, or `clauseGuides.ts`) and wire its field into `EditorSettings`, `loadEditorSettings`, `applyEditorSettings`, and `useEditorSettings` in `src/ui/editorSettings.ts`.
2. Add its user-facing labels under `UI_LABELS.topBar` in `src/ui/labels.ts`.
3. Render its control inside `src/components/SettingsPopover.tsx` so the top bar remains uncluttered.

### Extending the Programmatic JSON IR, Patch Engine, or Lens Slicer
1. Update the Zod source-of-truth schemas in `src/core/irSchemas.ts` (never hand-maintain duplicate JSON Schema objects—`getAuteurJsonSchemas()` derives them automatically).
2. Implement pure codecs, transactional patch operations, or slicer presets in `src/core/ir.ts`, `src/core/patch.ts`, or `src/core/slicer.ts`.
3. Keep all identifiers and field names strictly aligned with `docs/GLOSSARY.md` (`Macro-Block`, `Macro-State`, `Sub-State`, `Sub-State Tag`, Camera `identifier`, `tokenMappings`, `referenceBindings`) and update `docs/JSON_IR_SPEC.md`.
4. Add round-trip, negative-validation, and lint-gate tests in `tests/core/ir.test.ts`, `tests/core/patch.test.ts`, and `tests/core/slicer.test.ts`.

### Adding a New Deterministic Linter Rule
1. Implement the rule as an **isolated, exported pure function** in `src/core/linter.ts` returning `LintDiagnostic[]`.
2. Tag every diagnostic with one of the five canonical Script Supervisor lenses (`Lens 1`–`Lens 5`), an explicit `severity` (`'error'` | `'warning'`), a plain-language `message`, and an actionable `repairHint`.
3. Compose the rule inside `lintDocument()` in `src/core/linter.ts` (automatically surfaced in both UI `DiagnosticDot` and `AuteurEnvelope.derived.diagnostics`).
4. Add both **positive** (violation caught) and **negative** (valid construct passes) tests in `tests/core/linter.test.ts`, and verify all 4 canonical presets in `src/data/presets.ts` still pass with zero false positives.

---

## 3. UI Minimalism, Labels & Theme Guardrails

- Keep Live Mode focused on the calm asymmetric `40/60` Phase 1 Staging / Phase 2 Execution split (and Source Mode on its centered `~820px` single-document reading measure) with **zero** permanent sidebars, telemetry dashboards, or cluttered IDE chrome.
- **UI Labeling SSOT (`src/ui/labels.ts`)**: Never hardcode interface labels, Macro-Block captions (`INTENT -> Directorial Intent`, `AESTHETIC -> World Lookbook`, etc.), phase headings, button copy, placeholders, tooltips, or aria-labels inside JSX components. Define and update all user-facing UI strings exclusively in `src/ui/labels.ts` (`APP_META`, `MACRO_BLOCK_META`, `UI_LABELS`).
- Centralize reusable UI chrome classes in `src/ui/tokens/ui.ts` (`UI_TOKENS`) and reference semantic CSS variables (`bg-surface`, `border-border-main`, `text-text-main`) so all four shell themes (`Light`, `Warm`, `Dark`, `Pure Black OLED`) maintain full contrast parity.
- Route every destructive confirmation (Macro-Block or Macro-State deletion) through the decoupled `ConfirmDialog` component—never use `window.confirm` or `window.alert`.
- Keep diagnostics quiet in the right margin (`DiagnosticDot`) with zero horizontal layout shift.

---

## 4. Verification Commands

Run these commands after any change to `src/core/`, `src/components/`, `src/ui/`, or `src/data/`:

```bash
npm test          # Runs the Vitest unit suite for src/core/ and src/ui/
npm run lint      # Runs strict TypeScript type-checking (tsc --noEmit)
npm run build     # Runs tsc --noEmit && vite build
```

All three must exit with code `0` before finalizing changes.
