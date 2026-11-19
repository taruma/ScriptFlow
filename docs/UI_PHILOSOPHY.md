# UI Philosophy — Auteur Script Editor

The Auteur Script Editor blends **Obsidian Live Preview** with **Notion's calm single-page document flow**, rendered through the **Physical Stationery & Blueprint Studio** visual design system.

---

## 1. Calm Single-Column Layout

- **Reading Width**: The entire script occupies a single centered vertical scroll (`~760px` text measure) with generous margins for beat indices (`S1`, `S2`...) on the left and quiet diagnostic indicators on the right.
- **Whisper-Quiet Top Bar (`h-12`)**: Holds only essential workflow controls—editable scene title (`Libre Baskerville`), live tabular beat count, `[ Live | Source ]` segmented switcher, `Presets` dropdown, 4-mode `Theme` switcher, and `Copy` menu (`Copy Plain Text` / `Copy Tagless`).
- **Zero Chrome Bloat**: No permanent sidebars, no multi-pane IDE clutter, no noisy telemetry widgets, and no layout shift when diagnostics appear.

---

## 2. Typography Triad

| Font | Class | Role |
|---|---|---|
| **`Libre Baskerville`** | `font-serif` | Scene titles and Phase headings (`Phase 1 — Staging`, `Phase 2 — Execution`) |
| **`Inter`** | `font-sans` | Quiet UI controls, dropdown menus, buttons, diagnostic popover prose |
| **`JetBrains Mono`** | `font-mono` | Script content, Macro-Block headers, inline `[TAG]` tokens, beat indices (`S1`, `S2`), and Source Mode editor |

---

## 3. Live Mode Interaction Patterns

### Phase 1 — Collapsible Staging Cards
- Each Staging block (`[INTENT]`, `[LOGIC]`, `[AESTHETIC]`, `[OPENING]`, `[CONTINUITY PROTOCOL]`, custom blocks) renders as a single-elevation stationery card with a semantic phase badge.
- Collapsing a block condenses it into a muted 1-line summary (e.g., detected `@` bindings or mapped lookbook token count).
- Expanded Staging blocks stay **live-formatted while typing** via `LiveHighlightedEditor` (zero-width-shift CSS Grid overlay keeping `Label:` keys, `@ref` badges, and `-> TOKEN` mappings highlighted on every keystroke with zero flash to monochrome plain text).

### Phase 2 — Always-Formatted Option A Waterfall Stack
- **Lead Step & Waterfall Rail**: Step 1 leads the beat card and Steps $2 \dots k$ indent under a `2px` vertical hairline rail prefixed with `↳`. Clicking any step places the caret directly inside that formatted step without collapsing the waterfall.
- **Live Chaining & Merging**:
  - Typing `-> ` (or `→ `) or pressing `Enter` inside any step immediately forks into the next indented `↳` step and moves focus there.
  - Pressing `Backspace` at column `0` of an indented `↳` step merges it cleanly back into the previous step.
  - `ArrowUp` / `ArrowDown` at step boundaries navigate smoothly across waterfall steps.
- **Camera Continuity Rail vs. Cut Hairline**:
  - Consecutive beats sharing the same numbered camera slot (`[CAM 01]` $\to$ `[CAM 01]`) link via a continuous vertical rail in the left margin.
  - Camera slot switches (`[CAM 01]` $\to$ `[CAM 02]`), recalls (`[CAM 01] ->`), or unnumbered `[CAM]` montage lines render a crisp dotted `cut` (or `cut · recall`) hairline between beats.
- **Surgical Beat Management**: Hover between beats for a surgical `+` beat insert button, click `+ Add step` inside any beat card to append a `↳` Sub-State, or drag the hover-revealed `⋮⋮` handle in the left margin to reorder beats losslessly.

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
