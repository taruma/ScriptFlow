# 04 — Auteur Script: Audit Engine, Empirical Lab Notes & Reference Parsers

> **Bundle Role**: `File 4 of 7` — Verification Rules, Spatial/Temporal Lab Findings & Working Parser Implementations  
> **Target Consumer**: Stateless AI Agents building linters, continuity validators, AST parsers, syntax highlighters, and visualizers  
> **Specification Lock**: Pure Auteur Script (`v0.4.0` Canonical Inline Syntax) — **100% Platform- & Model-Agnostic**

---

## Content Manifest (What Is Inside This File)

This file merges four cleanly separated technical documents:

| Part | Document Title | Source Origin (Cleaned & Unified) | Contents |
|---|---|---|---|
| **Document 4A** | **Script Supervisor Audit Engine** | `grammar/script_supervisor_audit.md` | 4 scene topologies, 5 diagnostic audit lenses, pre-flight state ledger, automated repair recipes |
| **Document 4B** | **Empirical Lab Findings: Spatial Coordinates & Temporal Slack** | `notes/scratchpad.md` (Notes 001 & 003) | `frame-left` vs `stage-left` vs `profile-left` disambiguation, ASCII viewport diagram, Beat-to-Duration calibration, Cut-Latency Floor, Anti-Float rule |
| **Document 4C** | **Reference Parser / Renderer A (Canonical Inline Syntax)** | `vector-film/.../_extensions/auteur/auteur.lua` | Lua Pandoc filter parsing `[BLOCK]` headers, `->`/`→` waterfalls, `Speaker says (tone) {speech}`, `<foley>`, `[TAG]`, `@ref`, `Key:` |
| **Document 4D** | **Reference Parser / Renderer B (Full-Script Staging Modal & Token Extractor)** | `auteur-script-knowledge/_extensions/auteur/auteur.lua` | Lua Pandoc filter parsing complete 5-block scripts, extracting `@ref as LABEL` and `[AESTHETIC]` `-> TOKEN` dictionaries |

---

================================================================================
## Document 4A: Script Supervisor Audit Engine
================================================================================

The **Script Supervisor Audit Engine** is the verification gate for Auteur Script—evaluating structural integrity, spatial geometry, prop lifecycles, and temporal continuity before rendering or during automated linting.

### 1. Context-Aware Auditing: The 4 Scene Topologies

Applying linear continuity to a montage is a false positive, just as allowing unmotivated jump-cuts in real-time dialogue is a real error. Validators must branch on topology:

| Topology Type | Structural Formula | Camera Token | Directorial Scope & Invariant Focus |
|---|---|---|---|
| **1. Continuous Real-Time** | $S_0 \mapsto S_1 \mapsto \dots \mapsto S_n$ | `[CAM 01]`, `[CAM 02]` | Single unbroken takes or real-time coverage. Strict 180° axis, prop hand-tracking, matching eyelines, physical state accumulation. |
| **2. Parallel Cross-Cutting** | $A_k \parallel B_k$ | `[CAM 01]` (Loc A), `[CAM 02]` (Loc B) | Dual independent State Ledgers; Location A inherits strictly from $A_{k-1}$ with zero lighting/prop bleed into $B$. |
| **3. Discontinuous / Montage** | $S_a \xrightarrow{\text{CUT}} S_b \xrightarrow{\text{CUT}} S_c$ | Plain unnumbered `[CAM]` | Elliptical time, trailers, montages. Inheritance severed per line; each line provides its own micro-anchor (subject, light, setting/token). |
| **4. Spatial Journey / Portal** | $S_n \xrightarrow{\text{traverse}} S_{n+1}$ | `[CAM 01]` | Unbroken tracking across thresholds (street $\to$ interior). Modulate `[ENV]` / lighting and `<sound>` at boundary crossings. |

---

### 2. The 5 Script Supervisor Audit Lenses

| Lens | Audit Domain | Core Inspection Focus | Key Rule Verified |
|---|---|---|---|
| **Lens 1** | **Spatial & Optics** | 180° Axis, eyelines, `frame-left/right` anchors, `[FOCUS]`, $S_0 \to S_1$ handoff | No unmotivated axis flips; zero `stage-left/right`; stable spatial geography |
| **Lens 2** | **Temporal, Pacing & Wear** | Beat-to-duration calibration, physical degradation (sweat, blood, mud), `[SPEED]` | No temporal slack (floating) or cut crowding; no unprompted wear resets |
| **Lens 3** | **Props & Inventory** | Explicit hand allocation (`left/right/both`), item permanence, `[PROP]` | Valid lifecycle (`Stored -> Held -> Used -> Released`); zero ghost props |
| **Lens 4** | **Acoustics & Voice** | Selective `<foley>`, room tone in `[AESTHETIC]`, `(O.S.)`/`(V.O.)`, `{dialogue}` | **No Macro-State ends on dialogue**; static room tone not repeated per line |
| **Lens 5** | **Blocks & Grammar** | Block orthogonality, Single-Dimension Law, `@` isolation in `[INTENT]` | Zero lookbook bleed in `[EXECUTION]`; zero tags/motion verbs in `[OPENING]` |

#### Detailed Verification Checkpoints
- **Lens 1 (Spatial & Optics):**
  - `[OPENING]` establishes a motionless $S_0$ still; Line 1 of `[EXECUTION]` inherits matching camera setup, positions, and hand grips.
  - Subjects at `frame-left` look `screen-right`; reverse cuts place responder at `frame-right` looking `screen-left`.
  - Continuous oners (`[CAM 01]`) use operator transitions (`PAN`, `CRANING`, `TRACKING`), never re-declaring a static shot scale mid-take.
- **Lens 2 (Temporal & Wear):**
  - Cut count does not exceed $\text{Duration} \div 2.0$.
  - Action oner lines match tempo (`0.8s–1.2s` combat; `2.5s–4.0s` dialogue).
  - Sweat, blood, mud, and tears persist in `[ACT]` until cleaned or scene ends.
- **Lens 3 (Props & Inventory):**
  - Left/right/both hands tracked explicitly across beats until put down or dropped.
- **Lens 4 (Acoustics & Voice):**
  - Spoken dialogue uses `Speaker says (delivery) {line}` (curly braces only, never quotes).
  - Foley uses `<short physical sound description>` selectively for unique friction, off-screen triggers, or dramatic impacts.
  - Persistent ambient sound stays in `[AESTHETIC]` (`Audio:`); discrete ongoing sounds repeat explicitly (`<low growl continues>`).
- **Lens 5 (Blocks & Grammar):**
  - `@image`/`@actor`/`@audio` bindings appear only in `[INTENT]` / `[CHARACTERS]`; downstream blocks use canonical names only.
  - No static wardrobe, location architecture, or lighting formulas restated in `[EXECUTION]` (unless referenced via declared token `EV01`, `LOC01`).

---

### 3. Pre-Flight State Ledger Schema

```text
[INTERNAL SPATIAL LEDGER]
• Topology: [Continuous Oner | Multi-Cam Coverage | Cross-Cut | Montage | Spatial Journey]
• Staging Setup: [INTENT: Objective | LOGIC: Constraints | AESTHETIC: World | OPENING: S_0]
• Primary Axis: [Subject A (frame-left) <--- Line of Action ---> Subject B (frame-right)]
• Active Props: [Prop 1: Subject A Right Hand | Prop 2: Center Table]
• Physical Conditions: [Subject A: Rain-soaked collar | Subject B: Dry]
• Background Anchors: [frame-left: Open window | frame-right: Oak door | BG: Stone hearth]
```

---

### 4. Automated Directorial Repair Recipes

| Detected Flaw | Deterministic Repair |
|---|---|
| **Plot Dump / Play-by-Play `[INTENT]`** | Condense to 1 flowing sentence: `"Create a [Format/Tone] scene set in [Location], featuring [Characters] [Core Stakes]."` |
| **Staging Disconnect ($S_0 \not\to S_1$)** | Re-anchor Line 1 of `[EXECUTION]` to open with the exact framing, posture, and hand grips locked in `[OPENING]`. |
| **Accidental 180° Axis Break** | Swap viewport/eyeline parity or insert a neutral buffer shot (direct frontal CU / POV) or explicit arcing camera move. |
| **Theatrical Coordinate Leakage** | Replace `stage-left` / `stage-right` with `frame-left` / `frame-right` (or `screen-left` / `screen-right`); separate position from `facing screen-*`. |
| **Ghost Prop / Vanishing Object** | Fold explicit hand allocation into `[ACT]` on every visible line (`skillet in his right hand`). |
| **Lookbook Bleed in `[EXECUTION]`** | Strip static wardrobe, color palette, and room architecture out of `[OPENING]` / `[EXECUTION]`. |
| **Oner Jump-Cut Risk** | Replace static shot re-declaration (`[CAM 01] Low-angle FS`) on lines 2+ with operator motion (`[CAM 01] CRANING DOWN ->`). |
| **Terminal Dialogue Line** | Append `[ACT] <physical follow-through>` or `<sound trigger>` after the `{line}` at the end of the Macro-State. |
| **Temporal Slack (Floating Action)** | Increase Macro-State granularity to ~1.0s per line for combat, or reduce target clip duration. |
| **Blended Multi-Dimensional Tag** | Split into orthogonal Sub-States (`[CAM 01] PUSH-IN CU -> [ACT] John stumbles forward`). |

---

================================================================================
## Document 4B: Empirical Lab Findings (Spatial Coordinates & Temporal Slack)
================================================================================

### 1. Spatial Coordinate Disambiguation (`frame-left` vs. `stage-left` vs. `profile-left`)

Mixing spatial reference frames causes 180° inversions, dimension collisions (position vs. rotation), and 50/50 attention splits in generative video models.

| Term | Reference Frame | Dimension Governed | Model Interpretation & Risk |
|---|---|---|---|
| **`frame-left`** / **`screen-left`** | **Camera / Viewport Frame** (2D screen space) | **Position** (Horizontal X-axis) | **Reliable & Stable.** Matches cinematic captioning priors directly. |
| **`stage-left`** | **Actor / Proscenium Frame** (theatrical space) | **Position** *(Inverted relative to camera)* | **High Collision Risk (BANNED).** Actor's left is viewer's `frame-right`. Models flip unpredictably 50/50. |
| **`profile-left`** / **`facing screen-left`** | **Subject Anatomical Heading** (yaw vector) | **Orientation / Eyeline** (Angle $\theta$ relative to lens) | **Category Mismatch if used as position.** A subject at `frame-right` looking across the screen is `frame-right, in profile-left`. |

```text
============================== THE SCREEN VIEWPORT ==============================
◄── [ FRAME-LEFT ] ──────────── [ FRAME-CENTER ] ──────────── [ FRAME-RIGHT ] ──►
│                                                                              │
│    (Viewer's Left)                                      (Viewer's Right)     │
│                                                                              │
│                                   ACTOR                                      │
│                                (Facing Lens)                                 │
│                                      │                                       │
│    [ STAGE-RIGHT ] ◄─────────────────┴─────────────────► [ STAGE-LEFT ]      │
│  (Actor's Right Hand)                                 (Actor's Left Hand)    │
=================================================================================
```

$$\text{Stage-Left} \equiv \text{Frame-Right}, \qquad \text{Stage-Right} \equiv \text{Frame-Left}$$

**Strict Rule for Linters & UIs:**
- Enforce `frame-left`, `frame-center`, `frame-right` (or `screen-left/right`) + depth planes `FG`, `MG`, `BG` for **location**.
- Enforce `facing frame-left/right`, `facing screen-left/right`, or `in profile-left/right` inside `[ACT]` / `[OPENING]` for **rotational heading**.
- Flag `stage-left` and `stage-right` as syntax/continuity errors.

---

### 2. Beat-to-Duration Ratio & Temporal Slack (Empirical Calibration)

Generative video models have no real-world internal clock; they distribute temporal attention steps evenly across the requested clip duration.

- **Empirical Test Observation (5-Beat Subway Combat Oner across 5s vs. 8s vs. 10s):**
  - **5 seconds (~1.0s per Macro-State):** Visceral, grounded weight transfer, crisp motion blur masking contact seams, immediate terminal impact.
  - **8 seconds (~1.6s per Macro-State):** Mild mid-take float and drag between exchanges.
  - **10 seconds (~2.0s per Macro-State):** **"Temporal Slack" / Low-Gravity Float ("Peter Pan effect")** — when a 0.8s physical action is given 2.0s without intermediate micro-beats, latent velocity decays toward zero and subjects hover mid-air.

#### Mode A: Cut Sequence (`[CAM]` or switching `[CAM 01]` $\to$ `[CAM 02]`)
- **Cut-Latency Floor:** Models need **1.5s to 2.5s per shot** to stabilize a new scene latent.
- **Rule:** Never exceed $\text{Duration} \div 2.0$ cuts (e.g., max 2–3 shots in 5s; max 4–5 shots in 10s).

#### Mode B: Continuous Moving Oner (`[CAM 01]` persistence)
- Zero cut latency; Macro-State frequency scales directly with genre velocity.

#### Genre-Based Temporal Calibration Matrix

| Genre / Cinematic Tempo | Recommended Mode | Macro-State Target Interval (Oner `[CAM 01]`) | Max Shots in Cut Mode | Pacing Risk / Failure Mode |
|---|---|---|---|---|
| **Close-Quarters Combat / Parkour / Chase** | Continuous Oner | **0.8s – 1.2s per line** *(5s $\to$ 4–5 lines; 10s $\to$ 8–10 lines)* | $1\text{ shot per } 2.0\text{s} - 2.5\text{s}$ | **Temporal Slack:** Too few beats create floaty low-gravity motion. |
| **Tactical Gunplay / Standoff** | Hybrid Coverage | **1.5s – 2.0s per line** *(Aim, muzzle flash, recoil, cover)* | $1\text{ shot per } 2.5\text{s} - 3.0\text{s}$ | **Mannequin Freeze:** Actors freeze behind barriers waiting out duration. |
| **Dramatic Dialogue / Interrogation** | Multi-Shot Coverage | **2.5s – 4.0s per line** *(Speech burst + micro-reaction + breath)* | $1\text{ shot per } 3.0\text{s} - 5.0\text{s}$ | **Lip-Sync Acceleration:** Compressing dialogue under 2s produces rapid robotic mouths. |
| **Psychological Horror / Mystery / Noir** | Slow Creep Oner | **4.0s – 6.0s+ per line** *(Slow dolly, lingering beam, dread)* | $1\text{ shot per } 5.0\text{s} - 8.0\text{s}$ | Low beat frequency works well; long holds preserve acoustic decay. |

**The Anti-Float Formula for Action Oners:**
$$\text{Target Duration (seconds)} \approx N_{\text{Macro-States}} \times 1.0\text{s}$$
Never scale an action clip from 5s to 10s without doubling choreographic beat granularity (footwork checks, parry slips, recoil recovery, grip shifts).

---

================================================================================
## Document 4C: Reference Parser / Renderer A (Canonical Inline Syntax Lua Filter)
================================================================================

*Source*: `vector-film/notebook/articles/scene-anatomy-coordinates-for-three/_extensions/auteur/auteur.lua`  
*Capabilities*: Parses individual Macro-Block cards and Execution waterfall chains using canonical inline syntax (`Speaker says (tone) {speech}`, `<foley>`, `[TAG]`, `@ref`, `->` / `→`).

```lua
-- _extensions/auteur/auteur.lua
-- Pandoc / Quarto Lua filter for Auteur Script Editorial Cards & Code Blocks

local counter = 0

local function escape_html(text)
  if not text then return "" end
  local escaped = text:gsub("&", "&amp;")
  escaped = escaped:gsub("<", "&lt;")
  escaped = escaped:gsub(">", "&gt;")
  escaped = escaped:gsub('"', "&quot;")
  return escaped
end

-- Map macro block name to color category
local function get_macro_color(name)
  local upper = name:upper():match("^%s*(.-)%s*$") or ""
  if upper:find("CONTINUITY") then
    return "purple", "CONTINUITY INHERITANCE"
  elseif upper:find("INTENT") then
    return "amber", "DIRECTORIAL INTENT"
  elseif upper:find("LOGIC") then
    return "blue", "COORDINATE FENCE"
  elseif upper:find("AESTHETIC") then
    return "emerald", "WORLD AESTHETIC"
  elseif upper:find("OPENING") then
    return "teal", "FIRST-FRAME ANCHOR"
  elseif upper:find("EXECUTION") then
    return "rose", "ACTIVE TIMELINE"
  else
    return "slate", "STAGING BLOCK"
  end
end

-- Highlight inline tokens inside text: tags, references, dialogue, foley, keys
local function highlight_tokens(text, is_aesthetic)
  local escaped = escape_html(text)

  -- 1. Format line-starting Key: in Aesthetic blocks (e.g. Medium:, Palette:, Wardrobe Ruby:)
  if is_aesthetic then
    local key, rest = escaped:match("^([%w%s_%-]+:)(.*)$")
    if key and rest then
      escaped = '<strong class="auteur-key">' .. key .. '</strong>' .. rest
    end
  end

  -- 2. Format Dialogue with tone: Character says (tone) {speech}
  escaped = escaped:gsub("([A-Za-z0-9_%-]+)%s+(says%s+O%.S%.)%s*%(([^%)\r\n]+)%)%s*%{([^%}\r\n]+)%}", 
    '<strong class="auteur-char">%1</strong> <span class="auteur-verb">%2</span> <span class="auteur-tone">(%3)</span> <span class="auteur-speech">{%4}</span>')
  escaped = escaped:gsub("([A-Za-z0-9_%-]+)%s+(says)%s*%(([^%)\r\n]+)%)%s*%{([^%}\r\n]+)%}", 
    '<strong class="auteur-char">%1</strong> <span class="auteur-verb">%2</span> <span class="auteur-tone">(%3)</span> <span class="auteur-speech">{%4}</span>')

  -- 3. Format Dialogue without tone: Character says {speech}
  escaped = escaped:gsub("([A-Za-z0-9_%-]+)%s+(says%s+O%.S%.)%s*%{([^%}\r\n]+)%}", 
    '<strong class="auteur-char">%1</strong> <span class="auteur-verb">%2</span> <span class="auteur-speech">{%3}</span>')
  escaped = escaped:gsub("([A-Za-z0-9_%-]+)%s+(says)%s*%{([^%}\r\n]+)%}", 
    '<strong class="auteur-char">%1</strong> <span class="auteur-verb">%2</span> <span class="auteur-speech">{%3}</span>')

  -- 4. Format Diegetic Foley: <foley sound>
  escaped = escaped:gsub("&lt;([^&]+)&gt;", '<span class="auteur-foley">&lt;%1&gt;</span>')

  -- 5. Format Sub-state coordinate tags: [CAM], [CAM 02], [BLOCK], [ACT], [VFX], [TRANS], etc.
  escaped = escaped:gsub("%[([%w%s_%-]+)%]", '<span class="auteur-tag">[%1]</span>')

  -- 6. Format Multimodal references: @PREVIOUS_CLIP, @RUBY, @voice_oscar
  escaped = escaped:gsub("(@[%w_%-]+)", '<span class="auteur-ref">%1</span>')

  return escaped
end

-- Split text into lines
local function split_lines(str)
  local lines = {}
  for line in (str .. "\n"):gmatch("(.-)\r?\n") do
    table.insert(lines, line)
  end
  return lines
end

-- Split line into chained steps by "->" or "→"
local function split_steps(line)
  local steps = {}
  local normalized = line:gsub("→", "->")
  local start = 1
  while true do
    local s, e = normalized:find("%s*%->%s*", start)
    if not s then
      local remaining = normalized:sub(start)
      local trimmed = remaining:match("^%s*(.-)%s*$")
      if trimmed and trimmed ~= "" then
        table.insert(steps, trimmed)
      end
      break
    else
      local segment = normalized:sub(start, s - 1)
      local trimmed = segment:match("^%s*(.-)%s*$")
      if trimmed and trimmed ~= "" then
        table.insert(steps, trimmed)
      end
      start = e + 1
    end
  end
  return steps
end

-- Render Macro Block Card (auteur-block)
local function render_macro_block(raw_text)
  counter = counter + 1
  local card_id = "auteur-block-" .. counter
  local lines = split_lines(raw_text)

  local macro_name = nil
  local body_lines = {}

  for idx, line in ipairs(lines) do
    local trimmed = line:match("^%s*(.-)%s*$")
    if trimmed ~= "" then
      if not macro_name and trimmed:match("^%[([%w%s_%-]+)%]$") then
        macro_name = trimmed:match("^%[([%w%s_%-]+)%]$")
      else
        table.insert(body_lines, trimmed)
      end
    end
  end

  local color_class, phase_label = get_macro_color(macro_name or "STAGING")
  local is_aesthetic = macro_name and (macro_name:upper():find("AESTHETIC") ~= nil)

  local body_html = ""
  if is_aesthetic then
    local formatted = {}
    for _, line in ipairs(body_lines) do
      table.insert(formatted, '<div class="vf-block-line">' .. highlight_tokens(line, true) .. '</div>')
    end
    body_html = table.concat(formatted, "")
  else
    local formatted = {}
    for _, line in ipairs(body_lines) do
      table.insert(formatted, highlight_tokens(line, false))
    end
    body_html = '<p class="vf-macro-prose">' .. table.concat(formatted, " ") .. '</p>'
  end

  local html = {}
  table.insert(html, '<div class="vf-code-card vf-auteur-block-card" id="' .. card_id .. '">')
  table.insert(html, '<div class="vf-code-header">')
  table.insert(html, '<div class="vf-code-badges">')
  table.insert(html, '<span class="vf-code-lang">AUTEUR SCRIPT</span>')
  table.insert(html, '<span class="vf-code-type ' .. color_class .. '">' .. escape_html(phase_label) .. '</span>')
  table.insert(html, '</div>')
  table.insert(html, '</div>')
  table.insert(html, '<div class="vf-code-body">')
  
  if macro_name then
    table.insert(html, '<div class="vf-macro-banner"><span class="auteur-macro-badge ' .. color_class .. '">[' .. escape_html(macro_name) .. ']</span></div>')
  end

  table.insert(html, '<div class="vf-block-content">' .. body_html .. '</div>')
  table.insert(html, '</div>')
  table.insert(html, '</div>')

  return pandoc.RawBlock('html', table.concat(html, ""))
end

-- Render Execution Waterfall Card (auteur-execution)
local function render_execution_waterfall(raw_text)
  counter = counter + 1
  local card_id = "auteur-exec-" .. counter

  -- Split into shots/paragraphs (divided by blank lines)
  local raw_paragraphs = {}
  local current_para = {}
  for line in (raw_text .. "\n"):gmatch("(.-)\r?\n") do
    local trimmed = line:match("^%s*(.-)%s*$")
    if trimmed == "" then
      if #current_para > 0 then
        table.insert(raw_paragraphs, table.concat(current_para, " "))
        current_para = {}
      end
    else
      table.insert(current_para, trimmed)
    end
  end
  if #current_para > 0 then
    table.insert(raw_paragraphs, table.concat(current_para, " "))
  end

  local html = {}
  table.insert(html, '<div class="vf-code-card vf-auteur-exec-card" id="' .. card_id .. '">')
  table.insert(html, '<div class="vf-code-header">')
  table.insert(html, '<div class="vf-code-badges">')
  table.insert(html, '<span class="vf-code-lang">AUTEUR SCRIPT</span>')
  table.insert(html, '<span class="vf-code-type rose">EXECUTION TIMELINE</span>')
  table.insert(html, '</div>')
  table.insert(html, '</div>')
  table.insert(html, '<div class="vf-code-body vf-waterfall-container">')

  for shot_idx, para in ipairs(raw_paragraphs) do
    local steps = split_steps(para)
    if #steps > 0 then
      table.insert(html, '<div class="vf-shot-waterfall-card">')
      table.insert(html, '<div class="vf-waterfall-lead">' .. highlight_tokens(steps[1], false) .. '</div>')
      if #steps > 1 then
        table.insert(html, '<div class="vf-waterfall-rail">')
        for s_idx = 2, #steps do
          table.insert(html, '<div class="vf-waterfall-step"><span class="auteur-arrow">↳</span><span class="auteur-step-content">' .. highlight_tokens(steps[s_idx], false) .. '</span></div>')
        end
        table.insert(html, '</div>')
      end
      table.insert(html, '</div>')
    end
  end

  table.insert(html, '</div>')
  table.insert(html, '</div>')

  return pandoc.RawBlock('html', table.concat(html, ""))
end
```

---

================================================================================
## Document 4D: Reference Parser / Renderer B (Full-Script Staging Modal & Token Extractor)
================================================================================

*Source*: `auteur-script-knowledge/_extensions/auteur/auteur.lua`  
*Capabilities*: Parses a complete multi-block script (`parse_auteur_script`), partitions Staging blocks from Execution lines (`[EXECUTION]` / `[TIMELINE]`), extracts `AESTHETIC` token mappings (`-> TOKEN`), and extracts canonical character labels (`@ref as LABEL`).

```lua
-- Extract tokens declared in AESTHETIC block
local function extract_aesthetic_tokens(staging_blocks)
  local tokens = {}
  local seen = {}
  for _, sb in ipairs(staging_blocks) do
    if sb.name == "AESTHETIC" then
      for _, line in ipairs(sb.lines) do
        for tok in line:gmatch("%-%>%s*([%w_%-]+)") do
          if not seen[tok] then
            seen[tok] = true
            table.insert(tokens, tok)
          end
        end
        for tok in line:gmatch("→%s*([%w_%-]+)") do
          if not seen[tok] then
            seen[tok] = true
            table.insert(tokens, tok)
          end
        end
      end
    end
  end
  table.sort(tokens, function(a, b) return #a > #b end)
  return tokens
end

-- Extract character labels explicitly defined as "@ref as label" across staging blocks
local function extract_character_names(staging_blocks)
  local names = {}
  local seen = {}
  local stop_words = {
    ["BOTH"] = true, ["ALL"] = true, ["THE"] = true, ["AND"] = true,
    ["WITH"] = true, ["FOR"] = true, ["FROM"] = true, ["INTO"] = true,
    ["UNDER"] = true, ["NEAR"] = true, ["SCENE"] = true, ["PART"] = true
  }

  local function add_name(raw)
    if not raw then return end
    local clean = raw:match("^%s*(.-)%s*$")
    if clean and #clean >= 2 and not stop_words[clean:upper()] then
      local upper = clean:upper()
      local title = clean:sub(1,1):upper() .. clean:sub(2):lower()
      if not seen[upper] then
        seen[upper] = true
        table.insert(names, upper)
      end
      if not seen[title] then
        seen[title] = true
        table.insert(names, title)
      end
    end
  end

  for _, sb in ipairs(staging_blocks) do
    for _, line in ipairs(sb.lines) do
      for name in line:gmatch("@[%w_%-]+%s+[aA][sS]%s+([A-Za-z0-9_%-]+)") do
        add_name(name)
      end
    end
  end

  table.sort(names, function(a, b) return #a > #b end)
  return names
end

-- Parse raw Auteur Script into staging blocks and execution lines
local function parse_auteur_script(text)
  local lines = split_lines(text)
  local staging_blocks = {}
  local execution_lines = {}
  local in_execution = false
  local current_block = nil

  for _, line in ipairs(lines) do
    local trimmed = line:match("^%s*(.-)%s*$")
    
    if not in_execution then
      -- Check if line is a macro-block header: [BLOCK_NAME]
      local block_header = trimmed:match("^%[([A-Z0-9 _%-]+)%]$")
      if block_header then
        block_header = block_header:match("^%s*(.-)%s*$")
        if block_header == "EXECUTION" or block_header == "TIMELINE" then
          in_execution = true
          current_block = nil
        else
          current_block = {
            name = block_header,
            lines = {}
          }
          table.insert(staging_blocks, current_block)
        end
      elseif current_block then
        if trimmed ~= "" or #current_block.lines > 0 then
          table.insert(current_block.lines, line)
        end
      end
    else
      -- In execution phase: every non-empty line is a macro-state
      if trimmed ~= "" then
        table.insert(execution_lines, trimmed)
      end
    end
  end

  return staging_blocks, execution_lines
end
```
