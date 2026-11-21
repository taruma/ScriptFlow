# AI Assistant Walkthrough & Tools Guide

This guide explains how the **Auteur Script Editor AI Assistant** works end-to-end—from BYOK setup and unified `Auto` focus routing to every local script tool, passive/on-demand skill, pre-send prompt customization, review card workflow, and debug trace inspection.

> **Related References**
> - **Architecture & Data Flow**: [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) (§6)
> - **Script Supervisor Rules & 5 Audit Lenses**: [`docs/SCRIPT_SUPERVISOR_AUDIT_RULES.md`](SCRIPT_SUPERVISOR_AUDIT_RULES.md)
> - **Programmatic JSON IR, Patches & Slicer**: [`docs/JSON_IR_SPEC.md`](JSON_IR_SPEC.md)
> - **Canonical `v0.4.0` Syntax Contract**: [`docs/GRAMMAR_CONTRACT.md`](GRAMMAR_CONTRACT.md)

---

## 1. Mental Model: How the AI Assistant Works

The AI Assistant is **multi-turn, agentic, and strictly suggestions-first**—not a one-shot text generator and never an unchecked auto-editor.

### Core Principles
1. **Plain-Text-as-Truth & Zero Direct Mutation**: None of the AI tools can directly overwrite your editor text. Every draft, targeted edit, or audit fix is validated against Zod schemas and the deterministic Script Supervisor linter, then staged as a reviewable card (`Apply`, `Apply Fix`, `Fork & Apply`, or `Dismiss`). Clicking **Apply** commits a single undoable history checkpoint (`Cmd/Ctrl+Z`).
2. **Multi-Turn Memory (`previous_interaction_id`)**: Conversation continuity is maintained across user messages via the Gemini Interactions API (`client.interactions.create` with `stream: true`), while a fresh **Live Editor State** summary (`snapshotHash`, `changedSinceLastTurn`, `sceneTopology`, active lint counts) is injected on every turn so manual edits or clicked Apply actions never leave the model working on stale memory.
3. **Agentic Tool Loop (Up to 8 Rounds per Turn)**: Round 1 never dumps your entire script into the chat prompt. Instead, the model receives your craft rules, live editor summary, skill directory, and pruned tool schemas, then pulls only the overview, lens slices, or craft skills it needs locally in your browser before staging its result.
4. **3-Layer Verification Stack**:
   - **Layer 1 — Grammar & Schema Integrity** (`src/core/parser.ts`, `irSchemas.ts`, `patch.ts`): Structural validity, snapshot concurrency (`expectedSnapshotHash`), and valid target IDs (`MB#`, `S#`).
   - **Layer 2 — Deterministic Code Linter** (`src/core/linter.ts`): 5 instant, zero-token rules enforced on every keystroke and every AI dry-run (`rejectOnNewErrors: true`).
   - **Layer 3 — AI Semantic Script Supervisor** (`src/core/slicer.ts` + selected Gemini 4 model): Evaluates spatial 180° eyelines, camera visibility, prop hand-tracking, temporal pacing, physical wear, and lookbook bleed across the 5 lenses.

### Turn Execution Lifecycle

```text
You send a prompt (in Auto / Draft / Refine / Audit focus)
   │
   ▼
[Pre-Send Composer] composeAgentContext() runs locally:
  • Parses current rawText -> snapshotHash, sceneTopology, deterministic lint
  • Resolves every built-in & custom skill into: active | available | muted
  • Prunes allowed tools by Focus + editor emptiness
  • Assembles system_instruction (Editable Craft + Live State + Active Scene Brief + Active Skills + Directory + Code-Owned Protocol)
   │
   ▼
[Round 1] Streamed request to Gemini Interactions API (previous_interaction_id chained)
   │
   ├─► Model emits function_call step(s) (e.g. get_script_overview, parallel inspect_lens_slice, load_auteur_skill)
   │     └─► Browser executes executeScriptToolCall() locally against rawText (zero mutation)
   │         • If validation or lint fails -> returns ok: false + errors + repairHint (is_error: true)
   │         • If clean -> stages reviewable card (Patch / Draft / Audit) or returns slice/skill data
   │
   ├─► [Round 2..N, max 8] Browser sends function_result payloads back -> Model self-repairs or synthesizes
   │
   ▼
[Final Round] Model returns no more function_call steps -> Streams final Markdown reply -> Cards unlock for Apply
```

---

## 2. Getting Started & AI Settings (BYOK)

Click **`AI`** in the top bar (`TopSlateBar`) to open the right-side AI Canvas sidebar. When closed, the AI module is lazy-loaded and incurs zero runtime or bundle overhead. On desktop, drag the sidebar's left border to resize between `340px` and `580px`.

### Configuring Your API Key & Model
Click the **`Model · Level`** status chip at the bottom-right of the sidebar composer dock (or **Open AI Settings** on the setup card) to configure:

| Setting | Options & Default | Notes |
|---|---|---|
| **Gemini API Key (BYOK)** | Your personal key (`AIza...`) | Stored strictly in this browser and sent directly to the Gemini API. Never read from server environment variables. |
| **Session only** | Off (`localStorage`) / On (`sessionStorage`) | Toggle on to keep your key only until the browser tab closes. **Clear Key** purges both stores immediately. |
| **Gemini 4 Model** | `Gemini 4 Hydrogen` *(default, fast)*<br>`Gemini 4 Neon` *(frontier speed)*<br>`Gemini 4 Carbon` *(strongest reasoning)* | All three share a 1M unified context window and can be switched anytime between turns. Use Hydrogen for fast everyday edits and multimodal briefs, Neon for frontier-level rewrites and coverage with fast end-to-end completion, and Carbon for complex multi-lens continuity audits or dense drafts. |
| **Reasoning Level** | `Low` / `Medium` *(default)* / `High` | Maps directly to `generation_config.thinking_level` (`thinking_summaries: 'auto'`). |
| **Show reasoning summary** | On *(default)* / Off | Controls whether streamed thought summaries appear inside the **Reasoning & Tools** accordion. |
| **Show Debug Trace** | Off *(default)* / On | Surfaces a quiet **`Inspect`** button on completed, stopped, and failed turns to open the **AI Trace Inspector** modal. |

---

## 3. Unified Focus Bar (`Auto` · `Draft` · `Refine` · `Audit`)

The sidebar runs **one continuous conversation thread** anchored by a 4-tab **Focus** bar directly below the resizable prompt box at the bottom of the sidebar. You do not need to switch modes after drafting and applying a scene.

### Focus Modes & Editor-State-Aware Tool Pruning

To prevent unnecessary token cost and accidental whole-script overwrites, the context composer dynamically prunes which tools the model sees based on **Focus** and **whether the editor is currently empty**:

| Focus | Editor State | Exposed Tools | Passive `draft_craft`? | Primary Use Case |
|---|---|---|---|---|
| **`Auto`** *(default)* | **Empty** | `propose_script_draft`, `load_auteur_skill`* | **Yes** | Describe a scene idea (with optional Brief / Refs) → compiles and stages a full `v0.4.0` draft immediately. |
| **`Auto`** *(default)* | **Has Script** | `get_script_overview`, `inspect_lens_slice`, `propose_script_patch`, `report_audit_review`, `load_auteur_skill`* | No *(available on demand)* | Seamless post-draft workflow: ask for targeted edits, run audits, or ask directorial questions in the same thread—`propose_script_draft` is omitted so the model cannot accidentally replace the entire script. |
| **`Draft`** | Empty or Has Script | `propose_script_draft`, `get_script_overview` *(if non-empty)*, `load_auteur_skill`* | **Yes** | Force full-scene generation or re-draft a replacement scene from scratch on a non-empty editor. |
| **`Refine`** | Has Script | `get_script_overview`, `inspect_lens_slice`, `propose_script_patch`, `load_auteur_skill`* | No | Constrain the assistant strictly to targeted, ID-addressed script edits. |
| **`Audit`** | Has Script | `get_script_overview`, `inspect_lens_slice`, `report_audit_review`, `load_auteur_skill`* | No | Constrain the assistant strictly to Script Supervisor continuity evaluation and clickable fix suggestions. |

*\*`load_auteur_skill` is automatically omitted if zero skills are in the `available` state (for example, if all remaining skills are pinned or muted).*

### Contextual Focus Controls
- **Target Scope Selector (`Auto` / `Refine` on non-empty scripts):** Choose `Whole Script`, any Staging Macro-Block (`MB0 · [INTENT]`, `MB2 · [AESTHETIC]`, etc.), or any Execution Macro-State (`S1`, `S2`, ...). When a specific target is chosen, your prompt is automatically prefixed with `[Target Scope: ... — focus edits on <ID> unless adjacent context requires minimal continuity alignment.]`.
- **One-Click `Audit All` Pill (`Auto` on non-empty scripts):** Runs a full 5-lens Script Supervisor audit (`overrideFocus: 'audit'`) without switching your active Focus pill away from `Auto`.
- **6 Quick Audit Lens Pills (`Audit` focus):** One-click triggers for **`All Lenses`** or any individual lens (**`Lens 1 · Spatial`**, **`Lens 2 · Pacing`**, **`Lens 3 · Props`**, **`Lens 4 · Acoustics`**, **`Lens 5 · Grammar`**).

### Chat Session Lifecycle & Read-Only Examples
- Conversations are kept **in memory per open script**. Click **`New Chat`** (reset icon in the sidebar header) to clear messages, reset `previous_interaction_id`, and start a fresh thread.
- Switching scripts in the Script Library automatically resets the chat thread, Target Scope, and Brief tray.
- **Bundled Examples (`Fork & Apply`):** Bundled examples are read-only until forked. When you click **`Fork & Apply`** on an AI Draft, Patch, or Audit Fix card while viewing a bundled example, the app forks the example into *My Scripts* (IndexedDB), applies the suggestion, and **preserves your active AI conversation thread** so you can keep iterating seamlessly.

---

## 4. Resizable Prompt Box & Dedicated `Scene Brief & References` Modal

At the bottom of the sidebar sits a **resizable prompt box** (`Enter` to send, `Shift+Enter` for a newline) that auto-grows cleanly as you type and includes a top drag-resize handle (double-click to reset to auto-grow), with the 4-tab Focus bar, Target Scope selector, **`Brief`** button, and **`Model · Level`** settings chip neatly arranged underneath.

### Editing `Scene Brief & References` (`AiBriefModal`)
Click **`Brief`** at the bottom-left to open the dedicated **Scene Brief & References** modal (unobstructed by the prompt box and modeled as a mode-agnostic Reference Pack for cast handles, constraints, and future multimodal attachments):

1. **Include in AI context (On/Off toggle)**:
   - Enabled by default as soon as you populate any Brief field, and can be toggled off anytime without clearing your references or notes (the bottom button shows **`Brief · Off`** while paused).
   - **Carries across all modes (`Auto`, `Draft`, `Refine`, `Audit`):** When active, your Brief is injected as a dedicated **`Scene Brief & References`** context section inside `system_instruction` (visible live inside **Context → Live Prompt Preview**), never rewriting or wrapping what you type in the prompt box.
   - When the Brief is empty or toggled off, **nothing** is injected and your prompt box message is sent verbatim.
2. **Cast & References (PromptLab-style Visual Card Grid + Multimodal Attachments)**:
   - **Drag & Drop / Local Upload (Images & Text):** Drop or pick local **images** (`.jpg`, `.png`, `.webp` — automatically downscaled in-browser to max `1600px` longest edge at `85%` quality) or small **text documents** (`.txt`, `.md`, `.json`, `.csv`, `≤ 256 KB`). Each card shows a visual preview tile, editable top-left handle badge (`@image1`, `@doc1`, ...), and **Label** + **Note** inputs directly underneath.
   - **Gemini Files API (Video, Audio, PDF, or Full-Fidelity Originals up to 2 GB):** Click **`Files API`** to upload directly from the browser via `@google/genai` (auto-polling `PROCESSING` → `ACTIVE`) or attach/delete active **48-hour Gemini Cloud files** on your API key. Dropping a video/audio/PDF onto the local dropzone surfaces a 1-click **`Upload via Files API`** shortcut.
   - **Public YouTube URLs:** Click **`YouTube`** to paste any public YouTube URL with instant thumbnail preview (`@video1`, zero upload required). Video cards also include a **`Static` / `Agentic`** toggle for Interactions API video processing mode.
   - **Text-only handles (`+ Text handle`):** Keep lightweight manual `@handle` rows without attaching media.
   - **Send-Once-Per-Thread Efficiency:** Because ScriptFlow chains server-side state via `previous_interaction_id`, each multimodal attachment is delivered **once** on the first turn it appears (not re-uploaded on follow-up turns in the same thread), while the lightweight `@handle` manifest stays live in `system_instruction`.
   - **Automatic Passive Skill Triggers (All Modes):** Whenever the Brief is active, declaring any `@video*` handle passively activates the **`video_continuation`** skill, and declaring any `@image*`, `@actor*`, or `@audio*` handle (including `@audio1` inside a note) passively activates **`character_reference`**—even on a blank script and across `Auto`, `Draft`, `Refine`, and `Audit`.
3. **Format & Specs**: Concise production constraints (e.g., *"short sequence, continuous handheld oner, Robert has only one line, Japanese kissaten cafe"*).
4. **Subtext & Additional Instructions**: Background directorial intent, unspoken tension, or extra instructions carried across turns.
5. **Modal Actions**:
   - **`Clear`**: Clears all Brief fields and reference rows (and resets the toggle to enabled).
   - **`Done`** (or `Esc`): Closes the modal while the **`Brief`** button shows its live status (`Brief`, `Brief · 2 refs`, or `Brief · Off` when paused).

### Verbatim Prompt Box (Zero Hidden Wrapping)
Your message in the composer box is **always sent verbatim** (except for an explicit `[Target Scope: ...]` prefix when you select a specific `MB#` or `S#` scope in `Auto` / `Refine` on a non-empty script). Leaving the Brief empty or paused lets you brainstorm, ask craft questions, or draft directly from the prompt box without any automatic template wrapper.

---

## 5. Complete Local AI Tools Reference

All 6 AI tools live in [`src/services/scriptTools.ts`](../src/services/scriptTools.ts) and execute **locally in the browser** against your current `rawText` and active `Settings → Supervisor rules` (`ruleOverrides`).

### 1. `get_script_overview` *(Read-Only)*
- **UI Badge:** `Inspect overview`
- **Available In:** `Auto` (non-empty), `Draft` (non-empty), `Refine`, `Audit`
- **Arguments:** `{}` (none)
- **What It Returns:**
  - `snapshotHash` (optimistic concurrency token required for patches)
  - `schemaVersion`, `sceneTopology` (`continuous_oner` | `multi_camera_coverage` | `discontinuous_montage` | `mixed` | `empty`), `hasContinuationContext`
  - `stagingMacroBlocks`: every `MB#` ID, header, kind, format (`prose` vs. `key_value`), and `[AESTHETIC]` key list
  - `macroStateCount` and `macroStates`: every `S#` ID, Sub-State count, `activeCameraIdentifier`, and `cameraTransition`
  - `cameraSlots`, `referenceBindingCount`, `tokenMappingCount`
  - `diagnosticsSummary` and full `diagnostics[]` from the 5 deterministic linter rules

### 2. `inspect_lens_slice` *(Read-Only + Co-Located Supervisor Checklist)*
- **UI Badge:** `Inspect lens slice`
- **Available In:** `Auto` (non-empty), `Refine`, `Audit`
- **Arguments:**
  - `preset`: One of the 5 built-in Script Supervisor presets:
    - `lens1_spatial_optics` — `[LOGIC]`, `[OPENING]`, `[CONTINUITY PROTOCOL]`, `[CAM]`/`[BLOCK]`/`[ACT]`, `resolvedCamera`, referenced tokens, Lens 1 diagnostics
    - `lens2_temporal_pacing_wear` — `[INTENT]`, `[LOGIC]`, `[OPENING]`, `[ACT]`/`[STATE IN/OUT]`/`[SPEED]`, `resolvedCamera`, Lens 2 diagnostics
    - `lens3_props_inventory` — `[LOGIC]`, `[OPENING]`, `[AESTHETIC]` (`Wardrobe`, `Location`), `[ACT]`/`[PROP]`, `resolvedCamera`, Lens 3 diagnostics
    - `lens4_acoustics_voice` — `[AESTHETIC]` (`Audio`), `{dialogue}`, `<foley>`, `(score)`, reference bindings, `endsOnDialogue`, Lens 4 diagnostics
    - `lens5_blocks_grammar` — Full document Sub-States, `resolvedCamera`, all tokens/refs, and all diagnostics
  - `spec` *(optional)*: Custom composable `LensSliceSpec` (`macroBlocks`, `aestheticKeys`, `dimensions`, `subStateTags`, `includeAllSubStates`, `includeResolvedCamera`, `includeTokenMappings`, `includeReferenceBindings`, `includeSceneTopology`, `includeTrailingResolution`, `includeAllDiagnostics`), or combined with `preset` as overrides.
- **Co-Located Topology-Filtered Checklist:** Whenever called with a built-in `preset`, the tool attaches a `checklist` object (`getLensAuditChecklist(preset, topology)`) directly alongside `slice`:
  - On **continuous oners / coverage**, enforces 180° eyeline parity, $S_0 \to S_1$ handoff, camera holds/operator verbs, prop lifecycles, and wear repetition.
  - On **`discontinuous_montage`**, explicitly suppresses cross-cut 180° eyelines, $S_0 \to S_1$ carryover, and cross-state prop/wear persistence, switching to montage self-contained anchoring, plain `[CAM]` tags, and the cut-latency floor (`Duration / 2.0`).
- **Parallel Execution:** The model can call multiple `inspect_lens_slice` presets in parallel within a single round for fast multi-lens audits.

### 3. `propose_script_patch` *(Transactional Dry-Run & Staging)*
- **UI Badge:** `Stage patch`
- **Available In:** `Auto` (non-empty), `Refine`
- **Arguments:** Validated against `AuteurPatchSchema` (`expectedSnapshotHash`, `summary`, and `ops[]` targeting `MB#`, `MB#.#`, `S#`, or `S#.#` via `set_macro_block`, `insert_macro_block`, `delete_macro_block`, `set_aesthetic_entry`, `delete_aesthetic_entry`, `upsert_token_mapping`, `delete_token_mapping`, `replace_macro_state`, `insert_macro_state`, `delete_macro_state`, `reorder_macro_states`, `replace_sub_state`, `insert_sub_state`, `delete_sub_state`).
- **Validation & Self-Repair Gate:**
  - Dry-runs `applyAuteurPatch(rawText, patch, { rejectOnNewErrors: true, ruleOverrides })`.
  - **If rejected** (`SNAPSHOT_MISMATCH`, `TARGET_NOT_FOUND`, `VALIDATION_ERROR`, or `LINT_ERROR_INTRODUCED`): stages **nothing** and returns `ok: false` (`is_error: true`) with structured `errors`, `introducedErrors`, and a concrete `repairHint` (including the current `snapshotHash` if stale) so the model repairs and retries automatically.
  - **If clean:** computes a deterministic line diff (`buildLineDiff`) and `LintDelta` (before/after error & warning counts, resolved diagnostics), and stages a **`PatchSuggestionCard`**.

### 4. `propose_script_draft` *(Compiler Dry-Run & Staging)*
- **UI Badge:** `Compile draft`
- **Available In:** `Auto` (empty), `Draft`
- **Arguments:** `{ title?, summary?, draft: AuteurScriptDraft }` (staging Macro-Blocks with `format: 'prose' | 'key_value'` + `[EXECUTION]` Macro-States and typed Sub-States).
- **Validation & Self-Repair Gate:**
  - Compiles via `compileAuteurDraft(draft, ruleOverrides)` into canonical `v0.4.0` plain text.
  - **If schema validation fails or any deterministic lint `error` is present** (respecting active `ruleOverrides`): withholds staging and returns `ok: false`, `staged: false`, `diagnostics[]`, and `repairHint` so the model fixes the draft before showing it to you.
  - **If lint-error-free:** stages a **`DraftSuggestionCard`** with topology, Macro-Block/Macro-State counts, diagnostics summary, and full preview/diff.

### 5. `report_audit_review` *(Structured Multi-Lens Audit & Fix Dry-Run)*
- **UI Badge:** `Stage audit review`
- **Available In:** `Auto` (non-empty), `Audit`
- **Arguments:** Validated against `AuteurReviewSchema` (`overallSummary` and `issues[]`, each carrying `lens`, `severity`, `targetLevel`, `targetId`, `message`, `rationale`, `repairHint`, and optional `suggestedPatch`).
- **Per-Issue Fix Verification:**
  - Every embedded `suggestedPatch` is individually dry-run with `rejectOnNewErrors: true` and active `ruleOverrides`.
  - Clean fixes attach a 1-click **`Apply Fix`** button directly inside that audit issue row.
  - Any broken or lint-violating `suggestedPatch` is withheld from staging and reported back in `invalidSuggestedPatches` with a `repairHint` so the model can repair it.
  - Stages an **`AuditReviewSuggestionCard`** with clickable `targetId` jump links.

### 6. `load_auteur_skill` *(Dynamic On-Demand Craft & Module Loader)*
- **UI Badge:** `Load skill`
- **Available In:** Any Focus whenever `availableSkills.length > 0`
- **Arguments:** `{ skillId: string }` — its JSON Schema `enum` is built **dynamically per turn** from `context.availableSkills` (including user-created custom skills), never cached statically.
- **Runtime State Machine:**
  - `available` → returns `{ ok: true, skillId, name, content }` and adds a **`Loaded`** skill pill to the turn.
  - `active` → returns `{ ok: true, alreadyActive: true }` (prevents redundant token dumps or error loops).
  - `muted` → returns `{ ok: false, error: 'Skill is muted by the user.', availableSkills }` (strictly honors user Mute).
  - Unknown ID → returns `{ ok: false, error, availableSkills, repairHint }`.

---

## 6. Knowledge Registry, Skills & Pre-Send Transparency (`Context` Modal)

Click **`Context`** in the sidebar header (shows active skill count and an indicator dot when customizations or upstream knowledge updates exist) to open **`AiContextInspectorModal`**.

### How `system_instruction` Is Structured (Anti-Override-Rot Design)

Every turn's `system_instruction` is assembled deterministically by `composeAgentContext()` ([`src/services/auteurKnowledge.ts`](../src/services/auteurKnowledge.ts)) from **6 distinct sections** (omitting empty sections cleanly):

| Section | Editable? | What It Contains |
|---|---|---|
| **1. Foundational Craft** | **Editable** | Core Pure Auteur Script `v0.4.0` directorial craft (*boundaries not handcuffs*, *static once / volatile always*, *state inheritance*, *literal over literary*, *acting is reacting*, *anti-twitch*, *repetition mandate*, and canonical inline syntax invariants). |
| **2. Live Editor State** | Read-Only (Code-Owned) | Authoritative current snapshot: `isEmpty`, `snapshotHash`, `changedSinceLastTurn` warning, `sceneTopology`, `hasContinuationContext`, Macro-Block/Macro-State/ref/token counts, and active deterministic linter diagnostics so the AI focuses on semantic continuity. |
| **3. Scene Brief & References** *(when active)* | Controlled via `Brief` modal | Mode-agnostic active reference context (`Cast & References`, `Format & Specs`, `Subtext & Additional Instructions`) carried across `Auto`, `Draft`, `Refine`, and `Audit` whenever populated and toggled on. Omitted completely when empty or paused. |
| **4. Active Skills** | Read-Only (Computed) | Full bodies of every skill currently in the **`active`** state (pinned by you or passively matched from your script/brief). |
| **5. Available Skill Directory** | Read-Only (Computed) | Compact 1-line `id: triggerHint` menu for **`available`** skills that the model may load on demand via `load_auteur_skill`. |
| **6. Tool & Safety Protocol** | Read-Only (Code-Owned) | Allowed tool list for this turn, optimistic concurrency (`expectedSnapshotHash`), staging-first rule, self-repair rule, and parallel lens slicing instructions. Kept read-only so craft edits can never break tool execution. |

### The 3-State Skill Machine (`active | available | muted`)

Every built-in and custom skill resolves into **strictly one mutually exclusive state** per turn—guaranteeing zero duplication between `system_instruction` and `load_auteur_skill`:

- **`active`** *(User **Pinned** OR **Passive** auto-trigger)* → Injected directly into `system_instruction`; excluded from `load_auteur_skill`.
- **`available`** *(Default **`Auto`** when not passively triggered)* → Listed as a 1-line hint in the Available Skill Directory and loadable via `load_auteur_skill`.
- **`muted`** *(User **Muted**)* → Omitted from both `system_instruction` and `load_auteur_skill`, and rejected at runtime if called.

### Built-In Extension Skills Catalog (`BUILTIN_AUTEUR_SKILLS` · `src/data/knowledge/skills/*.md`)

| Skill ID | Category | Passive Auto-Activation Trigger | What It Provides |
|---|---|---|---|
| `draft_craft` | Workflow | Editor is empty **OR** `Focus = Draft` | Block-by-block drafting specs (`[INTENT]`, `[LOGIC]`, `[AESTHETIC]`, `[OPENING]` 4 coordinates, `[EXECUTION]`), silent pre-flight ledger, and curated canonical examples from `src/data/examples/` (`forest-pov-horror`, `interrogation-coverage`, plus `heist-montage` on montage topology). |
| `video_continuation` | Module | Script has `@video1` / `[CONTINUITY PROTOCOL]` **OR** active Brief has `@video*` handle | Terminal-frame `[OPENING]` handoff, `[CONTINUITY PROTOCOL]` placement, reduced delta-only `[AESTHETIC]`, and `S1` camera continuation rules. |
| `token_mapping` | Module | Script has declared `Description -> TOKEN` mappings in `[AESTHETIC]` | Shorthand dictionary authoring (`LOC01`, `EV01`, `PROP01`) and downstream reuse without lookbook bleed. |
| `character_reference` | Module | Script has `@ref` bindings **OR** active Brief has `@image*`/`@actor*`/`@audio*` handle | Phase 1 reference isolation, separating facial/vocal identity from fresh scene wardrobe in `[AESTHETIC]`, and canonical name usage downstream. |
| `temporal_calibration` | Module | On demand *(or Pin)* | Macro-State-to-duration tempo table (combat oner `0.8s–1.2s`, tactical `1.5s–2.0s`, dialogue `2.5s–4.0s`, slow horror `4.0s–6.0s+`), anti-float rule, and cut-latency floor (`Duration / 2.0`). |
| `spatial_fences` | Module | On demand *(or Pin)* | Inline `[BLOCK]` for 3+ subjects/mark swaps, `[STATE IN]`/`[STATE OUT]` boundary clamps, dynamic `[LIGHT]`, and Tier-2 single-dimension tags (`[FOCUS]`, `[SPEED]`, `[PROP]`, `[ENV]`, `[CROWD]`, `[VFX]`, `[TRANS]`). |

### Inside the 3 Tabs of `AiContextInspectorModal`
1. **Live Prompt Preview**: Inspect the exact pre-send prompt sections (`Editable`, `Active · From Brief`, vs. `Code-Owned`), active `Focus`, `sceneTopology`, `snapshotHash`, pruned tool badges, total character count, and one-click **`Copy Prompt`**. If built-in defaults ever evolve (`AUTEUR_KNOWLEDGE_VERSION`) while you have saved overrides, a quiet notice lets you **Acknowledge** or **Reset All**.
2. **Foundational Craft**: Edit **Foundational Auteur Craft** directly (persisted in `localStorage` under `auteur-editor-ai-skills-v1`), with a **`Modified`** indicator and **`Reset to default`**.
3. **Skills & Extensions**:
   - Toggle any built-in or custom skill between **`Auto`**, **`Pin`**, and **`Mute`** and immediately see its resolved status (`Active · Passive`, `Active · Pinned`, `Available`, `Muted`).
   - Expand any skill to read or override its instruction body (`Reset` restores built-in text).
   - Click **`+ Add Custom Skill`** to create your own reusable extension skills (`Name`, auto-slugified `snake_case` `ID` validated against built-in collisions, `Trigger Hint`, and `Instruction Body`), plus edit or delete them (destructive deletes and **Reset all defaults** confirm via `ConfirmDialog`).

---

## 7. Reading Responses, Applying Cards & Debugging Traces

### Thinking Summary, Separated Tools & Skills Strip, and Sticky-Bottom Auto-Scroll
Each assistant turn separates **Thinking** from **Tools & Skills** so long reasoning traces never bury active skills or tool calls:
- **Thinking Accordion:** Open while streaming inside a bounded scrollable panel (`max-h-56` with internal sticky-bottom scroll), then auto-collapses when done (when enabled in AI Settings).
- **Tools & Skills Activity Strip:** Rendered cleanly beneath the Thinking header and always visible even after Thinking collapses:
  - **Skill Pills** (`Auto`, `Pinned`, `Loaded`) with hover tooltips explaining each skill's ID and activation source.
  - **Tool Call Pills** (`running`, `done`, `retrying`, `stopped`) with hover tooltips summarizing the tool name, status, and arguments (e.g., `Preset: lens1_spatial_optics`, `2 ops · ...`, `Skill: temporal_calibration`).
- **Sticky-Bottom Auto-Scroll:** The message stream follows streamed output automatically while you are near the bottom, immediately pauses if you scroll up to read earlier turns, and surfaces a quiet **`↓ Latest`** pill to jump back down and resume auto-scrolling.
- Click **`Stop`** in the composer footer at any time to abort an in-flight turn cleanly via `AbortSignal`.

### Reviewing & Applying Staged Cards
Suggestion cards are inspectable immediately while streaming, while **Apply** buttons unlock once the assistant finishes its turn:

- **`PatchSuggestionCard`**: Shows summary, affected IDs (`S2`, `MB1`), lint delta (`Lint clean`, `-1 resolved`, warning count), and toggleable **Diff** / **Preview** views. If you manually edited the script after the patch was staged, a stale-snapshot warning disables **Apply** so manual edits are never clobbered. Once applied or dismissed, it auto-collapses into a compact single-line receipt (clickable to re-expand anytime).
- **`DraftSuggestionCard`**: Shows title, scene topology, Macro-Block/Macro-State counts, lint status, and **Preview** / **Diff** toggle. Clicking **Apply** commits a checkpoint, automatically sets the Scene Title if currently untitled, and auto-collapses the card to a compact receipt.
- **`AuditReviewSuggestionCard`**: Shows overall summary, error/warning counts, and **`Apply All (N)`** (or **`Fork & Apply All (N)`**) right in the header whenever 2+ unapplied, non-conflicting fixes can be committed together in a single transactional Undo checkpoint. Multi-issue audits (`2+` issues) start **collapsed** (`Show N issues ▸`) so the assistant's text reply stays visible without scrolling; expanding shows full rationales, clickable **`targetId`** jump links (`MB0`, `S2`, `S2.1`), diff previews, and 1-click **`Apply Fix`** buttons (auto-collapsing once all fixes are applied). Applying an individual fix (from either the sidebar or Live Mode) automatically rebases any provably non-conflicting sibling fixes onto the updated script so you can apply independent fixes one by one without re-running the audit (while genuinely overlapping or index-shifted siblings stay safely marked stale).
- **Actionable Hover-to-Diff Popovers in Live Mode (`AiPatchIndicator`, `AiPatchInsertionSeam`)**: While any patch or Audit Review fix is pending and non-stale, affected Staging Macro-Blocks (`MB#`) and Execution Macro-States (`S#`) show a subtle inset accent border and a quiet margin dot right next to `DiagnosticDot` (and proposed insertions show a thin dashed `+ AI Insert` pill between rows). Hover any indicator to peek a word-level diff right in Live Mode—or click to pin it open—and click **`Apply`** / **`Apply Fix`** (or **`Fork & Apply`** on examples, plus **`Dismiss`** for Refine patches) directly inside the popover. Actions sync 2-way with the AI sidebar (updating `Applied`/`Dismissed` receipts and rebasing sibling audit fixes) and commit as a single `Cmd/Ctrl+Z` Undo checkpoint. Indicators automatically clear once applied, dismissed, stale, or when the sidebar closes.

### Troubleshooting with the AI Trace Inspector (`AiTraceModal`)
Turn on **`Show Debug Trace`** in **AI Settings**, then click **`Inspect`** on any completed, stopped, or errored turn to examine:
- **Summary Strip:** Status badge (`Completed`, `Round Limit`, `Stopped`, `Error`), Model, Reasoning Level, **`Focus`** + `Mode`, Duration, Tool Rounds, **`Skills`** (`Active` + `Loaded`), `Interaction Chain` (`previous_interaction_id` progression), and aggregated `Token Usage`.
- **Round-by-Round Timeline (`Round 1..N`):** Expand any round to inspect the exact `Request Sent` (`model`, `previous_interaction_id`, `generation_config`, `tools`, `input`, full `system_instruction`) and every `Tool Calls & Results` entry (arguments, `ok`/`error`, staged suggestion ID, `Repair Hint`, and full JSON result).
- **`Copy Trace JSON`:** Copies the entire sanitized trace to clipboard. API keys and auth headers are strictly excluded and any echoed secret is redacted as `[REDACTED]`.

---

## 8. End-to-End Walkthrough Recipes

### Walkthrough A: Blank Script → Draft → Surgical Refine → 5-Lens Audit (Zero Tab Switching)
1. Create a **Blank Script** from the File menu and open the **`AI`** sidebar (defaults to **`Auto`**).
2. Click **`Brief`**, add `@image1` → `Mark` and `@image2` → `Robert`, add Specs (e.g., *"continuous handheld oner in a quiet Japanese cafe, Robert has 1 line"*), and add Subtext notes.
3. Click **`Context`** if you want to verify pre-send that `draft_craft` and `character_reference` are **Active** and `propose_script_draft` is ready.
4. Type your scene idea in the composer and press `Enter`. Review the staged **Proposed Draft** card and click **Apply**.
5. Notice the Focus bar now shows **Scope** (`Whole Script`, `MB#`, `S#`) plus **`Audit All`**—still in **`Auto`**, while your active **Brief** carries across as reference context for refinement and audits (or can be paused anytime via **Brief → Include in AI context**).
6. Pick `Scope: S4` and type *"Have Mark set the pen down before shutting the notebook"*. Review the line diff on the **Proposed Patch** card and click **Apply** (undoable via `Cmd/Ctrl+Z`).
7. Click **`Audit All`** to run a parallel 5-lens Script Supervisor audit, click any issue's `targetId` to jump to it, and click **Apply Fix** on any verified patch.

### Walkthrough B: Continuing an Existing Video Clip (`@video1`)
1. On a blank script (or with **`Focus = Draft`**), open **`Brief`** and add a reference with Handle `@video1` and Label *"Clip 1 final frame — Mark gripping the overhead rail"*.
2. Open **`Context`** → **Skills & Extensions** to confirm **`video_continuation`** is automatically **Active · Passive**.
3. Describe what happens next in the composer. The assistant will include `[CONTINUITY PROTOCOL]` before `[OPENING]`, keep `[AESTHETIC]` delta-only, and anchor `[OPENING]` to `@video1`'s terminal frame.

### Walkthrough C: Adding a Custom Studio Skill
1. Click **`Context`** → **Skills & Extensions** → **`+ Add Custom Skill`**.
2. Enter Name (`House Dialogue Rhythm`), ID (`house_dialogue_rhythm`), Trigger Hint (`When polishing spoken exchanges or interrogation scenes`), and concise instruction body.
3. Leave it on **`Auto`** (so the AI loads it via `load_auteur_skill` only when relevant) or set **`Pin`** to include it on every turn.
4. Check **Live Prompt Preview** to see it live in the Available Skill Directory (or Active Skills if pinned) before sending.

### Walkthrough D: Diagnosing an Unexpected AI Result
1. Open **AI Settings** and enable **`Show Debug Trace`**.
2. Click **`Inspect`** on the turn in question.
3. Check **Round 1** `system_instruction` and `tools` to confirm which skills were active and which tools were exposed, then check subsequent rounds' `Tool Calls & Results` for any `Repair Hint`, `SNAPSHOT_MISMATCH`, or `LINT_ERROR_INTRODUCED` self-repair steps.

---

## 9. Keyboard, Undo & Privacy Quick Reference

- **Composer shortcuts:** `Enter` sends; `Shift+Enter` inserts a newline.
- **Safe native Undo inside AI inputs:** Every `<input>` and `<textarea>` inside the composer, `Brief / Refs` tray, **AI Settings**, and **Context Inspector** carries `data-native-undo="true"`, and all AI modals carry `aria-modal="true"`—so pressing `Cmd/Ctrl+Z` while editing prompts or skills undoes your text input without undoing the Auteur Script behind it.
- **Document Undo after Apply:** Every applied Draft, Patch, or Audit Fix commits a single history `'checkpoint'`, so one `Cmd/Ctrl+Z` in the editor reverts the entire AI change cleanly.
- **Local-only persistence:**
  - API key: `auteur-editor-ai-api-key-v1` (`localStorage` or tab-scoped `sessionStorage` when `Session only` is on).
  - Model/reasoning/trace settings: `auteur-editor-ai-settings-v1` (`localStorage`).
  - Craft/template/skill overrides & custom skills: `auteur-editor-ai-skills-v1` (`localStorage`).
