# AI Assistant Walkthrough & Tools Guide

This guide explains how the **ScriptFlow (`v1.1.0`) AI Assistant** works end-to-end—from BYOK setup and unified `Auto` focus routing to the cache-stable 3-Zone prompt architecture, every local script tool, Pinned vs. On-Demand skills, Layer 2.5 Quick Scan, multimodal Scene Brief, pre-send prompt customization, review card & Live Mode indicator workflow, and debug trace inspection.

> **Related References**
> - **Architecture & Data Flow**: [`docs/ARCHITECTURE.md`](ARCHITECTURE.md)
> - **Script Supervisor Rules & 5 Audit Lenses**: [`docs/SCRIPT_SUPERVISOR_AUDIT_RULES.md`](SCRIPT_SUPERVISOR_AUDIT_RULES.md)
> - **Programmatic JSON IR, Patches & Slicer**: [`docs/JSON_IR_SPEC.md`](JSON_IR_SPEC.md)
> - **Canonical `v0.4.0` Syntax Contract**: [`docs/GRAMMAR_CONTRACT.md`](GRAMMAR_CONTRACT.md)

---

## 1. Mental Model: How the AI Assistant Works

The AI Assistant is **multi-turn, agentic, and strictly suggestions-first**—not a one-shot text generator and never an unchecked auto-editor.

### Core Principles
1. **Plain-Text-as-Truth & Zero Direct Mutation**: None of the AI tools can directly overwrite your editor text. Every draft, targeted patch, find/replace edit, title change, or audit fix is validated against Zod schemas and the deterministic Script Supervisor linter, then staged as a reviewable card (`Apply`, `Apply Title`, `Apply Fix`, `Apply All`, `Fork & Apply`, or `Dismiss`). Clicking **Apply** on script edits automatically saves persistent before- and after-apply Version History snapshots in IndexedDB (skipping blank or redundant pre-apply states) and commits a single undoable history checkpoint (`Cmd/Ctrl+Z`).
2. **Multi-Turn Memory & 3-Zone Cache Architecture (`previous_interaction_id`)**: Conversation continuity is maintained across user messages via the Gemini Interactions API (`client.interactions.create` with `stream: true`). To maximize Gemini 4 implicit prefix cache hits across turns and sessions, **Zone 1** (`tools` + `system_instruction`: Foundational Craft, Pinned Skills, static Tool & Safety Protocol, and On-Demand Skill Directory) stays byte-for-byte frozen across script edits, Scene Brief changes, and `Ask First` toggles, while **Zone 3** (Round 1 `input`) carries delta-only `<live_editor_state>` (full snapshot on Turn 1 or changes; compact 1-line `snapshotHash` confirmation when unchanged), `<scene_brief>` deltas, and `<turn_directive>` (`[Ask First: ON]`) at the end of **Zone 2** (`previous_interaction_id` history).
3. **Agentic Tool Loop (Up to 8 Rounds per Turn)**: Round 1 never dumps your entire script into the chat prompt. Instead, the model receives the cache-stable system instruction plus delta turn context, then pulls only the overview, targeted `v0.4.0` source sections, lens slices, or on-demand craft skills it needs locally in your browser before staging its result.
4. **3.5-Layer Verification Stack**:
   - **Layer 1 — Grammar & Schema Integrity** (`src/core/parser.ts`, `src/core/irSchemas.ts`, `src/core/patch.ts`): Structural validity, snapshot concurrency (`expectedSnapshotHash`), and valid target IDs (`MB#`, `MB#.#`, `S#`, `S#.#`).
   - **Layer 2 — Deterministic Code Linter** (`src/core/linter.ts`): 5 instant, zero-token rules enforced on every keystroke and every AI dry-run (`rejectOnNewErrors: true`).
   - **Layer 2.5 — Decisions API Quick Scan** (`src/services/geminiDecisions.ts` + `gemini-decision-1` on `v1beta`): Optional, single-pass (~400ms, `$0` output tokens, `~$0.0003` text scan; auto-chunked at `1000` checks per batch) AST-filtered atomic `noul` matrix evaluating 15 built-in declarative document-level, per-`S#`, and per-`S#.#` semantic craft & Scene Brief rules (plus any custom user rules), merging Layer 2 lint, surfacing suspect `S#` margin indicators (`AiQuickScanIndicator`) in Live Mode, and handing off selected lenses + unverified leads to Layer 3.
   - **Layer 3 — AI Semantic Script Supervisor** (`src/core/slicer.ts` + selected Gemini model): Evaluates spatial 180° eyelines, camera visibility, prop hand-tracking, temporal pacing, physical wear, and lookbook bleed across the 5 lenses, staging verified `suggestedPatch` fixes.

### Turn Execution Lifecycle

```text
You send a prompt (in Auto / Draft / Refine / Audit focus)
   │
   ▼
[Pre-Send Composer] composeAgentContext() runs locally:
  • Parses current rawText -> snapshotHash, diagnosticsFingerprint, sceneTopology, lint
  • Resolves every built-in & custom skill into: pinned (active) | on-demand (available) | muted
  • Resolves exposed tools by Focus (Auto exposes all 10 non-disabled tools consistently)
  • Assembles Zone 1 system_instruction (Craft + Pinned Skills + Static Protocol + Directory)
  • Assembles Zone 3 delta turnContext (Live Editor State + Scene Brief delta + Ask First directive)
   │
   ▼
[Round 1] Streamed request to Gemini Interactions API (previous_interaction_id chained)
   │
   ├─► Model emits function_call step(s) (e.g. get_script_overview, get_script_source, parallel inspect_lens_slice, propose_text_replace, propose_script_title, load_auteur_skill, ask_question)
   │     └─► Browser executes executeScriptToolCall() locally against rawText (zero mutation)
   │         • If validation or lint fails -> returns ok: false + errors + repairHint (is_error: true)
   │         • If clean -> stages reviewable card (Patch / Draft / Title / Audit / Question) or returns source/slice/skill data
   │
   ├─► [Round 2..N, max 8] Browser sends function_result payloads back -> Model self-repairs or synthesizes
   │
   ▼
[Final Round] Model returns no more function_call steps -> Streams final Markdown reply -> Cards unlock for Apply
```

---

## 2. Getting Started & AI Settings (BYOK)

Click **`AI`** in the top bar (`TopSlateBar`) to open the right-side AI Canvas sidebar. When closed, the AI module is lazy-loaded and incurs zero runtime or bundle overhead. On desktop, drag the sidebar's left border to resize between `340px` and `580px` (default `410px`).

### Configuring Your API Key & Model
Click the **`Model · Level`** status chip at the bottom-right of the sidebar composer dock (or **Open AI Settings** on the setup card) to open **`AiSettingsModal`** and configure:

| Setting | Options & Default | Notes |
|---|---|---|
| **Gemini API Key (BYOK)** | Your personal key (`AIza...`) | Stored strictly in this browser and sent directly to the Gemini API. Never read from server environment variables. |
| **Session only** | Off (`localStorage`) / On (`sessionStorage`) | Toggle on to keep your key only until the browser tab closes (migrates and purges the inactive store automatically). **Clear Key** purges both stores immediately. |
| **Gemini Model** | `Gemini 4 Hydrogen` (`gemini-4-hydrogen`) *(default, fast)*<br>`Gemini 4 Neon` (`gemini-4-neon`) *(frontier speed)*<br>`Gemini 4 Carbon` (`gemini-4-carbon`) *(strongest reasoning)*<br>`Gemini 3.8 Flash` (`gemini-3.8-flash`) *(agentic Flash workhorse)*<br>`Gemini 3.5 Flash-Lite` (`gemini-3.5-flash-lite`) *(budget / ultra-fast)* | All five share a 1M unified context window and can be switched anytime between turns. Use Hydrogen for fast everyday edits and multimodal briefs, Neon for frontier-level rewrites and coverage, Carbon for complex multi-lens audits or dense drafts, 3.8 Flash as a high-intelligence agentic Flash workhorse, and 3.5 Flash-Lite for ultra-low-cost, low-latency iterations. Each option displays its compact per-1M input/output rate directly in the picker. |
| **Reasoning Level** | `Low` *(default)* / `Medium` / `High` | Maps directly to `generation_config.thinking_level` (`thinking_summaries: 'auto'`). |
| **Quick Scan Sensitivity** | `Strict` / `Balanced` *(default)* / `Lenient` | Calibrated `gemini-decision-1` (`v1beta`, `$0.10 / $0` per 1M) probability cutoffs for `Flagged` and `Borderline` badges (`Strict`: `>=35% / >=20%`, `Balanced`: `>=50% / >=28%`, `Lenient`: `>=65% / >=42%`). |
| **Show reasoning summary** | On *(default)* / Off | Controls whether streamed thought summaries appear inside the **Thinking** accordion. |
| **Show estimated cost** | On *(default)* / Off | Displays a quiet approximate USD badge (`~$0.0042`) on completed turns and a cumulative session total to the left of the **`Model · Level`** chip below the prompt box (with hover token & USD breakdown tooltips covering both Interactions API turns and Decisions API Quick Scans). |
| **Show Debug Trace** | Off *(default)* / On | Surfaces a quiet **`Inspect`** button on completed, stopped, failed, and Quick Scan turns to open **`AiTraceModal`**. |
| **Reset to defaults** | Footer action | Restores default model (`Hydrogen`), reasoning level (`Low`), Quick Scan sensitivity (`Balanced`), and display toggles (`Show reasoning summary` On, `Show estimated cost` On, `Show Debug Trace` Off) **without clearing your BYOK API key or `Session only` storage mode**. |

---

## 3. Unified Focus Bar (`Auto` · `Draft` · `Refine` · `Audit`)

The sidebar runs **one continuous conversation thread** anchored by a 4-tab **Focus** bar directly below the resizable prompt box at the bottom of the sidebar. You do not need to switch modes after drafting and applying a scene.

### Focus Modes & Cache-Stable Tool Exposure

To balance prefix cache stability with intentional focus guardrails, **`Auto`** exposes all **10** non-disabled tools consistently whether the script is empty or populated, while **`Draft`**, **`Refine`**, and **`Audit`** provide narrower specialized tool sets:

| Focus | Editor State | Exposed Tools | Default Skills State | Primary Use Case |
|---|---|---|---|---|
| **`Auto`** *(default)* | **Empty or Has Script** | All 10 non-disabled tools (`get_script_overview`, `get_script_source`, `inspect_lens_slice`, `propose_script_patch`, `propose_text_replace`, `propose_script_draft`, `propose_script_title`, `report_audit_review`, `ask_question`†, `load_auteur_skill`*) | **On-Demand** *(zero default pinned; loads `draft_craft`, etc. via `load_auteur_skill`)* | Full cache-stable workspace: draft new scenes, run targeted AST/text edits, rename titles, or run audits in one continuous thread without swapping tool schemas between turns. |
| **`Draft`** | **Empty** | `propose_script_draft`, `propose_script_title`, `ask_question`†, `load_auteur_skill`* | On-Demand | Generate a fresh scene from scratch. |
| **`Draft`** | **Has Script** | `get_script_overview`, `get_script_source`, `inspect_lens_slice`, `propose_script_draft`, `propose_script_title`, `ask_question`†, `load_auteur_skill`* | On-Demand | Read existing source or lens slices as reference and re-draft a replacement scene from scratch on a non-empty editor. |
| **`Refine`** | **Has Script** | `get_script_overview`, `get_script_source`, `inspect_lens_slice`, `propose_script_patch`, `propose_text_replace`, `propose_script_title`, `ask_question`†, `load_auteur_skill`* | On-Demand | Constrain the assistant strictly to targeted AST patches, literal/regex text replacements, and scene title updates. |
| **`Audit`** | **Has Script** | `get_script_overview`, `get_script_source`, `inspect_lens_slice`, `report_audit_review`, `load_auteur_skill`* | On-Demand | Constrain the assistant strictly to Script Supervisor continuity evaluation and clickable fix suggestions. |

*\*`load_auteur_skill` is automatically omitted if zero skills are in the `available` (On-Demand) state (for example, if all skills are pinned or muted).*  
*†`ask_question` remains declared in `Auto`, `Draft`, and `Refine` for frozen prefix caching, but is strictly gated at runtime: it is rejected unless **`Ask First`** is toggled ON (injecting `[Ask First: ON]` into Zone 3 `input`, auto-resets after sending), the turn is a `[Clarifying follow-up]`, or `ask_question` is forced **`Always On`** in Context → Function Tools. Always omitted in `Audit`.*

### Contextual Focus Controls
- **Target Scope Selector (`Auto` / `Refine` on non-empty scripts):** Choose `Whole Script`, any Staging Macro-Block (`MB0 · [INTENT]`, `MB2 · [AESTHETIC]`, etc.), or any Execution Macro-State (`S1`, `S2`, ...). When a specific target is chosen, your prompt is automatically prefixed with `[Target Scope: ... — focus edits on <ID> unless adjacent context requires minimal continuity alignment.]`.
- **`Ask First` Toggle (`Auto`, `Draft`, `Refine`):** Sits next to **`Brief`** in the utility bar below the Focus tabs. Toggle it ON before sending to invite 1–4 structured multi-select clarifying questions (`QuestionSuggestionCard`) before the model drafts or edits; it automatically resets to Off once sent.
- **One-Click `Quick Scan` & `Audit All` Pills (`Auto` on non-empty scripts):** Click **`Quick Scan`** for a ~400ms, zero-output-token Decisions API pre-check (`gemini-decision-1`) across AST-filtered atomic rules + active Scene Brief fidelity without touching `previous_interaction_id`, or click **`Audit All`** to run a full 5-lens Gemini 4 Script Supervisor audit (`overrideFocus: 'audit'`) without leaving `Auto`.
- **Quick Scan + 6 Quick Audit Lens Pills (`Audit` focus):** One-click triggers for **`Quick Scan`** (Layer 2.5 screening, shown on non-empty scripts) alongside **`All Lenses`** or any individual lens (**`Lens 1 · Spatial`**, **`Lens 2 · Pacing`**, **`Lens 3 · Props`**, **`Lens 4 · Acoustics`**, **`Lens 5 · Grammar`**).
  - *Quick Scan Escalation:* Results render in an interactive, whole-card collapsible **`QuickScanCard`** (folding into a 1-line summary bar without dismissing Live Mode indicators) starting with a compact overview of the fixed-order lenses (all collapsed by default, issues-first drill-down with **`Show N passed checks`**, **`Expand all`** / **`Collapse all`**), pre-checked flagged/borderline lenses, clickable finding criteria & suspect `S#` jump pills, **`Re-scan`**, a 1-click **`Deep Audit Selected (N)`** (or **`Run Full Deep Audit`**) handoff forwarding tripped checks & suspect `S#` IDs as unverified System-1 leads to Gemini 4, and a 1-click **`Run Standard Audit All instead`** fallback if `v1beta` errors. *(Note: Decisions API has no context caching and omits YouTube video streams—YouTube Brief refs gracefully downgrade to text `@handle` labels.)*

### Chat Session Lifecycle, IndexedDB History & Read-Only Examples
- Conversations are **automatically saved in IndexedDB** (`aiSessions` store in `auteur-script-library-v1`, decoupled from script deletion so sessions survive even if the original script is deleted) at semantic checkpoints (turn completion, failure/abort, Quick Scan, suggestion apply/dismiss, question answer/skip, and text-only Brief updates—never per streamed token). Opening or refreshing the **`AI`** sidebar starts clean and displays up to **5 recent sessions** prioritized for the currently open script first (backfilling from other scripts), alongside an icon-only **History** button left of **`Context`** in the sidebar header and **`File ▾ → AI Chat History...`**.
- **Persistent Remote URI Refs, Text-Only Binary Briefs & Zone 1 Cache Stability:** Persisted sessions strip heavy binary/inline payloads (`inlineBase64`, `inlineText`, `blob:`/`data:` URLs) into `omittedAttachmentTag` descriptors (for Brief) or `omitted: true` metadata chips (for per-turn `+` composer attachments), while preserving lightweight remote references (**YouTube** URLs with remote thumbnails and **Gemini Files API** URIs with `expirationTime` metadata) across page reloads and exports so `formatSceneBriefContext()` stays byte-identical to `lastTurnBriefContext` without invalidating warm `previous_interaction_id` chains. Any Files API reference past its 48-hour `expirationTime` is automatically skipped on send and badged **`EXPIRED`** in both Scene Brief and chat attachment chips. Persisted sessions also deduplicate repeated Zone 1 `systemInstruction` strings in `traceSystemInstructions` for 100% identical `AiTraceModal` inspection.
- **History Explorer Modal (`AiSessionHistoryModal`):** Two-pane modal with search, **`All` / `This Script` / `Pinned`** filters, **`Script deleted`** badges when the original script is missing, inline **Rename** and **Pin** (protecting sessions from the 100-session FIFO cap), hover **Copy** on user prompts and assistant responses, **Copy Brief**, a **`Download | ▾`** split button (1-click **Conversation `.md`** download by default, evaluation-ready **Full Conversation `.json`** with conversation, `scriptSnapshot`, Brief, `skillsUsed`, `toolsUsed`, failed tool repair diagnostics, suggestion diffs/issues, and per-turn token/cache metrics without raw trace payload noise—ideal for pairing with an exported **Agent Context Pack** JSON—or **Full Payload `.json`** with top-level deduplicated `systemInstructions`, `toolsSummary`, full traces, and continuity metadata), full **Trace Inspector** parity (deduplicating repeated Zone 1 `systemInstruction` strings in storage and rehydrating identically), **`Load in Sidebar`** (never auto-switching the active script), and **`Switch Script & Load`** when the original script still exists.
- **Automatic Recap Bridge (`<prior_session_recap>`):** When resuming a session whose `previous_interaction_id` expired or belongs to another API key (`'interaction_expired'`, or a historical `'file_unavailable'` error on a chained turn where no `files_api` attachment was newly sent this turn), or when continuing a session onto a different script, `sessionRecap.ts` builds a deterministic Round 1 `<prior_session_recap>` preamble (preserving Zone 1 `system_instruction` untouched), re-collects any still-valid in-memory Brief attachments, and retries cleanly in a fresh interaction chain.
- **Bundled Examples (`Fork & Apply`):** Bundled examples are read-only until forked. When you click **`Fork & Apply`** (or **`Fork & Apply All`**) on an AI Draft, Patch, or Audit Fix card while viewing a bundled example, the app forks the example into *My Scripts* (IndexedDB), applies the suggestion, and **preserves your active AI conversation thread** so you can keep iterating seamlessly.

---

## 4. Resizable Prompt Box & Dedicated `Scene Brief & References` Modal

At the bottom of the sidebar sits a **resizable prompt box** (`Enter` to send, `Shift+Enter` for a newline) that auto-grows cleanly as you type and includes a top drag-resize handle (double-click to reset to auto-grow), a **`+` attach button** (plus drag-and-drop and clipboard image paste directly onto the prompt box) for **turn-scoped attachments** (`Upload file(s)…` with automatic Gemini Files API upload for video/audio/PDF/`>256 KB` docs, `Gemini Cloud Files (48h)…` modal to reuse existing cloud uploads across sessions, and an inline `YouTube URL…` bar; video chips support inline `Static` / `Agentic` toggling, click-to-preview in `BriefMediaLightbox`, and restore automatically to the composer if a turn fails or is stopped while keeping Quick Scan strictly Brief-only), the 4-tab Focus bar, Target Scope / Quick Audit row, **`Brief`** and **`Ask First`** buttons on the left, and the cumulative **Session Cost** badge + **`Model · Level`** settings chip on the right.

### Editing `Scene Brief & References` (`AiBriefModal`)
Click **`Brief`** at the bottom-left to open the dedicated **Scene Brief & References** modal (unobstructed by the prompt box and modeled as a mode-agnostic multimodal Reference Pack for cast handles, media attachments, and production constraints):

1. **Include in AI context (On/Off toggle)**:
   - Enabled by default as soon as you populate any Brief field, and can be toggled off anytime without clearing your references or notes (the bottom button shows **`Brief · Off`** while paused).
   - **Carries across all modes (`Auto`, `Draft`, `Refine`, `Audit`) without busting cache:** When active, your Brief is injected as a delta-only `<scene_brief>` block prepended to Round 1 `input` (sent once when active, updated only when edited, and emitting a 1-line `<scene_brief status="cleared">` notice if paused/cleared mid-session—visible live inside **Context → Live Prompt Preview**), never modifying `system_instruction` or rewriting what you type in the prompt box.
   - When the Brief is empty or toggled off, **nothing** is injected and your prompt box message is sent verbatim.
2. **Cast & References (Visual Card Strip + Multimodal Attachments)**:
   - **Drag & Drop / Local Upload (Images & Text):** Drop or pick local **images** (`.jpg`, `.png`, `.webp`, etc. — automatically downscaled in-browser to max `1600px` longest edge at `85%` quality) or small **text documents** (`.txt`, `.md`, `.json`, `.csv`, `.srt`, `.vtt`, etc., `≤ 256 KB`). Each card shows an aspect-ratio-aware preview tile, editable top-left handle badge (`@image1`, `@doc1`, ...), and **Label** + **Note** inputs directly underneath.
   - **Gemini Files API (Video, Audio, PDF, or Full-Fidelity Originals up to `2 GB`):** Click **`Files API`** to open the inline **`GeminiFilesPanel`**, where you can drag-and-drop or pick one or multiple files for sequential multi-file batch upload directly from the browser via `@google/genai` (`src/services/geminiFiles.ts`, auto-polling `PROCESSING` → `ACTIVE`), or browse, refresh, attach, and delete active **48-hour Gemini Cloud files** stored on your API key. Dropping a video, audio, PDF, or `> 256 KB` text file onto the local dropzone also surfaces a 1-click **`Upload via Files API`** shortcut. Locally expired `files_api` attachments (`expirationTime <= now`) are automatically skipped before sending, and 48-hour expiration or cross-key access errors surface clearly as `file_unavailable` (rather than blaming your API key).
   - **Public YouTube URLs:** Click **`YouTube`** to paste any public YouTube URL (`watch`, `shorts`, `embed`, `live`, `youtu.be`) with instant thumbnail preview (`@video1`, zero upload required). Video cards also include a **`Static` / `Agentic`** toggle for Interactions API video processing mode.
   - **Hover Preview & Click-to-Inspect Lightbox (`BriefMediaLightbox`):** Hover over any attached reference card to see a viewport-aware floating preview portal (scaled image, text excerpt, or file/URI metadata). Click the preview tile to open a full-screen lightbox (`aria-modal="true"`) with full-resolution image inspection, inline `<video>` / `<audio>` playback (for files uploaded during the current session), embedded YouTube playback (plus an **`Open on YouTube`** link), or a scrollable full-text viewer with line and character counts (`Esc` closes the lightbox without closing `AiBriefModal`).
   - **Text-only handles (`+ Text handle`):** Keep lightweight manual `@handle` rows without attaching media.
   - **Send-Once-Per-Thread Efficiency:** Because ScriptFlow chains server-side state via `previous_interaction_id`, each multimodal attachment is fingerprinted (`buildAttachmentFingerprint`) and delivered **once** on the first turn it appears (not re-uploaded on follow-up turns in the same thread), and the Brief text manifest is likewise sent once and only re-sent if edited or paused.
   - **On-Demand Skill Loading:** Whenever `@video*` or `@image*`/`@actor*`/`@audio*` references appear in your Brief or script, the model sees the relevant hint in the **On-Demand Skill Directory** and loads `video_continuation` or `character_reference` via `load_auteur_skill` when needed (or you can **Pin** any skill in Context → Skills & Extensions).
3. **Format & Specs**: Concise production constraints (e.g., *"short sequence, continuous handheld oner, Robert has only one line, Japanese kissaten cafe"*).
4. **Subtext & Additional Instructions**: Background directorial intent, unspoken tension, or extra instructions carried across turns.
5. **Modal Actions**:
   - **`Clear`**: Clears all Brief fields and reference rows (and resets the toggle to enabled).
   - **`Done`** (or `Esc`): Closes the modal while the **`Brief`** button shows its live status (`Brief`, `Brief · 2 refs`, or `Brief · Off` when paused).

### Verbatim Prompt Box (Zero Hidden Wrapping)
Your message in the composer box is **always sent verbatim** (except for an explicit `[Target Scope: ...]` prefix when you select a specific `MB#` or `S#` scope in `Auto` / `Refine` on a non-empty script). Leaving the Brief empty or paused lets you brainstorm, ask craft questions, or draft directly from the prompt box without any automatic template wrapper.

---

## 5. Complete Local AI Tools Reference

All 10 AI tools are dispatched via [`src/services/scriptTools.ts`](../src/services/scriptTools.ts) (backed by modular declarations and handlers under `src/services/tools/`) and execute **locally in the browser** against your current `rawText`, `sceneTitle`, and active `Settings → Supervisor rules` (`ruleOverrides`).

### 1. `get_script_overview` *(Read-Only)*
- **UI Badge:** `Inspect overview`
- **Available In:** `Auto` (non-empty), `Draft` (non-empty), `Refine`, `Audit`
- **Arguments:** `{}` (none)
- **What It Returns:**
  - `sceneTitle` and `snapshotHash` (optimistic concurrency token required for patches and text replacements)
  - `schemaVersion`, `sceneTopology` (`continuous_oner` | `multi_camera_coverage` | `discontinuous_montage` | `mixed` | `empty`), `hasContinuationContext`
  - `stagingMacroBlocks`: every `MB#` ID, header, kind, format (`prose` vs. `key_value`), and `[AESTHETIC]` key list
  - `macroStateCount` and `macroStates`: every `S#` ID, Sub-State count, `activeCameraIdentifier`, and `cameraTransition`
  - `cameraSlots`, `referenceBindingCount`, `tokenMappingCount`
  - `diagnosticsSummary` and full `diagnostics[]` from the 5 deterministic linter rules

### 2. `get_script_source` *(Read-Only Plain-Text Source Reader)*
- **UI Badge:** `Read script source`
- **Available In:** `Auto` (non-empty), `Draft` (non-empty), `Refine`, `Audit`
- **Arguments:**
  - `targetIds` *(optional)*: Specific Staging Macro-Block or Execution Macro-State IDs (e.g., `["MB0", "MB2", "S3", "S4"]` or header names like `"AESTHETIC"`, `"EXECUTION"`). Omit to read the full canonical `v0.4.0` plain-text script.
  - `annotateIds` *(optional, default `true`)*: Annotates returned Macro-Block headers (`# MB0`) and Macro-State lines (`S3: ...`) so the model sees exact IDs alongside verbatim prose. Pass `false` for raw unannotated canonical text.
- **What It Returns:** `snapshotHash`, `sceneTitle`, `filtered`, `totalChars`, `sourceText`, `annotatedSections`, `matchedIds` (when filtered), and `notFoundIds` + `repairHint` if any requested IDs were not found. Ideal for fast whole-script reading, checking tone/phrasing, or verifying exact strings before `propose_text_replace` or `propose_script_patch`.

### 3. `inspect_lens_slice` *(Read-Only + Surgical Filtering & Co-Located Supervisor Checklist)*
- **UI Badge:** `Inspect lens slice`
- **Available In:** `Auto` (non-empty), `Draft` (non-empty), `Refine`, `Audit`
- **Arguments:**
  - `preset`: One of the 5 built-in Script Supervisor presets:
    - `lens1_spatial_optics` — `[LOGIC]`, `[OPENING]`, `[CONTINUITY PROTOCOL]`, `[CAM]`/`[BLOCK]`/`[ACT]`, `resolvedCamera`, referenced tokens, Lens 1 diagnostics
    - `lens2_temporal_pacing_wear` — `[INTENT]`, `[LOGIC]`, `[OPENING]`, `[ACT]`/`[STATE IN/OUT]`/`[SPEED]`, `resolvedCamera`, Lens 2 diagnostics
    - `lens3_props_inventory` — `[LOGIC]`, `[OPENING]`, `[AESTHETIC]` (`Wardrobe`, `Location`), `[ACT]`/`[PROP]`, `resolvedCamera`, Lens 3 diagnostics
    - `lens4_acoustics_voice` — `[AESTHETIC]` (`Audio`), `{dialogue}`, `<foley>`, `(score)`, reference bindings, `endsOnDialogue`, Lens 4 diagnostics
    - `lens5_blocks_grammar` — Full document Sub-States, `resolvedCamera`, all tokens/refs, and all diagnostics
  - `macroStateIds` *(optional)*: Restricts Execution output to specific Macro-State IDs (e.g., `["S3", "S4"]`) while preserving inherited `resolvedCamera` continuity computed from the full document.
  - `includeStaging` *(optional)*: Set to `false` to omit Staging Macro-Blocks (`MB#`) when inspecting only Execution Macro-States.
  - `spec` *(optional)*: Custom composable `LensSliceSpec` (`macroBlocks`, `aestheticKeys`, `dimensions`, `subStateTags`, `macroStateIds`, `includeStaging`, `includeAllSubStates`, `includeResolvedCamera`, `includeTokenMappings`, `includeReferenceBindings`, `includeSceneTopology`, `includeTrailingResolution`, `includeAllDiagnostics`), or combined with `preset` as overrides.
- **Co-Located Topology-Filtered Checklist:** Whenever called with a built-in `preset`, the tool attaches a `checklist` object (`getLensAuditChecklist(preset, topology)`) directly alongside `slice`:
  - On **continuous oners / coverage**, enforces 180° eyeline parity, $S_0 \to S_1$ handoff, camera holds/operator verbs, prop lifecycles, and wear repetition.
  - On **`discontinuous_montage`**, explicitly suppresses cross-cut 180° eyelines, $S_0 \to S_1$ carryover, and cross-state prop/wear persistence, switching to montage self-contained anchoring, plain `[CAM]` tags, and the cut-latency floor (`Duration / 2.0`).
- **Parallel Execution:** The model can call multiple `inspect_lens_slice` presets in parallel within a single round for fast multi-lens audits.

### 4. `propose_script_patch` *(Transactional Dry-Run & Staging)*
- **UI Badge:** `Stage patch`
- **Available In:** `Auto` (non-empty), `Refine`
- **Arguments:** Validated against `AuteurPatchSchema` (`expectedSnapshotHash`, `summary`, and `ops[]` targeting `MB#`, `MB#.#`, `S#`, or `S#.#` via `set_macro_block`, `insert_macro_block`, `delete_macro_block`, `set_aesthetic_entry`, `delete_aesthetic_entry`, `upsert_token_mapping`, `delete_token_mapping`, `replace_macro_state`, `insert_macro_state`, `delete_macro_state`, `reorder_macro_states`, `replace_sub_state`, `insert_sub_state`, `delete_sub_state`).
- **Validation & Self-Repair Gate:**
  - Dry-runs `applyAuteurPatch(rawText, patch, { rejectOnNewErrors: true, ruleOverrides })`.
  - **Read-Before-Write Guard (`STALE_CONTEXT_READ_REQUIRED`):** Whenever the live script changed since the prior turn (`changedSinceLastTurn`) or the turn was seeded by a `<prior_session_recap>` bridge on a non-empty script, `propose_script_patch`, `propose_text_replace`, `propose_script_draft`, and `report_audit_review` require a fresh read in a prior round (`get_script_source` for the affected/changed targets or full source, or `inspect_lens_slice` for audit/slice fallback) before staging. Same-round parallel read + write calls still block the premature write until the next round so the model sees the updated text first (`get_script_overview` alone does not satisfy the guard).
  - **If rejected** (`SNAPSHOT_MISMATCH`, `STALE_CONTEXT_READ_REQUIRED`, `TARGET_NOT_FOUND`, `VALIDATION_ERROR`, or `LINT_ERROR_INTRODUCED`): stages **nothing** and returns `ok: false` (`is_error: true`) with structured `errors`, `introducedErrors`, and a concrete `repairHint` (including the current `snapshotHash` or target `get_script_source` IDs) so the model repairs and retries automatically.
  - **If clean:** computes a deterministic line diff (`buildLineDiff`) and `LintDelta` (before/after error & warning counts, resolved diagnostics), and stages a **`PatchSuggestionCard`**.

### 5. `propose_text_replace` *(Scoped Find-and-Replace & Linter-Gated Staging)*
- **UI Badge:** `Stage text replace`
- **Available In:** `Auto` (non-empty), `Refine`
- **Arguments:** `{ expectedSnapshotHash, summary, replacements: [{ find, replace, isRegex?, caseSensitive?, wholeWord?, flags?, targetIds? }] }` (1–20 replacement rules in a single atomic pass; optional per-rule `targetIds` like `["MB1", "S3"]` scopes replacements to those Macro-Blocks / Macro-States).
- **Safeguards & Staging:**
  - Verifies `expectedSnapshotHash` against the current script snapshot, rejects invalid/unsafe regex patterns, and preserves canonical `[HEADER]` lines so replacements cannot corrupt Macro-Block headers.
  - Dry-runs deterministic linting (`rejectOnNewErrors: true`, respecting active `ruleOverrides`) and withholds staging with a concrete `repairHint` if any rule matches zero times or introduces new lint errors.
  - Synthesizes an equivalent `AuteurPatch` for changed targets so Live Mode renders hover-to-diff margin indicators (`AiPatchIndicator`) and stages a standard **`PatchSuggestionCard`** (with `Apply Patch`, `Fork & Apply`, or `Dismiss`). Ideal for global character/prop/location renames, token-ID swaps, and cross-script terminology updates.

### 6. `propose_script_title` *(Scene Title Proposal & Staging)*
- **UI Badge:** `Suggest scene title`
- **Available In:** `Auto`, `Draft`, `Refine`
- **Arguments:** `{ title: string, rationale?: string }`
- **Staging & Apply:**
  - Validates that the normalized title is non-empty (max 120 chars) and distinct from the current `sceneTitle`.
  - Stages a dedicated **`TitleSuggestionCard`** displaying the current title → proposed title transition and optional rationale, with 1-click **`Apply Title`** (or **`Fork & Apply Title`** when viewing a read-only bundled example) and **`Dismiss`**.

### 7. `propose_script_draft` *(Compiler Dry-Run & Staging)*
- **UI Badge:** `Compile draft`
- **Available In:** `Auto` (empty), `Draft`
- **Arguments:** `{ title?, summary?, draft: AuteurScriptDraft }` (staging Macro-Blocks with `format: 'prose' | 'key_value'` + `[EXECUTION]` Macro-States and typed Sub-States).
- **Validation & Self-Repair Gate:**
  - Compiles via `compileAuteurDraft(draft, ruleOverrides)` into canonical `v0.4.0` plain text.
  - **If schema validation fails or any deterministic lint `error` is present** (respecting active `ruleOverrides`): withholds staging and returns `ok: false`, `staged: false`, `diagnostics[]`, and `repairHint` so the model fixes the draft before showing it to you.
  - **If lint-error-free:** stages a **`DraftSuggestionCard`** with topology, Macro-Block/Macro-State counts, diagnostics summary, and full preview/diff.

### 8. `report_audit_review` *(Structured Multi-Lens Audit & Fix Dry-Run)*
- **UI Badge:** `Stage audit review`
- **Available In:** `Auto` (non-empty), `Audit`
- **Arguments:** Validated against `AuteurReviewSchema` (`overallSummary` and `issues[]`, each carrying `lens`, `severity`, `targetLevel`, `targetId`, `message`, `rationale`, `repairHint`, and optional `suggestedPatch`).
- **Per-Issue Fix Verification:**
  - Every embedded `suggestedPatch` is individually dry-run with `rejectOnNewErrors: true` and active `ruleOverrides`.
  - Clean fixes attach a 1-click **`Apply Fix`** button directly inside that audit issue row (and enable header **`Apply All (N)`** batching when 2+ fixes are non-conflicting).
  - Any broken or lint-violating `suggestedPatch` is withheld from staging and reported back in `invalidSuggestedPatches` with a `repairHint` so the model can repair it.
  - Stages an **`AuditReviewSuggestionCard`** with clickable `targetId` jump links.

### 9. `load_auteur_skill` *(Dynamic On-Demand Craft & Module Loader)*
- **UI Badge:** `Load skill`
- **Available In:** Any Focus whenever `availableSkills.length > 0`
- **Arguments:** `{ skillId: string }` — its JSON Schema `enum` is built from `context.availableSkills` (all non-pinned, non-muted skills including custom user skills), staying completely static across script edits.
- **Runtime State Machine:**
  - `available` (`On-Demand`) → returns `{ ok: true, skillId, name, content }` (for `draft_craft`, dynamically including the *Discontinuous Montage* exemplar when editing a montage topology without mutating `system_instruction`) and adds a **`Loaded`** skill pill to the turn.
  - `active` (`Pinned`) → returns `{ ok: true, alreadyActive: true }` (prevents redundant token dumps or error loops).
  - `muted` (`Muted`) → returns `{ ok: false, error: 'Skill is muted by the user.', availableSkills }` (strictly honors user Mute).
  - Unknown ID → returns `{ ok: false, error, availableSkills, repairHint }`.

### 10. `ask_question` *(Opt-In Single/Multi-Select Clarifying Interview with Pause & Resume)*
- **UI Badge:** `Clarifying questions`
- **Available In:** Declared in `Auto`, `Draft`, and `Refine` so toggling **`Ask First`** never mutates `[tools]`, but **hard-gated ON/OFF at runtime**: rejected with `ok: false` unless **`Ask First`** is toggled ON (`[Ask First: ON]` in Zone 3 `input`; auto-resets after sending), the turn is a `[Clarifying follow-up]`, or `ask_question` is forced **`Always On`** in Context → Function Tools. Always omitted in `Audit`.
- **Arguments:** `{ intro?: string, questions: [{ question, options[], multiSelect?: boolean }] }` (1–4 concise questions, 2–5 short distinct options each; `multiSelect` defaults to `false` for mutually exclusive picks or `true` when choices combine; redundant `"Other"` options are stripped automatically).
- **Interactive Card (`QuestionSuggestionCard`) & Pause/Resume Flow:** Calling `ask_question` **immediately pauses the Gemini turn** (buffering any parallel sibling tool results cleanly instead of wasting a Round 2 filler reply). Multi-question cards present a compact **stepped `1 / N` view** (clickable `1`..`N` step pills, **`Back`** / **`Next`** / **`Skip`**, `Enter` in the note box to advance, and **`Skip all`** — using the same single pause/resume round-trip for zero extra token cost). Every question pairs single-pick (`multiSelect: false`) or multi-select (`multiSelect: true`) option chips with an **independent additive note input** (`data-native-undo="true"`) so you can refine any pick without rewriting chips. Click **`Submit Answers`**, **`Skip all`** / **`Skip & Proceed`** (*"Your call"*), or **`Dismiss`**: submitted/skipped answers resume the exact paused `previous_interaction_id` via Interactions API `function_result` (zero separate user chat bubble—the card collapses in place into an **`✓ Answered`** / **`Skipped`** receipt whose expanded view displays every question & answer at a glance). Typing a new message in the composer while paused resolves the open `call_id` cleanly as dismissed so the thread never deadlocks.

---

## 6. Knowledge Registry, Skills & Pre-Send Transparency (`Context` Modal)

Click **`Context`** in the sidebar header (shows active skill count and an indicator dot when customizations or upstream knowledge/rule updates exist) to open **`AiContextInspectorModal`**.

### How the 3-Zone Prompt Is Structured (Cache-Stable Prefix + Delta Turn Context)

Every turn is assembled deterministically by `composeAgentContext()` ([`src/services/auteurKnowledge.ts`](../src/services/auteurKnowledge.ts)) into **Zone 1 (`system_instruction`, frozen cache prefix)** and **Zone 3 (Round 1 `input`, delta-only turn context)**:

#### Zone 1 — `system_instruction` (Cache-Stable Prefix)

| Section | Editable? | What It Contains |
|---|---|---|
| **1. Foundational Craft** | **Editable** | Core Auteur Script `v0.4.0` directorial craft (*boundaries not handcuffs*, *static once / volatile always*, *state inheritance*, *literal over literary*, *acting is reacting*, *anti-twitch*, *repetition mandate*, canonical inline syntax invariants, and **Beginner & Power-User Adaptation**). |
| **2. Pinned Skills** | Read-Only (User-Pinned) | Full bodies of every skill explicitly **Pinned** by you (zero default pinned skills). |
| **3. Tool & Safety Protocol** | **Editable** *(Runtime Header Auto-Synced)* | Cache-stable runtime header (`Active focus`, `Allowed tools this turn` or Pure Conversation Mode, static `expectedSnapshotHash` + fresh-read rule, and Linter Gate override status) + editable Core Safety Protocol rules (including read-before-write on changed/bridged scripts) + editable per-tool Protocol Guidance bullets. Configured in Tab 4 (**`Function Tools`**). |
| **4. On-Demand Skill Directory** | Read-Only (Computed) | Compact 1-line `id: triggerHint` menu for **`available`** (`On-Demand`) skills that the model loads via `load_auteur_skill`. |

#### Zone 3 — Next Turn Context (Delta Payload Prepended to `input`)

| Block | Mode / Delivery | What It Contains |
|---|---|---|
| **`<live_editor_state>`** | `Full Snapshot` or `Unchanged · Compact` | Full snapshot (`sceneTitle`, `isEmpty`, `snapshotHash` / `expectedSnapshotHash`, `changedSinceLastTurn`, `changedTargetIds`, automatic **Recent user edits since last turn**, `sceneTopology`, counts, and active lint diagnostics) on Turn 1 or whenever the script, title, or diagnostics change; otherwise a compact 1-line `snapshotHash` confirmation. |
| **`<scene_brief>`** | `Full` / `Updated` / `Cached` / `Paused` / `Not Attached` | Mode-agnostic active reference context (`Cast & References`, `Format & Specs`, `Subtext`). Sent once per chain, re-sent only when edited, omitted when unchanged, or replaced with a 1-line `cleared` notice if paused mid-session. |
| **`<turn_directive>`** | `Ask First` / `Follow-up` / `Off` | `[Ask First: ON]` or `[Clarifying follow-up]` prepended only on those turns so `tools` and `system_instruction` stay identical. |

### The 3-State Skill Machine (`pinned | on-demand | muted`)

Every built-in and custom skill resolves into **strictly one mutually exclusive state** per turn—with **zero passive auto-injection** and zero duplication between `system_instruction` and `load_auteur_skill`:

- **`active` (`Pinned`)** *(User **Pinned**)* → Injected directly into Zone 1 `system_instruction`; excluded from `load_auteur_skill`.
- **`available` (`On-Demand`)** *(Default for all skills)* → Listed as a 1-line hint in the On-Demand Skill Directory and loadable via `load_auteur_skill`.
- **`muted` (`Muted`)** *(User **Muted**)* → Omitted from both `system_instruction` and `load_auteur_skill`, and rejected at runtime if called.

### Built-In Extension Skills Catalog (`BUILTIN_AUTEUR_SKILLS` · `src/data/knowledge/skills/*.md`)

| Skill ID | Category | Default State | What It Provides |
|---|---|---|---|
| `draft_craft` | Workflow | **On-Demand** *(load via `load_auteur_skill` or Pin)* | Block-by-block drafting specs (`[INTENT]`, `[LOGIC]`, `[AESTHETIC]`, `[OPENING]` 4 coordinates, `[EXECUTION]`), silent pre-flight ledger, and clean `0`-diagnostic curated examples from `src/data/examples/` (*Robert's Machu Picchu Trail Dispatch*, *Cappadocia Balloon Panic*, plus *The Grand Continental* dynamically on montage topology). |
| `draft_interview` | Workflow | **On-Demand** *(load via `load_auteur_skill` or Pin)* | Guides 2–4 high-leverage directorial questions before drafting an open scene (Camera Topology, Temporal Cadence, Audio & Dialogue Balance, Visual & Mood Texture) without re-asking settled prompt/Brief details, respecting single vs. multi-select picks and `ask_question` gating. |
| `video_continuation` | Module | **On-Demand** | Terminal-frame `[OPENING]` handoff, `[CONTINUITY PROTOCOL]` placement, reduced delta-only `[AESTHETIC]`, and `S1` camera continuation rules. |
| `token_mapping` | Module | **On-Demand** | Shorthand dictionary authoring (`LOC01`, `EV01`, `PROP01`) and downstream reuse without lookbook bleed. |
| `character_reference` | Module | **On-Demand** | Phase 1 reference isolation, separating facial/vocal identity from fresh scene wardrobe in `[AESTHETIC]`, and canonical name usage downstream. |
| `temporal_calibration` | Module | **On-Demand** | Macro-State-to-duration tempo table (combat oner `0.8s–1.2s`, tactical `1.5s–2.0s`, dialogue `2.5s–4.0s`, slow horror `4.0s–6.0s+`), anti-float rule, and cut-latency floor (`Duration / 2.0`). |
| `spatial_fences` | Module | **On-Demand** | Inline `[BLOCK]` for 3+ subjects/mark swaps, `[STATE IN]`/`[STATE OUT]` boundary clamps, dynamic `[LIGHT]`, and Tier-2 single-dimension tags (`[FOCUS]`, `[SPEED]`, `[PROP]`, `[ENV]`, `[CROWD]`, `[VFX]`, `[TRANS]`). |

### Inside the 5 Tabs of `AiContextInspectorModal`
1. **Live Prompt Preview**: Inspect both **System Instruction (Cache-Stable Prefix)** (`Editable` vs. `Read-Only · Code-Owned`) and **Next Turn Context (Delta Payload)** (`Full Snapshot` / `Unchanged · Compact`, Brief delivery badges, and `Turn Directive` status), plus active `Focus`, `sceneTopology`, `snapshotHash`, exposed tool badges (clickable to jump to **Function Tools**), total system prompt character count, and one-click **`Copy System Prompt`**. If built-in defaults ever evolve (`AUTEUR_KNOWLEDGE_VERSION`, currently `0.4.0-k5`) while you have saved overrides, a quiet notice lets you **Acknowledge** or **Reset All**.
2. **Foundational Craft**: Edit **Foundational Auteur Craft** directly (persisted in `localStorage` under `auteur-editor-ai-skills-v1`), with a **`Modified`** indicator and **`Reset to default`**.
3. **Skills & Extensions**:
   - Toggle any built-in or custom skill between **`On-Demand`**, **`Pin`**, and **`Mute`** (or use **`On-Demand all`** / **`Mute all`** to update every skill in one click without losing custom skills or body overrides) and immediately see its resolved status (`Pinned`, `On-Demand`, `Muted`).
   - Expand any skill to read or override its instruction body (`Reset` restores built-in text).
   - Click **`+ Add Custom Skill`** to create your own reusable extension skills (`Name`, auto-slugified `snake_case` `ID` validated against built-in collisions, `Trigger Hint`, and `Instruction Body`), plus edit or delete them (destructive deletes and **Reset all defaults** confirm via `ConfirmDialog`).
4. **Function Tools** (`FunctionToolsTab`):
   - **Enforce Linter Gate on Staged Proposals**: Toggle whether mutation tools (`propose_script_patch`, `propose_text_replace`, `propose_script_draft`, and `report_audit_review` fixes) reject proposals that introduce deterministic Script Supervisor errors (`rejectOnNewErrors: true`, default On) or allow staging while still enforcing AST schema and `expectedSnapshotHash` concurrency checks.
   - **Core Tool & Safety Protocol**: Inspect the cache-stable auto-synced runtime header (`Active focus`, `Allowed tools`) and edit/reset the foundational safety & self-repair rules.
   - **3-State Function Tool Activation (`Auto` · `Always On` · `Disabled`)**: Control each of the 10 function tools individually—or bulk-toggle **`Auto all`** / **`Disable all`** (disabling all 10 tools switches the next turn into **Pure Conversation Mode**, omitting `tools` from the Gemini API request for `0` tool schema tokens). Setting `ask_question` to **`Always On`** lets the assistant call it on demand even when `Ask First` is off; setting it to **`Disabled`** disables the sidebar **`Ask First`** toggle as well. `load_auteur_skill` retains a schema guard so it only exposes when at least 1 skill is in the `available` (`On-Demand`) state.
   - **Per-Tool Prompt Guidance, API Description & JSON Schema Inspection**: Expand any tool card to edit its **Protocol Guidance Bullet** (injected into Tool & Safety Protocol only when active) or its **API FunctionDeclaration Description**, reset that tool, or toggle its read-only sanitized **JSON Schema parameters** viewer (`getToolParametersSchema`).
5. **Quick Scan Rules** (`QuickScanRulesTabPanel`):
   - Browse the 15 built-in declarative atomic rules (`src/data/knowledge/quick-scan-rules.json`, `QUICK_SCAN_RULES_VERSION = '0.4.0-qs2'`) grouped by Audit Lens (`Lens 1`–`Lens 5`, `Scene Brief & Media`) with scope badges (`Doc`, `Per S#`, `Per S#.#`) and AST `when` condition tags.
   - Toggle any built-in or custom rule On/Off (or use **`Enable all`** / **`Disable all`** to toggle every rule in one click without deleting custom rules or text overrides), expand built-in rules to override `instructions` / `True` / `False` criteria (`Reset` restores built-in wording), or click **`+ Add Custom Rule`** to create project-specific `Document`, `Per Macro-State` (`{{STATE_ID}}`), or `Per Sub-State` (`{{SUB_STATE_ID}}`) checks evaluated in the exact same single Decisions API pass (persisted under `auteur-editor-quick-scan-rules-v1`).

### Unified Export, Selective Import & Reset Backup Safeguards
- **Unified `Export JSON`** (header bar of `AiContextInspectorModal`): Downloads a single human-editable JSON pack (`auteur-agent-context-YYYYMMDD-HHMMSS-<hash8>.json`, `format: "auteur-agent-context-pack"`, `packVersion: 1`) containing all browser-saved Foundational Craft edits, built-in skill pin/body overrides, custom skills, Tool & Safety Protocol / Linter Gate / Function Tool overrides, Quick Scan rule overrides, and custom Quick Scan rules. Imports remain backward-compatible with earlier `0.4.0-k1`–`k3` packs (and `"on_demand"` pin aliases). Never exports API keys, model preferences, or scripts.
- **Selective `Import JSON`** (`AgentContextImportDialog`): Click **`Import JSON`**—drag and drop any exported `.json` pack directly onto the modal header / tab bar (scoped strictly to the top chrome so selecting/dragging text inside tab editors never triggers a drop)—or open ScriptFlow on desktop via **`/?agents=<json-url>`** (which fetches the remote pack and opens `AgentContextImportDialog` directly without auto-opening the AI sidebar) to validate full or partial JSON packs via Zod (`src/ui/agentContextCodec.ts`) + store sanitizers, surface any non-fatal skip notes, and always open a detailed pick-and-choose review dialog where you can:
  - Toggle top-level sections (**Foundational Craft & Skills**, **Quick Scan Rules**) and check/uncheck individual overrides or custom items (each annotated with `New` vs. `Overwrites local` and change badges).
  - Choose **`Merge (Keep existing)`** (non-destructive: applies only checked items and preserves all other local customizations) or **`Replace (Switch profile)`** (replaces each checked section with only the selected items, displaying exact removal/reset counts and a one-click **`Export current backup first`** button whenever local items would be deleted).
- **Clear Reset Confirmations**: **`Reset all defaults`** and **`Reset Quick Scan rules`** permanently remove custom skills/rules and reset overrides in their respective stores; both `ConfirmDialog` prompts display exact counts of custom items and overrides that will be removed and include a one-click **`Export Agent Context first`** backup button.

---

## 7. Reading Responses, Applying Cards & Debugging Traces

### Thinking Summary, Collapsible Turn Activity Timeline, and Sticky-Bottom Auto-Scroll
Each assistant turn uses a quiet two-row disclosure layout so long reasoning traces, pinned skills, and tool calls never stack into multi-row pill clouds:
- **Thinking Disclosure (`Thinking…` / `Thought for Xs`):** Quiet borderless header row with turn duration (`Thought for 4s`), per-turn estimated cost badge, and `Inspect` button on the right. Expands on an indented left rail automatically while streaming once thought tokens arrive (`max-h-56` with internal sticky-bottom scroll), then auto-collapses when done (when enabled in AI Settings).
- **Collapsible Turn Activity Disclosure (`N skills · M tools`):** Collapsed by default to a single compact row beneath Thinking; while tools run, the row surfaces the active step (`Clarifying questions… · 3 skills · 1 tool`). Expanding reveals an indented vertical timeline with hover tooltips:
  - **Function Tool Rows:** Completed `load_auteur_skill` calls fold into their resolved skill entries (while running, retrying, or stopped skill loads remain visible). Other tools (`running`, `done`, `retrying`, `stopped`) show their display name and concise argument preview.
  - **Skill Rows:** Turn-loaded (`Loaded`) and `Auto` skills appear ahead of `Pinned` skills, with hover tooltips explaining each skill's ID and activation source.
- **Sticky-Bottom Auto-Scroll:** The message stream follows streamed output automatically while you are near the bottom, immediately pauses if you scroll up to read earlier turns, and surfaces a quiet **`↓ Latest`** pill to jump back down and resume auto-scrolling.
- Click **`Stop`** in the composer footer at any time to abort an in-flight turn cleanly via `AbortSignal`.

### Reviewing & Applying Staged Cards & Live Mode Indicators
Suggestion cards are inspectable immediately while streaming, while **Apply** buttons unlock once the assistant finishes its turn:

- **`PatchSuggestionCard`**: Staged by both `propose_script_patch` and `propose_text_replace`. Shows summary, affected IDs (`S2`, `MB1`), lint delta (`Lint clean`, `-1 resolved`, warning count), and toggleable **Diff** / **Preview** views. If you manually edited the script after the patch was staged, a stale-snapshot warning disables **Apply** so manual edits are never clobbered. Once applied or dismissed, it auto-collapses into a compact single-line receipt (clickable to re-expand anytime).
- **`TitleSuggestionCard`**: Staged by `propose_script_title`. Displays the current → proposed scene title transition and optional rationale, with 1-click **`Apply Title`** (or **`Fork & Apply Title`** on read-only bundled examples) and **`Dismiss`**, collapsing into a compact single-line receipt once resolved.
- **`DraftSuggestionCard`**: Shows title, scene topology, Macro-Block/Macro-State counts, lint status, and **Preview** / **Diff** toggle. Clicking **Apply** commits a checkpoint, automatically sets the Scene Title if currently untitled, and auto-collapses the card to a compact receipt.
- **`AuditReviewSuggestionCard`**: Shows overall summary, error/warning counts, and **`Apply All (N)`** (or **`Fork & Apply All (N)`**) right in the header whenever 2+ unapplied, non-conflicting fixes can be committed together in a single transactional Undo checkpoint. Multi-issue audits (`2+` issues) start **collapsed** (`Show N issues ▸`) so the assistant's text reply stays visible without scrolling; expanding shows full rationales, clickable **`targetId`** jump links (`MB0`, `S2`, `S2.1`), diff previews, and 1-click **`Apply Fix`** buttons (auto-collapsing once all fixes are applied). Applying an individual fix (from either the sidebar or Live Mode) automatically rebases any provably non-conflicting sibling fixes (`rebaseAuditReviewAfterFix`) onto the updated script so you can apply independent fixes one by one without re-running the audit (while genuinely overlapping or index-shifted siblings stay safely marked stale).
- **Actionable Hover-to-Diff Popovers in Live Mode (`AiPatchIndicator`, `AiPatchInsertionSeam`)**: While any patch or Audit Review fix is pending and non-stale, affected Staging Macro-Blocks (`MB#`) and Execution Macro-States (`S#`) show a subtle inset accent border and a quiet margin dot right next to `DiagnosticDot` (and proposed insertions show a thin dashed `+ AI Insert` pill between rows). Hover any indicator to peek a word-level diff right in Live Mode—or click to pin it open—and click **`Apply`** / **`Apply Fix`** (or **`Fork & Apply`** on examples, plus **`Dismiss`** for Refine patches) directly inside the popover. Actions sync 2-way with the AI sidebar (updating `Applied`/`Dismissed` receipts and rebasing sibling audit fixes) and commit as a single `Cmd/Ctrl+Z` Undo checkpoint. Indicators automatically clear once applied, dismissed, stale, or when the sidebar closes.
- **Quick Scan Suspect Indicators in Live Mode (`AiQuickScanIndicator`)**: Whenever an active Layer 2.5 Quick Scan flags or marks a Macro-State (`S#`) borderline, a quiet scan icon appears in that row's right margin (red for flagged, amber for borderline). Hover or click to pin a popover listing each tripped atomic rule (including sub-state `S#.#` badges, calibrated probability `%` or `Lint` badge, lens label, and rule question/diagnostic message) alongside a 1-click **`Audit S#`** button that launches a targeted Gemini 4 deep audit for that Macro-State.

### Troubleshooting with the AI Trace Inspector (`AiTraceModal`)
Turn on **`Show Debug Trace`** in **AI Settings**, then click **`Inspect`** on any completed, stopped, failed, or Quick Scan turn to examine:
- **Agent Turn Trace (`AgentTurnTrace`):**
  - **Summary Strip:** Status badge (`Completed`, `Round Limit`, `Stopped`, `Error`), Model, Reasoning Level, **`Focus`** + `Mode`, Duration, Tool Rounds, **`Skills`** (`Active` + `Loaded`), `Interaction Chain` (`previous_interaction_id` progression), aggregated `Token Usage`, and estimated USD cost breakdown (`Est. Cost` split by Input, Cached, Output, and Thinking tokens, plus rate card & promo badge when active).
  - **Round-by-Round Timeline (`Round 1..N`):** Expand any round to inspect the exact `Request Sent` (`model`, `previous_interaction_id`, `generation_config`, `tools`, `input`, full `system_instruction`) and every `Tool Calls & Results` entry (arguments, `ok`/`error`, staged suggestion ID, `Repair Hint`, and full JSON result), plus any server-reported `faults`. Non-completed terminal statuses (`failed`, `incomplete`, `cancelled`, `max_turns_exceeded`) or silent empty turns surface an explicit error notification in chat and preserve the last healthy `previous_interaction_id` without poisoning subsequent turns.
- **Quick Scan Trace (`QuickScanTrace`):**
  - **Summary Strip:** Model (`gemini-decision-1 (v1beta)`), Sensitivity (`strict` / `balanced` / `lenient`), Duration, Total Questions, Batch Count, Estimated Cost (`in / $0 out`), and Usage telemetry.
  - **Calibrated Answers & Payloads:** Sorted probability table (`P=%`, `conf=%`, `flagged` / `borderline` / `clean` badge for every evaluated rule key) plus collapsible **Input Sent** and **Questions Sent** JSON accordions.
- **`Copy Trace JSON`:** Copies the entire sanitized trace to clipboard. API keys and auth headers are strictly excluded and any echoed secret is redacted as `[REDACTED]`.

---

## 8. End-to-End Walkthrough Recipes

### Walkthrough A: Blank Script → Draft → Surgical Refine → Quick Scan & 5-Lens Audit (Zero Tab Switching)
1. Create a **Blank Script** from the File menu and open the **`AI`** sidebar (defaults to **`Auto`**).
2. Click **`Brief`**, add `@image1` → `Mark` and `@image2` → `Robert` (or drop reference images directly), add Specs (e.g., *"continuous handheld oner in a quiet Japanese cafe, Robert has 1 line"*), and add Subtext notes.
3. Click **`Context`** if you want to verify pre-send that all 10 tools are ready in **System Instruction** and your **Scene Brief** appears in **Next Turn Context**.
4. Type your scene idea in the composer (optionally toggling **`Ask First`** ON if you want clarifying questions first) and press `Enter`. Review the staged **Proposed Draft** card and click **Apply**.
5. Notice the Focus bar now shows **Scope** (`Whole Script`, `MB#`, `S#`) plus **`Quick Scan`** and **`Audit All`**—still in **`Auto`**, while your active **Brief** stays cached across turns in `previous_interaction_id` (and can be paused anytime via **Brief → Include in AI context**).
6. Pick `Scope: S4` and type *"Have Mark set the pen down before shutting the notebook"*. Review the line diff on the **Proposed Patch** card (or hover the Live Mode margin dot) and click **Apply** (undoable via `Cmd/Ctrl+Z`).
7. Click **`Quick Scan`** for an instant Layer 2.5 screening—then click **`Deep Audit Selected (N)`** (or **`Audit All`** directly) to run a parallel Script Supervisor audit, jump to any `targetId`, and apply individual fixes or **`Apply All (N)`**.

### Walkthrough B: Continuing an Existing Video Clip (`@video1`)
1. On a blank script (or with **`Focus = Draft`**), open **`Brief`** and upload a reference clip via **`Files API`** or paste a YouTube URL (assigned `@video1`), or add a manual text handle `@video1` → *"Clip 1 final frame — Mark gripping the overhead rail"*.
2. Describe what happens next in the composer. The assistant sees `video_continuation` in the **On-Demand Skill Directory**, loads it automatically via `load_auteur_skill`, includes `[CONTINUITY PROTOCOL]` before `[OPENING]`, keeps `[AESTHETIC]` delta-only, and anchors `[OPENING]` to `@video1`'s terminal frame (or you can **Pin** `video_continuation` in Context → Skills & Extensions).

### Walkthrough C: Adding a Custom Studio Skill
1. Click **`Context`** → **Skills & Extensions** → **`+ Add Custom Skill`**.
2. Enter Name (`House Dialogue Rhythm`), ID (`house_dialogue_rhythm`), Trigger Hint (`When polishing spoken exchanges or interrogation scenes`), and concise instruction body.
3. Leave it on **`On-Demand`** (so the AI loads it via `load_auteur_skill` only when relevant) or set **`Pin`** to include it in System Instruction on every turn.
4. Check **Live Prompt Preview** to see it live in the On-Demand Skill Directory (or Pinned Skills if pinned) before sending.

### Walkthrough D: Diagnosing an Unexpected AI Result
1. Open **AI Settings** and enable **`Show Debug Trace`**.
2. Click **`Inspect`** on the turn (or Quick Scan) in question.
3. Check **Round 1** `system_instruction` and `tools` to confirm which skills were active and which tools were exposed, then check subsequent rounds' `Tool Calls & Results` for any `Repair Hint`, `SNAPSHOT_MISMATCH`, or `LINT_ERROR_INTRODUCED` self-repair steps (or check the calibrated probability table on Quick Scan traces).

---

## 9. Keyboard, Undo & Privacy Quick Reference

- **Composer shortcuts:** `Enter` sends; `Shift+Enter` inserts a newline.
- **Safe native Undo inside AI inputs:** Every `<input>` and `<textarea>` inside the composer, **`Scene Brief & References`** modal (`AiBriefModal`), **Question Card** comments, **AI Settings**, and **Context Inspector** carries `data-native-undo="true"`, and all AI modals carry `aria-modal="true"`—so pressing `Cmd/Ctrl+Z` while editing prompts, references, or skills undoes your text input without undoing the Auteur Script behind it.
- **Document Undo & Persistent Version History after Apply:** Every applied Draft, Patch, or Audit Fix (including **`Apply All`** batches) automatically saves a persistent **pre-apply snapshot** in IndexedDB (`File ▾ → Version History…`, surviving page reloads and script switches) AND commits a single in-memory history `'checkpoint'`, so you can either press `Cmd/Ctrl+Z` immediately or compare/restore/fork any prior checkpoint later.
- **Local-only persistence:**
  - API key: `auteur-editor-ai-api-key-v1` (`localStorage` or tab-scoped `sessionStorage` when `Session only` is on).
  - Model, reasoning, Quick Scan sensitivity & display settings: `auteur-editor-ai-settings-v1` (`localStorage`).
  - Foundational Craft edits, skill pin/body overrides & custom skills: `auteur-editor-ai-skills-v1` (`localStorage`).
  - Quick Scan rule overrides & custom atomic rules: `auteur-editor-quick-scan-rules-v1` (`localStorage`).
