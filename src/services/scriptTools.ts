import type {AssistantFocus, AssistantMode, ScriptToolName} from './auteurKnowledge.ts';
import {MODE_TOOL_NAMES} from './tools/declarations.ts';
import {
  createDefaultIdGenerator,
  type ScriptToolContext,
  type ScriptToolExecutionResult,
  type ToolCallInput,
} from './tools/suggestions.ts';
import {
  runGetScriptOverview,
  runGetScriptSource,
  runInspectLensSlice,
} from './tools/handlers/inspectHandlers.ts';
import {
  runProposeScriptDraft,
  runProposeScriptPatch,
  runProposeScriptTitle,
  runProposeTextReplace,
  runReportAuditReview,
} from './tools/handlers/mutationHandlers.ts';
import {runAskQuestion, runLoadAuteurSkill} from './tools/handlers/workflowHandlers.ts';

export type {AssistantFocus, AssistantMode, ScriptToolName};

export {
  MODE_TOOL_NAMES,
  buildToolDeclarationsForContext,
  getSystemInstructionForMode,
  getToolDeclarationsForMode,
  sanitizeJsonSchemaForTool,
  type GeminiFunctionToolDeclaration,
} from './tools/declarations.ts';

export {
  buildLineDiff,
  type DiffLine,
  type ScriptLineDiff,
} from './tools/lineDiff.ts';

export {
  buildPatchSuggestionFromCandidateText,
  upsertStagedSuggestion,
  type AuditReviewIssueItem,
  type AuditReviewSuggestion,
  type ClarifyingQuestionItem,
  type DraftSuggestion,
  type LintDelta,
  type PatchSuggestion,
  type QuestionSuggestion,
  type ScriptToolContext,
  type ScriptToolExecutionResult,
  type StagedSuggestion,
  type TitleSuggestion,
  type ToolCallInput,
} from './tools/suggestions.ts';

export {
  composeAuditFixesBatch,
  rebaseAuditReviewAfterFix,
  type AuditFixesBatchPlan,
} from './tools/auditRebase.ts';

// ---------------------------------------------------------------------------
// Public Mode- & Context-Scoped Tool Dispatcher
// ---------------------------------------------------------------------------

/**
 * Executes a single local read-only/staging tool call strictly scoped to the turn's
 * allowed tools (`context.allowedTools` / `context.composedContext` / `MODE_TOOL_NAMES[context.mode]`).
 * Never mutates `context.rawText`.
 */
export function executeScriptToolCall(
  call: ToolCallInput,
  context: ScriptToolContext
): ScriptToolExecutionResult {
  const allowedTools =
    context.allowedTools ?? context.composedContext?.allowedToolNames ?? MODE_TOOL_NAMES[context.mode];
  const scopeLabel = context.composedContext
    ? `${context.composedContext.focus} focus`
    : `"${context.mode}" mode`;

  if (!allowedTools.includes(call.name as ScriptToolName)) {
    return {
      ok: false,
      toolName: call.name,
      result: {
        ok: false,
        error: `Tool "${call.name}" is not available in ${scopeLabel}.`,
        allowedTools,
        repairHint: `Use only the tools available in ${scopeLabel}: ${allowedTools.join(', ')}.`,
      },
    };
  }

  const nextId = context.createSuggestionId ?? createDefaultIdGenerator();
  const args =
    call.arguments && typeof call.arguments === 'object' && !Array.isArray(call.arguments)
      ? call.arguments
      : {};

  switch (call.name as ScriptToolName) {
    case 'get_script_overview':
      return runGetScriptOverview(context.rawText, context.ruleOverrides, context.sceneTitle);
    case 'get_script_source':
      return runGetScriptSource(args, context.rawText, context.ruleOverrides, context.sceneTitle);
    case 'inspect_lens_slice':
      return runInspectLensSlice(args, context.rawText, context.ruleOverrides);
    case 'propose_script_patch':
      return runProposeScriptPatch(args, context, nextId);
    case 'propose_text_replace':
      return runProposeTextReplace(args, context, nextId);
    case 'propose_script_draft':
      return runProposeScriptDraft(args, context, nextId);
    case 'propose_script_title':
      return runProposeScriptTitle(args, context, nextId);
    case 'report_audit_review':
      return runReportAuditReview(args, context, nextId);
    case 'load_auteur_skill':
      return runLoadAuteurSkill(args, context);
    case 'ask_question':
      return runAskQuestion(args, context, nextId);
  }
}
