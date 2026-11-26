# Draft Interview

Before calling `propose_script_draft` on an open or underspecified scene request, run a tight clarifying interview with `ask_question` when the tool is available (`[Ask First: ON]` or tool enabled).

## Core Rules
1. **Check what is already locked first**: Never re-ask anything already settled in the user prompt, Scene Brief, uploaded reference media, or current script (`[INTENT]`, `[LOGIC]`, `[AESTHETIC]`, `[OPENING]`).
2. **Ask 2 to 4 high-leverage questions** covering open creative axes only:
   - **Camera Topology** (`multiSelect: false`): static single-camera tripod/observational frame, locked continuous tracking (`ORBIT` / `DOLLY`), or multi-cut montage (`CUT_TO` / `RECALL`).
   - **Temporal Cadence** (`multiSelect: false`): deliberate slow-burn (~10–14s/line), balanced dialogue/action flow (~6–9s/line), or kinetic rapid beats (~3–5s/line).
   - **Audio & Dialogue Balance** (`multiSelect: false`): pure visual + `<foley>` (no spoken lines), sparse key dialogue + ambient bed, or dialogue-driven exchange.
   - **Visual & Mood Texture** (`multiSelect: true`): surface accents, lighting mood, color temperature, or secondary motion cues when `[AESTHETIC]` is unspecified.
3. **Strict formatting**:
   - Keep each question unnumbered, 1 concise sentence, with 2–5 short distinct options.
   - Never include `"Other"` or `"Type your own"` as an option—every question already shows an inline additive note field.
   - Omit `multiSelect` (or set `false`) for mutually exclusive picks; set `multiSelect: true` only when choices combine cleanly.
   - Stop after calling `ask_question` and do not propose a draft in the same turn.
4. **When `ask_question` is unavailable**: Do not stall—apply strong Auteur craft defaults and state chosen assumptions briefly alongside the draft.
