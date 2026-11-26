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
  '- Self-repair on tool errors: whenever a tool returns `is_error: true` (`ok: false`), inspect `errors`, `introducedErrors`, `diagnostics`, and `repairHint`, fix the issue, and retry before giving your final reply.',
].join('\n');

export const BUILTIN_SCRIPT_TOOLS: readonly ScriptToolDefinition[] = [
  {
    name: 'get_script_overview',
    label: 'Inspect Overview',
    category: 'inspect',
    defaultDescription:
      'Returns a compact read-only overview of the current Auteur Script: sceneTitle, snapshotHash, sceneTopology, staging Macro-Blocks (MB#), Macro-State count, camera slots, reference/token counts, and active Script Supervisor diagnostics.',
    defaultProtocolGuidance:
      '- `get_script_overview`: call to inspect exact `MB#`, `MB#.#`, `S#`, `S#.#` IDs, `sceneTopology`, camera slots, and active deterministic lint diagnostics.',
  },
  {
    name: 'get_script_source',
    label: 'Read Script Source',
    category: 'inspect',
    defaultDescription:
      'Reads the current Auteur Script—or a targeted subset via targetIds (MB#, header names like AESTHETIC/EXECUTION, or S#)—as compact canonical v0.4.0 plain text with optional ID annotations.',
    defaultProtocolGuidance:
      '- `get_script_source`: for localized edits—especially when `Recent user edits` or `[Target Scope: ...]` already identifies the target—prefer `targetIds` (e.g., `["MB0", "S3", "S4"]`) instead of reading the whole script; omit `targetIds` when you need the complete compact `v0.4.0` plain text.',
  },
  {
    name: 'inspect_lens_slice',
    label: 'Inspect Lens Slice',
    category: 'inspect',
    defaultDescription:
      'Extracts a focused read-only JSON slice of the current script using one of the 5 built-in Script Supervisor audit presets or a custom composable LensSliceSpec (including surgical macroStateIds and includeStaging) with resolved camera framing.',
    defaultProtocolGuidance:
      '- `inspect_lens_slice`: use surgical `macroStateIds` / `includeStaging: false` for targeted inspection, and issue parallel preset calls when auditing multiple Script Supervisor lenses.',
  },
  {
    name: 'propose_script_patch',
    label: 'Stage AST Patch',
    category: 'mutation',
    defaultDescription:
      'Dry-runs a transactional, ID-addressed AuteurPatch against the current script with rejectOnNewErrors=true. If valid and lint-clean, stages a reviewable PatchSuggestion without mutating the editor; if invalid or lint-rejected, returns structured errors and repairHint for self-repair.',
    defaultProtocolGuidance:
      '- `propose_script_patch`: use for structural AST edits (inserting, deleting, reordering, or rewriting Macro-Blocks, Macro-States, Sub-States, or `[AESTHETIC]` entries).',
  },
  {
    name: 'propose_text_replace',
    label: 'Stage Text Replace',
    category: 'mutation',
    defaultDescription:
      'Performs 1 to 20 atomic literal or regex find-and-replace rules across the script body or scoped targetIds (MB# / S#), preserving [HEADER] lines and dry-running the deterministic Script Supervisor linter (rejectOnNewErrors=true) before staging a reviewable PatchSuggestion.',
    defaultProtocolGuidance:
      '- `propose_text_replace`: use for fast literal or regex find-and-replace (renaming characters/props/tokens or pattern substitutions across the whole script or scoped `targetIds`).',
  },
  {
    name: 'propose_script_draft',
    label: 'Compile Draft',
    category: 'mutation',
    defaultDescription:
      'Validates and compiles a full AuteurScriptDraft JSON into canonical v0.4.0 plain text and stages a reviewable DraftSuggestion without overwriting the editor.',
    defaultProtocolGuidance:
      '- `propose_script_draft`: stage a complete, lint-clean `AuteurScriptDraft` ([INTENT], [LOGIC], [AESTHETIC] as `key_value`, [OPENING], and [EXECUTION]). Use for empty scripts or explicit full rewrites (prefer `propose_script_patch` / `propose_text_replace` for targeted edits on existing scripts). If `draft_craft` is in the Available Skill Directory and not yet loaded in this session, call `load_auteur_skill` for `draft_craft` before drafting.',
  },
  {
    name: 'propose_script_title',
    label: 'Suggest Scene Title',
    category: 'mutation',
    defaultDescription:
      'Stages a dedicated TitleSuggestion card to rename the active scene independently of script body edits.',
    defaultProtocolGuidance:
      '- `propose_script_title`: propose or update the scene title independently of script body edits.',
  },
  {
    name: 'report_audit_review',
    label: 'Stage Audit Review',
    category: 'audit',
    defaultDescription:
      'Validates a structured Script Supervisor AuteurReview (including dry-running any embedded suggestedPatch payloads against active lint rules) and stages clickable AuditReviewSuggestion items.',
    defaultProtocolGuidance:
      '- `report_audit_review`: report structured Script Supervisor continuity issues referencing exact `targetId` (`MB#`, `S#`, `S#.#`) and verified `suggestedPatch` fixes when helpful.',
  },
  {
    name: 'ask_question',
    label: 'Clarifying Questions',
    category: 'workflow',
    defaultDescription:
      'Presents 1 to 4 concise clarifying questions to the user as an interactive multi-select card (every question lets the user pick multiple options and add an optional custom comment). Stop after calling and wait for the user to answer.',
    defaultProtocolGuidance:
      '- `ask_question`: ONLY call when the current turn explicitly includes `[Ask First: ON]` (ask 1–4 concise questions with 2–5 short multi-select options without an "Other" option, do not stage a draft or patch in the same turn, and stop calling tools once staged) or `[Clarifying follow-up]` (only if critical ambiguity still blocks a strong result). Never call `ask_question` when Ask First is off.',
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
  const {focus, allowedToolNames, enforceToolLinterGate = true} = params;
  const hasTool = (name: ScriptToolName) => allowedToolNames.includes(name);
  const lines: string[] = [];

  if (allowedToolNames.length === 0) {
    lines.push(
      `- Active focus: \`${focus}\` | Allowed tools this turn: none (pure conversation mode — respond directly in prose without calling tools).`
    );
    return lines;
  }

  lines.push(
    `- Active focus: \`${focus}\` | Allowed tools this turn: ${allowedToolNames.map((t) => `\`${t}\``).join(', ')}.`
  );

  if (
    hasTool('propose_script_patch') ||
    hasTool('propose_text_replace') ||
    hasTool('report_audit_review')
  ) {
    lines.push(
      '- Optimistic concurrency: always pass the latest `expectedSnapshotHash` from `<live_editor_state>` (or `get_script_overview`) on `propose_script_patch`, `propose_text_replace`, and any embedded `suggestedPatch` inside `report_audit_review`.'
    );
  }

  if (
    !enforceToolLinterGate &&
    (hasTool('propose_script_patch') ||
      hasTool('propose_text_replace') ||
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

  if (focus === 'auto' && allowedToolNames.length > 0) {
    lines.push(
      '- Auto routing: choose the minimal matching tool(s) above—`propose_script_draft` for empty scripts or full rewrites, `propose_script_patch` / `propose_text_replace` for targeted edits, `propose_script_title` for title updates, `report_audit_review` for audits, or respond directly in prose for pure questions.'
    );
  }

  return lines.join('\n');
}
