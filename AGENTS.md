# AGENTS.md — Auteur Script Editor Engineering Contract

This document is the operational Single Source of Truth (SSOT) for AI agents and engineers maintaining the **Auteur Script Editor** (`v0.4.0` Canonical Inline Syntax, 100% platform- and model-agnostic).

### Canonical Workspace Documentation (`docs/`)
- **`docs/GLOSSARY.md`**: Authoritative Pure Auteur Script vocabulary (explicit disambiguation of **Macro-Block**, **Macro-State**, **Sub-State**, **Sub-State Tag**, and inline `[BLOCK]`, plus all 27 grounded framework terms mapped to `src/core/types.ts`). **Read first** when interpreting user domain terminology.
- **`docs/GRAMMAR_CONTRACT.md`**: Locked `v0.4.0` regexes, parsing edge cases, Tagless export rules, and deterministic linter contracts.
- **`docs/ARCHITECTURE.md`**: Plain-Text-as-Truth data flow, module map, and pure serializer mutation contracts.
- **`docs/UI_PHILOSOPHY.md`**: Single-column live-formatted workspace principles, Waterfall step editing, and 4-mode theme system.

---

## 1. Non-Negotiable Architecture Invariants

1. **Zero-React Core (`src/core/`)**:
   - Every file in `src/core/` (`types.ts`, `parser.ts`, `extractor.ts`, `serializer.ts`, `linter.ts`, `index.ts`) MUST remain **100% pure TypeScript** with **zero** imports from `react`, `react-dom`, DOM globals (`window`, `document`, `localStorage`), or CSS/Tailwind.
   - Any new parsing, extraction, serialization, or deterministic Script Supervisor linting capability belongs exclusively in `src/core/`.
2. **Plain-Text-as-Truth**:
   - The raw canonical Auteur Script string (`rawText` in `src/App.tsx`) is the sole reactive source of truth.
   - The AST (`AuteurDocument`), extracted metadata (`ExtractedMetadata`), camera continuity links (`HOLD` / `CUT` / `RECALL` / `MONTAGE`), and diagnostics (`LintDiagnostic[]`) are derived synchronously via pure functions.
   - Never introduce a parallel mutable UI document tree. Every Live Mode edit must call a pure serializer helper in `src/core/serializer.ts` and commit the resulting canonical plain-text string.
3. **100% Platform- & Model-Agnostic Purity**:
   - Never add generative video vendor names, model identifiers, or external wrapper dialects anywhere in source code, presets, UI copy, tests, or documentation.
4. **Canonical `v0.4.0` Syntax Lock**:
   - Spoken dialogue uses curly braces (`Speaker says (delivery) {line}`), never quotation marks.
   - Foley uses angle brackets (`<sound>`), opt-in score uses parentheses (`(score)`), opt-in on-screen text uses lenticular brackets (`【text】`).
   - Do not reintroduce legacy `[AUDIO]` or `[DIAL]` syntax.

---

## 2. How to Safely Extend the Codebase

### Adding a New Inline Sub-State Tag
1. Update `SubStateKind` in `src/core/types.ts` (only if the tag needs distinct AST semantics beyond `'tier2'`).
2. Update `parseSubState` in `src/core/parser.ts` to classify the tag cleanly.
3. Add rendering support in `src/components/LiveHighlightedEditor.tsx` (and `src/components/SubStateRenderer.tsx` if used) using CSS custom properties defined in `src/index.css` (never hardcoded hex colors in JSX).
4. Add unit tests in `tests/core/parser.test.ts` and `tests/core/serializer.test.ts` (including `exportTagless` verification).

### Adding a New Deterministic Linter Rule
1. Implement the rule as an **isolated, exported pure function** in `src/core/linter.ts` returning `LintDiagnostic[]`.
2. Tag every diagnostic with one of the five canonical Script Supervisor lenses (`Lens 1`–`Lens 5`), an explicit `severity` (`'error'` | `'warning'`), a plain-language `message`, and an actionable `repairHint`.
3. Compose the rule inside `lintDocument()` in `src/core/linter.ts`.
4. Add both **positive** (violation caught) and **negative** (valid construct passes) tests in `tests/core/linter.test.ts`, and verify all 4 canonical presets in `src/data/presets.ts` still pass with zero false positives.

---

## 3. UI Minimalism, Labels & Theme Guardrails

- Keep the workspace centered in a calm single-page reading column (`~760px` text measure) with **zero** permanent sidebars, telemetry dashboards, or cluttered IDE chrome.
- **UI Labeling SSOT (`src/ui/labels.ts`)**: Never hardcode interface labels, Macro-Block captions (`INTENT -> Directorial Intent`, `AESTHETIC -> World Lookbook`, etc.), phase headings, button copy, placeholders, tooltips, or aria-labels inside JSX components. Define and update all user-facing UI strings exclusively in `src/ui/labels.ts` (`APP_META`, `MACRO_BLOCK_META`, `UI_LABELS`).
- Centralize reusable UI chrome classes in `src/ui/tokens/ui.ts` (`UI_TOKENS`) and reference semantic CSS variables (`bg-surface`, `border-border-main`, `text-text-main`) so all four shell themes (`Light`, `Warm`, `Dark`, `Pure Black OLED`) maintain full contrast parity.
- Keep diagnostics quiet in the right margin (`DiagnosticDot`) with zero horizontal layout shift.

---

## 4. Verification Commands

Run these commands after any change to `src/core/`, `src/components/`, or `src/data/`:

```bash
npm test          # Runs the Vitest unit suite for src/core/
npm run lint      # Runs strict TypeScript type-checking (tsc --noEmit)
npm run build     # Runs tsc --noEmit && vite build
```

All three must exit with code `0` before finalizing changes.
