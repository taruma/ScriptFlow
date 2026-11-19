# 02 — Auteur Script: Normative Specification (`v0.4.0`), Modules & Worked Examples

> **Bundle Role**: `File 2 of 7` — Complete Authoring/Diagnostic Spec, Extension Modules & Worked Script Corpus  
> **Target Consumer**: Stateless AI Agents building tooling (script generators, validators, module parsers, test suites)  
> **Specification Lock**: Pure Auteur Script (`v0.4.0` Canonical Inline Syntax) — **100% Platform- & Model-Agnostic**

---

## Content Manifest (What Is Inside This File)

This file merges four cleanly separated specification documents:

| Part | Document Title | Source Origin (Cleaned & Unified) | Contents |
|---|---|---|---|
| **Document 2A** | **Normative Script Specification (`v0.4.0`)** | `notes/auteur-script_skill_v0.4.0/SKILL.md` | Full block rules, inline `{}`/`<>`/`()`/`【】` syntax, spatial coordinates, temporal calibration, audit/diagnose output schemas, and **5 worked script examples** |
| **Document 2B** | **Module: Multimodal Character Reference Binding** | `modules/character_reference.md` | `@actor`/`@image`/`@audio` binding rules, `[INTENT]` isolation, `[CHARACTERS]` ensemble block, cardinality rules |
| **Document 2C** | **Module: Aesthetic Token Mapping** | `modules/token_mapping.md` | `Description -> TOKEN` lookup dictionary in `[AESTHETIC]` (`LOC01`, `EV01`, `PROP01`) and shorthand usage |
| **Document 2D** | **Module: Multi-Clip Video Continuation** | `modules/video_continuation.md` | Extending `@video1`, `[CONTINUITY PROTOCOL]` scaffold, terminal-frame `[OPENING]` alignment |

---

================================================================================
## Document 2A: Normative Script Specification (`v0.4.0`)
================================================================================

### Role & Core Laws

An Auteur Architect acts as director, cinematographer, and script supervisor in one—turning a concept, treatment, screenplay excerpt, or rough prompt into an **Auteur Script** that a multi-shot generative video model can render with coherent blocking, screen direction, physical weight, and continuity.

Scripts are written in English (spoken lines stay in the language the scene calls for).

The video model has strong learned priors for motion, weight, light, and performance. It fails where instructions are ambiguous, contradict each other, or leave dead time: flipped screen direction, a prop that changes hands, a character who teleports, or a fight beat that floats in mid-air. The specification removes that ambiguity with precise coordinate fences, then leaves the model's physical priors room to render natural momentum. **Set boundaries, not handcuffs.**

Three laws carry the format:

1. **Static once, volatile always.** Wardrobe, location architecture, and baseline lighting are locked once in Staging and never restated. Volatile physical details that can drift across beats (which hand holds a prop, posture, wounds, screen position) are restated in `[ACT]` on every line where they remain true.
2. **Every beat inherits the previous beat** ($S_n = f(S_{n-1} \mid \text{STAGING})$) until an instruction explicitly changes it. Never write disconnected descriptions in a continuous scene.
3. **Match beat count to duration and tempo.** Generative video models distribute temporal attention across the target clip duration. Too few physical beats in a long action clip create temporal slack (low-gravity floating); too many cuts in a short clip cause scene morphing.

Write like a working cinematographer: literal, physical, brief. No filler, no purple prose, no literary adjectives that cannot be photographed ("breathtaking", "stunning", "epic", "masterpiece"). Never add rendering buzzwords such as "8k", "photorealistic", or "hyper-detailed".

### Interaction Modes

- **Script (default):** Output only the finished script. No preamble, no commentary, no notes after it.
- **Discuss:** Answer as a director would—blocking, camera, pacing, and tradeoffs—in plain prose.
- **Revise or audit:** Return the corrected script followed by a short audit report across the five supervisor lenses.
- **Diagnose:** Given a script plus a description of what the generated clip got wrong, isolate whether the fault is a missing coordinate, a vector conflict, temporal slack, or stochastic model variance.

**Format of the script itself:** plain text only. Block headers on their own lines, no Markdown, no code fences, no bold, no bullets (a custom staging block may use plain lines).

**Ambiguity:** Specify precisely only what would break continuity if guessed wrong: spatial layout, number of characters, key props and which hand holds them, the 180° line of action, and the visual medium. Infer sensible cinematic defaults for the rest. If the input contains several distinct scenes, write one complete script per scene.

---

### Structure & Scene Topologies

A script is a sequence of **Macro-Blocks**, each a header in square brackets on its own line, content on the following lines, and exactly one blank line between blocks.

Standard order: `[INTENT]`, `[LOGIC]`, `[AESTHETIC]`, `[OPENING]`, `[EXECUTION]`.

- **Phase 1: STAGING (`[INTENT]`, `[LOGIC]`, `[AESTHETIC]`, `[OPENING]`).** Pre-production setup before the camera rolls ($S_0$). No sequenced action and no motion verbs.
- **Phase 2: EXECUTION (`[EXECUTION]`).** The rolling timeline ($S_1 \mapsto \dots \mapsto S_n$). Holds **Macro-States**, one per line.
- Each Macro-State is a chain of **Sub-States** joined by `->`. Each Sub-State governs strictly one physical, optical, or acoustic dimension (the Single-Dimension Law). Within a single line, `->` acts as a hierarchical layering operator—framing first, then physical performance within that frame, then speech, then contact sound—resolving into one synchronized beat interval ($\Delta t$).
- `[BLOCK]` (an inline spatial tag) is not a Macro-Block container. Never confuse the two.

**Block Extension Principle (Orthogonality):** Each block extends preceding context without redundant restatement or silent contradiction. Downstream blocks direct only what mutates.

**Custom staging blocks** (such as `[CHARACTERS]` or `[CONTINUITY PROTOCOL]`) slot immediately before `[OPENING]`, hold static lookup or boundary data, and contain no motion verbs. Do not duplicate their content in `[AESTHETIC]`.

#### The 4 Scene Topologies

Adapt state inheritance and camera numbering to the topology of the scene:

1. **Continuous Oner (`[CAM 01]` throughout):** A single unbroken take. Full state inheritance across every line. Establish the optical framing once in `[OPENING]` and Line 1; on subsequent lines, direct only physical operator transitions (`[CAM 01] CRANING UPWARD ->`, `[CAM 01] TRACKING LEFT ->`). Never re-declare a new static shot size mid-oner without an operator transition, or the model will jump-cut.
2. **Multi-Camera Coverage (`[CAM 01]`, `[CAM 02]`, …):** Continuous real-time scene with editorial cuts. Full physical state inheritance across cuts. Use `[CAM 01] ->` on consecutive lines to hold a setup, switch to `[CAM 02] CU on Rosa ->` to cut, and write `[CAM 01] ->` alone later to recall the first setup without re-describing its lens or angle.
3. **Parallel Cross-Cutting ($A_k \parallel B_k$):** Intercut action across two separate locations (such as a phone call or chase convergence). Maintain dual independent state ledgers: Location A inherits strictly from the previous Location A beat, never bleeding lighting, weather, or props into Location B. Number cameras per setup (`[CAM 01]` in Location A, `[CAM 02]` in Location B) and re-anchor location cues on each switch.
4. **Discontinuous Montage / Teaser (plain `[CAM]`):** Rapid-cut sequence across elliptical time or locations. Use plain, unnumbered `[CAM]` on every line. State inheritance is severed between lines: every line must supply its own subject, wardrobe/setting cue (or token), and light cue from a fresh baseline.

---

### Block Specifications

#### `[INTENT]`
One flowing sentence beginning with "Create". Weave together format or medium, setting container, main characters, and dramatic stakes. No colon labels, no shot-by-shot action, no backstory or lore summary.

- **Reference assets (`@image`, `@actor`, `@audio`):** Declare multimodal bindings exclusively here, as in `featuring @image1 as Mark (voice: @audio1) and @image2 as Robert` (or inside a dedicated `[CHARACTERS]` block for 4+ cast members). Everywhere downstream, use the character name alone (`Mark`) and never repeat `@image` or `@actor` tags. A reference image sets facial identity and age only: unless the user asks to keep the reference outfit, design a new full-body costume in `[AESTHETIC]` suited to the scene, keeping the face, eyes, and mouth unobstructed unless the role requires a helmet or mask.
- **Video continuation (`@video1`):** When extending an existing clip, open with `Create a seamless cinematic continuation of @video1 featuring …` and lock terminal-frame handoff rules in `[CONTINUITY PROTOCOL]` before `[OPENING]`.

#### `[LOGIC]`
One dense paragraph of in-scene physical invariants, usually one to three sentences (zero bullets). Use affirmative directives (Maintain, Preserve, Anchor, Track). Cover only the physical rules that would break the scene if violated: 180° line of action and screen direction, prop permanence and hand allocation, centrifugal or surface physics, directional light behavior, and match-on-action cuts. Never include meta-prompt instructions (shot counts, word limits, formatting rules).

If the script contains spoken dialogue and the user has not asked for on-screen text, end `[LOGIC]` with: `No subtitles appear on screen.`

#### `[AESTHETIC]`
The sensory lookbook, formatted as `Label: Value` lines, one category per line, values as compact tactile fragments. Standard categories: `Medium`, `Palette`, `Lighting`, `Location`, `Wardrobe`, `Audio`, plus specialized lines (`Hair/Makeup`, `Creature`, `World`) only when required. Usually four to seven lines.

- **Location:** Use specific architectural, industrial, or material vocabulary (*304-grade brushed stainless steel pass-through tables*, *wet red quarry tile with cast-iron floor drains*) instead of generic room labels.
- **Lighting and Palette:** Name the key, fill, and rim sources, color temperature contrast, and shadow falloff.
- **Wardrobe:** One line for one or two characters (separated with semicolons); individual lines (`Wardrobe Mark: …`) for larger casts. Specify head to footwear. *(Practical note: natural descriptive phrasing like `Wardrobe: Arthur in ...; Ruby in ...` yields stronger adherence than detached metadata lines when costumes are not baked into `@` character portraits.)*
- **Audio:** The persistent diegetic bed only—room tone, weather, mechanical hum. Declared once here, never repeated line-by-line in `[EXECUTION]`. No musical score unless the user asks for one.
- Zero kinetic action, zero timeline events, zero camera moves.

#### `[OPENING]`
The motionless first frame ($S_0$ at $t = 0$), written as a cinematographer describing a still photograph. Compact natural prose, two to four sentences (40–70 words). No square-bracket tags, no motion verbs (*walks*, *turns*, *tracking forward*), no off-screen characters, no audio cues. Do not repeat static lookbook specs from `[AESTHETIC]`. Lock four coordinates:

1. **Optical canvas:** shot scale, lens angle, camera height.
2. **Subject placement and set contact:** viewport position (`frame-left/center/right`, `FG/MG/BG`) and how bodies rest against the set.
3. **Pre-loaded hand grips:** exact hand allocation (`left hand`, `right hand`, `both hands`) for any prop used in early beats.
4. **Eyeline heading and background depth:** gaze direction (`facing screen-right`, `in profile-left`) and immediate visible background anchors.

Line 1 of `[EXECUTION]` ($S_1$) inherits `[OPENING]` with zero jump: it must open with the matching camera setup and initiate movement directly from the postures and grips locked in $S_0$.

#### `[EXECUTION]`
One Macro-State per line. Each line begins from the visible physical condition left by the previous line. Express pacing through causal beats, never numerical timestamps (`00:02`, `[3s]`) unless requested.

Each tagged Sub-State opens with its uppercase bracketed label followed by a single space (`[ACT] John grips the box`, never `[ACT: gripping the box]`).

---

### Canonical Inline Syntax

| Dimension | Syntax |
|---|---|
| Camera | `[CAM 01] …` (or `[CAM] …` in montages) |
| Performance | `[ACT] Subject active-verb …` |
| Spoken dialogue | `Speaker says (delivery) {line}` |
| Sound effect / foley | `<short physical sound description>` |
| Score (only if requested) | `(instrumental description)` |
| On-screen text (only if requested) | `【Exact text】` |

- **Dialogue** uses curly braces `{...}` and never quotation marks. Delivery parentheticals precede the brace: `Mark says (gasping from heat) {Get back!}`. Mark off-screen speakers `(O.S.)` and voiceover `(V.O.)`: `Arthur says (O.S., flat) {Don't look.}`. Declare non-English languages before the parenthetical: `Rosa says in French (calmly) {C'est fini.}`.
- **Sound** goes in angle brackets `<...>`.
- **Macro-State resolution rule:** **Never end a Macro-State on dialogue.** Always chain into an immediate physical follow-through in `[ACT]` or a sound trigger `<...>` so speech never lands on the terminal token of a line.
- **Interleaved speech:** Break long speech with physical micro-beats (`Speaker says {part 1} -> [ACT] micro-action -> Speaker says (delivery) {part 2}`), pauses in delivery notes, or reaction cuts where the speaker continues `(O.S.)`.

#### Sound Discipline
- Video models infer routine sound from visible action (walking implies footsteps). Add `<sound>` selectively for:
  1. **Unique material friction** (`<wet boots sucking at clay>`, `<cardboard scraping on wood>`).
  2. **Off-screen catalysts** that motivate a reaction (`<wood snapping in canopy> -> [ACT] Rosa freezes and spins toward the sound`).
  3. **Dramatic impact punctuation** (`<revolver cylinder clicks shut>`, `<laminated glass spiderweb-shatters>`).
- Restate a discrete ongoing sound (`<low predator growl continues>`) across lines while it stays active; keep persistent room tone strictly in `[AESTHETIC]`.

---

### Spatial Coordinates & The 180° Axis

Generative models are trained on camera-viewport captions. Mixing theatrical proscenium terms with rotational headings causes 50/50 horizontal flips. Keep **Position** and **Orientation** strictly orthogonal:

- **Viewport Position (Where the subject is in the 2D frame):** Use `frame-left`, `frame-center`, `frame-right` (or `screen-left`, `screen-right`) and depth planes `foreground (FG)`, `midground (MG)`, `background (BG)`. **Never use `stage-left` or `stage-right`** (an actor's stage-left is the viewer's `frame-right`, causing axis inversions).
- **Anatomical Orientation / Eyeline (Which way the subject faces):** Use `facing screen-right`, `facing screen-left`, `in profile-left`, `three-quarter profile right`, or `back to camera`. Never use `profile-left` alone as a location coordinate—a subject at `frame-right` looking across the room is `frame-right, in profile-left`.
- **180° Line of Action:** Lock the primary axis in `[LOGIC]` and `[OPENING]`. In shot-reverse-shot coverage, if Subject A is `frame-left facing screen-right`, reverse cuts to Subject B must frame them `frame-right facing screen-left`. If a camera crosses the axis, motivate it explicitly with an on-screen arcing camera move, a neutral frontal/POV buffer shot, or physical re-blocking.

---

### Performance & Continuity

`[ACT]` governs visible anatomy, posture, weight, and surface contact.

- **Literal over literary:** Never write abstract feelings (*"heartbroken"*, *"terrified"*, *"tense"*). Translate them into photographable anatomy scaled to shot size:
  - *CU / MCU:* pupil dilation, rapid blinking, jaw clench, throat swallow, nostril flare, lip tremor, breath rate.
  - *MS / FS / WS:* spine rigidity, shoulder slump, weight transfer across heels, asymmetric hand roles, spatial distance.
- **Subject first, present tense, active voice:** `[ACT] John grips the box with both hands`, never a detached participle (`gripping the box`).
- **Sustained compound action (anti-twitch):** A lone 0.5-second gesture leaves the model idle for the rest of the beat. Pair primary motion with posture, weight distribution, or surface contact in one `[ACT]`, or stack sequential `[ACT] -> [ACT]` micro-beats across the line.
- **Grounded bodies:** Give hands distinct jobs (one anchor hand braced on a counter or holding a prop, one active hand). Direct eye vector first, head turn second, torso third.
- **Acting is reacting:** Every visible subject in a multi-character frame must be directed—either co-acting in one `[ACT]` (`John steps closer while Robert stiffens against the wall`) or chained in action-reaction sequence. Directed stillness (`holds rigid, breath shallow`) is valid; omitting a visible character freezes them into a mannequin.
- **Brute-force continuity recall (The Repetition Mandate):** Because token attention decays across lines, explicitly fold continuity-critical conditions into `[ACT]` on every line where the subject is visible until the condition changes:
  1. Exact hand holding each prop (`skillet in his right hand`).
  2. Core posture (`crouched low`, `seated frame-left`).
  3. Accumulated physical wear (`blood trickling from temple`, `sweat-soaked collar`, `mud-streaked sleeves`).
  4. Screen placement and facing vector.

---

### Pace and Density (Temporal Calibration)

Generative video models allocate temporal frames across the beats written in `[EXECUTION]`. Calibrate line count and Sub-State density to the scene topology, genre tempo, and target clip duration:

1. **The Cut-Latency Floor (Montage & Multi-Camera Cuts):**
   - Video models require **1.5s to 2.5s per shot** to stabilize a new scene latent.
   - In cut sequences, never exceed $\text{Duration} \div 2.0$ total shots (e.g., maximum 2–3 shots in a 5s clip; 4–5 shots in a 10s clip). Overpacking cuts causes morphing or dropped shots.
2. **Continuous Oner Beat Calibration (`[CAM 01]`):**
   - Because an unbroken oner has zero cut latency, Macro-State lines pace the kinetic rhythm directly:
     - **High-velocity combat / chase / parkour:** target **0.8s–1.2s per Macro-State** (4–5 lines for a 5s clip; 8–10 lines for a 10s clip).
     - **Tactical action / standoff:** target **1.5s–2.0s per Macro-State**.
     - **Dramatic dialogue / coverage:** target **2.5s–4.0s per Macro-State** (compressing spoken lines under 2s forces unnatural, robotic lip-sync speed).
     - **Slow horror / atmospheric noir:** target **4.0s–6.0s+ per Macro-State**.
   - **The Anti-Float Rule:** Never stretch a 5-beat fight script across a 10-second generation—the 2.0s-per-beat slack causes subjects to hang in mid-air. To scale an action scene to 10s+, double the choreographic granularity (add parry slips, footwork checks, recoil recovery, and grip shifts).
3. **Sub-State Weight per Line:**
   - Most lines run **3 to 6 Sub-States** (`[CAM 01] -> [ACT] -> Speech -> [ACT] -> <sound>`). Quiet atmospheric holds may use 2; high-risk prop transfers or multi-actor clashes may run 6–8. Never pad a beat to hit an arbitrary number.
4. **Density Profiles:**
   - **Full / Expanded:** Deploy explicit `[BLOCK]` and `[STATE IN/OUT]` clamps on critical transitions and break long takes into granular `[CAM 01]` sub-lines.
   - **Concise / Compressed:** Condense `[AESTHETIC]` fragments and merge simple beats while keeping first-frame handoff and hand-grip continuity intact.
   - **Tagless / Character-Limit:** Strip square-bracket labels (`[CAM]`, `[ACT]`) while preserving the exact `->` sequence and physical descriptions.

---

### Optional Coordinates & Production Extensions

Deploy these only when scene complexity or user instructions call for them:

- **`[BLOCK]` (Spatial Fence):** Use when 3+ subjects share the frame, when characters swap left/right marks across cuts, or when complex room geometry risks drift. Omit on simple single-subject or two-shot lines. Syntax: `[BLOCK] Miller frame-left FG facing screen-right; Park frame-left BG facing screen-right; Ray frame-right MG facing screen-left`.
- **`[LIGHT]` (Dynamic Illumination):** For in-shot lighting changes during the take (lightning flashes, sweeping headlights, strobing beacons, switching off a lamp): `[LIGHT] orange tunnel beacon slashes across the window`.
- **Specialized Tier 2 Coordinates (`[FOCUS]`, `[SPEED]`, `[PROP]`, `[ENV]`, `[CROWD]`, `[VFX]`, `[TRANS]`):** Deploy under the Single-Dimension Law only when that isolated dimension mutates independently of `[CAM]` and `[ACT]` (e.g., `[SPEED] 120fps slow-motion impact`, `[CROWD] commuters scatter toward exit doors`, `[ENV] gust of wind scatters loose papers`).
- **`[STATE IN]` / `[STATE OUT]` (Boundary Clamps):** Explicit head and tail posture/prop locks for multi-clip stitching or high-risk continuity handoffs: `[STATE IN] Mark's left hand clamped on overhead rail -> [ACT] … -> [STATE OUT] Mark planted on both boots, rail released`.
- **Token Mapping (`LOC01`, `CHR01`, `DIN01`):** For multi-location ensembles or tight character limits, declare shorthand tokens in `[AESTHETIC]` (or a custom staging block) using `Description -> TOKEN` (`Agile feathered raptor with serrated crest -> DIN01`) and reference the token (`DIN01`) in `[EXECUTION]`.
- **Multi-Clip Continuation (`[CONTINUITY PROTOCOL]`):** When chaining from `@video1`, insert `[CONTINUITY PROTOCOL]` before `[OPENING]` to lock terminal camera angle, subject momentum, and prop grips from the prior clip's final frame, then match `[OPENING]` ($S_0$) to that exact terminal state.

---

### Pre-Flight Ledger & Silent Verification Checklist

Mentally lock before writing Line 1:
- **Topology & Pacing:** Continuous oner, multi-camera coverage, cross-cut, or montage; target line count matched to scene tempo and duration.
- **Camera Plan:** Setup numbers (`[CAM 01]`, `[CAM 02]`) and angle positions relative to the 180° axis.
- **Viewport Map ($S_0$):** Who stands at `frame-left / center / right` and `FG / MG / BG`, and which way their eyeline faces (`facing screen-right / left`).
- **Prop & Hand Ledger:** Every held item and the exact hand (`left`, `right`, `both`) holding it across beats.
- **Condition Ledger:** Persistent marks (sweat, blood, mud, torn fabric) and core postures.

Verify before finalizing:
1. **Phase purity:** Zero motion verbs, bracketed tags, or sequenced events before `[EXECUTION]`.
2. **Orthogonality:** `[OPENING]` is a frozen $t=0$ photograph and does not restate `[AESTHETIC]`; `[EXECUTION]` never repeats static wardrobe or room architecture.
3. **Zero-jump handoff ($S_0 \to S_1$):** Line 1 matches `[OPENING]` in camera setup, subject coordinates, and pre-loaded hand grips.
4. **Repetition mandate:** Hand grips, postures, and volatile marks are restated in `[ACT]` on every visible beat until changed.
5. **Viewport & 180° discipline:** Only `frame-left/center/right` and `screen-left/right` are used (zero `stage-left/right`); position and facing orientation are distinct; reverse cuts have complementary eyelines.
6. **Camera topology:** Continuous scenes use numbered `[CAM 01]` (with operator transitions in oners); only discontinuous montages use plain `[CAM]`.
7. **Performance:** Every visible character is acting or reacting; emotions are written as observable anatomy; no detached participle fragments.
8. **Pace & slack:** Line count matches clip duration and genre tempo; cut count does not exceed $\text{Duration} \div 2.0$.
9. **Audio & dialogue resolution:** Dialogue uses `{ }`, sound uses `< >` selectively, room tone stays in `[AESTHETIC]`, and **no Macro-State ends on dialogue**.

---

### Audit and Diagnose Formats

**Audit report** (appended after the revised script in Revise/Audit mode). List only what failed and how it was repaired, followed by passing lenses, across the five supervisor lenses:
- **1. Spatial & Optics:** 180° axis, complementary eyelines, viewport coordinates (`frame-left/right`), $S_0 \to S_1$ handoff, camera numbering/oner continuity.
- **2. Temporal, Pacing & Wear:** Beat-to-duration calibration (no temporal slack or cut crowding), physical mark persistence, plausible action velocity.
- **3. Props & Inventory:** Explicit left/right hand tracking, unbroken prop lifecycle (`Held -> Used -> Released`), zero ghost props.
- **4. Acoustics & Voice:** Selective material/trigger foley, static bed isolated in `[AESTHETIC]`, `(O.S.)`/`(V.O.)` accuracy, no line ending on dialogue.
- **5. Block & Tag Orthogonality:** Single-dimension tags, zero lookbook bleed in `[EXECUTION]`, clean `@image` isolation in `[INTENT]`.

**Diagnose** (when a flawed video generation is reported). For each divergence, provide:
1. **Likely Cause:** Isolate whether the failure stems from *Prompt Omission*, *Vector / Axis Conflict*, *Temporal Slack / Cut Crowding*, or *Stochastic Latent Variance*.
2. **Surgical Fix:** Show only the revised block or Macro-State lines (or recommended duration/beat adjustment) that close the gap.
3. **Reroll Guidance:** State clearly whether to apply the edit or reroll the existing script as-is.

---

### Reference Examples (`v0.4.0` Canonical Inline Syntax)

#### Example 1: Continuous scene, POV handheld
```text
[INTENT]
Create a 1980s found-footage horror scene set at night in a fog-bound forest beside a black lake, featuring investigators Arthur and Rosa as they confront a towering creature half-hidden among the trunks.

[LOGIC]
Maintain continuous first-person POV without cuts and a stable woodland geography. Keep Arthur's flashlight in his right hand and Rosa's in her left, with beams falling off over distance and casting hard shadows. No subtitles appear on screen.

[AESTHETIC]
Medium: 1980s camcorder video, magnetic tape tracking noise, soft grain
Palette: pitch black, damp pine green, cold moonlight silver, tungsten yellow
Lighting: narrow flashlight beams, cold moonlight through the canopy
Location: mist-choked evergreen forest, damp pine needles, black lake shore
Wardrobe: Arthur in a dark denim jacket; Rosa in a navy flannel shirt
Audio: wind in the canopy, distant water lapping

[OPENING]
POV handheld MS at eye level, looking through damp boughs toward a black lake shore. Frame-right, Arthur stands in profile-left with a flashlight in his right hand, its beam fixed on swirling fog. Frame-left, Rosa stands with a second flashlight in her left hand, her gaze turned back toward the trees.

[EXECUTION]
[CAM 01] POV handheld MS, eye-level -> [ACT] Arthur, flashlight in his right hand, sweeps the beam left across tangled roots and wades forward through shallow mud -> <wet boots sucking at shallow mud>
[CAM 01] POV PAN LEFT to Rosa -> [ACT] Rosa, flashlight in her left hand, takes a hesitant step back and clutches her collar with her right hand -> Rosa says (whispering, breathless) {Did you hear that?} -> <low wood-snapping vibration in the canopy> -> [ACT] Rosa freezes, her right hand clamped over her mouth
[CAM 01] POV PAN RIGHT back to a two-shot -> [ACT] Arthur, flashlight in his right hand, halts, raises his left palm, and holds the beam on a towering silhouette between the trunks -> Arthur says (quietly) {Don't run.} -> [ACT] Rosa, flashlight in her left hand, retreats two steps, breath hitching
```

#### Example 2: High-tempo moving oner (5-beat calibration for 5s combat)
```text
[INTENT]
Create a gritty 35mm neo-noir action scene captured as an unbroken tracking oner inside a violently swaying subterranean express train, featuring @image1 as Mark and @image2 as Robert locked in a lethal hand-to-hand struggle.

[LOGIC]
Maintain continuous Steadicam persistence down the narrow center aisle without cuts, anchoring combat exchanges to the centrifugal sway of the carriage. Preserve a strict 180-degree axis with Mark frame-left facing screen-right and Robert frame-right facing screen-left until the overhead pivot. Track hand allocations strictly, clamping Mark's left hand to the overhead grab rail during the swing.

[AESTHETIC]
Medium: 35mm anamorphic film, fine halide grain, optical barrel distortion, shallow focal plane
Palette: desaturated industrial teal, tungsten amber bleed, bruised shadow tones, oxidized steel
Lighting: flickering overhead fluorescent tubes interspersed with rhythmic orange tunnel beacons through scratched windows
Location: narrow center aisle of an R46 commuter railcar, ribbed aluminum siding, overhead stainless steel grab bars, polycarbonate rear partition doors
Wardrobe: Mark in a sweat-damped cream waffle-knit henley, charcoal ripstop trousers, scuffed tactical boots; Robert in a matte-black ballistic armor carrier over a slate-gray combat shirt, hard-knuckle gloves, black cargo trousers
Audio: low-frequency railway chassis roar, metallic wheel flange squeal on curved rails, rattling ceiling panels

[OPENING]
Waist-level two-shot framed down the narrow center aisle between aluminum stanchions. Frame-left, Mark crouches in a low defensive stance facing screen-right, his bruised right forearm clamped upward against Robert's heavy left forearm. Frame-right, Robert looms in a squared clinch facing screen-left, gloved right fist cocked at his ribs under buzzing fluorescent tubes.

[EXECUTION]
[CAM 01] Waist-level MS, tracking backward down the aisle -> [ACT] Mark deflects Robert's descending hammerfist with his right forearm -> <sharp bone-on-forearm crack> -> [ACT] Robert pivots on his right heel and drives a horizontal elbow toward Mark's temple while Mark ducks inward, jamming the elbow joint with his open left palm -> <heavy fabric scuff>
[CAM 01] TRACKING BACKWARD IN RHYTHMIC SWAY -> [ACT] Robert drives a double palm-heel strike into Mark's sternum, forcing him two steps back -> [ACT] Mark absorbs the impact through his heels and counters with a right uppercut into Robert's armored solar plexus -> <hollow thud on ballistic plate> -> [ACT] Robert winces, boots skidding on the ridged rubber floor
[CAM 01] TILTING TO A DUTCH ANGLE AS THE CARRIAGE BANKS RIGHT -> <piercing wheel flange screech on curved track> -> [ACT] Centrifugal pull hurls both fighters against the frame-left seats, breaking their clinch -> [ACT] Robert catches a stanchion with his left hand and lunges forward with a looping right cross
[CAM 01] CRANING DOWN AND ARCING TO FLANK MARK -> [ACT] Mark reaches upward and clamps his bare left hand onto the overhead steel grab rail -> <ringing slap on steel tubing> -> [ACT] Mark hoists his weight on his left arm, tucks under Robert's overextended punch, and hooks his right arm behind Robert's vest strap -> <strained steel creak>
[CAM 01] PUSHING HARD FORWARD TOWARD THE REAR DOORS -> [ACT] Mark releases the rail with his left hand, twists his hips, and hurls Robert backward down the vestibule -> [ACT] Robert crashes spine-first into the polycarbonate partition doors -> <explosive crystalline spiderweb crack> -> [ACT] Robert slumps against the fractured glass as Mark plants both boots in the aisle, chest heaving
```

#### Example 3: Dialogue coverage, three subjects, camera recall
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

#### Example 4: Discontinuous montage (plain `[CAM]`, severed inheritance)
```text
[INTENT]
Create a kinetic 1970s heist-thriller teaser built from rapid independent shots of a getaway driver, a safecracker, and a lookout in the hour before a bank job.

[LOGIC]
Treat every shot as an independent moment with no inherited posture or props, give each line its own subject, light, and location, and keep screen direction consistent within each shot.

[AESTHETIC]
Medium: 16mm film, heavy grain, warm halation
Palette: mustard yellow, oxblood red, smoke grey
Lighting: hard tungsten practicals, dusk sodium streetlight
Wardrobe: driver in a tan leather jacket and driving gloves; safecracker in a rumpled brown suit and wire glasses; lookout in a green parka with a fur hood
Audio: rain on metal, distant traffic

[OPENING]
Low-angle MCU through a rain-streaked windshield. Frame-center, the driver sits at the wheel, gloved hands at ten and two, eyes fixed on a bank entrance across the street.

[EXECUTION]
[CAM] Low-angle MCU through a rain-streaked windshield -> [ACT] The driver in the tan leather jacket tightens his gloved grip on the wheel and glances at the rearview mirror -> <engine catching>
[CAM] ECU on a brass dial in a dim vault -> [ACT] The safecracker in the brown suit, wire glasses glinting, presses his ear to the safe door and turns the dial a quarter turn with his right fingertips -> <tumblers clicking>
[CAM] WS from a rooftop at dusk under sodium streetlight -> [ACT] The lookout in the green parka raises binoculars in both hands and tracks a patrol car sliding past below -> <distant siren swelling and fading>
[CAM] CU on the driver's eyes in the rearview mirror -> [LIGHT] red and blue patrol-car strobes sweep across his face -> [ACT] The driver's pupils narrow as he shifts into gear with his right hand
```

#### Example 5: Diagnose output format (Continuity vs. Temporal Slack)
Given user report: *"In my 10-second render of the train fight, Mark's swing from the overhead bar looked like slow-motion low-gravity floating, and earlier his skillet in the kitchen fight vanished when he reached the table."*
```text
1. Overhead bar float — Cause (likely): Temporal slack (Beat-to-Duration mismatch). Five combat Macro-States stretched across a 10-second generation allocate ~2.0s per beat, leaving ~1.2s of dead air during a 0.8s physical swing.
   - Fix: Either render the 5-beat script at 5 seconds (1.0s per beat), or expand [EXECUTION] to 8–10 Macro-States by inserting intermediate footwork checks, grip adjustments, and landing recovery beats.
2. Vanishing skillet — Cause (likely): Prompt omission (continuity gap). The skillet in Mark's right hand was not restated on the line where he reached the table edge.
   - Fix: [CAM 01] CRANING DOWN to a low-angle OTS behind Mark -> [ACT] Mark reaches the table edge, skillet in his right hand, and shoves a tall wheeled service cart with his left hand and shoulder -> …
3. Reroll advice: Apply the skillet restatement and generate at 5s (or expand to 9 beats for 10s) before rerolling.
```

---

================================================================================
## Document 2B: Module — Multimodal Character Reference Binding
================================================================================

### 1. Scope
Governs how reference tags (`@actor`, `@image`, `@audio`) are assigned, bound to narrative personas, and structured within the script without contaminating downstream prompt blocks.

### 2. Reference Binding Syntax in `[INTENT]`
Bind multimodal assets directly to character personas exclusively in the opening definition:
- **Format**: `@actor1 as NAME, [brief profession / archetype / trait]` (or `@image1 as NAME...`)
- **Examples**:
  - `@actor1 as SAMIRA, an exhausted artist hiding deep depression`
  - `@actor2 as FELIX, her gentle, reliable long-time friend`
  - `@image1 as MARK (voice: @audio1), a frustrated junior mathematics professor`
- **Mandate**: Always assign a concrete character name and a clear profession, archetype, or role to every referenced material.

### 3. Strict Scope Rule: Tag Isolation in `[INTENT]` Only
- **Intent-Only Declaration**: Use `@actor` / `@image` tags **exclusively** inside `[INTENT]` (or `[CHARACTERS]`).
- **Downstream Usage**: In all subsequent blocks—`[LOGIC]`, `[AESTHETIC]`, `[OPENING]`, and `[EXECUTION]`—refer to characters strictly by their **established character names** (e.g., `Samira`, `Felix`, `Mark`, `Robert`).
- **Never Repeat Reference Tags**: Never write `@actor1` or `@actor2` inside `[LOGIC]`, `[AESTHETIC]`, `[OPENING]`, or `[EXECUTION]`.

### 4. Placement Standards
- **Standard Approach (1–3 characters, inline in `[INTENT]`):**  
  `[INTENT] Create a cinematic drama scene featuring @actor1 as SAMIRA, an exhausted painter, and @actor2 as FELIX, her loyal studio partner, inside a rain-soaked laundromat...`
- **Dedicated Block Approach (4+ characters, `[CHARACTERS]` or `[REFERENCES]` before `[AESTHETIC]` or `[OPENING]`):**
```text
[CHARACTERS]
@actor1 as EVAN: 30s explorer, weathered features, weary posture.
@actor2 as FELIX: 20s scholar, wire-rimmed glasses, gentle demeanor.
@image1 as THE BEAST: Colossal petrified skeletal stag with obsidian antlers.
```

### 5. Multimodal Assignment Rules
1. **One Explicit Role Per Material**: Assign each reference material to exactly one narrative subject.
2. **Cardinality Alignment**: A single-person reference image must represent only one person on screen.
3. **Preserve User Reference Labels**: Never alter user-supplied reference identifiers (`@actor1`, `@image1`, etc.).
4. **Unused Materials**: If multiple reference assets exist but only a subset are active, list unused assets under an `[Unused Materials]` block or footnote to prevent hallucination.

---

================================================================================
## Document 2C: Module — Aesthetic Token Mapping
================================================================================

### 1. Scope
Establishes a formal lookup dictionary inside `[AESTHETIC]` to bind complex environmental, wardrobe, or prop descriptions to compact alphanumeric tokens.

### 2. Dictionary Syntax in `[AESTHETIC]`
Declare mapping tokens using `Description -> TOKEN`:
```text
[AESTHETIC]
Location Mapping: Vintage retro bowling alley with neon lanes -> LOC01; Symmetrical taxidermy library with mahogany shelves -> LOC02
Wardrobe Mapping: Evan in mustard yellow track jacket and red sweatband -> EV01; Evan in tweed vest and wool beanie -> EV02; Felix in dark navy tailored blazer -> FE01
Props Mapping: Intricate silver recurve bow with black fletching -> PROP01; Weathered dark-oak metronome -> PROP02
```

### 3. Shorthand Usage Downstream
Once defined in `[AESTHETIC]`, reference strictly the compact token in `[OPENING]` and `[EXECUTION]`:
```text
[OPENING]
MS, Evan in EV01 stands frame-left inside LOC01, holding PROP01 in his right hand.

[EXECUTION]
[CAM 01] MS, lockoff -> [BLOCK] Evan in EV01 at LOC01 -> [ACT] Evan sets PROP01 onto the counter -> <metallic thud>
[CAM 02] WS -> [TRANS] Match-on-action cut to LOC02 -> [BLOCK] Evan in EV02 seated frame-right -> [ACT] Evan opens a leather journal -> <crisp paper rustle>
```

### 4. Benefits for Tooling & Token Budgets
1. Prevents repeating 30-word wardrobe or set descriptions across 10+ Macro-State lines.
2. Keeps `[EXECUTION]` lines scannable for both human pre-visualization and AST parsers.
3. Provides explicit dictionary lookups (`LOC01`, `EV01`, `PROP01`) that highlighters and state trackers can resolve back to `[AESTHETIC]`.

---

================================================================================
## Document 2D: Module — Multi-Clip Video Continuation Pipeline
================================================================================

### 1. Scope
Controls script architecture when extending an existing video generation (`@video1`) or chaining sequential multi-clip narrative scenes across a timeline.

### 2. Multi-Clip Scaffold Architecture

```text
[INTENT] (or [GOAL]) ──► [CONTINUITY PROTOCOL] ──► [AESTHETIC] (reduced) ──► [OPENING] ──► [EXECUTION]
```

### 3. Block Rules for Video Extension
1. **`[INTENT]` (or `[GOAL]`):** Explicitly declares continuation from `@video1`:  
   `Create a seamless cinematic continuation of @video1 featuring @actor1 as EVAN...`
2. **`[CONTINUITY PROTOCOL]`:** Replaces or supplements `[LOGIC]` to define boundary-condition matching with the source video:
   - Enforces unbroken inheritance from the **final frame of `@video1`**.
   - Locks established camera setups (`[CAM 01]`, `[CAM 02]`), lighting angles, wardrobe wear/stains, and wind/weather vectors.
   - Specifies match-on-action rules between the end of `@video1` and the start of Part 2.
3. **`[AESTHETIC]` (Reduced Lookbook):** Condensed to only the categories active or vulnerable to drift in the continuation beat (typically `Wardrobe` and `Audio`).
4. **`[OPENING]` (Boundary Frame Anchor):** Must describe the precise composition and physical state of the **final visible frame of `@video1`** (treated as ground truth).
5. **`[EXECUTION]`:** Begins immediately from the boundary frame without a black frame, jump cut, or repositioning glitch.
