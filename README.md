<div align="center">
  <img src="public/SCRIPTFLOW - WHITE.png#gh-dark-mode-only" alt="ScriptFlow — Draft the World. Direct Every Beat." width="460" />
  <img src="public/SCRIPTFLOW - BLACK.png#gh-light-mode-only" alt="ScriptFlow — Draft the World. Direct Every Beat." width="460" />
</div>

# ScriptFlow — Auteur Script Editor & Scene Blueprint

**ScriptFlow** (*Draft the World. Direct Every Beat.*) is a local-first, Plain-Text-as-Truth editor and Scene Blueprint studio for authoring, visualizing, auditing, and exporting **Pure Auteur Script (`v0.4.0`)**—a 100% platform- and model-agnostic canonical inline screenplay grammar designed for spatial, optical, temporal, and acoustic precision.

> **Version Separation Note**
> - **ScriptFlow Application (`1.0.0` — Unreleased / UI & UX Polish):** Tracks the editor UI, multi-script library, version history, and optional browser-local AI Assistant in [`CHANGELOG.md`](CHANGELOG.md). While pre-release UI/UX polish continues, `package.json` intentionally stays at `"0.4.0"` until the final `1.0.0` release tag.
> - **Pure Auteur Script Grammar & JSON IR (`v0.4.0` — Locked):** Tracks the canonical inline syntax, deterministic Script Supervisor linter, and programmatic JSON IR schema (`AUTEUR_IR_SCHEMA_VERSION = "0.4.0"`) separately in [`docs/SPEC_CHANGELOG.md`](docs/SPEC_CHANGELOG.md).

---

## Core Mental Model

Every script is plain text partitioned into a strict three-level hierarchy:

1. **Macro-Block (`MB#`)** — Document-level containers separated by blank lines across **Phase 1 — Staging (`S0`)** (`[INTENT]`, `[LOGIC]`, `[AESTHETIC]`, `[OPENING]`, `[CONTINUITY PROTOCOL]`, and custom Staging blocks) and **Phase 2 — Execution (`[EXECUTION]`)**.
2. **Macro-State (`S#`)** — A single non-empty line inside `[EXECUTION]` (`S1`, `S2`, …) representing one atomic stretch of screen time.
3. **Sub-State (`S#.#`)** — Each `->`-chained, single-dimension unit inside a Macro-State line, led by a **Sub-State Tag** (`[CAM 01]`, `[ACT]`, `[BLOCK]`, `[LIGHT]`, `[STATE IN]`, `[STATE OUT]`, Tier-2 tags) or inline syntax (`Speaker says (delivery) {line}`, `<foley>`, `(score)`, `【on-screen text】`).

Live Mode, Source Mode, deterministic linting, exports, and programmatic JSON IR all derive synchronously from the single canonical plain-text buffer—never from a parallel mutable UI tree.

---

## Key Capabilities

- **Plain-Text-as-Truth Live Mode & Source Mode**
  - Asymmetric `40/60` desktop Live workspace (**Phase 1 — Staging** on the left, **Phase 2 — Execution** on the right) with independently scrollable panes, collapsible Staging cards and Execution Macro-States, and a structured 2-column `[AESTHETIC]` Lookbook editor.
  - Always-formatted `↳` Waterfall Sub-State editing with live `->` / `Enter` splitting, `Backspace` merging, `ArrowUp`/`ArrowDown` boundary navigation, `Alt+↑`/`Alt+↓` keyboard Sub-State reordering, hover-revealed drag-and-drop reordering for Macro-Blocks and Macro-States, global Paste-and-Hydrate, non-destructive **Format Script**, and active-draft document Undo/Redo (`Cmd/Ctrl+Z`, `Cmd/Ctrl+Shift+Z` / `Ctrl+Y`).
  - Centered single-document **Source Mode** (`~820px` measure in `JetBrains Mono`) plus one-click Canonical Plain Text (`.txt`), Tagless (`.txt`), and JSON Envelope (`.json`) copy and download exports.
- **Read-Only Scene Blueprint Graph View (`[ Live | Graph | Source ]`)**
  - Lazy-loaded `@xyflow/react` blueprint canvas visualizing **Phase 1 — Staging Macro-Blocks (`MB#`)**, an intermediate **Inferred Objects** rail (Characters via `@ref as Label`, `[AESTHETIC]` Lookbook tokens with optional `(reference: @ref)`, Staging-only visual refs, and Camera Setups), and **Phase 2 — Execution (`S1 → SN`)** grouped into **Shot Chambers** with curved **`RECALL`** arcs.
  - Supports dual-axis **`L → R` / `T ↓ B`** auto-layout, compact default posture with on-demand perpendicular Sub-State splitting (`Split Sub-States`), opposite-side **`Show Source`** plain-text provenance branches, **`Show Threads`** continuity wiring, bespoke sculpted Sub-States (screenplay Dialogue micro-blocks, Foley waveforms, Score cues, framed serif Title Cards), a scene-aware **Sub-State Isolator Dock** (showing only detected dimensions plus `Other` for plain Sub-States in `Ghost` vs. `Compact` mode), a read-only **Object Inspector** with Call Site `fitView` focus, free dragging with full **`Reset`**, and 4-theme parity. See [`docs/GRAPH_VIEW.md`](docs/GRAPH_VIEW.md).
- **Deterministic Script Supervisor Linter & Worked Examples**
  - 5 pure, synchronous linter rules spanning `Lens 1`–`Lens 5` (`viewport-coordinate-purity`, `camera-redefinition-guard`, `macro-state-resolution`, `multimodal-reference-isolation`, `frozen-first-frame-purity`) with persisted per-rule `'off' | 'warning' | 'error'` overrides in Settings and zero-layout-shift right-margin `DiagnosticDot` popovers.
  - 4 bundled read-only canonical worked examples (*Interrogation Room Coverage*, *Subway Train Fight Oner*, *POV Forest Horror*, and *1970s Heist Montage*) covering all scene topologies with one-click **Fork to Edit**.
- **Local-First Multi-Script Library & Version History**
  - Browser-local IndexedDB `v2` persistence (with automatic `localStorage` fallback and crash-recovery mirror), debounced autosave with tab-hide/pagehide flush, editorial two-pane Script Library with full-text search, pinning, folder/tag facets, bulk export/delete, and full-library JSON backup with smart non-destructive merge restore.
  - Per-script **Version History** saving automatic pre-AI (`AI Draft`, `AI Patch`, `Audit Fix`) and `Pre-Restore` checkpoints alongside permanent manual **Milestones** with side-by-side diff, single-step undoable restore, and fork.
- **Optional Browser-Local BYOK AI Assistant**
  - Lazy-loaded right-side AI Canvas Sidebar (zero bundle or runtime overhead until opened) supporting streaming `@google/genai` Interactions API turns across Gemini 4 (`gemini-4-hydrogen`, `gemini-4-neon`, `gemini-4-carbon`) and `gemini-3.5-flash-lite` with `Low` / `Medium` / `High` reasoning levels.
  - Unified `Auto` / `Draft` / `Refine` / `Audit` focus bar with editor-state-aware tool pruning, automatic recent-edit diff context, 10 strictly read-only/staging local tools (`get_script_overview`, `get_script_source`, surgical `inspect_lens_slice`, `propose_script_patch`, `propose_text_replace`, `propose_script_title`, `propose_script_draft`, `report_audit_review`, dynamic `load_auteur_skill`, and opt-in `ask_question` via `Ask First`), and suggestions-first review cards (including `TitleSuggestionCard`, smart sibling Audit Fix rebasing, and transactional **Apply All** batching).
  - Layer 2.5 **Quick Scan** semantic triage via the stateless `v1beta` Decisions API (`gemini-decision-1`) with `Strict` / `Balanced` / `Lenient` sensitivity, AST-filtered document / per-`S#` / per-`S#.#` rules, expandable rule criteria, and 1-click **Deep Audit** escalation.
  - Multimodal **Scene Brief & References** modal (local image/text dropzone, drag-and-drop multi-file Gemini Files API uploads & 48-hour cloud file browser, public YouTube URLs with `Static`/`Agentic` video mode), 4-tab **Context Inspector** (`Foundational Craft`, 6 built-in Extension Skills + custom skills, `Quick Scan Rules` + custom rules, and unified JSON Export / selective Merge or Replace Import packs), Live Mode hover-to-diff patch & quick-scan margin indicators, per-turn & cumulative USD cost estimates, and an opt-in sanitized **Trace Inspector**.
- **Programmatic JSON IR & Debug Inspector**
  - Pure TypeScript + Zod `AuteurScriptIR` and `AuteurEnvelope` codecs (`toAuteurIR`, `fromAuteurIR`, `compileAuteurDraft`), transactional ID-addressed `applyAuteurPatch()` & `projectAuteurPatchPreview()`, Composable Lens Slicer (`AUDIT_LENS_PRESETS`), Zod JSON Schema registry (`getAuteurJsonSchemas()`), and a zero-cost-when-closed 5-tab `JsonIrDebugDrawer`.
- **Appearance, Accessibility & Safeguards**
  - 4-mode semantic shell theme system (**Light** default, **Warm**, **Dark**, **Pure Black** OLED), script text-size presets (`13px`–`16px`), toggleable monochrome clause underlines, accessible `ConfirmDialog` prompts, `aria-modal="true"` / `data-native-undo="true"` keyboard isolation, and top-level `ErrorBoundary` crash recovery.

---

## Quickstart & Commands

Requires **Node.js** and **npm**.

```bash
# Install dependencies
npm install

# Start the Vite dev server (http://localhost:3000)
npm run dev

# Run the Vitest unit test suite (29 test files / 308 tests)
npm test

# Run Vitest in watch mode
npm run test:watch

# Strict TypeScript type-checking (tsc --noEmit)
npm run lint

# Type-check and build the production bundle (tsc --noEmit && vite build)
npm run build

# Preview the production Vite build locally
npm run preview
```

### Browser-Local Privacy & BYOK Note

ScriptFlow runs **100% client-side in your browser**—no backend server or proxy is required. All scripts, snapshots, display preferences, and custom skills stay strictly local in browser IndexedDB and `localStorage`. The AI Assistant is completely optional: if you choose to enable it, your BYOK Gemini API key is stored locally in `localStorage` (or tab-scoped `sessionStorage` when **Session only** is enabled) and sent directly from your browser to the Gemini API only when you submit a prompt, run a Quick Scan, or manage Brief Files API attachments.

---

## Documentation Sitemap

| Document | Purpose |
|---|---|
| [`CHANGELOG.md`](CHANGELOG.md) | ScriptFlow application release history (`1.0.0` pre-release features & engineering notes). |
| [`AGENTS.md`](AGENTS.md) | Operational engineering contract, architectural invariants, extension recipes, and Definition of Done. |
| [`docs/SPEC_CHANGELOG.md`](docs/SPEC_CHANGELOG.md) | Version history for the Pure Auteur Script `v0.4.0` grammar, linter, and JSON IR specification. |
| [`docs/GLOSSARY.md`](docs/GLOSSARY.md) | Authoritative Pure Auteur Script vocabulary (`Macro-Block`, `Macro-State`, `Sub-State`, `Sub-State Tag`, inline `[BLOCK]`) mapped to `src/core/types.ts`. |
| [`docs/GRAMMAR_CONTRACT.md`](docs/GRAMMAR_CONTRACT.md) | Locked `v0.4.0` syntax regexes, parser edge cases, Tagless export rules, and deterministic linter contracts. |
| [`docs/SCRIPT_SUPERVISOR_AUDIT_RULES.md`](docs/SCRIPT_SUPERVISOR_AUDIT_RULES.md) | Human-readable checklist of all 4 Scene Topologies, all 5 live linter rules, and all 5 Script Supervisor Audit Lenses (`Lens 1`–`Lens 5`). |
| [`docs/JSON_IR_SPEC.md`](docs/JSON_IR_SPEC.md) | Programmatic `AuteurScriptIR`, `AuteurEnvelope`, transactional `AuteurPatch`, Composable Lens Slicer, and Zod JSON Schema contracts. |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Plain-Text-as-Truth data flow, full module map, pure serializer contracts, and global Paste/Undo guards. |
| [`docs/UI_PHILOSOPHY.md`](docs/UI_PHILOSOPHY.md) | Asymmetric `40/60` Live, Source & Graph View layout principles, Waterfall editing, Library/History UX, AI Canvas UX, and 4-mode theme palette. |
| [`docs/GRAPH_VIEW.md`](docs/GRAPH_VIEW.md) | Technical architecture & plain-text extraction reference for the read-only Graph View (`src/ui/canvas/` + `src/components/canvas/`). |
| [`docs/UI_LABELING.md`](docs/UI_LABELING.md) | Single Source of Truth UI copy contract (`APP_META`, `MACRO_BLOCK_META`, `UI_LABELS`), Pure Auteur UI vocabulary, and theme labels. |
| [`docs/AI_ASSISTANT_WALKTHROUGH.md`](docs/AI_ASSISTANT_WALKTHROUGH.md) | End-to-end guide to BYOK setup, `Auto`/`Draft`/`Refine`/`Audit` focus, all 10 local AI tools, Quick Scan, Brief modal, Context Inspector, and Trace Inspector. |
