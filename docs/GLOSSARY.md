# Glossary — Pure Auteur Script (`v0.4.0`)

This document is the canonical domain vocabulary for **Pure Auteur Script** (`v0.4.0` Canonical Inline Syntax, 100% platform- and model-agnostic) and maps each concept directly to its representation in `src/core/`.

---

## 1. Critical Structural Disambiguation (Read First)

Do not conflate **Macro-Blocks**, **Macro-States**, **Sub-States**, **Sub-State Tags**, and the inline **`[BLOCK]`** tag:

| Term | Scope & Structural Role | Syntax Example | Codebase Mapping (`src/core/types.ts` · `irSchemas.ts`) |
|---|---|---|---|
| **Macro-Block ($B \in \mathcal{B}$)** | Document-level container separated by blank lines. Partitions the script into **Phase 1: STAGING** or **Phase 2: EXECUTION**. | Standalone header on its own line: `[INTENT]`, `[LOGIC]`, `[AESTHETIC]`, `[OPENING]`, `[EXECUTION]`, `[CONTINUITY PROTOCOL]` | `StagingBlock` / `ExecutionSection` · `StagingMacroBlockIR` (`MB0`…) / `ExecutionMacroBlockIR` |
| **Macro-State ($S_n$)** | One complete non-empty line inside `[EXECUTION]`, representing one atomic stretch of screen time ($S_1, S_2, \dots, S_n$). | `[CAM 01] MS, OTS Miller -> [ACT] Miller slides the folder -> <paper scrape>` | `ExecutionBeat` (`beat.index` = `1..N`) · `MacroStateIR` (`id: "S1"`, `"S2"`, …) |
| **Sub-State ($s_i$)** | One atomic segment inside a Macro-State line, separated by `->` (or `→`). Governs strictly one optical, physical, or acoustic dimension. | `[ACT] Miller slides the folder`, `Miller says {Look at the dates.}`, `<paper scrape>` | `SubStateNode` · `SubStateIR` (`id: "S1.0"`, `"S1.1"`, …, discriminated by `dimension`) |
| **Sub-State Tag ($\tau \in \mathcal{T}$)** | The leading uppercase bracketed label on a tagged Sub-State inside `[EXECUTION]`. Never starts a new Macro-Block. | `[CAM 01]`, `[CAM]`, `[ACT]`, `[BLOCK]`, `[LIGHT]`, `[STATE IN]`, `[STATE OUT]`, `[SPEED]`, `[VFX]` | `SubStateNode.tag` · `SubStateIR.subStateTag` (with `CAM` separating `identifier: "01" \| "02A" \| null`) |
| **`[BLOCK]` Tag** | An **inline Sub-State tag** used inside `[EXECUTION]` to lock 2D viewport coordinates for 3+ subjects or mark swaps. **Not** a Macro-Block container. | `[BLOCK] Miller frame-left FG facing screen-right; Ray frame-right MG facing screen-left` | `SubStateNode` (`kind: 'block'`) · `SubStateIR` (`dimension: 'block'`, `subStateTag: 'BLOCK'`) |

- **Strict 3-Level Hierarchy (`Macro-Block` → `Macro-State` → `Sub-State`)**:
  - A **Macro-Block (`MB#`)** is a document-level section (`[INTENT]`, `[LOGIC]`, `[AESTHETIC]`, `[OPENING]`, `[EXECUTION]`, etc.).
  - A **Macro-State (`S#`)** is strictly **a single non-empty line inside the `[EXECUTION]` Macro-Block** (`S1`, `S2`, …).
  - A **Sub-State (`S#.#`)** is **anything inside a Macro-State line**—each `->`-chained, single-dimension unit (`[CAM]`, `[ACT]`, `[BLOCK]`, `[LIGHT]`, `{dialogue}`, `<foley>`, `(score)`, `【text】`). Never refer to content *inside* a Macro-State line as a Macro-State; it is a **Sub-State**.
- **Narrative Beat vs. Shot vs. Macro-State**:
  - **Narrative Beat** *(storytelling / dramatic layer)*: A dramatic or rhythmic unit of story or action.
  - **Shot** *(cinematography / editorial layer)*: An unbroken camera take between cuts.
  - **Macro-State ($S_n$)** *(Auteur Script syntax layer)*: One single non-empty line in `[EXECUTION]`, composed of chained Sub-States ($S_n = \langle s_{\text{cam}}, s_{\text{act}}, s_{\text{dial}}, s_{\text{sfx}}, \dots \rangle$).
  - Often `1 Macro-State ≈ 1 shot ≈ 1 narrative beat`, but they are strictly **orthogonal**: a continuous oner shot routinely spans 5+ Macro-State lines, and a complex narrative beat can be split across 2+ Macro-State lines using camera persistence (`[CAM 01] ->`) for readability and temporal calibration. **Never call `[EXECUTION]` lines `"beats"` or Sub-States `"steps"` in UI copy, linter diagnostics, or AI prompts.**
- **Agent Shorthand & Codebase Alias Navigation**:
  | User / Agent Shorthand | Canonical Domain Term | UI Display | JSON IR ID / Field (`irSchemas.ts`) | Internal TS AST / React Alias |
  |---|---|---|---|---|
  | `MB` · `MB#` | **Macro-Block** | `Macro-Block` / `MB` | `MB0`, `MB1`, … (`stagingMacroBlocks`) | `StagingBlock` · `StagingBlockCard` |
  | `S` · `State` · `S#` *(never `MS` — collides with Medium Shot)* | **Macro-State** | `Macro-State` · `S1 → SN` | `S1`, `S2`, … (`macroStates`); Staging = `S0` | `ExecutionBeat` · `ExecutionBeatRow` *(legacy code alias)* |
  | `S#.#` · `SS` *(conversational shorthand)* | **Sub-State** | `Sub-State` / `Sub-States` | `S1.0`, `S1.1`, … (`subStates`) | `SubStateNode` |
- **Viewport Position vs. Orientation**:
  - **Position** (2D screen space): `frame-left`, `frame-center`, `frame-right` (or `screen-left`, `screen-right`) + depth planes `FG`, `MG`, `BG`.
  - **Orientation / Eyeline** (anatomical yaw): `facing screen-right`, `facing screen-left`, `in profile-left`, `back to camera`.
  - **Banned**: `stage-left` and `stage-right` (actor's stage-left equals viewer's `frame-right`, causing horizontal axis flips).

---

## 2. Master Framework Dictionary (27 Grounded Terms)

### Category 1: Staging Architecture

1. **Auteur Script**: A structured plain-text prompt framework organizing cinematic intent into static pre-production Staging ($S_0$) and dynamic sequential Execution Macro-States ($S_1 \dots S_n$). Acts simultaneously as a pre-visualization scaffold and a post-generation empirical diagnostic ledger.
2. **The Film Crew Mental Model**: Treating a generative video model like a skilled film crew rather than a deterministic code interpreter; the director supplies coordinates and boundaries while learned latent priors compute natural momentum, weight, and gap-filling.
3. **The 3 Core Pillars**: **Intent** (why the shot exists), **Aesthetic** (sensory world), and **Execution** (timeline progression), with no forced authoring order.
4. **The 2 Production Phases**: Partitioning every script into **Phase 1: STAGING** (static setup before camera rolls) and **Phase 2: EXECUTION** (rolling timeline). Governed by the **Phase Partition Law**: $\mathcal{B} = \mathcal{B}_{\text{staging}} \cup \mathcal{B}_{\text{execution}}, \ \mathcal{B}_{\text{staging}} \cap \mathcal{B}_{\text{execution}} = \emptyset$.
5. **Phase 1: STAGING ($S_0$)**: Static world rules, lookbook parameters, reference bindings, and opening still frame locked before motion begins. Contains zero sequenced action or motion verbs.
6. **Phase 2: EXECUTION ($S_1 \to \dots \to S_n$)**: Dynamic rolling timeline where camera optics, physical choreography, dialogue, and foley evolve Macro-State by Macro-State without restating static staging.
7. **`[INTENT]` Block**: Phase 1 Macro-Block answering *"Why does this shot exist?"* Written as one flowing sentence starting with `"Create …"` covering format, setting container, primary characters, stakes, and multimodal `@` bindings (`@image1 as Mark (voice: @audio1)`). Zero shot lists or play-by-play action.
8. **`[LOGIC]` Block (The Invariant Anchor)**: Phase 1 Macro-Block locking persistent physical laws (180° axis, screen direction, prop permanence/hand allocation, surface/centrifugal physics, match-on-action rules) in 1–3 dense sentences with zero bullets. Ends with `No subtitles appear on screen.` when dialogue exists and visible text is unwanted.
9. **`[AESTHETIC]` Block**: Phase 1 sensory lookbook formatted as `Label: Value` lines (`Medium`, `Palette`, `Lighting`, `Location`, `Wardrobe`, `Audio`). Also hosts optional shorthand token mappings (`Description -> TOKEN`, e.g., `LOC01`, `EV01`). Zero kinetic action or camera moves.
10. **`[OPENING]` Block ($S_0$)**: Phase 1 motionless first-frame anchor ($t = 0$) written as 2–4 sentences of plain prose locking optical canvas, viewport placement, pre-loaded hand grips, and eyeline heading. Strictly zero square-bracket `[TAG]` tokens, zero motion verbs, and zero audio cues.
11. **`[EXECUTION]` Block**: Phase 2 Macro-Block directing the sequential timeline ($S_1 \mapsto \dots \mapsto S_n$), one Macro-State per non-empty line. Accepts legacy execution header aliases `[TIMELINE]`, `[BEATS]`, and `[SHOTLIST]`.

---

### Category 2: State Mathematics & Timeline

12. **Thinking Notation**: Using compact state equations ($S_n = f(S_{n-1} \mid \text{STAGING})$) as the human director's mental state ledger, without claiming generative models deterministically execute state code.
13. **Macro-State ($S_n$)**: One complete non-empty line inside `[EXECUTION]` representing one continuous state interval ($\Delta t$) of screen time.
14. **Pre-Visualization Unit**: The cognitive function of a Macro-State line, allowing directors to mentally rehearse, reorder, and surgically insert state transitions before spending compute.
15. **Sub-State ($s_i$)**: An atomic coordinate segment inside a Macro-State line governed by the **Single-Dimension Law** (each Sub-State directs strictly one physical, optical, or acoustic dimension).
16. **Sub-State Tag ($\tau \in \mathcal{T}$)**: An inline uppercase bracketed label (`[CAM 01]`, `[CAM]`, `[ACT]`, `[BLOCK]`, `[LIGHT]`, `[STATE IN]`, `[STATE OUT]`, `[FOCUS]`, `[SPEED]`, `[PROP]`, `[ENV]`, `[CROWD]`, `[VFX]`, `[TRANS]`) separating cinematographer, choreographer, and spatial roles.
17. **Core Staging Equation ($S_n = f(S_{n-1} \mid \text{STAGING})$)**: Models each Macro-State $S_n$ as a directed mutation $f$ of the preceding state $S_{n-1}$, conditioned on the global invariant baseline $\text{STAGING} = \langle \text{INTENT}, \text{LOGIC}, \text{AESTHETIC}, S_0 \rangle$.
18. **Chaining Operator (`->` / `→`)**: Across lines, denotes sequential temporal Macro-States ($S_0 \to S_1 \to S_2$). Within a single `[EXECUTION]` Macro-State line, chains single-dimension Sub-States (camera perspective, physical performance, spoken dialogue, foley) into one synchronized state interval ($\Delta t$). *(Note: inside `[AESTHETIC]`, `->` is overloaded exclusively for shorthand token mapping `Description -> TOKEN`.)*
19. **The Core Dimensions (`v0.4.0` Canonical Inline Syntax)**:
    - **Camera**: `[CAM 01] …` (continuous/coverage) or `[CAM] …` (montage)
    - **Performance**: `[ACT] Subject active-verb …`
    - **Spoken Dialogue**: `Speaker says (delivery) {line}` (curly braces only, never quotes; supports `in Language`, `(O.S.)`, `(V.O.)`)
    - **Diegetic Foley**: `<short physical sound description>` (selective friction, triggers, and impacts)
    - **Opt-In Score**: `(instrumental description)` (only when music is requested)
    - **Opt-In On-Screen Text**: `【Exact text】` (only when visible titles/signs are requested)

---

### Category 3: Directorial Craft & Continuity

20. **Latent Priors**: Deep visual, anatomical, optical, and temporal patterns absorbed by generative video models from video datasets.
21. **Coordinate Fences**: Explicit spatial, optical, and physical boundary conditions written in the script to collapse latent ambiguity.
22. **Boundaries, Not Handcuffs**: Eliminating ambiguity at state transitions ($S_{n-1} \mapsto S_n$) while leaving learned priors room to render natural momentum without rigid second-by-second timestamps.
23. **State Inheritance ($S_n = f(S_{n-1})$)**: Every Macro-State in a continuous scene inherits the camera, posture, prop, and lighting state of the preceding Macro-State until explicitly mutated.
24. **Physical Baggage**: Accumulated physical reality—held props, hand allocation, core posture, fatigue, sweat, blood, mud, torn fabric—carried forward across Macro-States until released or cleaned.
25. **The Repetition Mandate**: Explicitly restating continuity-critical volatile conditions (exact hand holding each prop, posture, accumulated wear, screen placement) in an `[ACT]` Sub-State on every visible Macro-State line to counter token attention decay.
26. **Camera Persistence (`[CAM 01]`)**: Holding an established camera setup across consecutive lines (`[CAM 01] ->`) or recalling it cleanly later after cuts (`[CAM 01] ->`) without triggering unintended cuts or re-definition drift.
27. **Empirical Diagnostic Ledger**: Post-generation practice of using explicit script coordinates to isolate whether a visual error stems from *Prompt Omission*, *Vector/Axis Conflict*, *Temporal Slack / Cut Crowding*, or *Stochastic Latent Variance*.

---

## 3. Extended Structural & Audit Vocabulary

- **Block Extension Principle (Orthogonality)**: Downstream blocks inherit upstream Staging automatically without repeating static lookbook details (zero lookbook bleed) and never silently contradict upstream invariants.
- **Open Block Principle**: Custom Phase 1 Staging Macro-Blocks (`[CHARACTERS]`, `[CONTINUITY PROTOCOL]`, `[REFERENCES]`, `[STAGE]`) and legacy Phase 2 Execution aliases (`[TIMELINE]`, `[BEATS]`, `[SHOTLIST]`) are permitted so long as every block obeys the Phase Partition Law.
- **The 4 Scene Topologies**:
  1. **Continuous Oner (`[CAM 01]` throughout)**: Unbroken take; full state inheritance; lines 2+ use operator transitions (`PAN`, `CRANING`, `TRACKING`, `TILTING`, `PUSHING`), never static shot-scale re-declarations (**The Moving Oner Law**).
  2. **Multi-Camera Coverage (`[CAM 01]`, `[CAM 02]`, …)**: Continuous real-time scene with editorial cuts, holds (`HOLD`), and recalls (`RECALL`).
  3. **Parallel Cross-Cutting ($A_k \parallel B_k$)**: Dual independent state ledgers across two locations with zero cross-stream bleed.
  4. **Discontinuous Montage (plain `[CAM]`)**: Inheritance severed between lines; each line anchors its own subject, setting/token, and light cue.
- **Macro-State Resolution Rule**: Never terminate a Macro-State line on spoken `{dialogue}`; always chain into an immediate `[ACT]` physical follow-through or `<foley>` trigger.
- **Cut-Latency Floor & Temporal Slack (Anti-Float Rule)**: Cut sequences need ~1.5s–2.5s per shot to stabilize (max $\text{Duration} \div 2.0$ cuts); action oners target ~0.8s–1.2s per Macro-State so excess time per Macro-State does not cause low-gravity floating.
- **Tagless Export (`exportTagless`)**: Stripping inline bracketed Sub-State tags (`[CAM 01]`, `[ACT]`, `[BLOCK]`, etc.) for tight character budgets while preserving the `->` sequence and dropping empty bare camera holds so no line begins with a dangling `->`.
- **The 5 Script Supervisor Audit Lenses**:
  - **Lens 1 — Spatial & Optics**: 180° axis, viewport coordinates, $S_0 \to S_1$ handoff, camera numbering/oner continuity.
  - **Lens 2 — Temporal, Pacing & Wear**: Macro-State-to-duration calibration, physical wear persistence, plausible velocity.
  - **Lens 3 — Props & Inventory**: Explicit left/right/both hand allocation and unbroken prop lifecycle.
  - **Lens 4 — Acoustics & Voice**: Selective `<foley>`, room tone isolated in `[AESTHETIC]`, `(O.S.)`/`(V.O.)`, Macro-State resolution rule.
  - **Lens 5 — Blocks & Grammar**: Block orthogonality, Single-Dimension Law, `@ref` isolation in Staging, frozen `[OPENING]` purity.
- **Camera Identifier (`identifier`)**: The numeric or alphanumeric camera setup slot attached to a `CAM` Sub-State Tag (`[CAM 01]` → `subStateTag: "CAM"`, `identifier: "01"`; `[CAM 02A]` → `identifier: "02A"`). Unnumbered montage shots (`[CAM]`) use `identifier: null`.
- **Token Mapping (`Description -> TOKEN`)**: Shorthand lookbook aliases declared inside `[AESTHETIC]` `key: value` entries (e.g., `Location: dim room -> LOC01`) and indexed in `derived.tokenMappings` for reuse across `[EXECUTION]`.
- **Reference Binding (`@ref as Name (voice: @audio)`)**: Multimodal identity and voice bindings declared in Phase 1 Staging (`[INTENT]`, `[CHARACTERS]`, `[REFERENCES]`, `[CONTINUITY PROTOCOL]`) and indexed in `derived.referenceBindings`.
- **Programmatic JSON IR (`AuteurScriptIR` / `AuteurEnvelope` / `AuteurPatch` / `AuteurLensSlice`)**: Glossary-aligned, Zod-validated JSON interchange layer (`docs/JSON_IR_SPEC.md`) enabling programmatic creation, transactional ID-addressed editing, and dimension-isolated Script Supervisor evaluation while keeping canonical plain text as the single source of truth.

