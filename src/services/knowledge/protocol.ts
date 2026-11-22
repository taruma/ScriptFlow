import {BUNDLED_EXAMPLES} from '../../data/examples/index.ts';
import {BUNDLED_KNOWLEDGE_SKILLS, FOUNDATIONAL_CRAFT_MD} from '../../data/knowledge/index.ts';
import type {
  AskQuestionMode,
  AssistantFocus,
  AuteurSkillDefinition,
  ScriptToolName,
} from './types.ts';

// ---------------------------------------------------------------------------
// Editable Craft Foundation (Loaded from Markdown)
// ---------------------------------------------------------------------------

export const DEFAULT_FOUNDATIONAL_CRAFT = FOUNDATIONAL_CRAFT_MD;

// ---------------------------------------------------------------------------
// Built-in Extension Skills Registry (Loaded from src/data/knowledge/skills/)
// ---------------------------------------------------------------------------

export function formatCuratedExample(exampleId: string): string {
  const found = BUNDLED_EXAMPLES.find((ex) => ex.id === exampleId);
  if (!found) return '';
  return [`### Curated Example — ${found.title} (${found.topology})`, found.content].join('\n');
}

export function buildDraftCraftBody(coreRules: string, includeMontageExample: boolean): string {
  const sections: string[] = [
    coreRules,
    formatCuratedExample('forest-pov-horror'),
    formatCuratedExample('interrogation-coverage'),
  ];

  if (includeMontageExample) {
    sections.push(formatCuratedExample('heist-montage'));
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
// Code-Owned Tool & Safety Protocol (Read-Only, Never Overridden by Craft Edits)
// ---------------------------------------------------------------------------

export interface ToolProtocolParams {
  focus: AssistantFocus;
  allowedToolNames: readonly ScriptToolName[];
  snapshotHash: string;
  isEmpty: boolean;
  availableSkillCount: number;
  askQuestionMode?: AskQuestionMode;
}

export function buildToolProtocolBlock(params: ToolProtocolParams): string {
  const {
    focus,
    allowedToolNames,
    snapshotHash,
    isEmpty,
    availableSkillCount,
    askQuestionMode = 'off',
  } = params;
  const hasTool = (name: ScriptToolName) => allowedToolNames.includes(name);

  const lines: string[] = [
    '## Tool & Safety Protocol (Code-Owned)',
    `- Active focus: \`${focus}\` | Allowed tools this turn: ${allowedToolNames.map((t) => `\`${t}\``).join(', ')}.`,
    '- Staging-first safety: never assume editor text has changed until the user applies a staged suggestion. Every edit, draft, or audit review must be staged through its dedicated tool.',
    '- Self-repair on tool errors: whenever a tool returns `is_error: true` (`ok: false`), inspect `errors`, `introducedErrors`, `diagnostics`, and `repairHint`, fix the issue, and retry before giving your final reply.',
  ];

  if (
    hasTool('propose_script_patch') ||
    hasTool('propose_text_replace') ||
    hasTool('report_audit_review')
  ) {
    lines.push(
      `- Optimistic concurrency: always pass \`expectedSnapshotHash: "${snapshotHash}"\` on \`propose_script_patch\`, \`propose_text_replace\`, and any embedded \`suggestedPatch\` inside \`report_audit_review\`.`
    );
  }

  if (hasTool('get_script_overview') && (hasTool('get_script_source') || hasTool('inspect_lens_slice'))) {
    lines.push(
      '- Surgical reading first: for localized edits—especially when `Recent user edits` or `[Target Scope: ...]` already identifies the target—prefer `get_script_source` with `targetIds` (e.g., `["MB0", "S3", "S4"]`) or `inspect_lens_slice` with `macroStateIds` / `includeStaging: false` instead of reading the whole script. Use `get_script_overview` for exact IDs (`MB#`, `MB#.#`, `S#`, `S#.#`), `get_script_source` (without `targetIds`) when you need the complete compact `v0.4.0` plain text, and parallel `inspect_lens_slice` calls when auditing multiple lenses.'
    );
  } else if (hasTool('get_script_overview') && !isEmpty) {
    lines.push(
      '- Call `get_script_overview` first if you need to inspect existing Macro-Blocks before staging a new draft.'
    );
  }

  if (hasTool('propose_text_replace') && hasTool('propose_script_patch')) {
    lines.push(
      '- Choosing the right edit tool: use `propose_text_replace` for fast literal or regex find-and-replace (renaming characters/props/tokens or pattern substitutions across the whole script or scoped `targetIds`); use `propose_script_patch` for structural AST edits (inserting, deleting, reordering, or rewriting Macro-Blocks, Macro-States, Sub-States, or `[AESTHETIC]` entries). Both run the deterministic Script Supervisor linter (`rejectOnNewErrors: true`).'
    );
  }

  if (hasTool('propose_script_title')) {
    lines.push(
      '- Scene title updates: use `propose_script_title` to propose or update the scene title independently of script body edits.'
    );
  }

  if (hasTool('propose_script_draft')) {
    lines.push(
      '- Drafting workflow: stage a complete, lint-clean `AuteurScriptDraft` ([INTENT], [LOGIC], [AESTHETIC] as `key_value`, [OPENING], and [EXECUTION]) via `propose_script_draft`.'
    );
  }

  if (focus === 'auto' && !isEmpty) {
    lines.push(
      '- Auto routing on an existing script: use `propose_text_replace` for find/regex replacements, `propose_script_patch` for structural refinements/rewrites, `propose_script_title` for renaming the scene, `report_audit_review` for Script Supervisor audits, or answer directly if the user only asks a question.'
    );
  }

  if (hasTool('load_auteur_skill') && availableSkillCount > 0) {
    lines.push(
      '- On-demand skills: call `load_auteur_skill` only when the current task genuinely requires one of the skills listed in the Available Skill Directory below. Never call it for skills already injected as Active.'
    );
  }

  if (hasTool('ask_question')) {
    if (askQuestionMode === 'ask_first') {
      lines.push(
        '- Clarifying interview requested (Ask First): the user explicitly asked to be interviewed before drafting or editing. Call `ask_question` with 1–4 concise, high-leverage directorial questions (each with 2–5 short multi-select options; the UI automatically lets the user select multiple options and add a custom comment per question—never include an "Other" option). Do not stage a draft or patch in this same turn; once `ask_question` succeeds, stop calling tools and wait for the user to reply without repeating the questions in prose.'
      );
    } else if (askQuestionMode === 'followup') {
      lines.push(
        '- Clarifying follow-up: the user just submitted answers to your clarifying questions. If you now have enough direction, proceed directly to drafting or staging your patch. Only call `ask_question` for a concise follow-up round if a critical ambiguity still blocks a strong result (and stop after calling it so the user can respond).'
      );
    }
  }

  return lines.join('\n');
}
