# Grammar Contract — Pure Auteur Script (`v0.4.0`)

This document locks the exact parsing, extraction, export, and deterministic linting contracts implemented by `src/core/`.

---

## 1. Two-Phase Document Partition

An Auteur Script is plain text partitioned into **Macro-Blocks** separated by a single blank line:

- **Macro-Block Header Regex**: `^\[([A-Z0-9 _-]+)\]$`
- **Phase 1 — Staging ($S_0$)**: `[INTENT]`, `[LOGIC]`, `[AESTHETIC]`, `[OPENING]`, plus custom staging extensions (`[CHARACTERS]`, `[CONTINUITY PROTOCOL]`, `[REFERENCES]`, `[STAGE]`).
- **Phase 2 — Execution ($S_1 \dots S_n$)**: Opened by `[EXECUTION]` (or aliases `[TIMELINE]`, `[BEATS]`, `[SHOTLIST]`).
  - Once Phase 2 begins, **subsequent `[TAG]` tokens are Sub-State tags, never new Macro-Blocks**.
  - Every non-empty line in Phase 2 is one **Macro-State ($S_n$)**. Blank lines inside `[EXECUTION]` are treated as harmless visual spacers and never merge adjacent beats or corrupt beat counts.

---

## 2. Chaining Operator (`->` / `→`) Overloading

| Context | Meaning of `->` / `→` | Parser Behavior |
|---|---|---|
| **Inside `[AESTHETIC]`** | Shorthand token mapping (`Description -> LOC01; Description -> EV01`) | Preserved intact inside the block body; extracted as `AestheticToken` dictionaries by `src/core/extractor.ts`. |
| **Inside `[EXECUTION]`** | Sub-State chaining delimiter (`/\s*(?:->|→)\s*/`) | Splits each Macro-State line into ordered atomic `SubStateNode` segments. |

---

## 3. Canonical Inline Sub-State Grammar

| Kind | Canonical Pattern | Implemented Regex / Rule |
|---|---|---|
| **Camera** | `[CAM 01] ...`, `[CAM 02A] ...`, `[CAM 01]` (bare hold/recall), `[CAM] ...` (montage) | Leading `[CAM]` (`identifier: null`) or numbered `[CAM <id>]` matching `/^CAM\s+(\d+[A-Z]?)$/` (`subStateTag: "CAM"`, `identifier: "01" \| "02A"`) |
| **Performance** | `[ACT] Subject active-verb ...` | Leading `[ACT]` tag |
| **Spatial Fence** | `[BLOCK] Subject frame-left FG facing screen-right; ...` | Leading `[BLOCK]` tag |
| **Dynamic Light** | `[LIGHT] single-dimension illumination shift` | Leading `[LIGHT]` tag |
| **Boundary Clamps** | `[STATE IN] ...`, `[STATE OUT] ...` | Leading `[STATE IN]` / `[STATE OUT]` tag |
| **Tier-2 Tags** | `[FOCUS]`, `[SPEED]`, `[PROP]`, `[ENV]`, `[CROWD]`, `[VFX]`, `[TRANS]` | Any other leading uppercase `[TAG]` |
| **Spoken Dialogue** | `Speaker says (delivery) {line}` (with optional `in Language`, `(O.S.)`, `(V.O.)`, or `O.S. (delivery)`) | `/^(?<speaker>[A-Za-z0-9 _-]+?)\s+says(?:\s+in\s+(?<lang>[A-Za-z-]+))?(?:[\s,]+(?<mods>[^{]+?))?\s*\{(?<line>[^}]+)\}$/` |
| **Diegetic Foley** | `<short physical sound description>` | `/^<([^<>]+)>$/` |
| **Opt-in Score** | `(instrumental description)` | `/^\(([^()]+)\)$/` (when spanning the full Sub-State) |
| **On-Screen Text** | `【Exact text】` | `/^【([^】]+)】$/` |

---

## 4. Tagless Export Contract (`exportTagless`)

- Preserves Staging Macro-Blocks intact.
- For each `[EXECUTION]` beat:
  1. Splits on `/\s*(?:->|→)\s*/`.
  2. Strips leading bracketed Sub-State tags (`/^\[[A-Z0-9 _-]+\]\s*/`).
  3. Drops empty segments (such as bare camera holds `[CAM 01] ->`) so the exported line never starts with a dangling `->`.
  4. Joins remaining segments with `' -> '`.

---

## 5. V1 Deterministic Script Supervisor Linter Rules (`src/core/linter.ts`)

All 5 rules are registered declaratively in `LINT_RULE_REGISTRY` and executed via `lintDocument(doc, metadata?, ruleOverrides?)`, where each rule accepts an optional `'off' | 'warning' | 'error'` override (defaults apply when `ruleOverrides` is omitted):

| # | Rule ID | Audit Lens | Default Severity | Contract |
|---|---|---|---|---|
| **1** | `viewport-coordinate-purity` | `Lens 1: Spatial & Optics` | `error` | Flags `stage-left` / `stage-right` (case-insensitive) in `[LOGIC]`, `[OPENING]`, and `[EXECUTION]`. Recommends `frame-left/right` or `screen-left/right`. |
| **2** | `camera-redefinition-guard` | `Lens 1: Spatial & Optics` | `warning` | Flags when an already-established numbered camera slot (`[CAM 01]`, `[CAM 02]`, ...) re-declares a static shot-scale token (`WS`, `EWS`, `FS`, `MS`, `MWS`, `MLS`, `MCU`, `CU`, `ECU`, `OTS`, `POV`, `INS`, `two-shot`, `low-angle`, `high-angle`) on a subsequent beat without an operator motion verb (`PAN`, `CRANING`, `TRACKING`, `TILTING`, `PUSHING`, `ARCING`, etc.). Bare holds/recalls (`[CAM 01] ->`) and first appearances in continuation scripts (`[CONTINUITY PROTOCOL]` / `@video1`) are never flagged. |
| **3** | `macro-state-resolution` | `Lens 4: Acoustics & Voice` | `warning` | Flags any `[EXECUTION]` beat whose final non-empty Sub-State is spoken `{dialogue}` without trailing `[ACT]` follow-through or `<foley>` trigger. |
| **4** | `multimodal-reference-isolation` | `Lens 5: Blocks & Grammar` | Staging: `warning` / Execution: `error` | Flags `@ref` tokens appearing outside `[INTENT]`, `[CHARACTERS]`, `[REFERENCES]`, `[CONTINUITY PROTOCOL]`, `[GOAL]`, or `[UNUSED MATERIALS]`. Defaults to a soft `warning` in other Phase 1 Staging blocks (`[LOGIC]`, `[AESTHETIC]`, `[OPENING]`, custom blocks) and `error` inside `[EXECUTION]`. |
| **5** | `frozen-first-frame-purity` | `Lens 5: Blocks & Grammar` | `error` | Flags any square-bracketed `[TAG]` token inside `[OPENING]`. |

---

## 6. Programmatic JSON IR Round-Trip & Schema Contract

The pure core JSON engine (`src/core/irSchemas.ts`, `src/core/ir.ts`, `src/core/patch.ts`, `src/core/slicer.ts`) enforces strict grammar parity with canonical `v0.4.0` plain text (see `docs/JSON_IR_SPEC.md` for full schemas and patch operations):

- **Lossless Round-Trip Lock**: `fromAuteurIR(toAuteurIR(raw))` equals `exportPlainText(raw)` across all canonical presets, custom Staging Macro-Blocks, unlabelled `[AESTHETIC]` fallback lines (`key: null`), and `plain` Sub-States.
- **Staging Formats**: `INTENT`, `LOGIC`, `OPENING`, and custom Staging Macro-Blocks serialize as `format: "prose"`; `AESTHETIC` serializes as `format: "key_value"` (`entries[]`), preserving `Description -> TOKEN` token mappings canonically inside `entry.value`.
- **Execution Dimensions**: All 11 `SubStateIR` dimensions (`camera`, `action`, `block`, `light`, `state_boundary`, `tier2`, `dialogue`, `foley`, `score`, `onscreen_text`, `plain`) compile deterministically via `renderSubState()`, making syntax drift (e.g., quoted dialogue or legacy `[DIAL]`/`[AUDIO]` tags) structurally impossible.
- **Runtime Validation & JSON Schema Registry**: Every programmatic payload (`draft`, `ir`, `envelope`, `patch`, `review`) is validated at runtime via Zod and exported as standard JSON Schema objects via `getAuteurJsonSchemas()`.

