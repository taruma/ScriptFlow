import {BUNDLED_EXAMPLES} from '../../data/examples/index.ts';
import {BUNDLED_KNOWLEDGE_SKILLS, FOUNDATIONAL_CRAFT_MD} from '../../data/knowledge/index.ts';
import type {
  AskQuestionMode,
  AssistantFocus,
  AuteurSkillDefinition,
  ResolvedScriptTool,
  ScriptToolDefinition,
  ScriptToolName,
} from './types.ts';

// ---------------------------------------------------------------------------
// Editable Craft Foundation (Loaded from Markdown)
// ---------------------------------------------------------------------------

export const DEFAULT_FOUNDATIONAL_CRAFT = FOUNDATIONAL_CRAFT_MD;

// ---------------------------------------------------------------------------
// Built-in Extension Skills Registry (Loaded from src/data/knowledge/skills/)
// ---------------------------------------------------------------------------

const DRAFT_CRAFT_ONER_ID = 'script-cbd82a05-d987-4d9a-aa42-5bfb11f996af';
const DRAFT_CRAFT_COVERAGE_ID = 'script-7a1b8107-26df-45d8-b09f-9a10b85a0f87';
const DRAFT_CRAFT_MONTAGE_ID = 'script-9e58b61c-7652-4472-b1a7-1685bcea812a';

export function formatCuratedExample(exampleId: string): string {
  const found = BUNDLED_EXAMPLES.find((ex) => ex.id === exampleId);
  if (!found) return '';
  return [`### Curated Example — ${found.title} (${found.topology})`, found.content].join('\n');
}

export function buildDraftCraftBody(coreRules: string, includeMontageExample: boolean): string {
  const sections: string[] = [
    coreRules,
    formatCuratedExample(DRAFT_CRAFT_ONER_ID),
    formatCuratedExample(DRAFT_CRAFT_COVERAGE_ID),
  ];

  if (includeMontageExample) {
    sections.push(formatCuratedExample(DRAFT_CRAFT_MONTAGE_ID));
  }

  return sections.filter((section) => section.length > 0).join('\n\n');
}

export const DRAFT_CRAFT_CORE_RULES =
  BUNDLED_KNOWLEDGE_SKILLS.find((skill) => skill.id === 'draft_craft')?.body ?? '';

export const BUILTIN_AUTEUR_SKILLS: readonly AuteurSkillDefinition[] =
  BUNDLED_KNOWLEDGE_SKILLS.map((skill) => ({
    id: skill.id,
    name: skill.name,
    category: skill.category,
    triggerHint: skill.triggerHint,
    body: skill.id === 'draft_craft' ? buildDraftCraftBody(skill.body, false) : skill.body,
    builtIn: true as const,
  }));

// ---------------------------------------------------------------------------
// Built-in Function Tool Definitions & Editable Tool & Safety Protocol
// ---------------------------------------------------------------------------

export const DEFAULT_TOOL_PROTOCOL_CORE = [
  '- Staging-first safety: never assume editor text has changed until the user applies a staged suggestion. Every edit, draft, or audit review must be staged through its dedicated tool.',
  '- Read & round efficiency: use `<live_editor_state>` for `snapshotHash`, `Staging blocks` (`MB#`), `Camera slots`, `sceneTopology`, and deterministic lint diagnostics—call `get_script_source` only when you need exact line wording or when `<live_editor_state>` indicates manual edits since the prior turn (prefer targeted `targetIds` for localized edits). Batch multi-lens audits via `inspect_lens_slice({ presets: [...] })` and multi-state insertions via `insert_states`.',
  '- Self-repair on tool errors: whenever a tool returns `is_error: true` (`ok: false`), inspect `errors`, `introducedErrors`, `diagnostics`, and `repairHint`, fix the issue, and retry before giving your final reply.',
].join('\n');

export const BUILTIN_SCRIPT_TOOLS: readonly ScriptToolDefinition[] = [
  {
    name: 'get_script_source',
    label: 'Read Script Source',
    category: 'inspect',
    defaultDescription:
      'Reads the current Auteur Script—or a targeted subset via targetIds (MB#, header names like AESTHETIC/EXECUTION, or S#)—as compact canonical v0.4.0 plain text with optional MB#/S# annotations.',
    defaultProtocolGuidance:
      '- `get_script_source`: whenever `<live_editor_state>` indicates the script changed since the prior turn (or after a history recap on a non-empty script), call `get_script_source` before editing (preferring `targetIds`, e.g., `["MB0", "S3", "S4"]`, for localized edits; omit `targetIds` for full source).',
  },
  {
    name: 'inspect_lens_slice',
    label: 'Inspect Lens Slice',
    category: 'inspect',
    defaultDescription:
      'Extracts a focused read-only JSON slice (with resolved camera framing and topology checklists) for one `preset` or a deduplicated `presets` array of Script Supervisor audit lenses, optionally scoped by `macroStateIds` or `includeStaging: false`.',
    defaultProtocolGuidance:
      '- `inspect_lens_slice`: pass `presets: [...]` to audit multiple lenses in one deduplicated call, and use `macroStateIds` / `includeStaging: false` for targeted inspection.',
  },
  {
    name: 'propose_script_patch',
    label: 'Stage Patch',
    category: 'mutation',
    defaultDescription:
      'Dry-runs and stages targeted edits (`set_block`, `insert_block`, `delete_block`, `replace_state`, `insert_states`, `delete_state`, `reorder_state`, `replace_text`) using canonical v0.4.0 plain text and/or an optional scene `title`, gated by `expectedSnapshotHash` and deterministic Script Supervisor linting.',
    defaultProtocolGuidance:
      '- `propose_script_patch`: use for all targeted edits, multi-state insertions (`insert_states`), literal/regex renames (`replace_text`), and scene renames (`title`, alone or combined with `ops`). Write canonical `v0.4.0` text without `# MB#` / `S#:` prefixes or Markdown fences.',
  },
  {
    name: 'propose_script_draft',
    label: 'Compile Draft',
    category: 'mutation',
    defaultDescription:
      'Parses and lint-checks a full canonical v0.4.0 plain-text `scriptText` (with optional `title` and `summary`) and stages a reviewable DraftSuggestion without overwriting the editor.',
    defaultProtocolGuidance:
      '- `propose_script_draft`: stage a complete, lint-clean canonical `v0.4.0` `scriptText` (`[INTENT]`, `[LOGIC]`, `[AESTHETIC]`, `[OPENING]`, and `[EXECUTION]`). Use for empty scripts or explicit full rewrites (prefer `propose_script_patch` for targeted edits). If `draft_craft` is in the Available Skill Directory and not yet loaded, call `load_auteur_skill` for `draft_craft` before drafting.',
  },
  {
    name: 'report_audit_review',
    label: 'Stage Audit Review',
    category: 'audit',
    defaultDescription:
      'Validates a structured Script Supervisor AuteurReview (dry-running any embedded text-first `suggestedPatch` payloads against active lint rules) and stages clickable AuditReviewSuggestion items.',
    defaultProtocolGuidance:
      '- `report_audit_review`: report structured Script Supervisor continuity issues referencing exact `targetId` (`MB#`, `S#`, `S#.#`) and verified `suggestedPatch` fixes when helpful.',
  },
  {
    name: 'ask_question',
    label: 'Clarifying Questions',
    category: 'workflow',
    defaultDescription:
      'Presents 1 to 4 concise clarifying questions as an interactive card (single-select by default; set multiSelect: true for combinable choices; every question also includes an additive note field). Calling this tool pauses the turn immediately until the user answers or skips.',
    defaultProtocolGuidance:
      '- `ask_question`: ONLY call when the current turn explicitly includes `[Ask First: ON]` (ask 1–4 concise questions with 2–5 short options without an "Other" option, setting `multiSelect: true` only when choices combine; if drafting an open scene, load `draft_interview` first; do not stage a draft or patch in the same turn) or `[Clarifying follow-up]` (only if critical ambiguity still blocks a strong result). Calling `ask_question` immediately pauses your turn until the user responds. Never call `ask_question` when Ask First is off.',
  },
  {
    name: 'load_auteur_skill',
    label: 'Load Craft Skill',
    category: 'workflow',
    defaultDescription:
      'Loads a specialized Auteur Script craft skill from the Available Skill Directory on demand for this turn. Never call for skills already injected as active.',
    defaultProtocolGuidance:
      '- `load_auteur_skill`: call only when the current task genuinely requires a skill listed in the Available Skill Directory below; never call it for skills already injected as Active.',
  },
];

export interface ToolProtocolRuntimeHeaderParams {
  focus: AssistantFocus;
  allowedToolNames: readonly ScriptToolName[];
  snapshotHash?: string;
  enforceToolLinterGate?: boolean;
}

/**
 * Generates the cache-stable runtime header lines prepended to `## Tool & Safety Protocol`
 * reflecting live focus, active tool names, concurrency instructions, and linter gate status
 * without embedding volatile per-edit `snapshotHash` values.
 */
export function buildToolProtocolRuntimeHeader(
  params: ToolProtocolRuntimeHeaderParams
): string[] {
  const {allowedToolNames, enforceToolLinterGate = true} = params;
  const hasTool = (name: ScriptToolName) => allowedToolNames.includes(name);
  const lines: string[] = [];

  if (allowedToolNames.length === 0) {
    lines.push(
      '- Allowed tools: none (pure conversation mode — respond directly in prose without calling tools).'
    );
    return lines;
  }

  lines.push(
    `- Allowed tools: ${allowedToolNames.map((t) => `\`${t}\``).join(', ')} (per-turn focus routing and Ask First gating are applied via \`<turn_directive>\`).`
  );

  if (hasTool('propose_script_patch') || hasTool('report_audit_review')) {
    lines.push(
      '- Optimistic concurrency & fresh-read rule: always pass the latest `expectedSnapshotHash` from `<live_editor_state>` (or `get_script_source`) on `propose_script_patch` and any embedded `suggestedPatch` inside `report_audit_review`; whenever `<live_editor_state>` indicates manual edits since the prior turn, read updated source via `get_script_source` before proposing changes.'
    );
  }

  if (
    !enforceToolLinterGate &&
    (hasTool('propose_script_patch') ||
      hasTool('propose_script_draft') ||
      hasTool('report_audit_review'))
  ) {
    lines.push(
      '- Linter gate override: deterministic Script Supervisor lint errors will not block staging proposals on this turn (AST schema and `expectedSnapshotHash` integrity still apply).'
    );
  }

  return lines;
}

export interface ToolProtocolParams {
  focus: AssistantFocus;
  allowedToolNames: readonly ScriptToolName[];
  snapshotHash?: string;
  isEmpty?: boolean;
  availableSkillCount: number;
  askQuestionMode?: AskQuestionMode;
  enforceToolLinterGate?: boolean;
  coreProtocolOverride?: string;
  resolvedTools?: readonly ResolvedScriptTool[];
}

export function buildToolProtocolBlock(params: ToolProtocolParams): string {
  const {
    focus,
    allowedToolNames,
    availableSkillCount,
    enforceToolLinterGate = true,
    coreProtocolOverride,
    resolvedTools,
  } = params;

  const runtimeHeader = buildToolProtocolRuntimeHeader({
    focus,
    allowedToolNames,
    enforceToolLinterGate,
  });

  const lines: string[] = ['## Tool & Safety Protocol', ...runtimeHeader];

  if (allowedToolNames.length === 0) {
    return lines.join('\n');
  }

  const trimmedCoreOverride = coreProtocolOverride?.trim();
  const coreBlock =
    trimmedCoreOverride && trimmedCoreOverride.length > 0
      ? trimmedCoreOverride
      : DEFAULT_TOOL_PROTOCOL_CORE;
  lines.push(coreBlock);

  const resolvedByName = new Map<ScriptToolName, ResolvedScriptTool>(
    (resolvedTools ?? []).map((tool) => [tool.name, tool])
  );
  const builtinByName = new Map<ScriptToolName, ScriptToolDefinition>(
    BUILTIN_SCRIPT_TOOLS.map((tool) => [tool.name, tool])
  );

  for (const toolName of allowedToolNames) {
    if (toolName === 'load_auteur_skill' && availableSkillCount === 0) {
      continue;
    }

    const resolved = resolvedByName.get(toolName);
    const builtin = builtinByName.get(toolName);
    const guidance = (resolved?.protocolGuidance ?? builtin?.defaultProtocolGuidance ?? '').trim();
    if (guidance.length > 0) {
      lines.push(guidance);
    }
  }

  if (allowedToolNames.length > 0) {
    lines.push(
      '- Routing: follow any `[Focus: ...]` directive in `<turn_directive>`; otherwise choose the minimal matching tool(s) above—`propose_script_draft` for empty scripts or full rewrites, `propose_script_patch` for targeted edits, renames (`replace_text`), or scene title updates (`title`), `report_audit_review` for audits, or respond directly in prose for pure questions.'
    );
  }

  return lines.join('\n');
}
