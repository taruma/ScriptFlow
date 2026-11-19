# 01 — Auteur Script: Master Builder Brief & Bundle Map

> **Bundle Role**: `File 1 of 7` — Primary Orientation, Formal AST Specification, and Bundle Navigation  
> **Target Consumer**: Stateless AI Agents building tooling (parsers, linters, validators, visualizers, editors, staging/timeline apps)  
> **Specification Lock**: Pure Auteur Script (`v0.4.0` Canonical Inline Syntax) — **100% Platform- & Model-Agnostic**  
> **Exclusions**: Contains zero video model/platform brand names, zero legacy `[AUDIO]`/`[DIAL]`/`"quoted dialogue"` syntax, and zero external wrapper dialects.

---

## Content Manifest (What Is Inside This File)

| Section | Title | Contents |
|---|---|---|
| **§1** | **7-File Handoff Map** | Overview of all 7 files in this folder and when to read each |
| **§2** | **Core Philosophy & Mental Model** | Film Crew model, Thinking Notation, 5 Lenses, Beat vs. State, Pre-Generation Editing |
| **§3** | **Document Architecture & Two-Phase Grammar** | Phase Partition Law, Block Extension Principle (Orthogonality), Macro-Block Contracts |
| **§4** | **Canonical Inline Syntax (`v0.4.0`)** | Sub-States, `->` chaining, `[CAM]`, `[ACT]`, `{dialogue}`, `<foley>`, `(score)`, `【text】`, Tier-2 tags |
| **§5** | **Spatial, Temporal & Continuity Invariants** | 4 Scene Topologies, Orthogonal Viewport Coordinates, 180° Axis, Beat-to-Duration Calibration, 5 Audit Lenses |
| **§6** | **Parser & Visualizer Implementation Notes** | Structural parsing rules, regex edge cases, `->` collision pitfalls, camera state machine |
| **§7** | **Complete Canonical Reference Script** | End-to-end 5-block reference exhibit |

---

## 1. The 7-File Handoff Bundle Map

This folder packages the entire Auteur Script knowledge base, visual design system, and editor technical specification into **7 self-describing Markdown files** so you have complete domain context without scanning external repositories:

| File | Scope | Primary Use for Tooling Builders |
|---|---|---|
| **`01_MASTER_BRIEF_AND_MAP.md`** *(this file)* | Unified architecture, syntax spec, invariants, parser edge cases | Read **first** for complete structural & parsing orientation |
| **`02_SYNTAX_SPEC_MODULES_AND_EXAMPLES.md`** | Normative `v0.4.0` specification, 5 worked scripts, and optional production modules (`@` bindings, token mapping, multi-clip continuation) | Reference for prompt generation rules, extension modules, and test fixtures |
| **`03_CORE_THEORY_GRAMMAR_AND_GLOSSARY.md`** | North Star intent, 7-point litmus test, state mathematics, formal block contracts, and 27-term grounded glossary | Reference for domain ontology, mathematical equations, and UI copy/definitions |
| **`04_AUDIT_EMPIRICS_AND_PARSERS.md`** | Script Supervisor Audit Engine (4 topologies, 5 lenses, repair recipes), empirical spatial/temporal lab notes, and two working Lua parser/renderer implementations | Reference for building linters, continuity validators, AST parsers, and syntax highlighters |
| **`05_VECTOR_FILM_ARTICLES_AND_CASE_STUDIES.md`** | Five curated production essays & case studies (*5 Lenses*, *From Code to Cinema*, *Three Years Late*, *Coordinates for Three*, *What Comes Before the Prompt*) | Reference for real-world creator UX, 15×15m staging patterns, and pre-script Writer's Room workflows |
| **`06_VISUAL_DESIGN_SYSTEM.md`** | Stationery/blueprint UI theme engine (`Light`/`Warm`/`Dark`/`Pure Black`), 3-font triad, `UI_TOKENS`, Auteur Script syntax/cue colors, and Master-Detail layout invariants | Reference for frontend UI styling, syntax highlighting, timelines, and visual parity with the studio suite |
| **`07_EDITOR_TECHNICAL_SPEC.md`** | Complete Product & Technical Specification for the web-based Auteur Script Editor (Live Waterfall UI, Plain-Text-as-Truth, zero-React `src/core/`, 5 V1 linter rules, Vitest suite, SSOT docs) | Implementation blueprint for building the single-page Auteur Script Editor app |

---

## 2. Core Philosophy & Mental Model (Why Tooling Must Respect This)

If you are building software for Auteur Script, you are not building a generic "prompt enhancer" or a deterministic 3D keyframe engine. You are building a **cognitive pre-visualization scaffold and empirical diagnostic ledger** for a human director.

### 2.1 The Film Crew Model & Thinking Notation
- **Probabilistic Engines, Not Deterministic Code**: Generative video models rely on learned visual, anatomical, and temporal *latent priors* absorbed from video datasets. They do not execute deterministic physics code.
- **Coordinate Fences ("Boundaries, Not Handcuffs")**: An Auteur Script eliminates spatial and physical ambiguities at boundary points ($S_{n-1} \mapsto S_n$) so the model's priors can interpolate natural momentum, weight, and micro-acting without artificial second-by-second timestamps.
- **Thinking Notation**: State equations such as $S_n = f(S_{n-1} \mid \text{STAGING})$ are the creator's **mental state ledger**, not claims about neural network internals.
- **Dual Function in One Artifact**:
  1. **Pre-Generation (Pre-Visualization Scaffold)**: Forces the director to separate camera optics, physical blocking, performance, and sound before spending compute. Unlocks **surgical pre-generation editing**—inserting a micro-reaction between two spoken lines without rewriting the scene.
  2. **Post-Generation (Empirical Diagnostic Ledger)**: When a generated clip diverges from intent, explicit coordinates let the director isolate whether the cause was a missing/conflicting script instruction, temporal slack, or stochastic latent variance.

### 2.2 The 5 Lenses of AI Filmmaking
From Taruma Sakti's essay *You Can Engineer a Pipeline, But You Can't Hack Intent*:
1. **Behavioral Lens (Observation)**: Prompt and observe; expensive trial-and-error.
2. **Procedural Lens (Workflow)**: Repeatable node/tool recipes; brittle when foundation models update.
3. **Diagnostic Lens (Evaluation)**: **Where Auteur Script lives.** Diagnosing *why* a generation succeeded or broke at the coordinate and attention-window level.
4. **Architectural Lens (Theorycrafting)**: Reasoning about tokenization, attention distribution, context windows, and latent space before rendering.
5. **Cinematic Lens (Intent & Taste)**: Separating *technical* failures (likeness drift, jitter) from *cinematic* failures (wrong shot scale, missing silence).

### 2.3 Beat vs. State & Writer's Room Separation
- **Beat vs. State**: In traditional screenwriting, a *beat* is a unit of dramatic or emotional shift. In Auteur Script, a **Macro-State ($S_n$)** is an atomic audio-visual slice of screen time ($S_n = \langle s_{\text{cam}}, s_{\text{act}}, s_{\text{dial}}, s_{\text{sfx}}, \dots \rangle$).
- **Writer's Room Separation**: Story canon, character dossiers, and dialogue iteration happen *upstream* of Auteur Script (`Dialogue Script` $\to$ `Performance Screenplay` $\to$ `Auteur Script`). Auteur Script is the stage-and-camera execution specification, not a novel or lore bible.

---

## 3. Document Architecture & Two-Phase Grammar

An Auteur Script is **plain text only** (no Markdown bolding, bullets, or code fences inside the script payload). It is partitioned into **Macro-Blocks** separated by **exactly one blank line**.

### 3.1 The Phase Partition Law

$$\mathcal{B} = \mathcal{B}_{\text{staging}} \cup \mathcal{B}_{\text{execution}}, \quad \mathcal{B}_{\text{staging}} \cap \mathcal{B}_{\text{execution}} = \emptyset$$

| Phase | Purpose | Macro-Blocks | Motion Verbs / Timeline? |
|---|---|---|---|
| **Phase 1: STAGING ($S_0$)** | Pre-production setup before camera rolls | `[INTENT]`, `[LOGIC]`, `[AESTHETIC]`, `[OPENING]` + custom staging blocks (`[CHARACTERS]`, `[CONTINUITY PROTOCOL]`, `[REFERENCES]`, `[STAGE]`) | **Strictly NO** sequenced actions or motion verbs |
| **Phase 2: EXECUTION ($S_1 \dots S_n$)** | Rolling camera timeline | `[EXECUTION]` (or `[TIMELINE]` / `[BEATS]` variants) | **Yes** — 1 Macro-State per non-empty line |

### 3.2 The Block Extension Principle (Orthogonality)
1. **Forward Inheritance**: Everything locked in Staging cascades automatically into `[EXECUTION]`.
2. **Zero Redundancy (Anti-Bloat)**: `[OPENING]` never repeats static `[AESTHETIC]` details (wardrobe, lighting formulas, room architecture); `[EXECUTION]` directs only what *mutates* ($\Delta S$) plus volatile continuity anchors (hand grips, posture, wear).
3. **Non-Contradiction**: Downstream blocks cannot silently override upstream staging without an explicit mutation event (e.g., `[LIGHT]` switching off a lamp).

### 3.3 Canonical Macro-Block Contracts

| Block Header | Format & Length | Responsibility | Strict Negative Boundary |
|---|---|---|---|
| **`[INTENT]`** | 1 flowing sentence starting with `"Create …"` | Deliverable medium/format, setting container, primary characters, dramatic stakes, and multimodal `@` bindings (`@image1 as Mark (voice: @audio1)`). For video extension: `"Create a seamless cinematic continuation of @video1 featuring …"`. | No colon labels (`Format:`), no shot lists, no play-by-play action, no lore dump. |
| **`[LOGIC]`** | 1 dense paragraph (1–3 sentences, zero bullets) | Affirmative physical invariants (`Maintain`, `Preserve`, `Anchor`, `Track`): 180° axis, screen direction, prop permanence/hand allocation, surface/centrifugal physics, match-on-action rules. Ends with `No subtitles appear on screen.` when dialogue exists and on-screen text is unwanted. | No meta-prompt instructions (shot counts, word limits), no aesthetic lookbook prose. |
| **`[CHARACTERS]`** *(optional)* | Plain lines before `[AESTHETIC]` or `[OPENING]` | Dedicated `@actor` / `@image` casting ledger for 4+ character ensembles. | No kinetic action; downstream blocks use canonical names only (never repeat `@` tags). |
| **`[CONTINUITY PROTOCOL]`** *(optional)* | Dense paragraph before `[OPENING]` | Replaces or supplements `[LOGIC]` when continuing from `@video1` / `@PREVIOUS_CLIP`: binds terminal frame geometry, rendering style/lighting, momentum, and prop grips. | No new unrelated story exposition. |
| **`[AESTHETIC]`** | `Label: Value` lines (typically 4–7 lines) | Sensory lookbook: `Medium`, `Palette`, `Lighting`, `Location` (precise architectural/material terms), `Wardrobe` (head-to-footwear; semicolons for 1–2 chars or `Wardrobe Name:` lines for ensembles), `Audio` (persistent diegetic room tone only; no score unless requested). Also hosts `-> TOKEN` mappings if used. | Zero kinetic action, zero camera moves, zero timeline progression. |
| **`[OPENING]`** | 2–4 sentences (40–70 words), plain prose | Motionless $t = 0$ still canvas ($S_0$) locking 4 coordinates: (1) optical canvas (shot scale, angle, height), (2) viewport placement (`frame-left/center/right`, `FG/MG/BG`) & set contact, (3) pre-loaded hand grips (`left/right/both`), (4) eyeline heading & visible background anchors. | **Zero square-bracket tags**, zero motion verbs, zero off-screen characters, zero audio cues. |
| **`[EXECUTION]`** | One Macro-State ($S_n$) per non-empty line | Rolling timeline chained left-to-right with `->`. Line 1 ($S_1$) must inherit `[OPENING]` ($S_0$) with zero jump. | No repeating static wardrobe or static room architecture. |

---

## 4. Canonical Inline Syntax (`v0.4.0`, Platform-Agnostic)

### 4.1 Macro-States, Sub-States & The Chaining Operator (`->`)
- **Macro-State ($S_n$)**: One complete non-empty line inside `[EXECUTION]`.
- **Sub-State ($s_i$)**: An atomic segment inside a Macro-State separated by `->` (parsers should also accept Unicode `→`).
- **Single-Dimension Law**: Each tagged Sub-State governs strictly one dimension.
- **Hierarchical Layering Within a Line**: `->` orders causal priority within one synchronized beat interval ($\Delta t$):  
  `[CAM 01] ... -> [ACT] ... -> Speaker says (delivery) {line} -> [ACT] ... -> <foley>`
- **Tag Syntax Rule**: Bracketed tags open with an uppercase label followed by a **single space** outside the brackets (`[ACT] John grips...`, never `[ACT: ...]` or `[ACT:]`).

### 4.2 Core Syntax Elements

| Dimension | Canonical Syntax | Rules & Variants |
|---|---|---|
| **Camera** | `[CAM 01] …` or `[CAM] …` | Numbered (`[CAM 01]`, `[CAM 02]`) for continuous scenes and coverage recall; plain unnumbered `[CAM]` strictly for discontinuous montages/teasers. Multiple `[CAM]` tags may chain mid-line for intra-shot moves. |
| **Performance** | `[ACT] Subject active-verb …` | Present tense, active voice, explicit subject (never dangling participles like `gripping`). Literal photographable anatomy, never abstract emotions (`terrified`, `sad`). Supports compound action and sequential `[ACT] -> [ACT]`. |
| **Spoken Dialogue** | `Speaker says (delivery) {line}` | **Curly braces `{...}` ONLY** (never quotation marks). Optional parenthetical precedes `{...}`. Off-screen/voiceover: `(O.S.)`, `(V.O.)`, or combined `(O.S., flat)`. Non-English: `Speaker says in French (calmly) {C'est fini.}`. |
| **Foley / SFX** | `<short physical sound description>` | Angle brackets `<...>`. Selective only (models infer routine footsteps/motion): deploy for (1) unique material friction, (2) off-screen catalysts, (3) dramatic impacts. Ongoing discrete sounds repeat across lines (`<low predator growl continues>`). |
| **Score (opt-in only)** | `(instrumental description)` | Parentheses `(...)`. Included **only** when music is explicitly requested; default audio is 100% diegetic. |
| **On-Screen Text (opt-in)** | `【Exact text】` | Lenticular brackets `【...】`. Used only when visible titles/signs/subtitles are desired. |

### 4.3 Mandatory Macro-State Resolution Rule
- **Never end a Macro-State line on spoken dialogue.** Speech must always chain into an immediate physical follow-through in `[ACT]` or an acoustic trigger `<...>` (e.g., `... -> Arthur says {Don't run.} -> [ACT] Rosa retreats two steps -> <sharp intake of cold air>`).

### 4.4 Optional Tier-2 Coordinates & Production Extensions

| Element | Syntax / Placement | When Used |
|---|---|---|
| **`[BLOCK]`** | `[BLOCK] Miller frame-left FG facing screen-right; Ray frame-right MG facing screen-left` | On-demand spatial fence when 3+ subjects share the frame, marks swap, or room geometry risks drift. **Never confuse with a Macro-Block container.** |
| **`[LIGHT]`** | `[LIGHT] red and blue strobes sweep across his face` | Dynamic in-shot lighting changes (flashes, headlights, lamp off). Static lighting belongs in `[AESTHETIC]`. |
| **`[FOCUS]`**, **`[SPEED]`**, **`[PROP]`**, **`[ENV]`**, **`[CROWD]`**, **`[VFX]`**, **`[TRANS]`** | `[TAG] single-dimension mutation` | Deployed only when that isolated dimension mutates independently of `[CAM]` and `[ACT]` (e.g., `[SPEED] 120fps slow-motion impact`, `[VFX] stone disc levitates`, `[TRANS] Fade to white`). |
| **`[STATE IN]` / `[STATE OUT]`** | `[STATE IN] Mark's left hand on rail -> [ACT] … -> [STATE OUT] Mark planted, rail released` | Explicit head/tail boundary clamps for multi-clip stitching or high-risk continuity handoffs. |
| **Token Mapping** | Declared in `[AESTHETIC]`: `Description -> TOKEN` (e.g., `... -> LOC01`, `... -> EV01`) | Multi-location or multi-wardrobe scenes; downstream blocks reference compact `TOKEN`. |
| **Reference Assets** | `@image1`, `@actor1`, `@audio1`, `@video1`, `@PREVIOUS_CLIP` | Declared exclusively in `[INTENT]`, `[CHARACTERS]`, or `[CONTINUITY PROTOCOL]`. |

---

## 5. Spatial, Temporal & Continuity Invariants (For Validators, Visualizers & Editors)

### 5.1 The 4 Scene Topologies

| Topology | Camera Token Rule | State Inheritance |
|---|---|---|
| **1. Continuous Oner** | `[CAM 01]` throughout. Line 1 sets framing; subsequent lines direct **operator transitions only** (`[CAM 01] CRANING DOWN ->`, `[CAM 01] TRACKING LEFT ->`). **The Moving Oner Law**: re-declaring a static shot scale (`[CAM 01] Low-angle FS`) mid-oner triggers a jump cut. | Full unbroken carryover ($S_{n-1} \to S_n$). |
| **2. Multi-Camera Coverage** | Numbered setups (`[CAM 01]`, `[CAM 02]`, …). `[CAM 01] ->` holds current framing; switching to `[CAM 02] CU on Ray ->` cuts; writing `[CAM 01] ->` later recalls the original setup without re-describing lens/angle. | Full carryover across cuts. |
| **3. Parallel Cross-Cutting ($A_k \parallel B_k$)** | Setup-numbered cameras (`[CAM 01]` in Location A, `[CAM 02]` in Location B) with re-anchored location cues on switches. | **Dual independent state ledgers**: $A_k$ inherits from $A_{k-1}$ only (zero cross-stream bleed). |
| **4. Discontinuous Montage / Teaser** | Plain unnumbered `[CAM]` on every line. | **Severed between lines**: each line supplies its own subject, wardrobe/setting cue (or token), and light cue. |

### 5.2 Spatial Coordinates & The 180° Axis
Position and orientation are **strictly orthogonal**:
- **Viewport Position (2D Screen Space)**: `frame-left`, `frame-center`, `frame-right` (or `screen-left`, `screen-right`) and depth planes `FG` (foreground), `MG` (midground), `BG` (background).
  - **Banned terms**: `stage-left`, `stage-right` (actor's stage-left equals viewer's `frame-right`, causing 50/50 horizontal flips).
- **Anatomical Orientation / Eyeline**: `facing screen-right`, `facing screen-left`, `in profile-left`, `three-quarter profile right`, `back to camera`. Never use `profile-left` alone as a spatial coordinate.
- **180° Line of Action**: In shot-reverse-shot coverage, if Subject A is `frame-left facing screen-right`, reverse cuts to Subject B must place them `frame-right facing screen-left`. Crossing the line requires an explicit arcing camera move, neutral frontal/POV buffer shot, or physical re-blocking.
- **Macro-Set Anchor Pattern (*Three Years Late*)**: For complex multi-person ensembles, lock characters to physical architectural anchors (e.g., a 15×15m grid with 4 cardinal anchors) and establish all camera setups (`[CAM 01]`–`[CAM 05]`) inside the initial clip context window before extending.

### 5.3 Temporal Calibration & The Cut-Latency Floor
Empirical findings (`04_AUDIT_EMPIRICS_AND_PARSERS.md`, Document 4B) show generative video models distribute temporal attention uniformly across the target clip duration:
- **Cut-Latency Floor (Cut Mode)**: Models require **1.5s–2.5s per shot** to stabilize a new scene latent. Never exceed $\text{Duration} \div 2.0$ cuts (max 2–3 shots in 5s; 4–5 shots in 10s).
- **Continuous Oner Beat Calibration (`[CAM 01]`)**:
  - High-velocity combat / chase / parkour: **0.8s–1.2s per Macro-State line** (4–5 lines for 5s; 8–10 lines for 10s).
  - Tactical action / standoff: **1.5s–2.0s per line**.
  - Dramatic dialogue / coverage: **2.5s–4.0s per line** (under 2s compresses lip-sync unnaturally).
  - Slow horror / atmospheric noir: **4.0s–6.0s+ per line**.
- **Anti-Float Rule ("Temporal Slack")**: Stretching too few beats over a long action clip (e.g., 5 combat lines in 10s) creates unused time per beat, causing subjects to float in low-gravity slow motion.

### 5.4 The Repetition Mandate & 5 Supervisor Audit Lenses
Because token attention decays across lines, volatile conditions must be restated in `[ACT]` on every visible line until mutated:
1. Exact hand holding each prop (`left`, `right`, `both`)
2. Core posture (`crouched`, `seated`)
3. Accumulated physical wear (`blood`, `sweat`, `mud`, `torn fabric`)
4. Screen placement and facing vector

**5 Audit Lenses**: (1) Spatial & Optics, (2) Temporal, Pacing & Wear, (3) Props & Inventory (`Held -> Used -> Released`), (4) Acoustics & Voice, (5) Block & Tag Orthogonality.

---

## 6. Parser & Visualizer Implementation Notes

Two Pandoc/Quarto Lua renderers exist in the ecosystem (included verbatim in `04_AUDIT_EMPIRICS_AND_PARSERS.md`). If you are building a TypeScript/Python/Rust parser or visual UI, handle these mechanics and edge cases:

### 6.1 Structural Parsing Rules
1. **Macro-Block Detection**: A standalone line matching `^\[([A-Z0-9 _%-]+)\]$` starts a Macro-Block. Once `[EXECUTION]` (or `[TIMELINE]` / `[BEATS]`) is entered, **subsequent `[TAG]` tokens are Sub-State tags, NOT Macro-Block headers**. (`[BLOCK]` only appears inline inside `[EXECUTION]`, never as a standalone header.)
2. **Macro-State Line Splitting**: Inside `[EXECUTION]`, every non-empty line is one Macro-State ($S_n$).
3. **Chaining Split (`->` / `→`)**: Split each Macro-State line on `\s*(?:->|→)\s*`.
   - **Pitfall**: Inside `[AESTHETIC]`, `->` is used for **token mapping** (`Description -> LOC01`), NOT Sub-State chaining. Only split Sub-States inside `[EXECUTION]`.
4. **Sub-State Classification**:
   - Starts with `[TAG]` (`[CAM 01]`, `[CAM]`, `[ACT]`, `[BLOCK]`, `[LIGHT]`, `[VFX]`, `[TRANS]`, `[STATE IN]`, `[STATE OUT]`, etc.).
   - Starts with `<...>` $\to$ Foley / SFX.
   - Starts with `(...)` $\to$ Music / Score (check that it spans the full Sub-State, not a dialogue delivery note).
   - Starts with `【...】` $\to$ On-screen text.
   - Matches spoken dialogue pattern $\to$ Dialogue.

### 6.2 Dialogue & Reference Regex Pitfalls
- **Dialogue Pattern Variations Observed**:
  - `Speaker says (delivery) {line}`
  - `Speaker says {line}`
  - `Speaker says (O.S.) {line}` or `Speaker says (O.S., flat) {line}`
  - `Speaker says O.S. (strained protest) {line}`
  - `Speaker says in French (calmly) {line}`
  - **Parser Recommendation**: Anchor on:  
    `^(?<speaker>[A-Za-z0-9 _-]+?)\s+says(?:\s+in\s+(?<lang>[A-Za-z-]+))?(?:[\s,]+(?<mods>[^\{]+?))?\s*\{(?<line>[^\}]+)\}$`
- **Entity & Token Extraction**:
  - Multimodal bindings in Staging: `@(?<ref>[A-Za-z0-9_-]+)\s+as\s+(?<label>[A-Za-z0-9_-]+)` (optionally followed by `(voice:\s*@(?<voice>[A-Za-z0-9_-]+))`).
  - Aesthetic token mappings in `[AESTHETIC]`: `->\s*([A-Za-z0-9_-]+)` (separated by `;` on `Location Mapping:` / `Wardrobe Mapping:` / `Props Mapping:` lines).
  - **Practical Model Caveat**: In `[AESTHETIC]`, natural phrasing (`Wardrobe: Arthur in a deep-olive henley...`) adheres better in video models than detached `Wardrobe Arthur: ...` metadata lines if wardrobe isn't baked into `@` portraits. Parsers should accept both `Wardrobe:` and `Wardrobe Name:` lines.

### 6.3 Camera State Machine Semantics for Visualizers
- `[CAM 01] MS, OTS Miller -> ...` establishes camera slot `CAM 01` with its optical framing.
- `[CAM 01] -> ...` (empty descriptor between `[CAM 01]` and `->`) = **Hold or Recall `CAM 01`** (inherits last framing stored for `CAM 01`).
- `[CAM 01] PAN LEFT -> ...` or `[CAM 01] CRANING DOWN -> ...` = **Intra-shot operator transition** on active `CAM 01` (no cut).
- `[CAM 02] CU on Ray -> ...` = **Editorial cut** to slot `CAM 02`.
- `[CAM] ...` (unnumbered) = Standalone shot cut in montage mode (resets frame state).

---

## 7. Complete Canonical Reference Script (`v0.4.0` Inline Syntax)

```text
[INTENT]
Create a tense neo-noir thriller scene set in a dim concrete interrogation room, featuring detectives Miller and Park pressing a defiant suspect named Ray across a steel table.

[LOGIC]
Keep the table as the axis, with Miller and Park on one side facing screen-right and Ray opposite facing screen-left. Preserve the lit cigarette in Ray's right hand and the manila folder under Miller's left palm until someone moves them. No subtitles appear on screen.

[AESTHETIC]
Medium: 35mm film, 2.39:1 anamorphic, muted charcoal and amber tungsten
Lighting: single amber overhead downlight, deep falloff into the corners
Location: concrete interrogation room, scuffed linoleum floor, steel table bolted down, one-way mirror
Wardrobe: Miller in a rumpled beige trench coat; Park in a grey suit with a loosened tie; Ray in an orange mechanic's jumpsuit with cuffed wrists
Audio: fluorescent ballast hum, muffled hallway footsteps

[OPENING]
MS at eye level, framed over Miller's shoulder toward Ray seated across the steel table. Frame-left foreground, Miller sits facing screen-right with his left palm pressed on a manila folder. Frame-left background, Park stands against the wall facing screen-right, arms folded. Frame-right midground, Ray slouches facing screen-left in the amber downlight, a lit cigarette pinched in his cuffed right hand.

[EXECUTION]
[CAM 01] MS, OTS Miller -> [BLOCK] Miller frame-left FG facing screen-right; Park frame-left BG facing screen-right; Ray frame-right MG facing screen-left -> [ACT] Miller slides the manila folder across the steel with his left palm while smoke curls from the cigarette in Ray's right hand -> Miller says {Look at the dates, Ray.} -> [ACT] Park shifts his weight against the wall, arms still folded
[CAM 02] CU on Ray -> [ACT] Ray tilts his head back facing screen-left and exhales smoke through narrowed eyes, cuffed wrists resting on the table, cigarette pinched in his right hand -> Ray says (unhurried) {Dates don't mean a thing.} -> Miller says (O.S., flat) {They mean twenty years.} -> [ACT] Ray taps ash onto the steel with his right hand
[CAM 01] -> [ACT] Miller leans forward and plants both palms flat on the folder -> [ACT] Park, in the background, uncrosses his arms and takes one step toward the table -> <steel table groaning under Miller's weight>
```
