# UI Labeling & Copy Contract (`src/ui/labels.ts`)

This document is the human-readable reference for all user-facing text, Macro-Block captions, badges, placeholders, tooltips, accessibility (`aria-label`) copy, and theme labels in the **Auteur Script Editor**.

The programmatic Single Source of Truth (SSOT) for interface copy lives exclusively in **`src/ui/labels.ts`** (with shell theme names in **`src/ui/theme.ts`**).

---

## 1. Non-Negotiable Labeling Rules

1. **Zero Hardcoded UI Strings in JSX**: Components in `src/components/` must never hardcode user-facing labels, headings, button captions, tooltips, placeholders, or `aria-label` strings. All copy is imported from `APP_META`, `MACRO_BLOCK_META`, or `UI_LABELS` in `src/ui/labels.ts`.
2. **100% Platform- & Model-Agnostic Copy**: Never reference external video vendors, model names, or platform dialects in UI labels, preset descriptions, tooltips, or empty states.
3. **Calm Editorial Tone**: Labels follow the *Physical Stationery & Blueprint Studio* voice—quiet, concise, utilitarian, and film-craft grounded (zero hype, zero marketing fluff, zero emoji).
4. **Glossary-Grounded Precision**: Structural labels distinguish **Phase 1 — Staging ($S_0$)** from **Phase 2 — Execution ($S_1 \to S_n$)** and never conflate Macro-Blocks, Macro-States, Sub-States, and inline `[BLOCK]` tags (see `docs/GLOSSARY.md`).

---

## 2. Domain-to-UI Vocabulary Bridge

To keep the editor approachable while writing without diluting technical precision:

| Core / Glossary Term | Editor UI Representation | Where Used |
|---|---|---|
| **App Identity (`APP_META`)** | `ScriptFlow` · fallback title `Untitled Scene` | Header slate & blank template |
| **Phase 1: STAGING ($S_0$)** | `Phase 1 — Staging` · `S0 (N blocks)` | Phase 1 section header |
| **Phase 2: EXECUTION ($S_1 \dots S_n$)** | `Phase 2 — Execution` · `S1 → SN` | Phase 2 section header |
| **Macro-State ($S_n$)** | Left-margin index `S1`, `S2`, … · count `N beats` · actions `Add beat` / `Delete S#` | Top slate bar & Execution rows |
| **Sub-State ($s_i$)** | Waterfall `step` (`lead step`, `step 2`, `Add step`, `Remove step`) · `New Sub-State in S#` | Execution waterfall cards |
| **Camera Continuity** | Bare hold cue `hold framing` · cut dividers `cut` and `cut · recall` | Execution camera rail & dividers |
| **Script Supervisor Linter** | Header summary `N err · N warn` · Popover `Script Supervisor (N)` · `Repair: ` | Top slate bar & `DiagnosticDot` |

---

## 3. Macro-Block Captions & Semantic Badge Classes (`MACRO_BLOCK_META`)

Every Macro-Block header (`[INTENT]`, `[LOGIC]`, `[AESTHETIC]`, etc.) resolves its human-readable subtitle caption and semantic badge CSS class via `getMacroBlockMeta(kind)`:

| `MacroBlockKind` | Displayed Caption | CSS Badge Class (`src/index.css`) | Semantic Color Family |
|---|---|---|---|
| `INTENT` | `Directorial Intent` | `auteur-phase-intent` | Amber |
| `LOGIC` | `Coordinate Fence` | `auteur-phase-logic` | Sky Blue |
| `AESTHETIC` | `World Lookbook` | `auteur-phase-aesthetic` | Emerald |
| `OPENING` | `First-Frame Anchor · S0` | `auteur-phase-opening` | Teal |
| `CONTINUITY PROTOCOL` | `Continuity Inheritance` | `auteur-phase-continuity` | Purple |
| `CHARACTERS` | `Cast Ledger` | `auteur-phase-slate` | Slate |
| `REFERENCES` | `Reference Assets` | `auteur-phase-slate` | Slate |
| `STAGE` | `Spatial Stage` | `auteur-phase-slate` | Slate |
| `EXECUTION` | `Active Timeline` | `auteur-phase-execution` | Rose |
| `CUSTOM` *(Fallback)* | `Staging Block` | `auteur-phase-slate` | Slate |

---

## 4. `UI_LABELS` Namespace Map (`src/ui/labels.ts`)

| Namespace | Owning Component(s) | Key Labels Covered |
|---|---|---|
| **`topBar`** | `TopSlateBar.tsx`, `FileMenuDropdown.tsx`, `SettingsPopover.tsx` | Left-wing `File` menu (`New Blank Script`, `Import File (.txt / .json)...`, `Download Canonical .txt`, `Download Tagless .txt`, `Download JSON Envelope`, `Backup All Scripts (.json)`, `Restore Backup (.json)...`, `Browse Library...`), scene title `aria-label`, subtle read-only `Example` pill (`exampleBadge`, `exampleBadgeTitle`), singular/plural `beat` / `beats`, compact `N err` / `N warn`, `[ Live \| Source ]` mode labels, quiet **Undo / Redo** history group (or `Fork to Edit` pill on read-only examples), quiet `Library` button, quiet `AI` toggle button (`aiButton`, `aiAria`, `aiTitle`), unified `Settings` gear popover (`Text size` stepper, `Clause underlines` switch, `Theme` grid, and `Supervisor rules` panel with `Off` / `Warn` / `Error` toggles & `Reset defaults`), `Copy` menu (`Copy Plain Text`, `Copy Tagless`), and optional `JSON IR` debug trigger. |
| **`document`** | `StagingPane.tsx`, `ExecutionPane.tsx`, `AddStagingBlockPicker.tsx` *(coordinated by `LiveDocument.tsx`)* | Pane `aria-label`s, `Phase 1 — Staging`, `Phase 2 — Execution`, `S0 · N blocks`, `Expand all` / `Collapse all`, `S1 → SN`, `cut` / `cut · recall` dividers, `Add macro-block` / `Add beat` and surgical insertion tooltips, and editable vs. read-only bottom hints (`footerHint`, `footerHintReadOnly`). |
| **`staging`** | `StagingBlockCard.tsx`, `stagingBlockRegistry.ts`, `AestheticBlockEditor.tsx`, `AddStagingBlockPicker.tsx` | Empty staging placeholder, edit `aria-label` / placeholder, collapsed metadata (`N @refs`, `N tokens`, `N keys`, `N lines`), 2-column `[AESTHETIC]` key/value placeholders & add/remove labels, Staging block picker headings & reserved-header validation, drag-reorder tooltip (`Drag to reorder macro-block`), and block delete tooltips. |
| **`execution`** | `ExecutionBeatRow.tsx`, `ExecutionPane.tsx` | `hold framing`, `emptySummary`, per-beat `Collapse S#` / `Expand S#` triggers, `Add step`, inline chaining hint (`Type -> or press Enter to chain next step`), drag-reorder tooltip & collapsed/floating `N steps` badge, delete beat/step labels, and step input placeholders (`[CAM 01] MS, eye level`, `[ACT] ..., Speaker says {line}, or <foley>`). |
| **`source`** | `SourceEditor.tsx` | `Canonical Plain-Text Source`, live `N lines` / `N chars` counters, editor `aria-label`, and blank script placeholder. |
| **`diagnostics`** | `DiagnosticDot.tsx` | `Script Supervisor (N)` popover title, `Repair: ` hint prefix, accessible trigger and close `aria-label`s. |
| **`library`** | `ScriptLibraryModal.tsx` | Modal title & close label, `New Blank` / `Import` header buttons, search placeholder & clear button, filter tabs (`All` / `My Scripts` / `Examples`), `Example` / `Active` badges, inline row actions (`Fork`, `Duplicate`, `Rename`, `Export .txt`, `Delete`), empty states, `Show more (N remaining)` pagination button, result counts, and keyboard navigation hint. |
| **`ai`** | `AiAssistantSidebar.tsx`, `AiContextInspectorModal.tsx`, `AiSuggestionCards.tsx`, `AiSettingsModal.tsx`, `AiTraceModal.tsx` | Sidebar title, `New Chat`, quiet `Context` button, `Model · Level` settings chip, unified `Focus` pill (`Auto` / `Draft` / `Refine` / `Audit`) & empty states (`focuses.autoEmpty`, `autoActive`, `draft`, `refine`, `audit`), skill-source badges (`Auto`, `Pinned`, `Loaded`), target scope (`Whole Script`, `MB#`, `S#`) & quiet `Audit All` pill, `Audit` quick lens pills (`All Lenses`, `Lens 1`–`Lens 5`), collapsible `Brief / Refs` tray copy (`briefToggle`, `briefTray`: `Cast & References`, `Add ref`, handle/subject/note placeholders, `Format & Specs`, `Subtext & Context`, `Edit template`, `Clear`), missing-key BYOK setup card, streaming `Reasoning & Tools` accordion with skill/tool counts and opt-in `Inspect` button, `Send` / `Stop` composer controls, staged suggestion card labels (`Proposed Patch`, `Proposed Draft`, `Script Supervisor Audit`, `Show diff` / `Preview`, `Apply` / `Apply Fix` / `Fork & Apply` / `Dismiss`, stale-script warning, target jump tooltips), `Agent Context & Skills` inspector copy (`contextInspector`: tabs, upstream update banner, editable vs. code-owned badges, `Copy Prompt`, Craft & Template editors, Skills & Extensions CRUD/pin controls, destructive confirmation prompts), single `AI Settings` modal copy (BYOK key input, privacy note, `Session only`, `Clear Key`, model & reasoning level selectors, `Show reasoning summary`, `Show Debug Trace`), and `AI Trace Inspector` modal copy (`traceModal`: summary labels highlighting `Focus` and `Skills`, status badges, `Copy Trace JSON`, round timeline, `Request Sent`, `Tool Calls & Results`, `Repair Hint`, `Error Details`). |
| **`confirm`** | `ConfirmDialog.tsx`, `App.tsx`, `AddStagingBlockPicker.tsx` | Accessible dialog aria-label, `Cancel` / `Delete` actions, and destructive confirmation titles/descriptions for deleting Macro-Blocks, Macro-States, and custom Library scripts. |
| **`errorBoundary`** | `ErrorBoundary.tsx` | Unexpected crash fallback title & description, `Reload Editor`, `Copy Saved Script` / `Saved Script Copied`, and local-storage / clipboard fallback notes. |
| **`debug`** *(Optional)* | `debug/JsonIrDebugDrawer.tsx` | `JSON IR Debug Inspector` title/subtitle, `Round-Trip Lossless` / `Round-Trip Diff` status badges, 5 tab names (`Envelope & IR`, `Lens Slicer`, `Patch Sandbox`, `Draft Compiler`, `JSON Schemas`), slicer filter headings, patch dry-run/commit actions, draft compiler controls, and read-only commit guard hint (`readOnlyCommitHint`). |
| **`toasts`** | `App.tsx` | Transient status confirmations (`Script pasted and hydrated`, read-only paste guidance, fork/duplicate/blank/import/rename/delete feedback, backup export & restore summary counts, file read errors, and AI patch/draft/fix/fork-apply confirmations). |

---

## 5. Theme Appearance Labels (`src/ui/theme.ts`)

Shell theme names and atmosphere subtitles live in `THEME_OPTIONS`:

| `ThemeMode` | Label | Subtitle Description |
|---|---|---|
| `light` | `Light` | `Clean Warm Stone` |
| `warm` | `Warm` | `Drafting Paper` |
| `dark` *(Default)* | `Dark` | `Warm Obsidian Studio` |
| `oled` | `Pure Black` | `OLED Blueprint Void` |

---

## 6. How to Safely Update or Add UI Copy

1. **Edit an existing label**: Update the entry directly in `src/ui/labels.ts` (or `THEME_OPTIONS` in `src/ui/theme.ts`)—changes propagate immediately across all components.
2. **Add a new UI control or section**:
   - Add the string or pluralization helper function (`(count: number) => ...`) under the matching namespace in `UI_LABELS` inside `src/ui/labels.ts`.
   - Reference `UI_LABELS.<namespace>.<key>` inside JSX rather than typing inline literals.
3. **Add a new canonical Macro-Block kind**:
   - Add its `caption` and semantic `badgeClass` to `MACRO_BLOCK_META` in `src/ui/labels.ts` (ensuring the badge CSS class defines `--phase-*` tokens for all 4 themes in `src/index.css`).
   - Update Section 3 of this document to keep the reference table in sync.
