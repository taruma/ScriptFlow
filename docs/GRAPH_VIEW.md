# Graph View — Technical Architecture & Extraction Reference

This document is the transparent technical specification for **Graph View** (`[ Live | Graph | Source ]`) in the **Auteur Script Editor**. It explains how a plain-text Pure Auteur Script (`v0.4.0`) is parsed, inferred into decoupled graph objects, laid out deterministically across two orientations, and rendered interactively via `@xyflow/react`—all without mutating the canonical plain-text source of truth.

---

## 1. Design Philosophy & Invariants

1. **Plain-Text-as-Truth (Strictly Read-Only):** Graph View holds zero parallel mutable document state. Every card, extracted object, wire, Shot Chamber, and `RECALL` arc is derived synchronously from `rawText` (`parseAuteurScript` → `extractMetadata` → `buildGraphSceneModel` → `buildCanvasLayout`). Free-dragging nodes only stores ephemeral local `(dx, dy)` offsets in React state (`nodeOffsets`), reversible in one click via **Reset Layout**.
2. **Decoupled Extraction Proof (`Show Source`):** Every formatted Execution Macro-State and Sub-State strips redundant syntax delimiters (`[CAM]`, `[ACT]`, `<...>`, `{...}`, `【...】`) for typographic clarity, while providing a one-click **`Source` (`Code2`)** toggle that branches the exact unedited plain-text line off the opposite side of the node—proving the entire structured graph comes directly from plain text.
3. **Zero-React Pure Graph Layer (`src/ui/canvas/`):** All graph modeling, entity tokenization, deterministic auto-layout, edge derivation, and React Flow state reconciliation live in pure TypeScript modules under `src/ui/canvas/` (exported via `src/ui/canvas/index.ts`) and are unit-tested directly in Vitest (`tests/ui/canvasGraph.test.ts`).
4. **Zero Initial Bundle Cost:** `AuteurGraphView` (`src/components/canvas/AuteurGraphView.tsx`) is code-split via `React.lazy` in `src/App.tsx`, so `@xyflow/react` (~100 kB gzipped) is never downloaded until the user switches to **Graph** mode.
5. **Presentation-First Hygiene:** Script Supervisor linter diagnostics are intentionally hidden in Graph View, and global Paste-and-Hydrate / document Undo/Redo shortcuts are guarded (`viewMode === 'graph'`) in `src/ui/useGlobalEditorShortcuts.ts`. On narrow viewports (`< 640px`), `resolveNarrowWorkspaceState` keeps the workspace in read-only Live Mode.

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
| **Aesthetic Token (`location` / `wardrobe` / `prop`)** | `Description -> TOKEN` or `Description -> TOKEN (reference: @ref)` inside `[AESTHETIC]` (`;` separates multiple mappings on one line) | `extractAestheticTokenSegments` (`src/core/aesthetic.ts`, `AESTHETIC_TOKEN_SEGMENT_REGEX`) | Accepts both ASCII `->` and Unicode `→`, plus optional trailing `(reference: @ref)` or `(ref: @ref)`. Category classifies `location` (`location`/`set`/`place`/`env`), `prop` (`prop`/`item`/`object`/`vehicle`), or `wardrobe` (default). |
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
| `light_vfx` | `light`, `tier2` | Subtle uppercase tag prefix + optical/VFX cue |
| `onscreen_text` | `onscreen_text` | Framed serif Title Card micro-slate with corner tick marks |
| `other` | `plain` *(untagged / undetected)* | Neutral slate prose labeled `Other` in the Isolator Dock (no extra parsing required) |

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

### 3.1 Two-Axis Geometry (`src/ui/canvas/canvasLayout.ts` + `layoutMetrics.ts`)

| Axis / Side | `L → R` (`direction: 'LR'`) | `T ↓ B` (`direction: 'TB'`) |
|---|---|---|
| **Primary Flow** | Layer 1 Staging → Layer 2 Objects → Layer 3 Execution (`S1 → SN`) left-to-right | Layer 1 Staging (2-col grid) ↓ Layer 2 Objects (wrapped rows) ↓ Layer 3 Execution top-to-bottom |
| **Perpendicular Decoupled Sub-States** | Fan **downward** beneath their Macro-State (`S#.1 ↓ S#.2 ↓ …`) | Fan **rightward** beside their Macro-State (`S#.1 → S#.2 → …`) |
| **Opposite-Side `</>` Raw Branch** | Branches **above** the Macro-State | Branches **left** of the Macro-State |

- **Default Posture & Reset (`createDefaultGraphExpansionState`):** On load, script switch, or **`Reset`**, all Macro-States start **folded (compact)** with **Source** branches collapsed and all ephemeral drag offsets cleared—keeping the initial view calm until the presenter explicitly splits a Macro-State's Sub-States or toggles source text.

### 3.2 Sub-State Isolation (`Ghost` vs. `Compact`)

When one or more dimensions are toggled in `SubStateIsolatorDock`:
- **Non-matching Sub-States:** Dimmed (`opacity: 0.14`) in **`Ghost`** mode, or omitted from cards and decoupled branches in **`Compact`** mode.
- **Zero-Match Macro-States:** Collapse into compact dashed **Milestone Pills** (`S3`) on the spine so temporal ordering remains intact.
- **Dimension Thread (`isolationThread`):** Connects surviving matching Macro-States directly across Milestone Pill gaps in the active dimension's color.

### 3.3 Dynamic Wire Routing (`src/ui/canvas/layoutEdges.ts`)

- **Extraction (`extraction`):** Declaring Staging block → Inferred Object (`staging-out` → `obj-in`).
- **Continuity Spine (`spineHold`, `spineCut`, `spineMontage`):** Sequential `S1 → S2 → … → SN` links.
- **Curved Recall Arc (`recall`):** Establishing `S#` → recalled `S#` (`recall-out` → `recall-in`), rendered with a custom cubic bezier lift in `AuteurGraphEdge.tsx`.
- **Downstream Label Match (`labelMatch`):** Drawn on hover/click of an object (or when **`Show Threads`** is toggled). For Execution call sites, if `subnode-S#.#` is currently visible (parent Macro-State split into Sub-States), the wire routes directly to `subnode-S#.#`; otherwise it falls back cleanly to `node-S#` (deduplicated per target).

### 3.4 Explicit Z-Index Stacking Hierarchy

`<ReactFlow>` runs with **`zIndexMode="manual"`** and **`elevateEdgesOnSelect={false}`** so React Flow's automatic parent-elevation never lifts edges above cards inside Shot Chambers:

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

1. **Controlled Node Reconciliation & Live DOM Height Feedback (`src/ui/canvas/flowSync.ts`, `AuteurGraphView.tsx`):**
   - `AuteurGraphView` stores controlled `flowNodes` in React state and applies React Flow v13 `NodeChangeset` batches via `changes.applyTo(prev)` (preserving `dimensions`, `select`, and live `position` during dragging and `Shift+Drag` marquee multi-select).
   - `estimateWrappedLines()` in `layoutMetrics.ts` simulates real word-boundary wrapping (`whitespace-pre-wrap` + `break-words`) for frame-0 placement, and `AuteurGraphView` captures React Flow's actual DOM `dimensions` changes (`measuredHeights` with a `>= 2px` hysteresis threshold) into `buildCanvasLayout`, guaranteeing zero vertical overlap on tall `</>` Raw Input branches, Staging cards, decoupled Sub-States, and Shot Chamber containers.
   - When layout or hover/selection recomputes, `mergeLayoutIntoFlowNodes` preserves each existing node's `measured`, `selected`, `dragging`, active drag `position`, and `style` object reference whenever dimensions are unchanged—preventing React Flow's internal `ResizeObserver` from re-measuring nodes in a loop.
   - Ephemeral drag deltas `(dx, dy)` are committed to `nodeOffsets` only once a drag settles (`!change.dragging`), avoiding per-pixel layout recomputation during drags.
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
| `src/ui/canvas/canvasGraph.ts` | Pure `buildGraphSceneModel`, `mapSubStateKindToGraphDimension`, `tokenizeAnnotatedText`, and `createDefaultGraphExpansionState`. |
| `src/ui/canvas/layoutMetrics.ts` | Geometry constants, `GRAPH_Z_CHAMBER` / `GRAPH_Z_CARD`, character-count height heuristics, and `applyOffset`. |
| `src/ui/canvas/layoutEdges.ts` | Pure edge builders (`buildExtractionEdges`, `buildExecutionContinuityEdges`, `buildDownstreamLabelMatchEdges`). |
| `src/ui/canvas/canvasLayout.ts` | Deterministic 3-layer `LR` / `TB` node placement orchestrating `layoutMetrics.ts` and `layoutEdges.ts`. |
| `src/ui/canvas/flowSync.ts` | Pure `mergeLayoutIntoFlowNodes` reconciling layout specs with React Flow internal node state. |
| `src/components/canvas/AuteurGraphView.tsx` | Lazy-loaded React Flow shell, HUD/Dock/Inspector wiring, drag-offset capture, `fitView`, and `useUpdateNodeInternals`. |
| `src/components/canvas/*Node.tsx` | Thin `memo()`'d custom node renderers (`ZoneHeaderNode`, `StagingBlockNode`, `InferredObjectNode`, `ShotChamberNode`, `MacroStateNode`, `SubStateNode`, `RawTextBranchNode`). |
| `src/components/canvas/AuteurGraphEdge.tsx` | Custom edge renderer for standard bezier links, overhead curved `RECALL` arcs, and `EdgeLabelRenderer` pills. |
| `src/components/canvas/SculptedSubStateBody.tsx` & `AnnotatedProse.tsx` | Bespoke per-dimension Sub-State renderers and inline clickable entity chips. |
| `src/components/canvas/GraphHud.tsx`, `SubStateIsolatorDock.tsx`, `ObjectInspectorPanel.tsx`, `graphContext.tsx` | Floating chrome overlays and shared interaction context + CSS color variable mappers. |

### Safe Extension Recipes

- **Adding a new custom node type (e.g., visual reference thumbnail card or director note):**
  1. Add the node type to `CanvasNodeType` in `src/ui/canvas/types.ts` and emit it in `src/ui/canvas/canvasLayout.ts` with `zIndex: GRAPH_Z_CARD`.
  2. Create a `memo()`'d renderer under `src/components/canvas/`, register it in `NODE_TYPES` inside `AuteurGraphView.tsx`, and add any copy to `UI_LABELS.graph` in `src/ui/labels/editor.ts`.
- **Adding a new Isolation Dimension:**
  - Add the key to `GRAPH_DIMENSIONS` in `src/ui/canvas/types.ts`, map it in `mapSubStateKindToGraphDimension` (`canvasGraph.ts`), add its 4-theme CSS variable `--graph-dim-<key>` in `src/index.css`, map it in `getDimensionColorVar` (`graphContext.tsx`), and add its label to `UI_LABELS.graph.isolatorDimensions` (`src/ui/labels/editor.ts`).
