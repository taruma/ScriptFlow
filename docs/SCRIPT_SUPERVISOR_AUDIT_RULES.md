# Script Supervisor Audit Rules — Human-Readable Reference (`v0.4.0`)

This document is the single, human-readable checklist of all **Script Supervisor Audit Rules** for **Pure Auteur Script (`v0.4.0`)**.

It brings together three complementary audit layers:
1. **Deterministic Rules (Live Automated Linter)** — 5 pure rules enforced synchronously on every keystroke and patch inside `src/core/linter.ts`.
2. **Semantic Quick Scan Rules (Optional Declarative Pre-Screen)** — 15 atomic binary (`true`/`false`) semantic checks defined in `src/data/knowledge/quick-scan-rules.json` (`src/data/knowledge/index.ts`), gated by topology and script-presence predicates.
3. **Contextual Craft Rules (Deep 5-Lens Script Supervisor Review)** — evaluated per lens by human reviewers or automated pipelines using the focused JSON projections in `AUDIT_LENS_PRESETS` (`src/core/slicer.ts`).

---

## 1. Context-Aware Auditing: The 4 Scene Topologies

Rules never apply blindly across genres—every audit begins by identifying the script's **Scene Topology** (`derived.sceneTopology` in `AuteurEnvelope`):

| Topology | Camera Pattern | `derived.sceneTopology` | Continuity Contract |
|---|---|---|---|
| **1. Continuous Oner** | Single numbered slot (`[CAM 01]`) throughout | `'continuous_oner'` | Strict unbroken inheritance ($S_0 \to S_1 \to \dots \to S_n$). Lines 2+ use operator moves (`PAN`, `CRANING`, `TRACKING`), never static shot-scale re-declarations. |
| **2. Multi-Camera Coverage** | Multiple numbered slots (`[CAM 01]`, `[CAM 02]`, …) | `'multi_camera_coverage'` | Real-time continuous scene with editorial cuts, bare holds (`[CAM 01] ->`), and recalls (`[CAM 01] ->`). Strict 180° axis, eyelines, and hand-prop tracking. |
| **3. Parallel Cross-Cutting** | Alternating numbered slots across two locations ($A_k \parallel B_k$) | `'multi_camera_coverage'` *(dual state ledgers)* | Dual independent State Ledgers: Location A inherits strictly from $A_{k-1}$ with zero lighting, wardrobe, or prop bleed into Location B. |
| **4. Discontinuous Montage** | Plain unnumbered `[CAM]` (`identifier: null`) | `'discontinuous_montage'` | Inheritance severed between lines. Each Macro-State anchors its own subject, light cue, and setting (or declared shorthand token `LOC01`). |

> **Deterministic IR Edge States**: `derived.sceneTopology` also emits `'mixed'` when numbered `[CAM ##]` and unnumbered `[CAM]` shots coexist (or when `[EXECUTION]` contains no camera Sub-States), and `'empty'` when `[EXECUTION]` has zero Macro-States.

---

## 2. Deterministic Rules (Live Automated Linter — `LINT_RULE_REGISTRY`)

These **5 declarative rules** live in `LINT_RULE_REGISTRY` inside `src/core/linter.ts`. They run synchronously on every edit (surfaced in the editor's right-margin `DiagnosticDot`, top-bar diagnostic counter, and `AuteurEnvelope.derived.diagnostics`) and are enforced by `applyAuteurPatch(..., { rejectOnNewErrors: true })`.

### Overridable Severity Behavior
- **In-App Controls**: Open **Settings → Supervisor rules** to set any rule to **`Off`**, **`Warn`**, or **`Error`** (plus **Reset defaults**). Changes update diagnostics immediately and persist in `localStorage`.
- **Programmatic API**: Call `lintDocument(doc, metadata?, ruleOverrides?)` with `Partial<Record<LintRuleId, 'off' | 'warning' | 'error'>>`:
  - **Omitted / Default**: Runs every rule with its built-in default severity (preserving phase-contextual defaults such as Staging `warning` vs. Execution `error` for `multimodal-reference-isolation`).
  - **`'off'`**: Suppresses the rule completely without affecting any other rule.
  - **`'warning'` / `'error'`**: Demotes or promotes every diagnostic emitted by that rule to the chosen severity.

| # | Rule ID | Status | Lens | Default Severity | Overridable Behavior | What It Checks & How to Fix |
|---|---|---|---|---|---|---|
| **1** | `viewport-coordinate-purity` | Active · Configurable | **Lens 1: Spatial & Optics** | `error` | `off` \| `warning` \| `error` | Flags banned theatrical directions (`stage-left` / `stage-right`) in `[LOGIC]`, `[OPENING]`, or `[EXECUTION]`. **Fix:** Use camera-viewport coordinates (`frame-left` / `frame-right` or `screen-left` / `screen-right`) and separate position from `facing screen-*` orientation. |
| **2** | `camera-redefinition-guard` | Active · Configurable | **Lens 1: Spatial & Optics** | `warning` | `off` \| `warning` \| `error` | Flags when an already-established numbered camera slot (`[CAM 01]`, `[CAM 02]`) re-declares a static shot-scale token (`EWS`, `WS`, `FS`, `MWS`, `MLS`, `MS`, `MCU`, `CU`, `ECU`, `OTS`, `POV`, `INS`, `two-shot`, `low-angle`, `high-angle`) on a later Macro-State without an operator motion verb (`PAN`, `TILT`, `CRANE`, `TRACK`, `DOLLY`, `PUSH`, `PULL`, `ARC`, `BOOM`, `WHIP`, `SWING`, `DRIFT`, `GLIDE`, `ORBIT`, `PEDESTAL`, `ZOOM`, `FOLLOW`, `SLIDE`, `MOVE` and `-ING` forms). **Fix:** Use a bare hold/recall (`[CAM 01] ->`), an operator motion transition (`[CAM 01] PAN LEFT ->`), or cut to a new camera slot (`[CAM 02]`). *(First appearances in continuation scripts with `[CONTINUITY PROTOCOL]` / `@video1` are allowed.)* |
| **3** | `macro-state-resolution` | Active · Configurable | **Lens 4: Acoustics & Voice** | `warning` | `off` \| `warning` \| `error` | Flags any `[EXECUTION]` Macro-State line whose final Sub-State is spoken `{dialogue}`. **Fix:** Always chain an immediate `[ACT]` or `<foley>` Sub-State after the dialogue Sub-State. |
| **4** | `multimodal-reference-isolation` | Active · Configurable | **Lens 5: Blocks & Grammar** | Staging: `warning`<br>Execution: `error`<br>*(registry headline: `error`)* | `off` \| `warning` \| `error` | Flags `@ref` tags (`@image1`, `@audio1`, etc., excluding email addresses) outside `[INTENT]`, `[GOAL]`, `[CHARACTERS]`, `[REFERENCES]`, `[CONTINUITY PROTOCOL]` (including any header containing `CONTINUITY`), or `[UNUSED MATERIALS]`. Defaults to a soft **rule-of-thumb `warning`** inside other Phase 1 Staging blocks (`[LOGIC]`, `[AESTHETIC]`, `[OPENING]`, custom blocks) and a strict **`error`** inside `[EXECUTION]`. **Fix:** Declare `@ref as Name` in `[INTENT]`, `[CHARACTERS]`, or `[REFERENCES]`, then use canonical character names downstream. |
| **5** | `frozen-first-frame-purity` | Active · Configurable | **Lens 5: Blocks & Grammar** | `error` | `off` \| `warning` \| `error` | Flags any square-bracketed `[TAG]` token inside `[OPENING]`. **Fix:** Write `[OPENING]` strictly as 2–4 sentences of motionless plain prose locking $t = 0$. |

---

## 3. Complete 5-Lens Script Supervisor Checklist

Use this checklist when reviewing a script manually or configuring an automated Script Supervisor pass with `sliceAuteurScript(rawText, '<preset>')`.

### Lens 1 — Spatial & Optics (`lens1_spatial_optics`)
*Focus: 180° axis, viewport geometry, camera visibility, $S_0 \to S_1$ handoff, and camera numbering.*

- [ ] **No Theatrical Directions** *(Automated · Default `error`)*: Zero `stage-left` or `stage-right` anywhere in `[LOGIC]`, `[OPENING]`, or `[EXECUTION]`.
- [ ] **Position vs. Orientation Separated**: Screen position uses `frame-left` / `frame-center` / `frame-right` + depth (`FG`, `MG`, `BG`); anatomical yaw uses `facing screen-left/right`, `in profile-left/right`, or `back to camera`.
- [ ] **180° Axis & Eyeline Parity**: If Subject A is `frame-left` looking `screen-right`, a reverse shot places Subject B `frame-right` looking `screen-left` unless crossed via an explicit neutral shot (frontal CU/POV) or arcing camera move.
- [ ] **Action Visibility vs. Active Camera**: Every `[ACT]` detail (e.g., an eye blink, palm press, or hand gesture) is physically visible from the active `resolvedCamera.effectiveFraming` (for example, an OTS behind Miller cannot clearly show Miller's subtle eye movement).
- [ ] **Clean $S_0 \to S_1$ Handoff**: Line 1 (`S1`) opens with the exact camera setup, spatial layout, posture, and hand grips locked in `[OPENING]`.
- [ ] **No Oner Jump-Cut Re-Declarations** *(Automated · Default `warning`)*: Established `[CAM 01]` setups hold via `[CAM 01] ->` or move via operator verbs (`PAN`, `TRACKING`, `CRANING`), never re-stating static shot scales.
- [ ] **Spatial Fence for 3+ Subjects**: Multi-character rooms or mark swaps use an explicit inline `[BLOCK]` Sub-State to lock viewport coordinates.

#### Viewport Reference Diagram
```text
◄── [ FRAME-LEFT ] ────────── [ FRAME-CENTER ] ────────── [ FRAME-RIGHT ] ──►
     (Viewer Left)                                         (Viewer Right)
  [ STAGE-RIGHT (BANNED) ] ◄──── ACTOR FACING LENS ────► [ STAGE-LEFT (BANNED) ]
```

---

### Lens 2 — Temporal, Pacing & Wear (`lens2_temporal_pacing_wear`)
*Focus: Macro-State-to-duration calibration, cut density, plausible velocity, and physical baggage persistence.*

- [ ] **Cut-Latency Floor**: In cut-based coverage or montage, cut count does not exceed $\text{Duration (s)} \div 2.0$ (each cut needs ~1.5s–2.5s to stabilize).
- [ ] **Anti-Float Calibration (Temporal Slack)**: Action oners target **0.8s–1.2s per Macro-State** (~4–5 lines per 5s; ~8–10 lines per 10s). Dramatic dialogue targets **2.5s–4.0s per Macro-State**.
- [ ] **Physical Wear Persistence (The Repetition Mandate)**: Accumulated physical baggage—sweat, blood, mud, bruises, soaked clothing, exhaustion—is restated in an `[ACT]` Sub-State on every visible Macro-State line until cleaned or resolved.
- [ ] **Plausible Kinetic Transitions**: Posture changes (`seated -> standing`, `crouching -> lunging`) follow physically connected momentum with no teleporting across the room between consecutive Macro-State lines.

| Genre / Tempo | Recommended Mode | Target Interval per Macro-State | Max Cut Cadence | Failure Mode if Violated |
|---|---|---|---|---|
| **Close-Quarters Combat / Chase** | Continuous Oner | `0.8s – 1.2s` | 1 cut / `2.0s–2.5s` | Temporal Slack (floaty low-gravity motion) |
| **Tactical Gunplay / Standoff** | Hybrid Coverage | `1.5s – 2.0s` | 1 cut / `2.5s–3.0s` | Mannequin freeze behind cover |
| **Dramatic Dialogue / Interrogation** | Multi-Cam Coverage | `2.5s – 4.0s` | 1 cut / `3.0s–5.0s` | Accelerated robotic lip-sync |
| **Horror / Mystery / Noir** | Slow Creep Oner | `4.0s – 6.0s+` | 1 cut / `5.0s–8.0s` | Rushed tension / cut-off acoustic decay |

---

### Lens 3 — Props & Inventory (`lens3_props_inventory`)
*Focus: Hand allocation (`left` / `right` / `both`), prop permanence, and zero ghost props.*

- [ ] **Explicit Hand Allocation**: Every held prop names the exact hand (`in his right hand`, `under her left palm`, `in both hands`) matching `[LOGIC]` and `[OPENING]`.
- [ ] **Unbroken Prop Lifecycle**: Props follow a valid state chain (`Stored -> Picked Up -> Held -> Used -> Released/Put Down`). No object vanishes without being set down or dropped, and no object appears out of thin air.
- [ ] **No Hand Collisions**: A character cannot grab a second prop with a hand that is already holding an item unless they release or transfer the first item explicitly.
- [ ] **Repetition Across Cuts**: When returning to a character after a cut or recall (`[CAM 01] ->`), key held props are restated concisely in `[ACT]`.

---

### Lens 4 — Acoustics & Voice (`lens4_acoustics_voice`)
*Focus: Dialogue formatting, selective `<foley>`, room tone isolation, and Macro-State resolution.*

- [ ] **Macro-State Resolution Rule** *(Automated · Default `warning`)*: No Macro-State line ends on spoken `{dialogue}`; always follow with `[ACT]` physical reaction or `<foley>` trigger.
- [ ] **Curly-Brace Dialogue Lock**: Spoken lines strictly use `Speaker says (delivery) {line}` (optional `in Language`, `(O.S.)`, `(V.O.)`), never quotation marks and never legacy `[DIAL]`/`[AUDIO]` tags.
- [ ] **Room Tone Isolation**: Continuous background ambience (rain, ballast hum, wind, traffic) stays in `[AESTHETIC]` (`Audio:`) and is not spammed as a `<foley>` Sub-State on every `[EXECUTION]` Macro-State line.
- [ ] **Selective Diegetic `<foley>`**: Use `<sound>` only for distinct physical friction, impacts, or off-screen triggers; restate persistent discrete sounds explicitly (`<low growl continues>`).
- [ ] **Subtitle Guard**: When spoken dialogue is present and on-screen captions are unwanted, `[LOGIC]` ends with `No subtitles appear on screen.`
- [ ] **Opt-In Score & On-Screen Text**: `(score)` and `【on-screen text】` appear only when explicitly intended.

---

### Lens 5 — Blocks & Grammar (`lens5_blocks_grammar`)
*Focus: Phase Partition Law, Block Orthogonality, Single-Dimension Law, and canonical syntax purity.*

- [ ] **Multimodal Reference Isolation** *(Automated · Default `warning` in Staging, `error` in Execution)*: Keep `@image` / `@audio` / `@video` bindings in `[INTENT]`, `[GOAL]`, `[CHARACTERS]`, `[REFERENCES]`, `[CONTINUITY PROTOCOL]`, or `[UNUSED MATERIALS]`, and never leak `@ref` tokens into `[EXECUTION]`.
- [ ] **Frozen First-Frame Purity** *(Automated · Default `error`)*: `[OPENING]` contains zero `[TAG]` tokens, zero motion verbs, and zero audio cues—pure $t = 0$ still description.
- [ ] **Flowing `[INTENT]` (Zero Shot List)**: `[INTENT]` is one concise directorial sentence starting with `"Create …"`, never a play-by-play shot list.
- [ ] **Zero Lookbook Bleed**: `[EXECUTION]` does not restate static wardrobe, lens stock, color palette, or room architecture already locked in `[AESTHETIC]` (use declared shorthand tokens like `LOC01` when referencing settings in montage/multi-location scripts).
- [ ] **Single-Dimension Law**: Each Sub-State separated by `->` directs strictly one dimension (e.g., never blend camera motion and actor choreography inside a single `[CAM 01]` tag—split into `[CAM 01] PUSH-IN -> [ACT] ...`).

---

## 4. Optional Semantic Quick Scan Rule Layer (`QUICK_SCAN_RULES_VERSION = "0.4.0-qs2"`)

Between the 5 synchronous deterministic regex rules (`src/core/linter.ts`) and a full multi-lens Script Supervisor review, Pure Auteur Script defines a portable, model-agnostic catalog of **15 atomic semantic binary rules** in `src/data/knowledge/quick-scan-rules.json` (validated and normalized by `resolveQuickScanRuleCatalog()` in `src/data/knowledge/index.ts`).

Each rule answers a single yes/no semantic check (`true` = violation detected, `false` = clean), declares an explicit `scope` (`'document' | 'macro_state' | 'sub_state'`), attaches to one of the 5 Audit Lenses or `'brief'`, and specifies topology/presence `when` predicates (`all`, `continuous`, `oner`, `montage`, `has_opening`, `has_intent`, `has_aesthetic`, `has_dialogue`, `has_foley`, `has_action`, `has_action_or_prop`, `has_brief_text`, `has_brief_media`, `sub_is_action`, `sub_is_camera`, `sub_is_foley`, `sub_is_dialogue`, `sub_is_action_or_prop`) so irrelevant checks never fire on the wrong Scene Topology. Each rule also carries an `escalationHint` for handing flagged items off to deep 5-Lens review or surgical patching.

| Scope | Rule ID | Lens | Applicability (`when`) | What Triggers `true` |
|---|---|---|---|---|
| `document` | `doc_opening_motion` | `lens5_blocks_grammar` | `has_opening` | `[OPENING]` describes ongoing motion or camera movement instead of a frozen $t = 0$ frame. |
| `document` | `doc_opening_audio` | `lens5_blocks_grammar` | `has_opening` | `[OPENING]` mentions audible sounds, ambience, foley, or spoken dialogue. |
| `document` | `doc_intent_shotlist` | `lens5_blocks_grammar` | `has_intent` | `[INTENT]` reads like a multi-step shot list instead of one flowing directorial sentence. |
| `document` | `doc_eyeline_parity` | `lens1_spatial_optics` | `continuous` | `[EXECUTION]` flips screen placement or facing yaw vs. `[LOGIC]`/`[OPENING]` without an axis bridge. |
| `document` | `doc_s0_s1_handoff` | `lens1_spatial_optics` | `continuous`, `has_opening` | Macro-State `S1` contradicts framing, posture, layout, or hand grips locked in `[OPENING]`. |
| `document` | `doc_subtitle_guard` | `lens4_acoustics_voice` | `has_dialogue` | Spoken `{dialogue}` appears while `[LOGIC]` omits any subtitle policy. |
| `document` | `doc_wear_persistence` | `lens2_temporal_pacing_wear` | `continuous` | Established physical wear (sweat, blood, mud, bruises, soaked clothes) vanishes from later visible Macro-States without resolution. |
| `document` | `doc_brief_specs` | `brief` | `has_brief_text` | Script contradicts explicit format, shot-style, line-count, tone, or production constraints in the active Scene Brief. |
| `document` | `doc_brief_media` | `brief` | `has_brief_media` | Script contradicts character identity, wardrobe, setting, audio identity, or continuation details in attached reference media. |
| `macro_state` | `state_lookbook_bleed` | `lens5_blocks_grammar` | `has_aesthetic` | A Macro-State redundantly restates static wardrobe, film medium, palette, or architecture already locked in `[AESTHETIC]`. |
| `macro_state` | `state_cam_visibility` | `lens1_spatial_optics` | `has_action` | A Macro-State describes `[ACT]` details physically hidden or unreadable from its active `[CAM]` framing/angle. |
| `macro_state` | `state_hand_allocation` | `lens3_props_inventory` | `has_action_or_prop` | A character manipulates a distinct handheld prop without naming left hand, right hand, or both hands. |
| `macro_state` | `state_montage_anchor` | `lens1_spatial_optics` | `montage` | An independent montage Macro-State omits its subject or setting/location cue (`LOC##`). |
| `sub_state` | `state_single_dimension` | `lens5_blocks_grammar` | `sub_is_action` | An `[ACT]` Sub-State mixes camera motion/cuts, spoken dialogue, or foley/score instead of chaining with `->`. |
| `sub_state` | `state_ambient_foley` | `lens4_acoustics_voice` | `sub_is_foley` | A `<foley>` Sub-State describes continuous room tone/ambience that belongs in `[AESTHETIC]` `Audio:`. |

---

## 5. Quick Pass / Fail Examples

| Rule | Fail / Warning (Violates Rule) | Pass (Canonical `v0.4.0`) |
|---|---|---|
| **Viewport Coordinates** | `[ACT] Miller steps stage-left toward Ray` *(Error)* | `[ACT] Miller steps frame-right toward Ray` |
| **Oner Camera Continuity** | Line 2: `[CAM 01] Low-angle MS -> [ACT] ...` *(Warning)* | Line 2: `[CAM 01] CRANING DOWN -> [ACT] ...` *(or bare `[CAM 01] ->`)* |
| **Macro-State Resolution** | `[CAM 02] CU Ray -> Ray says {Never.}` *(Warning)* | `[CAM 02] CU Ray -> Ray says {Never.} -> [ACT] Ray taps ash onto the steel` |
| **Reference Isolation (Staging)** | `[AESTHETIC]` → `Wardrobe: @image1 in wool coat` *(Warning)* | `[INTENT]` binds `@image1 as Miller`; `[AESTHETIC]` → `Wardrobe: Miller in wool coat` |
| **Reference Isolation (Execution)** | `[EXECUTION]` → `[ACT] @image1 slides folder` *(Error)* | `[INTENT]` binds `@image1 as Miller`; `[EXECUTION]` → `[ACT] Miller slides folder` |
| **Frozen `[OPENING]`** | `[OPENING]` → `[CAM 01] MS. Miller walks in.` *(Error)* | `[OPENING]` → `MS at eye level. Frame-left, Miller stands facing screen-right.` |
| **Single-Dimension Law** | `[CAM 01] PUSH-IN as Miller slams the file` | `[CAM 01] PUSH-IN -> [ACT] Miller slams the file -> <heavy thud>` |

---

## 6. Where Rules Live in the Codebase

- **Declarative Deterministic Registry & Engine**: `src/core/linter.ts` (`LINT_RULE_REGISTRY`, `getLintRuleDefinition`, `lintDocument(doc, metadata?, ruleOverrides?)`, plus exported pure rule functions `lintViewportCoordinates`, `lintCameraRedefinition`, `lintMacroStateResolution`, `lintMultimodalReferenceIsolation`, `lintFrozenFirstFrame`).
- **Declarative Semantic Quick Scan Catalog**: `src/data/knowledge/quick-scan-rules.json` and `src/data/knowledge/index.ts` (`QUICK_SCAN_RULES_VERSION`, `BUNDLED_QUICK_SCAN_RULES`, `resolveQuickScanRuleCatalog`).
- **In-App Rule Settings & Persistence**: `src/ui/lintRules.ts` (`sanitizeLintRuleOverrides`, `getEffectiveLintRuleSeverity`, `setLintRuleOverride`, `countCustomLintRules`), `src/ui/editorSettings.ts` (`useEditorSettings`), and `src/components/SettingsPopover.tsx` (**Settings → Supervisor rules**).
- **Automated Rule Unit Tests**: `tests/core/linter.test.ts` (positive & negative cases, Staging vs. Execution `@ref` defaults, `ruleOverrides` suppression/promotion/demotion, and zero-false-positive verification across all 4 canonical presets in `src/data/examples/catalog.json`) and `tests/ui/uiState.test.ts` (`lintRules` state helpers).
- **Lens Evaluation Slicers & Review Schema**: `src/core/slicer.ts` (`AUDIT_LENS_PRESETS`, `sliceAuteurEnvelope`, `sliceAuteurScript`, `validateAuteurReview`) and `docs/JSON_IR_SPEC.md`.
