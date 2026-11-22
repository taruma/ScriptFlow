# Graph View — Technical Architecture & Extraction Reference

This document is the transparent technical specification for **Graph View** (`[ Live | Graph | Source ]`) in the **Auteur Script Editor**. It explains how a plain-text Pure Auteur Script (`v0.4.0`) is parsed, inferred into decoupled graph objects, laid out deterministically across two orientations, and rendered interactively via `@xyflow/react`—all without mutating the canonical plain-text source of truth.

---

## 1. Design Philosophy & Invariants

1. **Plain-Text-as-Truth (Strictly Read-Only, Locked Cards & Pan-Anywhere):** Graph View holds zero parallel mutable document state. Every card, extracted object, wire, Shot Chamber, and `RECALL` lane is derived synchronously from `rawText` (`parseAuteurScript` → `extractMetadata` → `buildGraphSceneModel` → `buildCanvasLayout`). All nodes are locked (`draggable: false`, `selectable: false` in `flowSync.ts`, `nodesDraggable={false}`, and `position` changes stripped in `handleNodesChange`) so dragging anywhere with mouse or 1-finger touch—even directly over cards—pans the blueprint smoothly without moving cards. Desktop keeps scroll-wheel zoom (`zoomOnScroll={true}`, `panOnScroll={false}`), while touch supports 1-finger pan + 2-finger pinch (`zoomOnPinch={true}`, `zoomOnDoubleClick={false}`, `paneDragThreshold={4}`, `touch-none overscroll-none`), mouse-only hover tracing (`pointerType === 'mouse'`), and drag-to-select text inside `Source` (`</>`) blocks (`nopan select-text`). **`Reset`** (always available in the upper View pill, softly emphasized when `isGraphViewModified()` is true) restores the current orientation's default fold/unfold posture, collapses `Source` viewers, turns off `Threads`, clears dimension isolation (resetting mode to `Ghost`), and refits the viewport.
2. **Decoupled Extraction Proof (`Source`):** Every formatted Execution Macro-State and Sub-State strips redundant syntax delimiters (`[CAM]`, `[ACT]`, `<...>`, `{...}`, `【...】`) for typographic clarity, while providing a one-click **`Source` (`Code2`)** toggle that branches the exact unedited plain-text line off the opposite side of the node—proving the entire structured graph comes directly from plain text.
3. **Zero-React Pure Graph Layer (`src/ui/canvas/`):** All graph modeling, entity tokenization, deterministic auto-layout, edge derivation, modification predicates (`isGraphViewModified`), and React Flow state reconciliation live in pure TypeScript modules under `src/ui/canvas/` (exported via `src/ui/canvas/index.ts`) and are unit-tested directly in Vitest (`tests/ui/canvasGraph.test.ts`).
4. **Zero Initial Bundle Cost:** `AuteurGraphView` (`src/components/canvas/AuteurGraphView.tsx`) is code-split via `React.lazy` in `src/App.tsx`, so `@xyflow/react` (~100 kB gzipped) is never downloaded until the user switches to **Graph** mode.
5. **Presentation-First Hygiene & Capture-Phase Menu Dismissal:** Script Supervisor linter diagnostics are intentionally hidden in Graph View, and global Paste-and-Hydrate / document Undo/Redo shortcuts are guarded (`viewMode === 'graph'`) in `src/ui/useGlobalEditorShortcuts.ts`. Both `TopSlateBar` and Graph View's bottom-right `?` Help popover use capture-phase outside-pointer listeners (`attachCaptureOutsideDismiss` in `src/ui/outsideDismiss.ts`) so `@xyflow/react` pane pan/zoom pointer handling never blocks menus or popovers from closing on canvas clicks. On mobile/narrow viewports (`< 640px`), `resolveNarrowWorkspaceState` reverts Graph View to read-only Live Mode.

---

## 2. End-to-End Parsing & Inference Pipeline

```text
rawText (Single Source of Truth)
  │
  ├── 1. src/core/parser.ts         → parseAuteurScript(rawText)
  │                                    Splits Macro-Blocks (MB#), Macro-States (S#),
  │                                    Sub-States (S#.#), Camera slots, Dialogue parts,
  │                                    and parseDialogueModifiers() (Extensions vs Delivery)
  │
  ├── 2. src/core/aesthetic.ts      → parseAestheticLine() / extractAestheticTokenSegments()
  │      + src/core/extractor.ts       / extractAestheticStandaloneReferences()
  │                                    extractMetadata(doc) → characters, aestheticTokens,
  │                                    stagingReferences, cameraSlots, beatLinks,
  │                                    inferSceneTopologyFromDocument()
  │
  ├── 3. src/ui/canvas/canvasGraph.ts → buildGraphSceneModel(doc, metadata)
  │                                      Builds Staging blocks, Inferred Objects rail,
  │                                      downstream call sites, Shot Chambers, RECALL links,
  │                                      and longest-first inline entity match rules
  │
  ├── 4. src/ui/canvas/canvasLayout.ts  → buildCanvasLayout(model, options)
  │      + layoutMetrics.ts               Computes deterministic 3-layer coordinates (LR / TB),
  │      + layoutEdges.ts                 z-index stack, Milestone Pills, Shot Chambers,
  │                                       and all 6 typed edge passes + drag offsets
  │
  └── 5. src/ui/canvas/flowSync.ts      → mergeLayoutIntoFlowNodes(prev, specs, offsets)
         + src/components/canvas/*        Reconciles into controlled React Flow v13 state
                                          preserving measured dimensions, selection & dragging
```

### 2.1 How Plain Text Objects Are Extracted (`src/core/`)

| Inferred Object Kind | Canonical Plain-Text Pattern | Core Extractor & Regex | Notes |
|---|---|---|---|
| **Character (`character`)** | `@ref as Label` or `@ref as Label (voice: @audio)` inside any Phase 1 Staging block | `extractCharacterBindings` (`src/core/extractor.ts`, `CHARACTER_BINDING_REGEX`) | Supports multi-word capitalized labels (e.g., `@image2 as Evan Montgomery`) with stopword guards (`and`, `with`, `in`, `facing`, …) and optional `(voice: @audio)` binding. Deduplicated case-insensitively per `ref::name`. |
| **Aesthetic Token (`location` / `wardrobe` / `prop`)** | `Description -> TOKEN` or `Description -> TOKEN (reference: @ref)` inside `[AESTHETIC]` (`;` separates multiple mappings on one line) | `extractAestheticTokenSegments` (`src/core/aesthetic.ts`, `AESTHETIC_TOKEN_SEGMENT_REGEX`) | Accepts both ASCII `->` and Unicode `→`, plus optional trailing `(reference: @ref)` or `(ref: @ref)`. Category classifies `location` (`location`/`setting`/`set`/`place`/`env`/`backdrop`/`venue`/`interior`/`exterior`/`room`/`architecture`), `prop` (`prop`/`item`/`object`/`vehicle`/`weapon`/`tool`/`device`/`artifact`/`gear`/`accessory`/`furniture`/`document`/`dossier`/`evidence`), or `wardrobe` (default). |
| **Staging-Only Visual Ref (`staging_ref`)** | `Description (reference: @ref)` or `(ref: @ref)` inside `[AESTHETIC]` with **no** `-> TOKEN` | `extractAestheticStandaloneReferences` (`src/core/aesthetic.ts`, `AESTHETIC_STANDALONE_REF_REGEX`) | Skips segments already parsed as `-> TOKEN` mappings and skips `@ref`s already bound to Characters or Tokens. Rendered with a dashed `Staging` badge as a self-contained Phase 1 visual anchor. |
| **Camera Setup (`camera_slot`)** | Numbered `[CAM 01]`, `[CAM 02A]` inside `[EXECUTION]` | `extractCameraContinuity` (`src/core/extractor.ts`) | Tracks `firstBeatIndex`, `firstDescriptor`, and per-Macro-State transition (`ESTABLISH`, `HOLD`, `CUT`, `RECALL`, `MONTAGE`, `NONE`). Shown in Layer 2 automatically as a fallback rail when no Staging objects exist, and always clickable on Macro-State camera slates & Shot Chambers. |

### 2.2 Dialogue Anatomy & Sculpted Sub-State Classification

In `src/core/parser.ts`, `parseDialogueModifiers(modifiers?: string)` splits comma-separated parentheticals inside `Speaker says [in Language] (modifiers) {line}` into two distinct arrays:
- **`extensions`**: Screenplay **Character Extensions** matching `/^(?:V\.O\.|O\.S\.|O\.C\.|CONT'D|FILTERED|PRE-LAP)$/i` (normalized uppercase, e.g., `(V.O.)`, `(O.S.)`).
- **`delivery`**: Performance / effort / emotional delivery cues (e.g., `(deadpan)`, `(panicked)`), rendered as an italic parenthetical line above the quoted dialogue in `SculptedSubStateBody.tsx`.

Every `SubStateKind` from `src/core/types.ts` maps deterministically into one of **9 Graph Isolation Dimensions** (`mapSubStateKindToGraphDimension` in `src/ui/canvas/canvasGraph.ts`). The Isolator Dock dynamically displays **only dimensions detected in the current scene (`count > 0`)**:

| `GraphDimension` | Source `SubStateKind` | Sculpted Visual Motif (`SculptedSubStateBody.tsx`) |
|---|---|---|
| `camera` | `camera` | Single-line optical slate with clickable `CAM ##` badge when numbered |
| `block` | `block` | Subtle `BLOCK` tag prefix + spatial coordinates prose |
| `action` | `action`, `state_boundary` | Clean choreography prose (zero repeated `[ACT]`) |
| `dialogue` | `dialogue` | Centered screenplay micro-block: clickable `SPEAKER` + `[Language]` + `(Extensions)` / `(delivery)` / `“line”` |
| `foley` | `foley` | 5-bar acoustic waveform icon + italic physical sound cue |
| `score` | `score` | `Music2` icon + italic musical cue |
| `light_vfx` | `light`, `tier2` (`[VFX]` only) | Subtle uppercase tag prefix + optical/VFX cue |
| `onscreen_text` | `onscreen_text` | Framed serif Title Card micro-slate with corner tick marks |
| `other` | `plain`, other `tier2` *(non-`[VFX]` / custom `[TAG]`)* | Neutral slate prose labeled `Other` in the Isolator Dock while preserving any `[TAG]` prefix |

### 2.3 Downstream Label Matching, Call Sites & Inline Tokenization

1. **Longest-First Word-Boundary Matching (`canvasGraph.ts`):**
   - Non-staging-only rail objects are sorted longest `matchToken` first (so `Detective Miller` matches before `Miller`, and `LOC01` never partially matches `LOC010`) using negative lookarounds `(?<![A-Za-z0-9_-])...(?![A-Za-z0-9_-])`.
2. **Staging Call Sites without Self-Loops:**
   - Every Staging block (including `[LOGIC]`, `[OPENING]`, and custom blocks) is scanned for downstream mentions, excluding any object whose `sourceBlockId === sb.mbId` so declaring blocks (`[INTENT]`, `[AESTHETIC]`) never emit redundant self-links.
3. **Case-Insensitive Dialogue Speaker Linking:**
   - Both `canvasGraph.ts` (`characterIdByLowerName`) and `SculptedSubStateBody.tsx` resolve dialogue speakers case-insensitively, so `ROSA says {…}` cleanly links to `@image1 as Rosa`.
4. **Inline Prose Annotation (`tokenizeAnnotatedText` + `AnnotatedProse.tsx`):**
   - Splits raw prose into literal spans and interactive entity chips (`@ref`, Character label, `TOKEN`) so hovering or clicking any inline mention triggers the exact same highlight & Object Inspector flow as clicking the Inferred Objects rail.

### 2.4 Scene Topology, Shot Chambers & `RECALL` Detection

- **Scene Topology (`inferSceneTopologyFromDocument` in `src/core/extractor.ts`):**
  - `empty`: zero Execution Macro-States.
  - `continuous_oner`: single numbered camera slot (`CAM 01`) with zero montage cuts.
  - `multi_camera_coverage`: 2+ numbered camera slots with zero montage cuts.
  - `discontinuous_montage`: unnumbered `[CAM]` montage lines with zero numbered slots.
  - `mixed`: numbered and unnumbered camera tags coexist (or no camera tags present).
- **Shot Chambers (`canvasGraph.ts`):** Any maximal contiguous run of `>= 2` Macro-States sharing the same numbered `cameraSlot` via `HOLD` (or `NONE` carry-over) is grouped into a `ShotChamber` (`parentId` container node). Unnumbered `MONTAGE` lines never produce Shot Chambers.
- **`RECALL` Origin Links:** Whenever `beatLink.transition === 'RECALL'`, `recallSourceMacroStateId` points back to `S${cameraSlots[slot].firstBeatIndex}`, producing a curved overhead `RECALL <SLOT>` arc.

---

## 3. Dual-Axis Layout, Isolation & Stacking Contract

### 3.1 Three-Tier Stratified Dual-Axis Geometry (`src/ui/canvas/canvasLayout.ts` + `layoutMetrics.ts`)

| Axis / Tier | `L → R` (`direction: 'LR'`, Default) | `T ↓ B` (`direction: 'TB'`, 90° Transpose) |
|---|---|---|
| **Tier 1 — Phase 1 Staging** | Horizontal row (`L → R`) across the top band (`[INTENT]` → `[LOGIC]` → `[AESTHETIC]` → `[OPENING]`). **`[AESTHETIC]`** starts **folded** in `L → R` and can split into horizontal Key–Value Lookbook swatch cards (`AestheticItemNode`) beneath its header (with **`Keys`/`Fold`** and opposite-side **`Source`** branching above). | Single vertical column (`T ↓ B`) on the left. **`[AESTHETIC]`** starts **unfolded** in `T ↓ B`, stacking indented Lookbook swatch cards beneath its header (flush with Tier 1's right edge, with **`Source`** branching left). |
| **Tier 2 — Inferred Objects** | Horizontal band (`L → R`) directly beneath Tier 1, grouped by kind on one unified baseline | Vertical column (`T ↓ B`) directly right of Tier 1, grouped by kind |
| **Tier 3 — Phase 2 Execution** | Horizontal spine (`S1 → SN`, `L → R`) directly beneath Tier 2 (starts **folded**) | Vertical spine (`S1 ↓ SN`, `T ↓ B`) directly right of Tier 2 (starts **unfolded**) |
| **Split Sub-States** | Fan **downward** beneath their Macro-State (`S#.1 ↓ S#.2 ↓ …`) | Fan **rightward** beside their Macro-State (`S#.1 → S#.2 → …`) |
| **Opposite-Side `Source` Branch** | Branches **above** the Macro-State (or `[AESTHETIC]`) with reserved headroom | Branches **left** of the Macro-State (or `[AESTHETIC]`) with reserved gutter width |

- **Orientation-Aware Defaults & Always-Ready `Reset` (`createDefaultGraphExpansionState` + `isGraphViewModified`):**
  - **`L → R` (default overview):** All Execution Macro-States and `[AESTHETIC]` Lookbook cards start **folded**, with all `Source` branches collapsed.
  - **`T ↓ B` (vertical deep-dive):** All Execution Macro-States and `[AESTHETIC]` Lookbook cards start **unfolded**, with all `Source` branches collapsed.
  - Switching orientations restores the target orientation's default posture and refits the canvas. **`Reset`** remains always visible in the upper View pill (so users can refit cleanly after panning/zooming as well, with subtle surface emphasis whenever `isGraphViewModified()` detects changed expansion, open `Source` branches, `Threads`, or dimension isolation); clicking it restores default expansion, closes `Source` branches, turns off `Threads`, clears dimension isolation (resetting mode to `Ghost`), and refits the canvas.

### 3.2 3-Anchor Canvas HUD & Unified Bottom Studio Dock

Graph View uses a **3-Anchor Spatial HUD** that keeps the top-right and bottom-left corners clear at rest:
1. **Top-Left Passive Context Pill (`GraphHud.tsx`, `top-3 left-3`):** Displays strictly the Scene Topology label and tabular scene counts (`Staging · Objects · Macro-States · Sub-States`).
2. **Top-Right Dedicated Object Inspector (`ObjectInspectorPanel.tsx`, `top-3 right-3`):** Appears only when an Inferred Object or inline entity is selected, occupying the freed top-right corner with zero toolbar overlap.
3. **Bottom-Center Two-Tier Studio Dock (`SubStateIsolatorDock.tsx`, `bottom-3 left-1/2 -translate-x-1/2`):** Stacks two slim, fixed-width floating pills (`gap-1.5`) in a grounded pyramid silhouette with borderless ghost resting buttons, soft elevated active states, and zero horizontal layout shift:
   - **Upper View Pill:** Compact single-row bar pairing the `[ L → R | T ↓ B ]` orientation switch with **icon-only** view toggles (`Split`/`Fold`, `Source`, `Threads`) and an always-visible icon-only **`Reset`** button (softly emphasized when `isGraphViewModified()` is true), each carrying descriptive tooltips and `aria-label`s.
   - **Lower Filter Base Pill + `Ghost | Compact` Satellite:** Sub-State Dimension Isolator (`All` + detected dimension chips with `6px` semantic dots at rest, lighting up with full semantic fill when active). When isolating `>= 1` dimension, **`Ghost | Compact`** floats in a detached right satellite pill (`lg:left-full lg:ml-1.5`) on desktop (`>= 1024px`) and docks cleanly centered above the Filter pill on tablet widths (`640px–1023px`) so dimension chips remain stationary (`0px` shift) and never collide with `ZoomControlsBar`.
4. **Bottom-Right Viewport & Help Bar (`ZoomControlsBar` in `AuteurGraphView.tsx`, `bottom-3 right-3`):** Houses `- 100% + | Fit | Map | ?`, where `?` (`CircleHelp`) toggles a compact click/Escape-dismissible interaction tips popover (`attachCaptureOutsideDismiss`) above the zoom bar instead of a permanent bottom-left banner. The overview `MiniMap` defaults to visible on desktop (`>= 1024px`) and hidden (still toggleable via `Map`) on tablets (`< 1024px`). Under `@media (pointer: coarse)`, dock icons, filter chips, zoom controls, and card header action buttons automatically expand to touch-friendly hit targets (`32–36px`) without altering desktop density.

When one or more dimensions are toggled in `SubStateIsolatorDock`:
- **Non-matching Sub-States:** Dimmed (`opacity: 0.14`) in **`Ghost`** mode, or omitted from cards and split branches in **`Compact`** mode.
- **Zero-Match Macro-States:** Collapse into compact dashed **Milestone Pills** (`S3`) on the spine so temporal ordering remains intact.
- **Animated Dimension Thread (`isolationThread`):** Connects surviving matching Macro-States directly across Milestone Pill gaps in the active dimension's color as a crisp dashed orthogonal pipe with a **gliding SVG pulse dot** (`L → R` in `LR`, `T ↓ B` in `TB`). While a tag is isolated, any background **`Threads`** entity wires stay static and dimmed so they never compete visually with the isolated craft thread.

### 3.3 Strict Tier Boundaries, Cascading State-Flow Threads & Blueprint Routing (`src/ui/canvas/layoutEdges.ts`, `AuteurGraphEdge.tsx`)

1. **Zero Tier 1 → Tier 3 Bypasses:** Staging Macro-Blocks (`MB#`) and `[AESTHETIC]` Lookbook cards never wire directly into Execution Macro-States (`S#`) or Sub-States (`S#.#`). Every cross-phase relationship flows strictly through its intermediate Tier 2 Inferred Object.
2. **Tier 1 ↔ Tier 2 (`extraction` & Staging references):**
   - **Extraction (`extraction`):** Declaring Staging block—or the exact expanded `[AESTHETIC]` Lookbook Key–Value card (`aes-MB#-#`, `aes-out`) when open—wires into its Tier 2 Inferred Object (`obj-in`), falling back cleanly to `node-MB#` when `[AESTHETIC]` is folded.
   - **Downstream Staging References (`labelMatch`, `obj-back` → `staging-match-in` / `aes-match-in`):** Connects an extracted Tier 2 Object to subsequent Staging blocks (`[LOGIC]`, `[OPENING]`, or the exact matching `[AESTHETIC]` Key card when open) without self-linking the declaring block.
3. **Tier 2 → First Active Macro-State → Cascading State-Flow (`labelMatch` + `isCascade`):**
   - **First Active Macro-State Entry:** Always drops **one** wire from the Tier 2 Object (`obj-out`) into the **first active Macro-State** (`node-S#` via `thread-entry`). When that Macro-State is split into Sub-States, `node-S#` hands off along the clean outer margin (`sub-thread-out` → `match-in`, `isMacroEntryHandoff: true`) into the first matched Sub-State (`subnode-S#.#`)—making the first active Macro-State unmistakable without cutting across intermediate Sub-States.
   - **Chronological Execution Cascade (`prev → next`):** Subsequent appearances chain sequentially in timeline order rather than fanning out from Tier 2:
     - **Folded Macro-States:** `node-S1` (`thread-out`) → `node-S2` (`thread-in`) → `node-S4` (`thread-in`) via dedicated lower-side ports (`82%`) and rounded orthogonal corridor pipes clear of `CUT` pills.
     - **Split Sub-States (Intra-State & Cross-State):** Consecutive mentions inside the same split Macro-State (`S1.2 → S1.3`) connect via a rounded orthogonal U-bracket (`match-out` → `match-same-in`, `isIntraState: true`); mentions crossing to a later Macro-State (`S1.3 → S2.3`, `S3.4 → S4.2`) route cleanly through the empty horizontal/vertical aisle between rows/columns with per-lane channel stepping (`laneIndex`)—eliminating diagonal spaghetti.
4. **Rounded Orthogonal Blueprint Pipes & On-Demand Stepped `RECALL` Lanes:**
   - All structural threads (`extraction`, `labelMatch`, `aestheticBranch`, `isolationThread`, `spine*`, `subStateChain`, `rawBranch`) use **rounded orthogonal pipes** (`getSmoothStepPath` + `buildRoundedOrthogonalPath` in `AuteurGraphEdge.tsx`) with dashed styling on state-flow & isolation threads, and ruler-straight top-aligned (`top: 34px`) horizontal Sub-State chains in `T ↓ B` mode.
   - **Quiet `RECALL CAM ##` Spine Badge + On-Demand Stepped Camera Lanes (`recall`):** At rest, camera recalls display quietly right on the timeline spine (`RECALL CAM 01`) with zero permanent arc clutter. Focusing a `CAM ##` badge, isolating **`CAM`**, or toggling **`Show Threads`** reveals **chronological cascading camera lanes** (`prev → next` per slot, e.g., `S1 → S4 → S7` for `CAM 01` and `S2 → S6` for `CAM 02`). `resolveVisibleRecallSlotLanes()` compacts lane indices strictly across camera slots that actually emit visible recalls, routes each lane on its own stepped rounded-orthogonal subway track (`RECALL_LANE_BASE + lane * RECALL_LANE_STEP`), and dynamically expands Tier 3's gutter/headroom in `canvasLayout.ts` so even scenes with 4+ recalled cameras stay clear of Tier 2 Objects and zone headers.
5. **Off-Thread Parent Dimming & Selective Gliding Pulse-Dot Animation:**
   - **Three-Tier Focus Contrast:** When an entity is focused, nodes directly on the active wire path (`directThreadNodeIds` — e.g., `S1`, `S1.2`, `S1.4`, `S2.3`, `S3.2`, …) keep full `isTraced` glow; split Macro-State headers (like `S2`/`S3`/`S4`) or an expanded `[AESTHETIC]` header that own matched child cards without sitting on the wire itself step down to **`isSecondaryTraced`** (`.auteur-graph-secondary-traced`, `opacity: 0.6`, soft tinted border) while preserving visible `subStateChain` ownership lines (`isSecondary: true`); unrelated nodes dim fully (`opacity: 0.22`).
   - **Gliding Pulse Dot:** Active **isolated Dimension Threads** (`isolationThread`) and **single-object focused traces** (hover/click an Inferred Object or Camera Setup) render a native SVG `<animateMotion>` **gliding pulse dot** (translucent halo + solid core moving strictly `source → target`) along their dashed wire—automatically hidden under `@media (prefers-reduced-motion: reduce)` (`.auteur-graph-pulse-dot` in `src/index.css`).
   - **Static Overview:** Unfiltered **`Show Threads`** (all entities visible at once) renders static dashed orthogonal lane pipes with zero pulse dots to avoid visual clutter and repaint load.

### 3.4 Explicit Z-Index Stacking Hierarchy & App Shell Isolation

`.auteur-graph-canvas` runs with `isolate z-0` (strictly below `TopSlateBar` at `z-40`), guaranteeing top-bar popovers (`Settings`, `File`, `Copy`) always float cleanly above Graph View's `ObjectInspectorPanel` and HUD. Inside the canvas, `<ReactFlow>` runs with **`zIndexMode="manual"`** and **`elevateEdgesOnSelect={false}`** so React Flow's automatic parent-elevation never lifts edges above cards inside Shot Chambers:

| Layer | `zIndex` | Elements |
|---|---|---|
| Backdrop | `0` (`GRAPH_Z_CHAMBER`) | `ShotChamberNode` dashed containers |
| Standard Wires | `1` | Extraction, spine, sub-state chain, raw branch, dimmed links |
| Continuity Overlays | `2` | Curved `RECALL` arcs and `isolationThread` connectors |
| Active Trace Wires | `3` | Hot/traced extraction and label-match wires |
| Edge Badges | `4` | `CUT` / `RECALL` pills via `EdgeLabelRenderer` |
| **All Cards & Headers** | **`10` (`GRAPH_Z_CARD`)** | `ZoneHeaderNode`, `StagingBlockNode`, `InferredObjectNode`, `MacroStateNode`, `SubStateNode`, `RawTextBranchNode` |

---

## 4. React Flow v13 Integration & Stability Contracts

1. **Controlled Node Reconciliation, Locked Nodes & Live DOM Height Feedback (`src/ui/canvas/flowSync.ts`, `AuteurGraphView.tsx`):**
   - `mergeLayoutIntoFlowNodes` defaults every node to `draggable: false` and `selectable: false` so per-node flags never override `<ReactFlow nodesDraggable={false} elementsSelectable={false}>`. `AuteurGraphView` strips any `'position'` changes from React Flow v13 `NodeChangeset` batches before calling `changes.applyTo(prev)` so cards stay locked at their deterministic layout coordinates, and passes a stable no-op `onNodeClick={NOOP_NODE_CLICK}` on `<ReactFlow>` so React Flow v13 keeps inline `pointer-events: all` on `.react-flow__node` wrappers (without it, locked non-selectable nodes receive `pointer-events: none` and block inner buttons, entity chips, hover tracing, and raw text selection).
   - `estimateWrappedLines()` in `layoutMetrics.ts` simulates real word-boundary wrapping (`whitespace-pre-wrap` + `break-words`) for frame-0 placement, and `AuteurGraphView` captures React Flow's actual DOM `dimensions` changes (`measuredHeights` with a `>= 2px` hysteresis threshold) into `buildCanvasLayout`, guaranteeing zero vertical overlap on tall `</>` Raw Input branches, Staging cards, decoupled Sub-States, and Shot Chamber containers.
   - When layout or hover/selection recomputes, `mergeLayoutIntoFlowNodes` preserves each existing node's `measured`, `selected`, `dragging`, active drag `position`, and `style` object reference whenever dimensions are unchanged—preventing React Flow's internal `ResizeObserver` from re-measuring nodes in a loop.
2. **Handle-Bounds Refresh on Orientation Flip (`AuteurGraphView.tsx`):**
   - Because `<Handle position={...} />` props rotate dynamically between `LR` and `TB`, `AuteurGraphView` invokes `useUpdateNodeInternals()` on all current node IDs inside `requestAnimationFrame` whenever `direction` changes so edge anchors re-snap immediately.
3. **4-Theme Semantic CSS Token Binding (`src/index.css`):**
   - React Flow v13 defaults to `color-scheme: light dark` with `light-dark(transparent, #141414)`. `.auteur-graph-canvas .react-flow` overrides `--xy-background-color`, `--xy-background-pattern-color`, `--xy-minimap-background-color`, `--xy-edge-label-*`, and `--xy-selection-*` directly from ScriptFlow's `--app-bg`, `--surface`, `--text-main`, `--tok-continuity`, and `--graph-dot` variables, and syncs `color-scheme` to `[data-theme-category="dark"]` / `[data-pure-black-shell="true"]`.
4. **Benign `ResizeObserver` Guard (`src/main.tsx`):**
   - A targeted capture-phase listener ignores benign Chromium `ResizeObserver loop completed with undelivered notifications.` notifications during rapid flex-pane or multi-node canvas resizes without suppressing real errors.

---

## 5. Module Map & Safe Extension Recipes

### Module Map

| File | Responsibility |
|---|---|
| `src/ui/canvas/index.ts` | Preserved public facade for all pure Graph View types, model, layout, and reconciliation helpers. |
| `src/ui/canvas/types.ts` | Canonical Graph View TypeScript contracts (`GraphSceneModel`, `InferredGraphObject`, `CanvasNodeSpec`, `CanvasEdgeSpec`, `GraphLayoutOptions`). |
| `src/ui/canvas/canvasGraph.ts` | Pure `buildGraphSceneModel`, `mapSubStateKindToGraphDimension`, `tokenizeAnnotatedText`, `createDefaultGraphExpansionState`, and `isGraphViewModified`. |
| `src/ui/canvas/layoutMetrics.ts` | Geometry constants, `GRAPH_Z_CHAMBER` / `GRAPH_Z_CARD`, character-count height heuristics, and `applyOffset`. |
| `src/ui/canvas/layoutEdges.ts` | Pure edge builders (`buildExtractionEdges`, `buildExecutionContinuityEdges`, `buildDownstreamLabelMatchEdges`). |
| `src/ui/canvas/canvasLayout.ts` | Deterministic 3-layer `LR` / `TB` node placement orchestrating `layoutMetrics.ts` and `layoutEdges.ts`. |
| `src/ui/canvas/flowSync.ts` | Pure `mergeLayoutIntoFlowNodes` reconciling layout specs with React Flow internal node state. |
| `src/components/canvas/AuteurGraphView.tsx` | Lazy-loaded React Flow shell, 3-anchor HUD/Studio Dock/Inspector wiring, bottom-right `ZoomControlsBar` + `?` Help popover, `fitView`, and `useUpdateNodeInternals`. |
| `src/components/canvas/*Node.tsx` | Thin `memo()`'d custom node renderers (`ZoneHeaderNode`, `StagingBlockNode`, `AestheticItemNode`, `InferredObjectNode`, `ShotChamberNode`, `MacroStateNode`, `SubStateNode`, `RawTextBranchNode`). |
| `src/components/canvas/AuteurGraphEdge.tsx` | Custom edge renderer for rounded orthogonal Blueprint/Metro corridor pipes, gliding SVG `<animateMotion>` pulse dots, overhead curved `RECALL` arcs, and `EdgeLabelRenderer` pills. |
| `src/components/canvas/SculptedSubStateBody.tsx` & `AnnotatedProse.tsx` | Bespoke per-dimension Sub-State renderers and inline clickable entity chips. |
| `src/components/canvas/GraphHud.tsx`, `SubStateIsolatorDock.tsx`, `ObjectInspectorPanel.tsx`, `graphContext.tsx` | Top-left passive context pill, unified bottom Studio Dock (layout controls + dot-badged dimension isolator), top-right Object Inspector, and shared interaction context + CSS color variable mappers. |

### Safe Extension Recipes

- **Adding a new custom node type (e.g., visual reference thumbnail card or director note):**
  1. Add the node type to `CanvasNodeType` in `src/ui/canvas/types.ts` and emit it in `src/ui/canvas/canvasLayout.ts` with `zIndex: GRAPH_Z_CARD`.
  2. Create a `memo()`'d renderer under `src/components/canvas/`, register it in `NODE_TYPES` inside `AuteurGraphView.tsx`, and add any copy to `UI_LABELS.graph` in `src/ui/labels/editor.ts`.
- **Adding a new Isolation Dimension:**
  - Add the key to `GRAPH_DIMENSIONS` in `src/ui/canvas/types.ts`, map it in `mapSubStateKindToGraphDimension` (`canvasGraph.ts`), add its 4-theme CSS variable `--graph-dim-<key>` in `src/index.css`, map it in `getDimensionColorVar` (`graphContext.tsx`), and add its label to `UI_LABELS.graph.isolatorDimensions` (`src/ui/labels/editor.ts`).
