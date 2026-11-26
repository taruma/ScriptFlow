import type {LintRuleOverrides} from '../../core/index.ts';
import type {QuickScanResult, QuickScanTrace} from '../../services/geminiDecisions.ts';
import type {AgentTurnTrace, GeminiErrorCode} from '../../services/geminiInteractions.ts';
import {
  rebaseAuditReviewAfterFix,
  upsertStagedSuggestion,
  type PatchSuggestion,
  type StagedSuggestion,
} from '../../services/scriptTools.ts';
import {
  upsertLoadedSkill,
  type AiChatMessage,
  type AiLoadedSkillItem,
  type QuestionResponseRecord,
} from '../aiAssistant.ts';

function updateMessageById(
  messages: AiChatMessage[],
  messageId: string,
  updater: (msg: AiChatMessage) => AiChatMessage
): AiChatMessage[] {
  let matched = false;
  const next = messages.map((msg) => {
    if (msg.id !== messageId) return msg;
    matched = true;
    return updater(msg);
  });
  return matched ? next : messages;
}

export function appendThoughtSummaryDeltaInMessages(
  messages: AiChatMessage[],
  messageId: string,
  delta: string
): AiChatMessage[] {
  return updateMessageById(messages, messageId, (msg) => ({
    ...msg,
    thoughtSummary: `${msg.thoughtSummary ?? ''}${delta}`,
  }));
}

export function appendTextDeltaInMessages(
  messages: AiChatMessage[],
  messageId: string,
  delta: string
): AiChatMessage[] {
  return updateMessageById(messages, messageId, (msg) => ({
    ...msg,
    text: `${msg.text}${delta}`,
  }));
}

export function recordToolCallStartInMessages(
  messages: AiChatMessage[],
  messageId: string,
  call: {callId: string; name: string; arguments: Record<string, unknown>}
): AiChatMessage[] {
  return updateMessageById(messages, messageId, (msg) => ({
    ...msg,
    toolCalls: [
      ...(msg.toolCalls ?? []),
      {
        callId: call.callId,
        name: call.name,
        arguments: call.arguments,
        status: 'running',
      },
    ],
  }));
}

export function recordToolCallResultInMessages(
  messages: AiChatMessage[],
  messageId: string,
  trace: {callId: string; ok: boolean; stagedSuggestionId?: string}
): AiChatMessage[] {
  return updateMessageById(messages, messageId, (msg) => ({
    ...msg,
    toolCalls: (msg.toolCalls ?? []).map((item) =>
      item.callId === trace.callId
        ? {
            ...item,
            status: trace.ok ? 'ok' : 'error',
            ...(trace.stagedSuggestionId ? {stagedSuggestionId: trace.stagedSuggestionId} : {}),
          }
        : item
    ),
  }));
}

export function recordSkillLoadedInMessages(
  messages: AiChatMessage[],
  messageId: string,
  skillEvent: AiLoadedSkillItem
): AiChatMessage[] {
  return updateMessageById(messages, messageId, (msg) => ({
    ...msg,
    loadedSkills: upsertLoadedSkill(msg.loadedSkills ?? [], skillEvent),
  }));
}

export function stageSuggestionInMessages(
  messages: AiChatMessage[],
  messageId: string,
  suggestion: StagedSuggestion
): AiChatMessage[] {
  return updateMessageById(messages, messageId, (msg) => ({
    ...msg,
    suggestions: upsertStagedSuggestion(msg.suggestions ?? [], suggestion),
  }));
}

export function resetAssistantTurnForRetryInMessages(
  messages: AiChatMessage[],
  messageId: string
): AiChatMessage[] {
  return updateMessageById(messages, messageId, (msg) => ({
    ...msg,
    text: '',
    thoughtSummary: '',
    toolCalls: [],
    loadedSkills: [],
    suggestions: [],
    dismissedSuggestionIds: [],
    appliedSuggestionIds: [],
    error: undefined,
    trace: undefined,
    hitToolRoundLimit: undefined,
    isStreaming: true,
  }));
}

export function completeAssistantTurnInMessages(
  messages: AiChatMessage[],
  messageId: string,
  completion: {
    text: string;
    thoughtSummary: string;
    hitToolRoundLimit?: boolean;
    trace?: AgentTurnTrace;
    bridgedFromHistory?: 'expired_chain' | 'cross_script';
  }
): AiChatMessage[] {
  return updateMessageById(messages, messageId, (msg) => ({
    ...msg,
    text: completion.text || msg.text,
    thoughtSummary: completion.thoughtSummary || msg.thoughtSummary,
    isStreaming: false,
    hitToolRoundLimit: completion.hitToolRoundLimit,
    trace: completion.trace,
    ...(completion.bridgedFromHistory ? {bridgedFromHistory: completion.bridgedFromHistory} : {}),
  }));
}

export function failAssistantTurnInMessages(
  messages: AiChatMessage[],
  messageId: string,
  error: {code: GeminiErrorCode; message: string; trace?: AgentTurnTrace}
): AiChatMessage[] {
  return updateMessageById(messages, messageId, (msg) => ({
    ...msg,
    isStreaming: false,
    toolCalls: (msg.toolCalls ?? []).map((item) =>
      item.status === 'running'
        ? {
            ...item,
            status: error.code === 'aborted' ? 'stopped' : 'error',
          }
        : item
    ),
    error: {
      code: error.code,
      message: error.message,
    },
    ...(error.trace ? {trace: error.trace} : {}),
  }));
}

export function completeQuickScanInMessages(
  messages: AiChatMessage[],
  messageId: string,
  result: QuickScanResult,
  trace: QuickScanTrace
): AiChatMessage[] {
  return updateMessageById(messages, messageId, (msg) => ({
    ...msg,
    quickScan: result,
    quickScanTrace: trace,
    isStreaming: false,
  }));
}

export function failQuickScanInMessages(
  messages: AiChatMessage[],
  messageId: string,
  error: {code: GeminiErrorCode; message: string}
): AiChatMessage[] {
  return updateMessageById(messages, messageId, (msg) => ({
    ...msg,
    isStreaming: false,
    quickScanErrorFallback: error.code !== 'aborted',
    error: {
      code: error.code,
      message: error.message,
    },
  }));
}

export function markSuggestionAppliedInMessages(
  messages: AiChatMessage[],
  messageId: string,
  suggestionId: string
): AiChatMessage[] {
  return updateMessageById(messages, messageId, (msg) => {
    const existing = msg.appliedSuggestionIds ?? [];
    if (existing.includes(suggestionId)) return msg;
    return {
      ...msg,
      appliedSuggestionIds: [...existing, suggestionId],
    };
  });
}

export function markSuggestionDismissedInMessages(
  messages: AiChatMessage[],
  messageId: string,
  suggestionId: string
): AiChatMessage[] {
  return updateMessageById(messages, messageId, (msg) => {
    const existing = msg.dismissedSuggestionIds ?? [];
    if (existing.includes(suggestionId)) return msg;
    return {
      ...msg,
      dismissedSuggestionIds: [...existing, suggestionId],
    };
  });
}

export function applyPatchReceiptToMessages(
  messages: AiChatMessage[],
  messageId: string,
  suggestion: PatchSuggestion,
  kind: 'patch' | 'fix',
  ruleOverrides?: LintRuleOverrides
): AiChatMessage[] {
  if (kind !== 'fix') {
    return markSuggestionAppliedInMessages(messages, messageId, suggestion.id);
  }

  return updateMessageById(messages, messageId, (msg) => {
    const existingApplied = msg.appliedSuggestionIds ?? [];
    const nextApplied = existingApplied.includes(suggestion.id)
      ? existingApplied
      : [...existingApplied, suggestion.id];
    const appliedSet = new Set(nextApplied);
    const nextSuggestions = (msg.suggestions ?? []).map((entry) =>
      entry.kind === 'audit_review'
        ? rebaseAuditReviewAfterFix(
            entry,
            suggestion,
            suggestion.candidateRawText,
            appliedSet,
            ruleOverrides
          )
        : entry
    );
    return {
      ...msg,
      appliedSuggestionIds: nextApplied,
      suggestions: nextSuggestions,
    };
  });
}

export function applyBatchFixesReceiptToMessages(
  messages: AiChatMessage[],
  messageId: string,
  includedFixIds: readonly string[]
): AiChatMessage[] {
  if (includedFixIds.length === 0) return messages;
  return updateMessageById(messages, messageId, (msg) => {
    const nextApplied = Array.from(
      new Set([...(msg.appliedSuggestionIds ?? []), ...includedFixIds])
    );
    return {
      ...msg,
      appliedSuggestionIds: nextApplied,
    };
  });
}

export function markQuestionAnsweredInMessages(
  messages: AiChatMessage[],
  messageId: string,
  suggestionId: string,
  response?: QuestionResponseRecord
): AiChatMessage[] {
  if (!response) {
    return markSuggestionAppliedInMessages(messages, messageId, suggestionId);
  }

  return updateMessageById(messages, messageId, (msg) => {
    const nextResponses = {
      ...(msg.questionResponses ?? {}),
      [suggestionId]: response,
    };

    if (response.status === 'dismissed') {
      const currentDismissed = msg.dismissedSuggestionIds ?? [];
      const nextDismissed = currentDismissed.includes(suggestionId)
        ? currentDismissed
        : [...currentDismissed, suggestionId];
      return {
        ...msg,
        dismissedSuggestionIds: nextDismissed,
        questionResponses: nextResponses,
      };
    }

    const currentApplied = msg.appliedSuggestionIds ?? [];
    const nextApplied = currentApplied.includes(suggestionId)
      ? currentApplied
      : [...currentApplied, suggestionId];
    return {
      ...msg,
      appliedSuggestionIds: nextApplied,
      questionResponses: nextResponses,
    };
  });
}

export function dismissQuickScanInMessages(
  messages: AiChatMessage[],
  messageId: string
): AiChatMessage[] {
  return updateMessageById(messages, messageId, (msg) => ({
    ...msg,
    quickScanDismissed: true,
  }));
}
