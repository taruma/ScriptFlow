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

  if (hasTool('propose_script_patch') || hasTool('report_audit_review')) {
    lines.push(
      `- Optimistic concurrency: always pass \`expectedSnapshotHash: "${snapshotHash}"\` on \`propose_script_patch\` and any embedded \`suggestedPatch\` inside \`report_audit_review\`.`
    );
  }

  if (hasTool('get_script_overview') && hasTool('inspect_lens_slice')) {
    lines.push(
      '- Inspect before judging or patching: use `get_script_overview` for exact IDs (`MB#`, `MB#.#`, `S#`, `S#.#`) and `inspect_lens_slice` for focused slices with resolved camera framing and topology-filtered checklists. When auditing multiple lenses, invoke independent `inspect_lens_slice` calls in parallel in the same round.'
    );
  } else if (hasTool('get_script_overview') && !isEmpty) {
    lines.push(
      '- Call `get_script_overview` first if you need to inspect existing Macro-Blocks before staging a new draft.'
    );
  }

  if (hasTool('propose_script_draft')) {
    lines.push(
      '- Drafting workflow: stage a complete, lint-clean `AuteurScriptDraft` ([INTENT], [LOGIC], [AESTHETIC] as `key_value`, [OPENING], and [EXECUTION]) via `propose_script_draft`.'
    );
  }

  if (focus === 'auto' && !isEmpty) {
    lines.push(
      '- Auto routing on an existing script: use `propose_script_patch` for targeted refinements/rewrites, `report_audit_review` for Script Supervisor audits, or answer directly if the user only asks a question.'
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
