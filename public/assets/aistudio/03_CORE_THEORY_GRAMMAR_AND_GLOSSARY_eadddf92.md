# 03 — Auteur Script: Core Theory, State Mathematics & Master Glossary

> **Bundle Role**: `File 3 of 7` — Philosophical North Star, Mathematical State Model, Block Orthogonality Contracts & Grounded Dictionary  
> **Target Consumer**: Stateless AI Agents building tooling (domain modeling, schema design, UI labels/tooltips, educational/onboarding UX)  
> **Specification Lock**: Pure Auteur Script (`v0.4.0` Canonical Inline Syntax) — **100% Platform- & Model-Agnostic**

---

## Content Manifest (What Is Inside This File)

This file merges four cleanly separated foundational theory documents:

| Part | Document Title | Source Origin (Cleaned & Unified) | Contents |
|---|---|---|---|
| **Document 3A** | **Framework North Star & 7-Point Concept Litmus Test** | `FRAMEWORK_INTENT.md` | Core pre-visualization thesis, Framework vs. User boundary table, 7-point litmus test, negative boundary matrix |
| **Document 3B** | **The Auteur Script Blueprint (State Math & Conceptual Model)** | `grammar/conceptual_model.qmd` | 3 Pillars, 2 Production Phases, State Vector & Staging Equations ($S_n = f(S_{n-1} \mid \text{STAGING})$), *What Remains* exhibit (upgraded to `v0.4.0` inline syntax), Latent Priors, State Inheritance & Diagnostic Loop |
| **Document 3C** | **Block Grammar & Orthogonality Contracts** | `grammar/block_rules.qmd` | Macro-Block vs. Sub-State Tag disambiguation, 5 Block Contracts, Block Extension Principle, Open Block Principle ($B \in \mathcal{B}$) |
| **Document 3D** | **Master Framework Dictionary (27 Grounded Terms)** | `grammar/glossary.yml` | Complete 27-term ontology across *Staging Architecture*, *State Mathematics & Timeline*, and *Directorial Craft & Continuity* |

---

================================================================================
## Document 3A: Framework North Star & 7-Point Concept Litmus Test
================================================================================

> *"Control is an illusion; intent is everything."* — Taruma Sakti

### 1. Core Thesis & The North Star

**Auteur Script is first and foremost a cognitive pre-visualization scaffold for the human director, not a pixel-control protocol for the machine.**

#### 1.1 Meeting the Machine Halfway
In early AI prompting, creators attempted to exert rigid, deterministic control over every pixel. But as modern video models advanced beyond basic keyword matching to leverage deep visual, physical, and temporal priors absorbed from massive video datasets, generation became a collaborative process. The director provides the structural blueprint, intent, and physical coordinates; the model draws upon its learned priors to calculate the latent rendering.

> *"A script isn't just a description—it's a set of instructions designed to trigger an experience."*

Under this paradigm, the model acts like a **skilled film crew**: the human director establishes coordinates and boundaries in Staging and Execution, while the model draws upon its learned physical priors to calculate natural momentum, weight, and gap-filling.

```text
[ Human Mental Cinema ] ──(Pre-Visualize)──> [ Auteur Script Scaffold ] ──(Scan Intent)──> [ Model Latent Render ]
                                                        ▲
                                                        │ (Post-Mortem Diagnostic)
                                                        └──────── Evaluate Output Divergence ────────┘
```

#### 1.2 Human Cognitive Beats Over Artificial Timestamps
Modern video models can follow exact second timestamps (`00:00-00:03`), but second-accurate timestamps are unnatural for human pre-visualization:
- Humans do not instinctively imagine cinematic pacing in exact seconds.
- Humans imagine pacing through **causal state progressions and narrative beats** ($S_0 \mapsto S_1 \mapsto S_2$).
- State-transition chains (`->`) mirror natural human cognitive sequencing while giving the generative model explicit directional flow.
- Within a single execution line, `->` establishes **multi-modal synchronization and causal priority** (optical framing $\to$ actor performance $\to$ spoken line $\to$ foley contact), which the model translates into a continuous synchronized beat interval ($\Delta t$).

#### 1.3 The Dual Purpose: Pre-Visualization & Empirical Diagnostic Loop
1. **Pre-Generation (Cognitive Scaffold):** Separating camera optics, physical anatomy, spatial blocking, and audio into isolated dimensions forces the human brain to mentally rehearse the scene like a director, cinematographer, choreographer, and sound designer before spending compute credits.
2. **Post-Generation (Diagnostic Learning Loop):** When an output fails to match expectations (or unexpectedly exceeds them), Auteur Script serves as an empirical root-cause ledger:
   - *Was the issue an ambiguity or conflicting instruction in staging or execution coordinates?*
   - *Or was it inherent stochastic variance in the generative model's latent sampling?*

---

### 2. Framework vs. User Implementation Rule

| The Framework Governs (Invariant) | The User Decides (Flexible) |
|---|---|
| **What can be controlled:** Isolated physical & optical dimensions. | **How to format:** Full canonical tags, concise shorthand, or natural language. |
| **How state transforms:** Mathematical state logic ($S_n = f(S_{n-1} \mid \text{STAGING})$). | **Tag omission:** Omitting tags or dropping syntax when hitting character limits. |
| **Phase separation:** Static Staging ($S_0$) vs. Kinetic Execution ($S_1 \dots S_n$). | **Workflow entry point:** Writing Execution first, Aesthetic first, or Intent first. |
| **Core theory purity:** Keeping core concepts universal and model-agnostic. | **Extension modules:** Choosing specialized blocks (`[CHARACTERS]`, `[CONTINUITY PROTOCOL]`) or token mappings (`LOC01`). |

---

### 3. The 7-Point Concept Litmus Test

Before introducing or altering any block, tag, or tooling rule, evaluate it against these seven criteria:

1. **Single-Dimension Orthogonality**: Does this concept govern strictly **one** isolated physical, optical, or narrative dimension without overlapping existing tags?
2. **2-Phase Separation**: Is the concept unambiguously classified under **Phase 1: STAGING** (static context / first-frame anchor $S_0$) or **Phase 2: EXECUTION** (kinetic temporal transition $S_1 \dots S_n$)?
3. **Cognitive Pre-Visualization Value**: Does this concept genuinely help the human director clarify and untangle their mental picture?
4. **Model-Agnostic Purity**: Is the concept completely independent of specific AI vendor brands or platform hacks?
5. **Graceful Omission (Minimal Overhead)**: Can a creator omit this concept in a stripped-down script without breaking the coherence of the remaining scene?
6. **Core Mathematical Consistency**: Does the concept align with $S_n = f(S_{n-1} \mid \text{STAGING})$?
7. **Thinking Notation vs. Machine Reality**: Does the concept avoid claiming that generative models "reason", "execute state code", or "simulate physics deterministically"? State equations are the creator's mental state ledger, and scripts are coordinate fences that collapse latent ambiguity.

---

### 4. Concept Intent & Negative Boundary Matrix

#### Macro-Blocks
| Block | Directorial Question | Problem / Friction It Solves | Boundary: What It NEVER Touches |
|---|---|---|---|
| **`[INTENT]`** | *"Why does this shot exist?"* | Directionless, generic output; lack of dramatic subtext. | **No technical camera moves or play-by-play actions.** |
| **`[LOGIC]`** | *"What physical laws cannot break?"* | **The Invariant Anchor:** Morphing geometry, impossible physics, lost props; primes learned priors with persistent spatial invariants. | **No aesthetic styling, meta-prompt rules, or timeline events.** |
| **`[AESTHETIC]`** | *"What does the world look & feel like?"* | Inconsistent palette, vague lighting, unanchored wardrobe. | **No kinetic actions or chronological time progression.** |
| **`[OPENING]`** | *"What is in frame at $t = 0$ ($S_0$)?"* | Ambiguous first frame; guessing where subjects start. | **No state transitions ($A \to B$), no tags, no motion verbs.** |
| **`[EXECUTION]`** | *"How does the state evolve ($S_1 \dots S_n$)?"* | Temporal drift, chaotic pacing, erratic camera cuts. | **No restating static staging parameters already in $S_0$.** |

#### Core & Tier-2 Coordinate Syntax
| Element | Isolated Dimension | Core Problem Solved | Negative Boundary |
|---|---|---|---|
| **`[CAM]` / `[CAM 01]`** | Camera Optics & Motion | Conflating camera movement with actor movement. | **Never describes actor anatomy, emotion, or dialogue.** |
| **`[ACT]`** | Physical Performance | Abstract adjectives (*"looks sad"*) producing dead faces. | **Never dictates camera optics, lighting, or set layout.** |
| **`Speaker says (delivery) {line}`** | Spoken Dialogue & Delivery | Unsynchronized dialogue or missing delivery cues; ends cleanly into follow-through. | **Never describes background music or camera moves; never ends a line.** |
| **`<sound>`** | Tactile Foley & Triggers | Silent or generic environments; triggers physical reactions. | **Never contains spoken dialogue or persistent room tone.** |
| **`(score)`** *(opt-in)* | Non-Diegetic Score | Muddled audio where music fights foley/dialogue. | **Never describes on-screen foley.** |
| **`[BLOCK]`** | 2D Screen Coordinates | Subject spatial drift; teleporting across cuts. | **Never uses `stage-left/right`; never dictates eyeline alone.** |
| **`[LIGHT]`** | Dynamic Lighting Shifts | Light sources flickering or drifting unnaturally. | **Never describes static lookbook tones (handled in `[AESTHETIC]`).** |
| **`[SPEED]`** | Temporal Speed Ramping | Inconsistent frame pacing (unintended slow-mo). | **Never alters scene duration or spatial coordinates.** |
| **`[PROP]`** | Interactive Object Physics | Props disappearing, morphing, or floating mid-action. | **Never describes static background set dressing.** |

---

================================================================================
## Document 3B: The Auteur Script Blueprint (State Math & Conceptual Model)
================================================================================

### 1. The Origin
Traditional screenplays deliberately hide shot lists, lens choices, and micro-choreography so a human film crew can interpret them. In generative video, **the model is the crew**—it needs explicit optical and physical coordinates. Meanwhile, strict character limits in early video tools meant verbose prose wasted token budgets on room setup before any action occurred.

Realizing that *"a script isn't just a description—it's a set of instructions designed to trigger an experience"* led to **Auteur Script**: a compact cognitive scaffold separating static Staging from dynamic Execution.

### 2. The 3 Core Pillars & 2 Production Phases

All scene instructions organize across three cognitive layers (with no forced authoring order—a creator may draft Execution first, Aesthetic first, or Intent first):
- **Pillar 1 — INTENT**: *The "Why" & Vision* (thematic stakes, emotional core, invariant rules).
- **Pillar 2 — AESTHETIC**: *The Audio-Visual World* (palette, lighting ratios, wardrobe, environment, acoustics, and $S_0$).
- **Pillar 3 — EXECUTION**: *The Dynamic Timeline* (play-by-play mutation across screen time).

In production, these partition cleanly into two phases:
- **Phase 1: STAGING ($S_0$)** — `[INTENT]`, `[LOGIC]`, `[AESTHETIC]`, `[OPENING]`
- **Phase 2: EXECUTION ($S_1 \to \dots \to S_n$)** — `[EXECUTION]`

### 3. Mapping the Motion: State Vectors & Equations

Drawing from functional data pipelines ($x \mapsto f(x)$), the complete screen state at any moment is modeled as a **Macro-State vector ($S_n$)**:

$$S_n = \langle s_{\text{camera}}, s_{\text{action}}, s_{\text{dialogue}}, s_{\text{foley}}, \dots \rangle$$

The progression of an entire scene is a sequence of state transformations:

$$S_0 \mapsto S_1 \mapsto S_2 \mapsto \dots \mapsto S_n$$

Governed by the **Core Staging Equation**:

$$S_n = f(S_{n-1} \mid \text{STAGING})$$

$$\text{STAGING} = \langle \text{INTENT}, \text{LOGIC}, \text{AESTHETIC}, S_0 \rangle$$

- **$S_0$**: The initial visual anchor locked in `[OPENING]` ($t = 0$).
- **$S_{n-1}$**: The accumulated physical state immediately preceding the current beat.
- **$\text{STAGING}$**: The global invariant baseline conditioning all mutations.
- **$f$**: The directional mutation operator commanding the beat's transition across duration $\Delta t$.
- **$S_n$**: The resulting screen state at the conclusion of the beat.

#### Two Grammatical Timeline Levels
1. **Macro-State ($S_n$) — The Human Pre-Visualization Unit**: One complete non-empty line in `[EXECUTION]`. Breaking scenes into one-line beats lets the human eye scan, simulate, and verify continuity before generating.
2. **Sub-State ($s_i$) & The Chaining Operator (`->`)**: Within one line, atomic Sub-States chain left-to-right:
   $$S_1 = \langle s_1 \mapsto s_2 \mapsto \dots \mapsto s_k \rangle$$
   - **Across lines**: `->` denotes sequential temporal beats ($S_0 \to S_1 \to S_2$).
   - **Within a line**: `->` acts as a **hierarchical layering operator** (camera perspective $\to$ physical performance $\to$ dialogue $\to$ diegetic contact sound) resolving into one synchronized beat interval ($\Delta t$).

### 4. Production Blueprint Example (*What Remains* — Canonical Inline Syntax)

```text
[INTENT]
Create a neorealist indie drama scene featuring @ROB as Robert (an aging, weathered father) and @JOHN as John (his intense, estranged son).

[LOGIC]
Maintain spatial continuity in a dusty, half-packed room. Keep prop tracking consistent with a cardboard box of vinyl records held by John. Trace Robert's transition from anger to vacant confusion. No subtitles appear on screen.

[AESTHETIC]
Medium: 35mm film, naturalistic grain
Palette: Desaturated amber, dusty ochres, soft shadows
Lighting: Direct golden afternoon light casting long window-pane shadows
Location: Cluttered mid-century suburban living room with stacked moving boxes
Hair/Makeup: Robert with disheveled curly grey hair and weathered skin; John with messy shoulder-length dirty-blond hair and sweat-sheen
Wardrobe: Robert wearing faded olive knit polo; John wearing dusty dark-grey denim shirt over a white tee
Audio: Distant cicadas outside, faint clock ticking

[OPENING]
MS, handheld, facing John standing frame-left, clutching a cardboard box of vinyl records tightly against his chest with both hands, glaring off-frame right toward Robert near a sunlit window.

[EXECUTION]
[CAM 01] MS, handheld, drift-left -> [ACT] John grips the cardboard box tightly, knuckles white -> John says (strained) {We can't keep everything, Dad. Just pick.} -> <cardboard scraping faintly against denim>
[CAM 02] MCU, low-angle on Robert near window -> [ACT] Robert points an accusatory finger frame-left, chest heaving -> Robert says (hoarse, rising) {That's my life in those boxes!} -> <heavy breathing>
[CAM 03] OTS behind Robert looking at John -> [ACT] John steps closer, clutching the box against his chest, jaw tight with resentment -> John says (sharp) {You didn't care about this house for ten years!} -> [ACT] John shifts his weight forward
[CAM 02] -> [ACT] Robert opens his mouth to yell, then freezes with his pointing hand suspended as his gaze drops into hollow blankness -> <floorboard creak>
[CAM 04] INS, close-up on the box -> [ACT] John's grip on the cardboard box loosens slightly, a vinyl sleeve sliding outward -> <dry paper rustling>
[CAM 03] -> [ACT] John's jaw slackens, anger draining into shock, lips parting -> John says (quiet, hesitant) {Dad...?} -> [ACT] John holds perfectly still
[CAM 02] -> [ACT] Robert's raised hand drops slowly to his side, blinking rapidly around the room -> Robert says (lost, soft) {Where... where is your mother?} -> [ACT] Robert stares past John
[CAM 05] MS, profile tracking -> [ACT] John slowly lowers the heavy box onto a wooden table frame-left, eyes locked on his father -> <dull thud of cardboard on wood> -> John says (barely audible) {She's not here, Dad.} -> [ACT] John exhales shakily
[CAM 06] WS, extreme low-angle -> [ACT] Thick dust motes drift lazily through a bright shaft of sunlight between Robert and John -> <distant cicadas humming>
[CAM 07] MCU, slow push-in on John -> [ACT] John's eyes well with tears, throat swallowing hard as he watches Robert's silhouette in the foreground -> [ACT] John wipes his cheek with his sleeve
```

### 5. Directorial Craft Mechanics
- **State Inheritance & Physical Baggage**: Every Macro-State carries forward held props, arm fatigue, wounds, and positions until an explicit action releases them.
- **The Repetition Mandate**: Because model token attention decays across lines, restate continuity-critical physical conditions (hand grips, postures, wounds) in `[ACT]` on every visible line until changed.
- **Camera Persistence (`[CAM 01]`)**: Repeating `[CAM 01]` across consecutive lines holds that framing without cutting; recalling `[CAM 01] ->` later returns to that exact angle.

---

================================================================================
## Document 3C: Block Grammar & Orthogonality Contracts
================================================================================

### 1. Why Orthogonality Matters
Without strict structural boundaries between blocks, prompts suffer from:
1. **Downstream Token Bloat**: Repeating wardrobe and architecture in `[EXECUTION]` wastes tokens and crowds out performance direction.
2. **Attention Drift**: Restating static lighting or fabric in action lines causes the model's attention to treat those tokens as directives to *re-render or mutate* them—causing flickering light and shifting clothes.

### 2. Disambiguation: Macro-Blocks vs. Sub-State Tags

| Directorial Dimension | Macro-Blocks ($B \in \mathcal{B}$) | Sub-State Tags ($\tau \in \mathcal{T}$) |
|---|---|---|
| **Structural Scope** | Document-level structural containers | Line-level coordinate tokens |
| **Placement** | Standalone uppercase header on its own line (`[INTENT]`, `[LOGIC]`, `[AESTHETIC]`, `[OPENING]`, `[EXECUTION]`) | Chained inline inside `[EXECUTION]` lines (`[CAM]`, `[ACT]`, `[BLOCK]`, `[LIGHT]`, `[PROP]`, etc.) |
| **Operational Role** | Partitions the stage into isolated functional layers | Layers simultaneous physical and optical dimensions within a beat |
| **Omissibility** | Invariant scaffold; baseline blocks preserved | Cognitive shorthand; optional tags omitted when unnecessary |

### 3. Abstract Structural Skeleton

```text
[INTENT]
Create a [Format/Genre] scene set in [Macro-Setting], featuring [Characters] [Core Stakes/Action].

[LOGIC]
Maintain [spatial/axis invariant]. Enforce [prop permanence and hand allocation]. Preserve [lighting/environmental consistency] across all cuts. No subtitles appear on screen.

[AESTHETIC]
Medium: [Film stock, lens characteristics, visual texture]
Palette: [Dominant hues, shadow tones, contrast ratio]
Lighting: [Base illumination quality, key light angle, practical sources]
Location: [Primary physical surfaces, architectural materials, era]
Wardrobe: [Character garments, silhouettes, fabric textures]
Audio: [Persistent room tone, environmental drone, ambient sound bed]

[OPENING]
[Shot size, camera angle, and lens perspective] framing [Subject coordinates: frame-left/center/right, depth planes] in [initial frozen posture and prop grip], with [immediate set contact and eyeline heading].

[EXECUTION]
[CAM 01] [Initial setup inheriting from S0] -> [ACT] [Physical action] -> Speaker says (delivery) {Line.} -> [ACT] [Follow-through] -> <contact sound>
[CAM 01] -> [ACT] [Choreography shift] -> <diegetic foley>
[CAM 02] [Coverage angle] -> [ACT] [Terminal action or reaction] -> <resolving sound>
```

### 4. The Open Block Principle ($B \in \mathcal{B}$)

The five baseline blocks form $\mathcal{B}_0 = \{\text{INTENT}, \text{LOGIC}, \text{AESTHETIC}, \text{OPENING}, \text{EXECUTION}\}$. Custom Macro-Blocks are permitted provided every block obeys the **Phase Partition Law**:

$$\mathcal{B} = \mathcal{B}_{\text{staging}} \cup \mathcal{B}_{\text{execution}}, \quad \mathcal{B}_{\text{staging}} \cap \mathcal{B}_{\text{execution}} = \emptyset$$

- **Staging Extensions (Phase 1)**: `[CHARACTERS]`, `[CONTINUITY PROTOCOL]`, `[REFERENCES]`, `[STAGE]`.
- **Execution Variants (Phase 2)**: `[SHOTLIST]`, `[TIMELINE]`, `[BEATS]`.

---

================================================================================
## Document 3D: Master Framework Dictionary (27 Grounded Terms)
================================================================================

### Category 1: Staging Architecture
1. **Auteur Script**: A structured prompt framework organizing cinematic intent into static pre-production staging and dynamic sequential timeline beats. Replaces unstructured prose with an explicit state ledger.
2. **The Film Crew Mental Model**: Treating the generative video model like a skilled film crew rather than a deterministic code interpreter; the director sets coordinates while learned priors compute natural momentum and gap-filling.
3. **The 3 Core Pillars**: Intent (purpose), Aesthetic (sensory world), and Execution (timeline), with no forced authoring sequence.
4. **The 2 Production Phases**: Phase 1: STAGING (setup before rolling) and Phase 2: EXECUTION (active rolling camera).
5. **Phase 1: STAGING ($S_0$)**: Static world rules, visual lookbooks, and opening frame locked before motion begins. Contains zero temporal progression.
6. **Phase 2: EXECUTION ($S_1 \to \dots \to S_n$)**: Dynamic timeline where camera, actor choreography, and sound evolve beat by beat without restating static staging.
7. **`[INTENT]` Block**: Pre-production container answering *"Why does this shot exist?"* (objective, format, characters, stakes; zero camera moves or play-by-play actions).
8. **`[LOGIC]` Block (The Invariant Anchor)**: Pre-production container locking persistent physical rules and spatial permanence so brief execution lines remain coherent.
9. **`[AESTHETIC]` Block**: Pre-production lookbook defining palette, lighting ratios, wardrobe, location materials, and persistent room tone.
10. **`[OPENING]` Block ($S_0$)**: Composed starting still canvas ($t=0$) locking initial camera framing, placement, and prop grips with zero motion verbs or tags.
11. **`[EXECUTION]` Block**: Dynamic timeline container directing sequential beats ($S_1 \mapsto \dots \mapsto S_n$).

### Category 2: State Mathematics & Timeline
12. **Thinking Notation**: Using state equations ($x \mapsto f(x)$) as compact cognitive shorthand for human mental staging, without claiming neural networks execute deterministic code.
13. **Macro-State ($S_n$)**: One complete non-empty line inside `[EXECUTION]` representing one continuous stretch of screen time.
14. **Pre-Visualization Unit**: The cognitive role of a Macro-State line in letting directors mentally simulate and verify pacing beat by beat.
15. **Sub-State ($s_i$)**: An atomic coordinate segment within a Macro-State line governing strictly one physical, optical, or acoustic dimension.
16. **Sub-State Tag ($\tau \in \mathcal{T}$)**: An inline bracketed category label (`[CAM]`, `[ACT]`, `[BLOCK]`, etc.) separating cinematographer, choreographer, and spatial roles.
17. **Core Staging Equation ($S_n = f(S_{n-1} \mid \text{STAGING})$)**: Models each beat $S_n$ as a transition from $S_{n-1}$ conditioned on pre-production staging.
18. **Chaining Operator (`->`)**: Across lines, denotes sequential temporal progression ($S_0 \to S_1$). Within a line, layers camera, action, dialogue, and sound into one synchronized beat interval ($\Delta t$).
19. **The Core Dimensions**: Baseline dimensions inside `[EXECUTION]`—camera optics (`[CAM]`/`[CAM 01]`), physical performance (`[ACT]`), inline spoken dialogue (`Speaker says (delivery) {line}`), and inline diegetic foley (`<sound>`).

### Category 3: Directorial Craft & Continuity
20. **Latent Priors**: Deep physical, anatomical, optical, and temporal patterns absorbed by generative video models from video datasets.
21. **Coordinate Fences**: Structural boundary coordinates set in the script to collapse latent ambiguity.
22. **Boundaries, Not Handcuffs**: Setting transition fences ($S_{n-1} \mapsto S_n$) without over-constraining the model with rigid artificial second-by-second timestamps.
23. **State Inheritance ($S_n = f(S_{n-1})$)**: Every new beat inherits the physical and optical reality of the preceding beat until explicitly mutated.
24. **Physical Baggage**: Accumulated physical reality (held props, fatigue, wounds, postures) carried forward across beats.
25. **The Repetition Mandate**: Explicitly restating continuity-critical details (hand grips, postures, wear) across consecutive beats to counter token attention decay.
26. **Camera Persistence (`[CAM 01]`)**: Holding or recalling an established camera framing across multiple lines without triggering accidental cuts.
27. **Empirical Diagnostic Ledger**: Post-generation practice of using explicit script coordinates to isolate prompt omissions or conflicts from stochastic latent variance.
