## How Prompt Caching Works Here

ScriptFlow isolates static instructions (`System Instruction` + tool schemas) in **Zone 1** and sends only changed script deltas per turn over Gemini's stateful `previous_interaction_id` chain. Warm turns hit Gemini's **implicit context cache**, discounting cached input tokens by ~90–95%.

---

## 5 Ways to Maximize Your Cache Hit Rate

1. **Stay on one model within a conversation**: Implicit caches are stored **per model**. Switching models mid-chat (e.g., Neon → Hydrogen) discards the warm cache and forces a `0%` cold start on Round 1.
2. **Keep multi-turn sessions warm**: Implicit caches stay warm for several minutes. Returning hours later re-processes the conversation prefix cold on Round 1.
3. **Pin skills you use every turn (`Context → Skills & Extensions`)**: For example, **Pin** `draft_craft` when drafting multiple scenes. Pinning puts it inside Zone 1—saving an extra `load_auteur_skill` tool round and sharing the same cached prefix across fresh chats started on the same model.
4. **Avoid mid-session edits to Foundational Craft or Skill pins**: Modifying Zone 1 mid-thread invalidates that prefix for the next turn. *(Switching Focus tabs or running **Deep Audit** does **not** break Zone 1—Focus routing travels in the per-turn `<turn_directive>`.)*
5. **Know Gemini 4's `2,050`-token re-processing floor**: On Gemini 4 models, if a follow-up round adds fewer than ~2,050 new tokens, the backend still re-processes the trailing ~2,050 tokens at standard input rate (so tiny tool replies can dip slightly below 90% even on warm turns). *(ScriptFlow's lean 7-tool text-first schemas, `<live_editor_state>` block/camera summaries, batched multi-lens `inspect_lens_slice`, and self-applied suggestion tracking minimize cold-start tokens and extra rounds automatically.)*
6. **Keep short video attachments on `Static` for multi-turn caching**: `Static` (default `1 fps`) locks video frame tokens identically across rounds (`85%–90%+` cache hits). Toggling a video chip to `Agentic` dynamically re-samples frames across rounds and breaks multi-turn prefix caching—reserve `Agentic` for multi-minute clips or single-turn analysis.

---

## Reading Cache & Cost Telemetry

- **Inline Pills (`X% hit` / `0% miss`)**: Shown beside each turn's cost badge and the bottom cumulative session badge whenever **Show estimated cost** is enabled in AI Settings.
- **Hover Tooltip**: Hover either pill to see `Cache: X% hit · Y% miss (-$saved)`, fresh `Input (miss)` tokens, and discounted `Cached (hit)` tokens.
- **AI Trace Inspector (`Inspect` button)**: Turn on **Show Debug Trace** in AI Settings to inspect the turn-level **Cache** bar and per-round `X% hit` pills on every **Round** card—making it easy to spot which round broke cache or triggered retries.
