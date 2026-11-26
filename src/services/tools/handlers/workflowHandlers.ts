import {toAuteurEnvelope} from '../../../core/index.ts';
import {
  assistantModeToFocus,
  buildDraftCraftBody,
  composeAgentContext,
  DRAFT_CRAFT_CORE_RULES,
} from '../../auteurKnowledge.ts';
import type {
  ClarifyingQuestionItem,
  QuestionSuggestion,
  ScriptToolContext,
  ScriptToolExecutionResult,
} from '../suggestions.ts';

export function runLoadAuteurSkill(
  args: Record<string, unknown>,
  context: ScriptToolContext
): ScriptToolExecutionResult {
  const resolvedSkills =
    context.composedContext?.resolvedSkills ??
    composeAgentContext({
      focus: assistantModeToFocus(context.mode),
      rawText: context.rawText,
      ruleOverrides: context.ruleOverrides,
    }).resolvedSkills;

  const availableSkills = resolvedSkills
    .filter((skill) => skill.status === 'available')
    .map((skill) => skill.id);

  const skillId = typeof args.skillId === 'string' ? args.skillId.trim() : '';
  if (!skillId) {
    return {
      ok: false,
      toolName: 'load_auteur_skill',
      result: {
        ok: false,
        error: 'Missing required "skillId" argument.',
        availableSkills,
        repairHint:
          availableSkills.length > 0
            ? `Pass a valid skillId from availableSkills: ${availableSkills.join(', ')}.`
            : 'No additional on-demand skills are available in this turn.',
      },
    };
  }

  const skill = resolvedSkills.find((item) => item.id === skillId);
  if (!skill) {
    return {
      ok: false,
      toolName: 'load_auteur_skill',
      result: {
        ok: false,
        error: `Unknown skill "${skillId}".`,
        availableSkills,
        repairHint:
          availableSkills.length > 0
            ? `Choose one of the available skills: ${availableSkills.join(', ')}.`
            : 'No additional on-demand skills are available in this turn.',
      },
    };
  }

  if (skill.status === 'muted') {
    return {
      ok: false,
      toolName: 'load_auteur_skill',
      result: {
        ok: false,
        error: 'Skill is muted by the user.',
        skillId: skill.id,
        availableSkills,
      },
    };
  }

  if (skill.status === 'active') {
    return {
      ok: true,
      toolName: 'load_auteur_skill',
      result: {
        ok: true,
        skillId: skill.id,
        name: skill.name,
        alreadyActive: true,
        note: 'This skill is already active in your system instruction.',
      },
    };
  }

  context.onSkillLoaded?.({
    id: skill.id,
    name: skill.name,
    source: 'tool',
  });

  const content =
    skill.id === 'draft_craft' &&
    !skill.isBodyOverridden &&
    toAuteurEnvelope(context.rawText, context.ruleOverrides).derived.sceneTopology ===
      'discontinuous_montage'
      ? buildDraftCraftBody(DRAFT_CRAFT_CORE_RULES, true)
      : skill.body;

  return {
    ok: true,
    toolName: 'load_auteur_skill',
    result: {
      ok: true,
      skillId: skill.id,
      name: skill.name,
      content,
    },
  };
}

export function runAskQuestion(
  args: Record<string, unknown>,
  context: ScriptToolContext,
  nextId: () => string
): ScriptToolExecutionResult {
  const askTool = context.composedContext?.resolvedTools.find((t) => t.name === 'ask_question');
  if ((context.askQuestionMode ?? 'off') === 'off' && askTool?.reason !== 'forced_on') {
    return {
      ok: false,
      toolName: 'ask_question',
      result: {
        ok: false,
        error: 'ask_question is OFF for this turn (Ask First is not enabled).',
        repairHint:
          'Do not call ask_question on this turn. Proceed directly with drafting, editing, auditing, or answering in prose.',
      },
    };
  }

  const rawQuestions = args.questions;
  if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
    return {
      ok: false,
      toolName: 'ask_question',
      result: {
        ok: false,
        error: 'Missing required non-empty "questions" array.',
        repairHint:
          'Provide 1 to 4 concise questions, each with a non-empty "question" string and 2 to 5 short "options" strings.',
      },
    };
  }

  const MAX_QUESTIONS = 6;
  const MAX_OPTIONS = 8;
  const parsedQuestions: ClarifyingQuestionItem[] = [];
  const errors: string[] = [];

  for (let i = 0; i < Math.min(rawQuestions.length, MAX_QUESTIONS); i++) {
    const rawItem = rawQuestions[i];
    if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) {
      errors.push(`questions[${i}] must be an object with "question" and "options".`);
      continue;
    }

    const record = rawItem as Record<string, unknown>;
    const questionText = typeof record.question === 'string' ? record.question.trim() : '';
    if (!questionText) {
      errors.push(`questions[${i}].question must be a non-empty string.`);
      continue;
    }

    const rawOptions = Array.isArray(record.options) ? record.options : [];
    const seen = new Set<string>();
    const options: string[] = [];

    for (const opt of rawOptions) {
      if (typeof opt !== 'string') continue;
      const clean = opt.trim();
      if (!clean) continue;
      if (/^other(?:\s*\(.*\))?$/i.test(clean)) continue;
      const lower = clean.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);
      options.push(clean);
      if (options.length >= MAX_OPTIONS) break;
    }

    if (options.length < 2) {
      errors.push(
        `questions[${i}].options must contain at least 2 distinct non-empty choices (excluding "Other").`
      );
      continue;
    }

    parsedQuestions.push({
      id: `q-${i + 1}`,
      question: questionText,
      options,
      ...(record.multiSelect === true ? {multiSelect: true} : {}),
    });
  }

  if (parsedQuestions.length === 0 || errors.length > 0) {
    return {
      ok: false,
      toolName: 'ask_question',
      result: {
        ok: false,
        errors: errors.length > 0 ? errors : ['No valid questions provided.'],
        repairHint:
          'Pass 1–4 questions where each item has a concise "question" string and 2–5 distinct short "options" strings (do not include an "Other" option).',
      },
    };
  }

  const intro =
    typeof args.intro === 'string' && args.intro.trim().length > 0
      ? args.intro.trim()
      : undefined;

  const suggestion: QuestionSuggestion = {
    id: nextId(),
    kind: 'question',
    ...(intro ? {intro} : {}),
    questions: parsedQuestions,
  };

  context.onStageSuggestion?.(suggestion);

  return {
    ok: true,
    toolName: 'ask_question',
    stagedSuggestion: suggestion,
    result: {
      ok: true,
      staged: true,
      suggestionId: suggestion.id,
      questionCount: parsedQuestions.length,
      note: 'The clarifying questions are now displayed to the user as an interactive multi-select card with comment fields. Stop calling tools now, avoid repeating the questions in prose, and wait for the user to submit their answers.',
    },
  };
}
