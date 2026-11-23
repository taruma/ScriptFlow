# Grammar Contract — Auteur Script (`v0.4.0`)

This document locks the exact parsing, extraction, formatting, export, and deterministic linting contracts implemented by `src/core/` (`parser.ts`, `aesthetic.ts`, `extractor.ts`, `serializer.ts`, `linter.ts`, `irSchemas.ts`, `ir.ts`, `patch.ts` + `patch/*`, `slicer.ts`).

---

## 1. Two-Phase Document Partition

An Auteur Script is plain text partitioned into **Macro-Blocks** separated by a single blank line (`\n\n`):

- **Macro-Block Header Name Regex (`MACRO_HEADER_NAME_REGEX`)**: `/^[A-Z0-9 _-]+$/`
- **Standalone Macro-Block Header Line Regex (`MACRO_HEADER_REGEX`)**: `/^\[([A-Z0-9 _-]+)\]$/`
- **Phase 1 — Staging ($S_0$)**:
  - Canonical headers (`CANONICAL_STAGING_HEADERS`): `[INTENT]`, `[LOGIC]`, `[AESTHETIC]`, `[OPENING]`, `[CONTINUITY PROTOCOL]`, `[CHARACTERS]`, `[REFERENCES]`, `[STAGE]`.
  - Recognized classification rules (`classifyMacroBlock`): `[GOAL]` classifies as `INTENT`; any header containing `CONTINUITY` classifies as `CONTINUITY PROTOCOL`; any other non-execution uppercase header classifies as `CUSTOM`.
  - Header sanitization (`sanitizeStagingHeaderName`) strips outer brackets, replaces `/` with spaces, drops non-`[A-Za-z0-9 _-]` characters, collapses whitespace, uppercases, and returns `''` if empty; `isReservedExecutionHeader` prevents Phase 2 headers from being inserted as Staging Macro-Blocks.
  - Full-script paste detection (`isMultiBlockAuteurScript`) returns `true` when raw text contains at least two standalone headers present in `KNOWN_CANONICAL_HEADERS` (`CANONICAL_STAGING_HEADERS`, `'GOAL'`, and `EXECUTION_HEADERS`).
- **Phase 2 — Execution ($S_1 \dots S_n$)**:
  - Opened by any header in `EXECUTION_HEADERS`: `[EXECUTION]` (canonical) or legacy aliases `[TIMELINE]`, `[BEATS]`, `[SHOTLIST]`.
  - Once Phase 2 begins, **subsequent `[TAG]` tokens are Sub-State tags, never new Macro-Blocks**.
  - Every non-empty line in Phase 2 is one **Macro-State ($S_n$)**. Blank lines inside `[EXECUTION]` are treated as harmless visual spacers and never merge adjacent Macro-States or corrupt Macro-State counts.

---

## 2. Chaining Operator (`->` / `→`) Overloading & `[AESTHETIC]` Lookbook Grammar

| Context | Meaning of `->` / `→` | Parser Behavior |
|---|---|---|
| **Inside `[AESTHETIC]`** | Shorthand token mapping (`Description -> LOC01; Description -> EV01`) | Preserved intact inside the block body; extracted as `AestheticToken` dictionaries by `src/core/extractor.ts` using `src/core/aesthetic.ts`. |
| **Inside `[EXECUTION]`** | Sub-State chaining delimiter (`CHAIN_SPLIT_REGEX = /\s*(?:->|→)\s*/`) | Splits each Macro-State line into ordered atomic `SubStateNode` segments (`splitExecutionSubStates`). |

### Locked `[AESTHETIC]` Lookbook Regexes (`src/core/aesthetic.ts`)

| Constant | Regex | Contract |
|---|---|---|
| `AESTHETIC_KEY_VALUE_REGEX` | `/^\s*([A-Za-z0-9_/-][A-Za-z0-9 _/-]*):(?:\s*(.*))?$/` | Parses `Key: Value` rows (multi-word keys, digits, `_`, `/`, `-`). Lines without a leading key (e.g., `: value` or plain prose) fall back losslessly to `type: 'free'` (`key: null` in JSON IR). |
| `AESTHETIC_LINE_CAPTURE_REGEX` | `/^(\s*)([A-Za-z0-9_/-][A-Za-z0-9 _/-]*:)(\s*)(.*)$/` | Lossless 4-group capture used by `src/core/highlighter.ts` (`leadingWs`, `keyWithColon`, `afterColonWs`, `value`). |
| `AESTHETIC_TOKEN_NAME_REGEX` | `/^[A-Za-z0-9_-]+$/` | Canonical shorthand token identifier (e.g., `LOC01`, `EV01`, `PROP01`). |
| `AESTHETIC_TOKEN_SEGMENT_REGEX` | `/^(.*?)\s*(?:->|→)\s*([A-Za-z0-9_-]+)\s*$/` | Evaluated per `;`-delimited segment (`extractAestheticTokenSegments`), extracting `{ description, token }`. |

---

## 3. Canonical Inline Sub-State Grammar (`src/core/parser.ts`)

Inside each `[EXECUTION]` Macro-State line, `parseSubState()` classifies each `->`-separated segment in strict precedence order: **bracketed `[TAG]`** → **`<foley>`** → **`【on-screen text】`** → **`(score)`** → **`dialogue`** → **`plain`**.

| Kind / Dimension | Canonical Pattern | Implemented Regex / Rule |
|---|---|---|
| **Leading Sub-State Tag** | `[TAG] ...` or bare `[TAG]` | `SUBSTATE_TAG_REGEX = /^\[([A-Z0-9 _-]+)\](?:\s+(.*))?$/` |
| **Camera (`camera`)** | `[CAM 01] ...`, `[CAM 02A] ...`, `[CAM 01]` (bare hold/recall), `[CAM] ...` (montage) | Leading `[CAM]` (`identifier: null`) or numbered `[CAM <id>]` matching `/^CAM\s+(\d+[A-Z]?)$/` (`subStateTag: "CAM"`, `identifier: "01" \| "02A"`) |
| **Performance (`action`)** | `[ACT] Subject active-verb ...` | Leading `[ACT]` tag |
| **Spatial Fence (`block`)** | `[BLOCK] Subject frame-left FG facing screen-right; ...` | Leading `[BLOCK]` tag |
| **Dynamic Light (`light`)** | `[LIGHT] single-dimension illumination shift` | Leading `[LIGHT]` tag |
| **Boundary Clamps (`state_boundary`)** | `[STATE IN] ...`, `[STATE OUT] ...` | Leading `[STATE IN]` / `[STATE OUT]` tag |
| **Tier-2 Tags (`tier2`)** | `[FOCUS]`, `[SPEED]`, `[PROP]`, `[ENV]`, `[CROWD]`, `[VFX]`, `[TRANS]` | Any other leading uppercase `[TAG]` matching `SUBSTATE_TAG_REGEX` |
| **Diegetic Foley (`foley`)** | `<short physical sound description>` | `FOLEY_REGEX = /^<([^<>]+)>$/` *(requires non-whitespace inner text)* |
| **On-Screen Text (`onscreen_text`)** | `【Exact text】` | `ONSCREEN_TEXT_REGEX = /^【([^】]+)】$/` |
| **Opt-in Score (`score`)** | `(instrumental description)` | `SCORE_REGEX = /^\(([^()]+)\)$/` *(spanning the full Sub-State; requires non-whitespace inner text)* |
| **Spoken Dialogue (`dialogue`)** | `Speaker says (delivery) {line}` (with optional `in Language`, `(O.S.)`, `(V.O.)`, or `O.S. (delivery)`) | `DIALOGUE_REGEX = /^(?<speaker>[A-Za-z0-9 _-]+?)\s+says(?:\s+in\s+(?<lang>[A-Za-z-]+))?(?:[\s,]+(?<mods>[^{]+?))?\s*\{(?<line>[^}]+)\}$/` |
| **Plain Fallback (`plain`)** | Unstructured inline segment | Any trimmed segment matching none of the rules above; preserved losslessly as `kind: 'plain'` (`dimension: 'plain'`). |

---

## 4. Canonical Formatting & Export Contracts (`src/core/serializer.ts`)

### 4.1 Non-Destructive Whitespace Formatter (`formatAuteurScript`)

`formatAuteurScript(raw)` enforces clean whitespace layout without altering script semantics:

1. Normalizes line endings (`\r\n` / `\r` → `\n`); returns `''` when the document is empty or whitespace-only.
2. Strips trailing horizontal whitespace (`/[ \t]+$/`) on every line.
3. Removes empty/whitespace-only lines inside the preamble, Staging Macro-Blocks, and `[EXECUTION]`.
4. Enforces exactly one blank line (`\n\n`) separating each Macro-Block with zero leading or trailing blank lines.
5. Never modifies inline text, spoken dialogue, Sub-State tags, or `->` / `→` arrows.

### 4.2 Plain-Text Export (`exportPlainText`)

`exportPlainText(raw)` normalizes line endings to `\n`, strips trailing horizontal spaces/tabs per line, and trims leading/trailing whitespace from the document.

### 4.3 Tagless Export (`exportTagless`)

`exportTagless(raw)` strips inline Sub-State tags for tight character budgets while preserving timeline flow:

1. Preserves preamble lines and Phase 1 Staging Macro-Blocks intact (joined with single `\n\n` block spacing).
2. For each `[EXECUTION]` Macro-State:
   - Splits on `/\s*(?:->|→)\s*/`.
   - Strips leading bracketed Sub-State tags (`/^\[[A-Z0-9 _-]+\]\s*/`) and trims each segment.
   - Drops empty segments (such as bare camera holds `[CAM 01] ->`) so no exported line begins with a dangling `->`.
   - Joins remaining segments with `' -> '` and drops any Macro-State line that becomes completely empty.

---

## 5. Deterministic Script Supervisor Linter Rules (`src/core/linter.ts`)

All 5 rules are registered declaratively in `LINT_RULE_REGISTRY` and executed via `lintDocument(doc, metadata?, ruleOverrides?)`, where each rule accepts an optional `'off' | 'warning' | 'error'` override (built-in defaults apply when `ruleOverrides` is omitted):

| # | Rule ID | Audit Lens | Default Severity | Contract |
|---|---|---|---|---|
| **1** | `viewport-coordinate-purity` | `Lens 1: Spatial & Optics` | `error` | Flags `stage-left` / `stage-right` (`/\bstage-(left\|right)\b/gi`) in `[LOGIC]`, `[OPENING]`, and `[EXECUTION]`. Recommends `frame-left/right` or `screen-left/right`. |
| **2** | `camera-redefinition-guard` | `Lens 1: Spatial & Optics` | `warning` | Flags when an already-established numbered camera slot (`[CAM 01]`, `[CAM 02]`, …) re-declares a static shot-scale token (`EWS`, `WS`, `FS`, `MWS`, `MLS`, `MS`, `MCU`, `CU`, `ECU`, `OTS`, `POV`, `INS`, `two-shot`, `low-angle`, `high-angle`) on a subsequent Macro-State without an operator motion verb (`PAN`/`PANNING`, `TILT`/`TILTING`, `CRANE`/`CRANING`, `TRACK`/`TRACKING`, `DOLLY`/`DOLLYING`, `PUSH`/`PUSHING`, `PULL`/`PULLING`, `ARC`/`ARCING`, `BOOM`/`BOOMING`, `WHIP`, `SWING`/`SWINGING`, `DRIFT`/`DRIFTING`, `GLIDE`/`GLIDING`, `ORBIT`/`ORBITING`, `PEDESTAL`, `ZOOM`/`ZOOMING`, `FOLLOW`/`FOLLOWING`, `SLIDE`/`SLIDING`, `MOVE`/`MOVING`). Bare holds/recalls (`[CAM 01] ->`) and first appearances in continuation scripts (`[CONTINUITY PROTOCOL]` / `@video1`) are never flagged. |
| **3** | `macro-state-resolution` | `Lens 4: Acoustics & Voice` | `warning` | Flags any `[EXECUTION]` Macro-State whose final non-empty Sub-State is spoken `{dialogue}` (`kind === 'dialogue'`) without trailing `[ACT]` follow-through or `<foley>` trigger. |
| **4** | `multimodal-reference-isolation` | `Lens 5: Blocks & Grammar` | Staging: `warning` / Execution: `error` *(registry headline: `error`)* | Flags `@ref` tokens (`/(?<![A-Za-z0-9._%+-])@[A-Za-z0-9_-]+/g`, excluding email addresses) appearing outside `[INTENT]`, `[GOAL]`, `[CHARACTERS]`, `[REFERENCES]`, `[CONTINUITY PROTOCOL]` (including any header containing `CONTINUITY`), or `[UNUSED MATERIALS]`. Defaults to a soft `warning` in other Phase 1 Staging blocks (`[LOGIC]`, `[AESTHETIC]`, `[OPENING]`, custom blocks) and `error` inside `[EXECUTION]`. |
| **5** | `frozen-first-frame-purity` | `Lens 5: Blocks & Grammar` | `error` | Flags any square-bracketed `[TAG]` token (`/\[([A-Za-z0-9 _-]+)\]/g`) inside `[OPENING]`. |

---

## 6. Programmatic JSON IR Round-Trip & Schema Contract

The pure core JSON engine (`src/core/irSchemas.ts`, `src/core/ir.ts`, `src/core/patch.ts` backed by `src/core/patch/*`, and `src/core/slicer.ts`) enforces strict grammar parity with canonical `v0.4.0` plain text (see `docs/JSON_IR_SPEC.md` for full schemas, patch operations, and non-mutating patch previews):

- **Lossless Round-Trip Lock**: `fromAuteurIR(toAuteurIR(raw))` equals `exportPlainText(raw)` across all canonical presets, custom Staging Macro-Blocks, unlabelled `[AESTHETIC]` fallback lines (`key: null`), and `plain` Sub-States.
- **Staging Formats**: `INTENT`, `LOGIC`, `OPENING`, and custom Staging Macro-Blocks serialize as `format: "prose"`; `AESTHETIC` serializes as `format: "key_value"` (`entries[]`), preserving `Description -> TOKEN` token mappings canonically inside `entry.value`.
- **Execution Dimensions**: All 11 `SubStateIR` dimensions (`camera`, `action`, `block`, `light`, `state_boundary`, `tier2`, `dialogue`, `foley`, `score`, `onscreen_text`, `plain`) compile deterministically via `renderSubState()`, making syntax drift (e.g., quoted dialogue or legacy `[DIAL]`/`[AUDIO]` tags) structurally impossible.
- **Runtime Validation & JSON Schema Registry**: Every programmatic payload (`draft`, `ir`, `envelope`, `patch`, `review`) is validated at runtime via Zod and exported as standard JSON Schema objects via `getAuteurJsonSchemas()`.
