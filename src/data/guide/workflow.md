## Focus Modes

The 4-tab bar below the prompt box guides intent without wiping your active toolset or invalidating your prompt cache:

- **Auto** *(default)*: Handles drafting on blank scripts, surgical refinement, Script Supervisor checks, and open craft discussion in one flow.
- **Draft**: Tailored for generating a complete `v0.4.0` Auteur Script (`[INTENT]`, `[LOGIC]`, `[AESTHETIC]`, `[OPENING]`, and `[EXECUTION]`).
- **Refine**: Scopes the assistant toward targeted text-first edits, multi-state insertions, find-and-replace, and scene title updates against your existing Macro-Blocks (`MB#`) and Macro-States (`S#`).
- **Audit**: Exposes 1-click **Quick Scan** plus deep **Script Supervisor** audit buttons (`Audit All` and `Lens 1`–`Lens 5`) using deduplicated multi-lens inspection.

---

## Target Scope (`Whole Script` / `MB#` / `S#`)

When editing an existing script in **Auto** or **Refine**, use the **Scope** selector to focus the model on a specific Staging Macro-Block (`MB#`) or Execution Macro-State (`S#`) so unrelated states stay untouched.

---

## Ask First (Clarifying Questions)

Toggle **`Ask First`** on before sending when your scene idea is still open-ended:

- The assistant pauses and returns an interactive **Clarifying Questions** card (1–4 fast multi-choice picks + optional notes).
- Click **Submit Answers** to continue with your choices—or **Skip & Proceed** to let it choose sensible Auteur defaults.

---

## Quick Scan vs. Deep Audit

- **Quick Scan**: Runs a sub-second semantic pre-check over atomic craft rules, flagging suspect Macro-States (`S#`) inline in Live Mode. Click any flagged item to launch a targeted **Deep Audit** for that state.
- **Audit All / Lens 1–5**: Runs a full structured Script Supervisor review with rationales, repair hints, and clickable **`Apply Fix`** / **`Apply All`** diff cards.

---

## Staging Safety & Craft Skills

- **Staging-First Edits**: Nothing mutates your script automatically. Review the diff or preview, then click **Apply** (or **Fork & Apply** on read-only examples). Every applied change is a single `Cmd/Ctrl+Z` undo step.
- **Skills (`Context → Skills & Extensions`)**: Set skills to **On-Demand** (loaded only when needed), **Pinned** (always active in System Instruction), or **Muted**.
