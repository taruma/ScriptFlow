# 07 — Auteur Script Editor: Product & Technical Specification

> **Bundle Role**: `File 7 of 7` — Authoritative Application Architecture, Interaction Design, Linter Contracts & Test Spec for the Web-Based Auteur Script Editor  
> **Target Consumer**: Stateless AI Agent implementing the Auteur Script Editor web application  
> **Upstream Dependencies**: Governed by `01`–`05` (Pure Auteur Script `v0.4.0` domain spec) and `06_VISUAL_DESIGN_SYSTEM.md` (stationery/blueprint theme engine, typography, `UI_TOKENS`, and semantic token colors)  
> **Specification Lock**: Pure Auteur Script (`v0.4.0` Canonical Inline Syntax) — **100% Platform- & Model-Agnostic** (zero video model or platform brand names anywhere in the app, presets, or generated docs)

---

## Content Manifest (What Is Inside This File)

| Section | Title | Contents |
|---|---|---|
| **§1** | **Product Philosophy & Visual Direction** | Single-page live document flow, ~760px reading column, Whisper-Quiet Top Bar, `06` Visual Design System integration, Paste-and-Hydrate guard |
| **§2** | **Live Mode & Source Mode Interaction Design** | Collapsible Staging cards, Option A Waterfall execution stack, click-to-edit / blur-to-beautify, surgical `+` insertion, drag-reorder, continuity rails, margin diagnostics |
| **§3** | **Decoupled Technical Architecture** | Plain-Text-as-Truth state model, strict zero-React `src/core/` module contracts, thin `src/components/` layer, and `src/data/presets.ts` |
| **§4** | **Locked `v0.4.0` Grammar & Deterministic Linter Contracts** | Exact parser edge cases (`->` overloading, blank lines, dialogue variations), Tagless export edge cases, and the 5 V1 deterministic linter rules |
| **§5** | **Verification & Automated Testing (`Vitest`)** | Mandatory pure-core unit test suite covering parser, serializer, extractor, Tagless exporter, and all 5 linter rules |
| **§6** | **Required Workspace SSOT Documentation** | Deliverables for `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/GRAMMAR_CONTRACT.md`, and `docs/UI_PHILOSOPHY.md` |

---

## 1. Product Philosophy & Visual Direction

Build a web-based **Auteur Script Editor** designed around a minimalist, single-page live document experience:

- **Aesthetic & Visual System (`06_VISUAL_DESIGN_SYSTEM.md`)**:
  - Think **Obsidian Live Preview** meets **Notion's calm document flow**, built strictly on the **Physical Stationery & Blueprint Studio** design system defined in `06_VISUAL_DESIGN_SYSTEM.md`.
  - Avoid cluttered IDE panes, permanent sidebars, or noisy dashboard cards.
  - **Typography Triad**: Use `Libre Baskerville` (`font-serif`) for editorial/scene titles, `Inter` (`font-sans`) for quiet UI chrome, and `JetBrains Mono` (`font-mono`) for Auteur Script text, `[TAG]` badges, and beat indices.
  - **4-Mode Theme Support**: Implement all 4 CSS variable theme modes from `06_VISUAL_DESIGN_SYSTEM.md` (`Light` Clean Warm Stone, `Warm` Drafting Paper, `Dark` Warm Obsidian Studio, and `Pure Black` OLED toggle) with zero-stutter switching (`disableTransitionsTemporarily()`). Default to **Dark (Warm Obsidian Studio)** on first launch, with a compact theme selector in the top bar.
- **Single-Page Centered Layout (`~760px` max reading width)**:
  - **Whisper-Quiet Top Bar (`h-12`, `UI_TOKENS.layout.appHeader`)**:
    - Editable scene title
    - Live beat count (`N beats`)
    - Compact `Presets` selector
    - Primary `[ Live | Source ]` segmented toggle (`UI_TOKENS.button.segmentedGroup`)
    - Compact theme switcher (`Light` / `Warm` / `Dark` / `OLED`)
    - `Copy` menu offering **`Copy Plain Text`** (canonical `v0.4.0` plain text) and **`Copy Tagless`** (strips square-bracket tags while preserving `->` flow and cleaning up dangling leading `->` arrows on bare camera holds)
  - **Document Canvas (Center)**: The entire script lives in one calm vertical scroll (`max-w-[760px] mx-auto`).
  - **Paste-and-Hydrate (With Active-Editor Guard)**:
    - When pasting raw plain-text Auteur Script **outside a focused input/textarea**—or when pasting multi-block text containing Macro-Block headers (e.g., `[INTENT]` and/or `[EXECUTION]`)—immediately replace/hydrate the full document and parse it into live-formatted blocks without losing a single character.
    - When a user is actively focused inside a single Staging block or Execution beat editor and pastes a normal inline snippet (without Macro-Block headers), keep the paste scoped normally to that active textarea so edits are never clobbered.

---

## 2. Live Mode & Source Mode Interaction Design

### 2.1 Phase 1 — Staging Blocks
Applies to `[INTENT]`, `[LOGIC]`, `[AESTHETIC]`, `[OPENING]`, plus custom staging blocks such as `[CHARACTERS]`, `[CONTINUITY PROTOCOL]`, `[REFERENCES]`, and `[STAGE]`:
- Render as clean, collapsible document cards using the semantic phase badge palette from `06_VISUAL_DESIGN_SYSTEM.md` §5.1:
  - `[INTENT]` — Amber
  - `[LOGIC]` — Sky Blue
  - `[AESTHETIC]` — Emerald
  - `[OPENING]` — Teal
  - `[CONTINUITY PROTOCOL]` — Purple
  - Custom staging blocks — Slate
- **Collapsed State**: Displays the phase badge plus a muted one-line summary preview (e.g., detected `@` character bindings, opening phrase, or mapped token count).
- **`[AESTHETIC]` Formatting**: Highlight `Label:` keys (`Medium:`, `Palette:`, `Lighting:`, `Location:`, `Wardrobe:`, `Audio:`, etc.) distinctly and highlight `-> TOKEN` mappings cleanly without treating `->` as an execution chain.
- **Click-to-Edit, Blur-to-Beautify**: Clicking a Staging block opens an auto-sizing inline plain-text editor (`JetBrains Mono`) for that block's raw text; blurring (or pressing `Cmd/Ctrl+Enter` or `Esc`) commits the mutation to the raw script and snaps back into formatted view.

### 2.2 Phase 2 — Execution Timeline (`[EXECUTION]` / `[TIMELINE]` / `[BEATS]`)
Use **Option A — Waterfall Stack** for Macro-States at rest:
- **Left Margin**: Shows muted monospace Macro-State index (`S1`, `S2`, `S3`...) plus a subtle drag handle (`⋮⋮`) revealed on hover for reordering beats.
- **Lead Step & Waterfall Rail**:
  - The **first Sub-State** leads the beat card (typically `[CAM 01] ...` or `[CAM] ...`, while remaining resilient when a beat leads with `[STATE IN]` or an off-screen `<sound trigger>`).
  - Every subsequent `->` Sub-State renders on its own indented `↳` rail line underneath (`border-left: 2px solid`, hovering to violet accent per `06_VISUAL_DESIGN_SYSTEM.md` §5.2).
  - Apply restrained semantic syntax styling from `06_VISUAL_DESIGN_SYSTEM.md` §5.2 for:
    - Sub-State tags (`[CAM 01]`, `[CAM]`, `[ACT]`, `[BLOCK]`, `[LIGHT]`, `[FOCUS]`, `[SPEED]`, `[PROP]`, `[ENV]`, `[CROWD]`, `[VFX]`, `[TRANS]`, `[STATE IN]`, `[STATE OUT]`)
    - Spoken dialogue (`Speaker says (delivery) {dialogue}`, `(O.S.)`, `(V.O.)`, `in Language`)
    - Diegetic foley (`<foley>`)
    - Opt-in score (`(score)`) and on-screen text (`【on-screen text】`)
    - Multimodal `@references` and declared `[AESTHETIC]` shorthand tokens (`LOC01`, `EV01`, etc.)
- **Click-to-Edit per Beat**: Clicking any `Sₙ` beat switches that row in place to an auto-sizing textarea with full typing speed; blurring (or `Cmd/Ctrl+Enter` / `Esc`) immediately re-parses and snaps back to the Waterfall Stack.
- **Surgical Beat Insertion**: Hovering between two beats reveals a subtle `+` divider to insert a new Macro-State in place, plus a quiet `+ Add beat` button at the bottom of `[EXECUTION]`.

### 2.3 Ambient Real-Time Visual Indicators (Zero Chrome Bloat)
- **Camera Continuity Rail vs. Cut Hairline**:
  - Consecutive beats sharing the same numbered camera slot (e.g., `[CAM 01]` $\to$ `[CAM 01]`) connect visually via a subtle vertical continuity rail in the margin.
  - Switching camera slots (`[CAM 01]` $\to$ `[CAM 02]`) or using unnumbered `[CAM]` montage shots automatically renders a crisp dotted `CUT` hairline between the beats.
- **Quiet Margin Diagnostics**:
  - When a Staging block or Execution beat triggers a deterministic Script Supervisor rule, render a subtle amber (warning) or red (error) `( ! )` indicator in the right margin without shifting layout geometry.
  - Hovering or clicking opens a compact popover showing: **Audit Lens**, **Rule / Issue**, and **Actionable Repair Hint**.

### 2.4 Source Mode (`[ Source ]`)
- Swaps the exact same centered `~760px` column into a clean raw plain-text editor (`JetBrains Mono`) for bulk editing, find/replace, or direct inspection.
- Losslessly synced with Live Mode via the single canonical plain-text source.

---

## 3. Decoupled Technical Architecture

Design strictly for modularity so future capabilities (temporal pacing meter, state inspector popovers, 2D blocking canvas, AI semantic audit) can be added without refactoring existing modules.

### 3.1 Plain-Text-as-Truth Pattern
- Store the **raw canonical plain-text script** as the single reactive state (persisted to `localStorage`).
- Derive the parsed AST, extracted entities/tokens, camera continuity metadata (`HOLD` / `CUT` / `RECALL`), and lint diagnostics synchronously via pure functions.
- All Live Mode mutations (editing a Staging block, editing a beat, inserting a beat, deleting a beat, drag-reordering beats) operate through pure helpers in `src/core/serializer.ts` that return the updated raw plain-text string. Never maintain a diverging UI-only document tree.

### 3.2 Strict Zero-React Core (`src/core/`)
Every file in `src/core/` MUST be **100% pure TypeScript** with **ZERO React, DOM, browser storage, or CSS/Tailwind imports**:

| Module | Responsibility |
|---|---|
| **`src/core/types.ts`** | Canonical AST types (`AuteurDocument`, `StagingBlock`, `ExecutionBeat`, `SubStateNode`, `SubStateKind`), extracted entities/tokens, camera transition metadata (`HOLD` / `CUT` / `RECALL`), and `LintDiagnostic` types. |
| **`src/core/parser.ts`** | Full `v0.4.0` parser converting raw plain text into `AuteurDocument` with exact line indices/spans for lossless round-tripping. |
| **`src/core/serializer.ts`** | Pure lossless mutation helpers (`updateStagingBlock`, `updateExecutionBeat`, `insertExecutionBeat`, `deleteExecutionBeat`, `reorderExecutionBeats`) plus `exportPlainText` and `exportTagless`. |
| **`src/core/extractor.ts`** | Extracts `@ref as NAME` bindings (including optional `(voice: @audio)`), `[AESTHETIC]` `Description -> TOKEN` dictionaries (preserving both description and token), `[CAM XX]` slot definitions, and beat-to-beat `HOLD`/`CUT`/`RECALL` links. |
| **`src/core/linter.ts`** | Modular deterministic Script Supervisor rules—each rule implemented as an isolated pure function tagged with its corresponding Audit Lens (`Lens 1`–`Lens 5`) and repair hint. |

### 3.3 Thin UI Layer (`src/components/`) & Presets (`src/data/`)
- **`src/components/`**: Modular React + Tailwind components consuming `UI_TOKENS` (`src/ui/tokens/ui.ts`):
  - `TopSlateBar`
  - `LiveDocument`
  - `StagingBlockCard`
  - `ExecutionBeatRow`
  - `SubStateRenderer`
  - `DiagnosticDot`
  - `SourceEditor`
- **`src/data/presets.ts`**: Pre-load the **4 worked `v0.4.0` reference scripts** verbatim from `02_SYNTAX_SPEC_MODULES_AND_EXAMPLES.md` (Example 1: *POV Forest Horror*, Example 2: *Subway Train Fight Oner*, Example 3: *Interrogation Room Coverage*, Example 4: *1970s Heist Montage*). Default to *Interrogation Room Coverage* or *Subway Train Fight Oner* on cold start when `localStorage` is empty.

---

## 4. Locked `v0.4.0` Grammar & Deterministic Linter Contracts

### 4.1 Parser & Serializer Edge Cases
1. **Macro-Block Detection**: Standalone uppercase header lines matching `^\[([A-Z0-9 _-]+)\]$`. Once `[EXECUTION]` (or `[TIMELINE]` / `[BEATS]`) starts, subsequent `[TAG]` lines are Execution Sub-States, never new Staging blocks.
2. **Blank Lines in `[EXECUTION]`**: Every non-empty line inside `[EXECUTION]` is one Macro-State ($S_n$). Blank lines inside `[EXECUTION]` are harmless visual spacers and must not break parsing or merge adjacent beats.
3. **`->` Overloading**: Inside `[AESTHETIC]`, `->` (or `→`) defines a shorthand token mapping (`Description -> TOKEN`). Only split `->` / `→` as Sub-State chains inside `[EXECUTION]`.
4. **Full `v0.4.0` Inline Syntax**:
   - Dialogue regex must handle multi-word speakers, optional language, and varied modifier placements:
     `^(?<speaker>[A-Za-z0-9 _-]+?)\s+says(?:\s+in\s+(?<lang>[A-Za-z-]+))?(?:[\s,]+(?<mods>[^\{]+?))?\s*\{(?<line>[^\}]+)\}$`
   - Supports `{dialogue}`, `<foley>`, `(score)` (when spanning the full Sub-State), `【on-screen text】`, `[CAM XX]`/`[CAM]`, `[ACT]`, `[BLOCK]`, `[LIGHT]`, and all Tier-2 tags.
5. **`Copy Tagless` Normalization**:
   - Strip bracketed Sub-State tags (`[CAM 01]`, `[CAM]`, `[ACT]`, `[BLOCK]`, etc.) while keeping the `->` flow intact.
   - **Bare Hold Cleanup**: If removing a bare hold/recall prefix like `[CAM 01] -> [ACT] Miller leans forward` leaves an empty first Sub-State, drop that empty segment so the exported line reads `Miller leans forward` (never a dangling leading `-> Miller leans forward`).

### 4.2 Core V1 Deterministic Linter Rules (`src/core/linter.ts`)
Each rule must be an isolated pure function returning structured `LintDiagnostic[]`:

1. **Rule 1 — Viewport Coordinate Purity (`Lens 1: Spatial & Optics`)**:
   - Flag banned theatrical proscenium terms `stage-left` / `stage-right` (case-insensitive) anywhere in `[LOGIC]`, `[OPENING]`, or `[EXECUTION]`. Suggest `frame-left` / `frame-right` (or `screen-left` / `screen-right`).
2. **Rule 2 — Macro-State Resolution Discipline (`Lens 4: Acoustics & Voice`)**:
   - Flag any `[EXECUTION]` Macro-State whose **final non-empty Sub-State** is spoken `{dialogue}` without a trailing `[ACT]` physical follow-through or `<foley>` acoustic trigger.
3. **Rule 3 — Multimodal Reference Isolation (`Lens 5: Blocks & Grammar`)**:
   - Flag any `@ref` token (`@[A-Za-z0-9_-]+`) appearing outside `[INTENT]`, `[CHARACTERS]`, `[REFERENCES]`, or `[CONTINUITY PROTOCOL]`.
4. **Rule 4 — Frozen First-Frame Purity (`Lens 5: Blocks & Grammar`)**:
   - Flag any square-bracketed `[TAG]` token inside `[OPENING]`.
5. **Rule 5 — Camera Re-Definition & Oner Jump-Cut Guard (`Lens 1: Spatial & Optics`)**:
   - Track declared numbered camera slots (`[CAM 01]`, `[CAM 02]`, …).
   - Flag when a previously defined `[CAM XX]` slot re-declares a **static shot-scale token** (`WS`, `EWS`, `FS`, `MS`, `MWS`, `MLS`, `MCU`, `CU`, `ECU`, `OTS`, `POV`, `INS`, `two-shot`, `low-angle`, `high-angle`) on a subsequent line in the same script.
   - **Valid & Never Flagged**: Bare holds/recalls (`[CAM 01] ->`) and operator motion transitions (`[CAM 01] PAN LEFT ->`, `[CAM 01] CRANING DOWN ->`, `[CAM 01] TRACKING BACKWARD ->`, `[CAM 01] PUSHING FORWARD ->`, `[CAM 01] TILTING ->`).
   - **Continuation Exception**: When `[CONTINUITY PROTOCOL]` or `@video1` is present, **do NOT flag** the *first* appearance of each `[CAM XX]` slot in `[EXECUTION]` (first-appearance camera re-declaration is required in continuation clips).

---

## 5. Verification & Automated Testing (`Vitest`)

Because `src/core/` is 100% pure TypeScript, include a **Vitest** unit test suite (`tests/core/`) verifying:
1. **Parser & Round-Trip Losslessness**: Parsing and serializing all 4 presets preserves raw script content cleanly; blank lines inside `[EXECUTION]` do not corrupt beat counts.
2. **`->` Overloading**: `[AESTHETIC]` `Description -> LOC01` lines extract tokens without splitting as Execution chains; both `->` and Unicode `→` split cleanly in `[EXECUTION]`.
3. **Inline Syntax Parsing**: Multi-word speakers, `says in French (calmly) {line}`, `says (O.S., flat) {line}`, `says O.S. (strained) {line}`, `<foley>`, `(score)`, and `【on-screen text】`.
4. **Serializer & Tagless Exporter**: Block edits, beat inserts, beat reorders, and `exportTagless` cleanly stripping bare `[CAM 01] ->` holds without leaving dangling `->` prefixes.
5. **All 5 Linter Rules**: Positive and negative unit tests for Rules 1–5, including operator motion pass-through and the `[CONTINUITY PROTOCOL]` / `@video1` first-appearance exception in Rule 5.

Run `npm test` and `npm run build` (`tsc -b && vite build`) to verify zero TypeScript errors and 100% passing unit tests.

---

## 6. Required Workspace SSOT Documentation

Generate concise, high-signal living documentation inside the new project workspace:
- **`AGENTS.md`** (project root): Architecture invariants, the strict zero-React rule for `src/core/`, how to add new tags or linter rules safely, verification commands, and UI minimalism guardrails.
- **`docs/ARCHITECTURE.md`**: Plain-Text-as-Truth data flow, module map, and pure serializer mutation contracts.
- **`docs/GRAMMAR_CONTRACT.md`**: Locked `v0.4.0` parsing rules, regex contracts, and edge cases implemented by `src/core/parser.ts`.
- **`docs/UI_PHILOSOPHY.md`**: Single-column live document principles, Option A Waterfall rules, 4-mode theme system from `06_VISUAL_DESIGN_SYSTEM.md`, and semantic Macro-Block / inline token color palette.
