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

## 2. Pure Auteur UI Vocabulary Contract

The editor displays canonical **Pure Auteur Script (`v0.4.0`)** structural terms directly—never translating Macro-States into `"beats"` or Sub-States into `"steps"`, and never abbreviating Macro-State as `"MS"` (which collides with cinematography **Medium Shot**):

| Core / Glossary Term | Editor UI Representation | Where Used |
|---|---|---|
| **App Identity (`APP_META`)** | `ScriptFlow` · fallback title `Untitled Scene` | Header slate & blank template |
| **Phase 1: STAGING ($S_0$)** | `Phase 1 — Staging` · `S0 · N Macro-Blocks` · `Add Macro-Block` · compact `MB` | Phase 1 section header, AI draft chip, & Debug stats |
| **Phase 2: EXECUTION ($S_1 \dots S_n$)** | `Phase 2 — Execution` · `S1 → SN` | Phase 2 section header |
| **Macro-State ($S_n$)** | Left-margin index `S1`, `S2`, … · count `N Macro-States` · actions `Add Macro-State` / `Delete S#` | Top slate bar, Library sort (`Macro-States`), & Execution rows |
| **Sub-State ($s_i$)** | Waterfall `Sub-State` (`lead Sub-State`, `Sub-State 2`, `Add Sub-State`, `Remove Sub-State`, `N Sub-States`) · `New Sub-State in S#` | Execution waterfall cards |
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
| `CUSTOM` *(Fallback)* | `Staging Macro-Block` | `auteur-phase-slate` | Slate |

---

## 4. `UI_LABELS` Namespace Map (`src/ui/labels.ts`)

| Namespace | Owning Component(s) | Key Labels Covered |
|---|---|---|
| **`topBar`** | `TopSlateBar.tsx`, `FileMenuDropdown.tsx`, `SettingsPopover.tsx` | Left-wing `File` menu (`New Blank Script`, `Import File (.txt / .json)...`, `Format Script`, `Version History...`, `Download Canonical .txt`, `Download Tagless .txt`, `Download JSON Envelope`, `Backup All Scripts (.json)`, `Restore Backup (.json)...`, `Browse Library...`, `JSON IR Inspector...`, `Settings`), scene title `aria-label`, subtle read-only `Example` pill (`exampleBadge`, `exampleBadgeTitle`), singular/plural `Macro-State` / `Macro-States`, compact `N err` / `N warn`, `[ Live \| Source ]` mode labels, quiet **Undo / Redo** history group (or `Fork to Edit` pill on read-only examples), icon-only `Library` button, icon-only `Settings` gear popover (`Text size` stepper, `Clause underlines` switch, `Theme` grid, `Supervisor rules` panel with `Off` / `Warn` / `Error` toggles & `Reset defaults`, and `JSON IR Inspector` action row), quiet `AI` toggle button (`aiButton`, `aiAria`, `aiTitle`), and split `Copy \| ▾` button (1-click Canonical Plain Text copy + chevron menu for `Copy Plain Text`, `Copy Tagless`, and `Copy JSON Envelope`). |
| **`versionHistory`** | `VersionHistoryModal.tsx` | Modal title/subtitle, `Clear History`, inline manual milestone input & `Save` button, read-only example prompt (`Fork to Edit`), trigger badges (`AI Draft`, `AI Patch`, `Audit Fix`, `Pre-Restore`, `Milestone`), `Current` / `Pinned` indicators, `[ Diff vs. Current \| Full Script ]` preview switcher, diff legend & summary, `Fork as New Script`, `Restore`, and retention/keyboard hints. |
| **`document`** | `StagingPane.tsx`, `ExecutionPane.tsx`, `AddStagingBlockPicker.tsx` *(coordinated by `LiveDocument.tsx`)* | Pane `aria-label`s, `Phase 1 — Staging`, `Phase 2 — Execution`, `S0 · N Macro-Blocks`, `Expand all` / `Collapse all`, `S1 → SN`, `cut` / `cut · recall` dividers, `Add Macro-Block` / `Add Macro-State` and surgical insertion tooltips, and editable vs. read-only bottom hints (`footerHint`, `footerHintReadOnly`). |
| **`staging`** | `StagingBlockCard.tsx`, `stagingBlockRegistry.ts`, `AestheticBlockEditor.tsx`, `AddStagingBlockPicker.tsx` | Empty Staging Macro-Block placeholder, edit `aria-label` / placeholder, collapsed metadata (`N @refs`, `N tokens`, `N keys`, `N lines`), 2-column `[AESTHETIC]` key/value placeholders & add/remove labels, Staging Macro-Block picker headings & reserved-header validation, drag-reorder tooltip (`Drag to reorder Macro-Block`), and block delete tooltips. |
| **`execution`** | `ExecutionBeatRow.tsx`, `ExecutionPane.tsx` | `hold framing`, `emptySummary`, per-Macro-State `Collapse S#` / `Expand S#` triggers, `Add Sub-State`, inline chaining & move hints (`Type -> or press Enter to chain next Sub-State · Alt+↑↓ to move`), drag-reorder tooltip (`Drag to reorder Macro-State`) & collapsed/floating `N Sub-States` badge, delete Macro-State/Sub-State labels, and Sub-State input placeholders (`[CAM 01] MS, eye level`, `[ACT] ..., Speaker says {line}, or <foley>`). |
| **`source`** | `SourceEditor.tsx` | `Canonical Plain-Text Source`, quiet `Format` whitespace button (`formatButton`, `formatTitle`, `formatAria`), live `N lines` / `N chars` counters, editor `aria-label`, and blank script placeholder. |
| **`diagnostics`** | `DiagnosticDot.tsx` | `Script Supervisor (N)` popover title, `Repair: ` hint prefix, accessible trigger and close `aria-label`s. |
| **`patchIndicators`** | `AiPatchIndicator.tsx` | Quiet Live Mode AI patch margin trigger & seam `aria-label`s, `AI Proposed Change` / `AI Proposed Insertion` popover headers, `Modify` / `Delete` / `Reorder` / `Insert` badges, `Moves to S#` / header-rename / omitted-lines labels, `AI Insert [...]` / `AI Insert Macro-State` seam pills, inline `Apply` / `Apply Fix` / `Fork & Apply` / `Dismiss` controls, and the Undo-capable `Apply directly here` footer hint. |
| **`library`** | `ScriptLibraryModal.tsx`, `LibraryPreviewPane.tsx` | Modal title & close label, `Clear Library` / `New Blank` / `Import` header buttons, full-text search placeholder & clear button, filter tabs (`All` / `My Scripts` / `Examples`), sort options (`Recent` / `A–Z` / `Macro-States`), opt-in bulk selection & export/delete controls, folder/tag facet filters, `Example` / `Active` / `Pinned` badges, preview pane controls (`Open Script`, `Fork to Edit`, `Pin`/`Unpin`, inline `Rename`, `Folder` & `Tags` inputs, `Preview` / `Source` switcher, `Duplicate`, `Export .txt`, `Delete`), empty states, pagination, result counts, and keyboard hint. |
| **`ai`** | `AiAssistantSidebar.tsx`, `AiBriefModal.tsx`, `AiContextInspectorModal.tsx`, `AiSuggestionCards.tsx`, `AiSettingsModal.tsx`, `AiTraceModal.tsx` | Sidebar title, `New Chat`, quiet `Context` button, bottom cumulative session cost pill (`cost.*`) to the left of the `Model · Level` settings chip, bottom 4-tab `Focus` bar (`Auto` / `Draft` / `Refine` / `Audit`) & empty states (`focuses.autoEmpty`, `autoActive`, `draft`, `refine`, `audit`), skill-source badges (`Auto`, `Pinned`, `Loaded`), target scope (`Whole Script`, `MB#`, `S#`) & quiet `Audit All` pill, `Audit` quick lens pills (`All Lenses`, `Lens 1`–`Lens 5`), dedicated `Scene Brief & References` modal copy (`briefToggle`, `briefPausedLabel`, `briefTray`: modal title/subtitle/close/done, `Include in AI context` toggle & paused hint, `Cast & References`, `Files API` upload/cloud-list panel, `YouTube` URL attach bar, drag-and-drop `Drop Image or Text` tile & Files API redirect notice, visual reference card handle/label/note/source/video-mode badges, `Format & Specs`, `Subtext & Additional Instructions`, `Clear`), opt-in **`Ask First`** clarifying toggle (`askFirstToggle`, `askFirstTitle`, `askFirstAria`, `askFirstBadge`), missing-key BYOK setup card, streaming `Thinking` accordion, separated `Skills & Tools` activity strip with hover tooltips (`skillSourceDescriptions`, `toolsSkillsRegionAria`), quiet per-turn estimated cost badge & breakdown tooltip (`cost.*`), sticky-bottom `Latest` scroll pill, and opt-in `Inspect` button, resizable prompt box (`composerAria`, `composerResizeAria`, `composerResizeTitle`) and `Send` / `Stop` composer controls, staged suggestion card labels (`Proposed Patch`, `Proposed Draft`, `Script Supervisor Audit`, `Clarifying Questions` / `Multi-select` / `Submit Answers` / `Answered`, `Show diff` / `Preview`, `Apply` / `Apply Fix` / `Apply All (N)` / `Fork & Apply` / `Fork & Apply All (N)` / `All Applied` / `Dismiss`, partial-batch compatibility note, stale-script warning, target jump tooltips), `Agent Context & Skills` inspector copy (`contextInspector`), single `AI Settings` modal copy (`settingsModal`, including `Show estimated cost` and `Reset to defaults`), and `AI Trace Inspector` modal copy (`traceModal`, including `Est. Cost`). |
| **`confirm`** | `ConfirmDialog.tsx`, `App.tsx`, `AddStagingBlockPicker.tsx` | Accessible dialog aria-label, `Cancel` / `Delete` / `Clear Library` actions, inline `Backup All Scripts (.json)` / `Backup Downloaded (.json)` auxiliary action, and destructive confirmation titles/descriptions for deleting Macro-Blocks, Macro-States, individual/bulk scripts, and clearing saved library scripts. |
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
