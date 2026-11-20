# UI Philosophy — Auteur Script Editor

The Auteur Script Editor blends **Obsidian Live Preview** with **Notion's calm single-page document flow**, rendered through the **Physical Stationery & Blueprint Studio** visual design system.

---

## 1. Two-Column Live Workspace & Single-Document Source Mode

- **Two-Column Live Mode (`lg:` split)**: On desktop, Live Mode splits cleanly into an asymmetric `40/60` pair of independently scrollable columns separated by a `1px` structural hairline—**Phase 1: Staging** on the left (`40%`) and **Phase 2: Execution** on the right (`60%`), each with a slim sticky header bar (`h-10`) so cast bindings (`@ref`), lookbook tokens, and coordinate fences stay visible while giving Execution beats generous horizontal measure (`S1` → `S{N}`). On smaller viewports (`< lg`), both phases stack smoothly in a single vertical flow.
- **Single-Document Source Mode**: Switching to `Source` collapses into a single centered canonical plain-text document (`~820px` reading measure) in compact `JetBrains Mono` for raw editing and inspection.
- **Whisper-Quiet Top Bar (`h-12`)**: Holds only essential workflow controls—a calm left-wing **`File ▾`** menu (`New Blank Script`, `Import File (.txt / .json)...`, `Download Canonical .txt`, `Download Tagless .txt`, `Download JSON Envelope`, `Backup All Scripts (.json)`, `Restore Backup (.json)...`, and `Browse Library...`), editable scene title (`Libre Baskerville`, paired with a subtle `Example` pill when viewing a read-only bundled example), live tabular beat count, quiet diagnostic jump pill, `[ Live | Source ]` segmented switcher, quiet **Undo / Redo** button pair (`⌘Z / Ctrl+Z`, `⇧⌘Z / Ctrl+Y` — seamlessly swapped for a refined stationery **`Fork to Edit`** pill button on read-only examples), optional `JSON IR` inspector toggle, quiet **`Library`** button, quiet **`AI`** toggle button (lazy-loaded right-side AI Canvas Sidebar), unified **Settings** gear popover (Text Size `13px`–`16px` stepper, toggleable monochrome **Clause Underlines**, 2×2 4-mode **Theme** grid, and a compact **Supervisor rules** drill-down panel with per-rule `Off` / `Warn` / `Error` toggles and `Reset defaults`), and `Copy` menu (`Copy Plain Text` / `Copy Tagless`).
- **Right-Side AI Canvas Sidebar, AI Settings & Opt-In Trace Inspector (`AiAssistantSidebar`, `AiSettingsModal`, `AiTraceModal`, lazy-loaded)**: Zero overhead when closed—Live (`40/60`) and Source modes remain completely unchanged. Clicking **`AI`** docks a resizable right-side canvas (`340px`–`580px` on desktop, responsive drawer on narrow viewports) inside the viewport-locked desktop shell (`lg:h-dvh lg:overflow-hidden`) so Staging, Execution, Source, and the AI message stream each scroll independently without whole-page scrolling, keeping the sidebar header, mode tabs, and composer permanently anchored. Includes a clickable `Model · Level` chip opening a single focused **AI Settings** modal (`aria-modal="true"`, BYOK API key with show/hide, browser-local privacy note, `Session only` toggle, `Clear Key`, Gemini 4 model & reasoning level selectors, `Show reasoning summary` toggle, and opt-in `Show Debug Trace` toggle off by default). Explicit **`Refine` | `Check` | `Draft`** mode tabs scope target selection (`Whole Script`, `MB#`, `S#`) or 1-click Script Supervisor lens audits (`All Lenses`, `Lens 1`–`Lens 5`). Every assistant turn renders Markdown safely (`MarkdownContent`), streams into a compact **Reasoning & Tools** accordion (open while running, collapsed once done), and stages **never-auto-applied** review cards (`PatchSuggestion`, `DraftSuggestion`, `AuditReviewSuggestion`) with expandable line diffs, stale-snapshot protection, clickable editor jump links, single-checkpoint `Undo` on user scripts, and seamless one-click **`Fork & Apply`** on read-only bundled examples. When **Show Debug Trace** is enabled, completed and failed/stopped turns surface a quiet **`Inspect`** button that opens the lazy-loaded **`AiTraceModal`** (`aria-modal="true"`, 4-theme parity) to review sanitized Interactions API requests, round-by-round tool calls/self-repair hints, token usage, interaction ID chains, and error details with one-click **`Copy Trace JSON`**.
- **Single-Column Searchable Script Library (`ScriptLibraryModal`, lazy-loaded)**: Opens as a calm, narrow modal (`aria-modal="true"`) with instant title/metadata search (`data-native-undo="true"`), segmented filter tabs (`All` / `My Scripts` / `Examples`), paginated scrollable rows (`50` per page, fast lightweight beat counts computed strictly on visible rows for smooth 1,000+ script scaling), full keyboard navigation (`↑` / `↓` / `Enter` / `Esc`), and quiet inline row actions (`Fork` on examples; `Duplicate`, inline `Rename`, `Export .txt`, and confirmed `Delete` via `ConfirmDialog` on custom scripts).
- **Read-Only Bundled Examples + Explicit Fork**: Bundled reference scripts open strictly **read-only** without polluting the user's IndexedDB library and without adding any extra banner strip, preserving `LiveDocument`'s full `calc(100dvh - 3rem)` desktop canvas height. `TopSlateBar` displays a subtle `Example` pill beside the read-only Scene Title and swaps Undo/Redo for a calm, hover-elevated **`Fork to Edit`** stationery pill; all mutating controls (Live/Source editing, title editing, block/beat CRUD/reorder, Undo/Redo, Debug IR commits, and Paste-and-Hydrate) remain locked while reading, collapsing/expanding, Live/Source switching, Copy, Export, and JSON IR inspection work seamlessly.
- **Document-Level Undo / Redo**: Every edit across Live Mode and Source Mode commits to a pure plain-text history stack (`src/core/history.ts`)—rapid typing bursts coalesce automatically while structural edits (splits, merges, inserts, deletes, drag-reorders, paste hydration, debug commits) create crisp checkpoints, and script switches/forks/imports reset history cleanly. Actively focused Live Mode drafts resync immediately on Undo/Redo (`historyRevision`), while non-document inputs (`data-native-undo="true"`) preserve native browser undo and open modals (`aria-modal="true"`) are never intercepted.
- **Resilient Crash Recovery (`ErrorBoundary`)**: A minimal, theme-aware top-level Error Boundary wraps the workspace so any unexpected render error presents a calm recovery card with **Reload Editor** and **Copy Saved Script** straight from the active `localStorage` mirror.
- **Zero Chrome Bloat**: No noisy telemetry widgets, zero idle vertical footer padding inside resting beat cards, and zero layout shift when diagnostics appear in the right margin of either column.
- **Headless Programmatic Engine**: All AI-facing JSON IR serialization, transactional patching, and Script Supervisor dimension slicing live strictly inside `src/core/` (`docs/JSON_IR_SPEC.md`)—keeping the human editor purely focused on canonical plain text and live formatting.

---

## 2. Typography System

| Font | Class | Role |
|---|---|---|
| **`Libre Baskerville`** | `font-serif` | Scene titles and Phase headings (`Phase 1 — Staging`, `Phase 2 — Execution`) |
| **`IBM Plex Sans`** | `font-script` | Live Mode script prose, Staging block bodies, and Execution Waterfall Sub-States (high-density proportional reading with zero-width-shift live token highlighting) |
| **`Inter`** | `font-sans` | Quiet UI controls, dropdown menus, Settings popover, buttons, diagnostic and confirmation modals |
| **`JetBrains Mono`** | `font-mono` | Structural badges (`[INTENT]`, `[EXECUTION]`), beat indices (`S1`, `S2`), tabular counts, and Source Mode raw plain-text editor |

---

## 3. Live Mode Interaction Patterns

### Phase 1 — Collapsible Staging Cards & Pluggable Block Editors
- Each Staging block (`[INTENT]`, `[LOGIC]`, `[AESTHETIC]`, `[OPENING]`, `[CONTINUITY PROTOCOL]`, custom blocks) renders as a single-elevation stationery card with a semantic phase badge.
- Collapsing a block keeps the header clean (`[BLOCK]` badge + caption + quiet right-aligned metadata such as `@refs`, `tokens`, `X keys` for `[AESTHETIC]`, or `X lines`) and shows a muted 2-line plain-text preview (`line-clamp-2`) underneath; clicking either the header or preview expands the block.
- **Pluggable Block Editor Registry (`stagingBlockRegistry.ts`)**: `[AESTHETIC]` renders through a structured 2-column live editor (`AestheticBlockEditor`) with bold keys in Column 1 and hanging-indent live-highlighted values in Column 2. All other Staging blocks stay live-formatted via `LiveHighlightedEditor`, and future structured blocks plug directly into the registry.
- **Surgical Staging Management & Drag Reordering (`StagingPane`)**: Hover before or between Staging cards for an inline `+` insert seam (or use the bottom `+ Add macro-block` picker for canonical and custom headers), drag the hover-revealed `⋮⋮` header handle (or press `Space` + `↑`/`↓` on the focused handle) via the shared `SortableList` engine for animated live-sliding reordering with a compact floating header preview (preserving per-card collapsed state across reorders, inserts, and deletes), and hover any Staging card header to delete it via the decoupled `ConfirmDialog`.

### Phase 2 — Always-Formatted Option A Waterfall Stack
- **Lead Step & Waterfall Rail**: Step 1 leads the beat card and Steps $2 \dots k$ indent under a `2px` vertical hairline rail prefixed with `↳`. Clicking any step places the caret directly inside that formatted step without collapsing the waterfall.
- **Live Chaining & Merging**:
  - Typing `-> ` (or `→ `) or pressing `Enter` inside any step immediately forks into the next indented `↳` step and moves focus there.
  - Pressing `Backspace` at column `0` of an indented `↳` step merges it cleanly back into the previous step.
  - `ArrowUp` / `ArrowDown` at step boundaries navigate smoothly across waterfall steps.
- **Camera Continuity Rail vs. Cut Hairline**:
  - Consecutive beats sharing the same numbered camera slot (`[CAM 01]` $\to$ `[CAM 01]`) link via a continuous vertical rail in the left margin with tight vertical rhythm.
  - Camera slot switches (`[CAM 01]` $\to$ `[CAM 02]`), recalls (`[CAM 01] ->`), or unnumbered `[CAM]` montage lines render a crisp dotted `cut` (or `cut · recall`) hairline between beats with expanded breathing room.
- **Collapsible Macro-States (`ExecutionPane` / `ExecutionBeatRow`)**: Each Macro-State card carries a quiet per-beat collapse chevron alongside Step 1, and the sticky Execution header mirrors Staging with a bulk `Collapse all` / `Expand all` toggle. Collapsing a Macro-State hides its indented `↳` waterfall and shows a muted 2-line clamped chained preview (`line-clamp-2`) with right-aligned `N steps` metadata while preserving the `S#` index, camera continuity rail / `cut` dividers, drag-to-reorder, hover delete, and right-margin diagnostics; clicking either the chevron or collapsed card expands it. Collapse state tracks indices cleanly across drag-reorders, insertions (new beats start expanded), and confirmed deletions.
- **Surgical Beat Management**: Hover between beats for a surgical `+` beat insert button, focus any beat card for `+ Add step` (or hover the card header for quick `+` and confirmed `Trash2` deletion via `ConfirmDialog`), or drag the hover-revealed `⋮⋮` handle in the left margin (with keyboard `Space` + `↑`/`↓` support) for animated live-sliding beat reordering with a compact floating beat preview.

### Toggleable Clause Underlines (Off by Default)
- Enabled via **Settings → Clause underlines** (`data-clause-guides="true"` on `<html>`): comma-separated phrases receive a faint monochrome dotted underline and sentence/semicolon clauses receive a subtle solid hairline underline, while punctuation characters stay un-underlined as crisp visual breaks. Decimals (`2.39:1`), ellipses (`...`), abbreviations (`O.S.`, `Mr.`), and spoken `{dialogue}` are intentionally skipped.

---

## 4. 4-Mode Shell Theme System & Semantic Palette

All components read exclusively from semantic CSS custom properties (`src/index.css`) and `UI_TOKENS` (`src/ui/tokens/ui.ts`). Theme swaps use `disableTransitionsTemporarily()` for zero-stutter redraws.

| Mode | Atmosphere | `--app-bg` | `--surface` | `--border-main` | `--text-main` |
|---|---|---|---|---|---|
| **`Light`** | Clean Warm Stone | `#f5f5f4` | `#ffffff` | `#e7e5e4` | `#1c1917` |
| **`Warm`** | Architectural Drafting Paper | `#f3efe6` | `#faf7f0` | `#dfd7c5` | `#2b231d` |
| **`Dark`** *(Default)* | Warm Obsidian Studio | `#0c0a09` | `#171514` | `#2c2825` | `#f5f5f4` |
| **`Pure Black`** | OLED Blueprint Void | `#000000` | `#000000` | `#242424` | `#f5f5f4` |

### Semantic Macro-Block & Inline Token Colors
- **Macro-Blocks**: `[INTENT]` Amber · `[LOGIC]` Sky Blue · `[AESTHETIC]` Emerald · `[OPENING]` Teal · `[EXECUTION]` Rose · `[CONTINUITY PROTOCOL]` Purple · Custom Slate.
- **Inline Tokens**: `[CAM]` / `[TAG]` Sky Blue · `@ref` / `TOKEN` Emerald · `{dialogue}` Amber · `<foley>` Burnt Orange (italic) · `(score)` Violet (italic) · `【text】` Slate · `↳` Violet.
