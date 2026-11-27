import {
  formatChatAttachmentSummary,
  type AiChatMessage,
} from '../../ui/aiAssistant.ts';
import {describeStagedSuggestion} from '../../ui/aiSessions.ts';

export interface BuildPriorSessionRecapOptions {
  originalScriptTitle?: string;
  currentScriptTitle?: string;
  isCrossScript: boolean;
  hasOmittedMedia?: boolean;
  maxChars?: number;
}

const DEFAULT_RECAP_MAX_CHARS = 12_000;
const MAX_SINGLE_MESSAGE_CHARS = 1_600;
const MAX_RECAP_SECTION_CHARS = 900;

function truncateMiddleOrEnd(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  if (maxChars <= 24) return trimmed.slice(0, maxChars);
  return `${trimmed.slice(0, maxChars - 14).trimEnd()}\n… [truncated]`;
}

function formatMessageEntry(msg: AiChatMessage): string {
  if (msg.role === 'user') {
    const scope = msg.scopeLabel ? ` [scope: ${msg.scopeLabel}]` : '';
    const attachmentsLine =
      msg.attachments && msg.attachments.length > 0
        ? `\nAttachments: ${msg.attachments.map(formatChatAttachmentSummary).join(', ')}`
        : '';
    const sectionBlocks: string[] = [];
    if (msg.attachments && msg.attachments.length > 0) {
      for (const att of msg.attachments) {
        const sectionTag = (att.sectionTag || att.attachment?.sectionTag)?.trim();
        const sectionBody = att.attachment?.inlineText;
        if (sectionTag && typeof sectionBody === 'string') {
          const excerpt = truncateMiddleOrEnd(sectionBody, MAX_RECAP_SECTION_CHARS);
          sectionBlocks.push(`<${sectionTag}>\n${excerpt}\n</${sectionTag}>`);
        }
      }
    }
    const promptText = truncateMiddleOrEnd(msg.text || '(empty prompt)', MAX_SINGLE_MESSAGE_CHARS);
    const sectionsText = sectionBlocks.length > 0 ? `\n${sectionBlocks.join('\n')}` : '';
    return `[User · ${msg.focus}${scope}]${attachmentsLine}${sectionsText}\n${promptText}`;
  }

  const parts: string[] = [];
  if (msg.text.trim().length > 0) {
    parts.push(truncateMiddleOrEnd(msg.text, MAX_SINGLE_MESSAGE_CHARS));
  }

  if (msg.suggestions && msg.suggestions.length > 0) {
    const applied = new Set(msg.appliedSuggestionIds ?? []);
    const dismissed = new Set(msg.dismissedSuggestionIds ?? []);
    const lines = msg.suggestions.map((s) => {
      const status = applied.has(s.id)
        ? 'APPLIED'
        : dismissed.has(s.id)
          ? 'DISMISSED'
          : 'STAGED_NOT_APPLIED';
      if (s.kind === 'question' && msg.questionResponses?.[s.id]) {
        const resp = msg.questionResponses[s.id];
        const answerSummary = Object.entries(resp.answers)
          .map(([qId, draft]) => {
            const picks = draft.selectedOptions.join(', ');
            const comment = draft.comment.trim();
            return `${qId}: ${[picks, comment].filter(Boolean).join(' — ') || '(no answer)'}`;
          })
          .join(' | ');
        return `- [QUESTION ${resp.status.toUpperCase()}] ${describeStagedSuggestion(s)}${answerSummary ? ` => ${answerSummary}` : ''}`;
      }
      return `- [${status}] ${s.kind}: ${describeStagedSuggestion(s)}`;
    });
    parts.push(`Proposals:\n${lines.join('\n')}`);
  }

  if (msg.quickScan) {
    const verdict =
      msg.quickScan.flaggedCount === 0 && msg.quickScan.borderlineCount === 0
        ? 'All clean'
        : `${msg.quickScan.flaggedCount} flagged · ${msg.quickScan.borderlineCount} borderline`;
    parts.push(
      `Quick Scan summary: ${verdict} (${msg.quickScan.totalQuestions} checks · ${msg.quickScan.suspectBeats.length} suspect state(s)).`
    );
  }

  if (msg.error) {
    parts.push(`Turn error (${msg.error.code}): ${msg.error.message}`);
  }

  if (parts.length === 0) {
    return '[Assistant]\n(no text output)';
  }
  return `[Assistant]\n${parts.join('\n')}`;
}

/**
 * Deterministically builds a compact `<prior_session_recap>` Round 1 preamble so a saved
 * session can continue seamlessly in a fresh Gemini Interactions chain when the previous
 * server `interaction_id` expired or when resuming onto a different script.
 * Placed in Round 1 `input` so Zone 1 `system_instruction` stays frozen and cacheable.
 */
export function buildPriorSessionRecap(
  messages: readonly AiChatMessage[],
  options: BuildPriorSessionRecapOptions
): string {
  const maxChars = Math.max(1200, options.maxChars ?? DEFAULT_RECAP_MAX_CHARS);
  const originalTitle = options.originalScriptTitle?.trim() || 'Untitled Scene';
  const currentTitle = options.currentScriptTitle?.trim() || 'Untitled Scene';

  const headerLines = [
    '<prior_session_recap>',
    '## Prior Conversation Recap (Local History Bridge)',
    options.isCrossScript
      ? `- Context: Continuing prior conversation originally started on "${originalTitle}" now onto current script "${currentTitle}". Treat the live editor state below as authoritative for edits.`
      : `- Context: Previous Gemini interaction chain for "${currentTitle}" expired or was unavailable; re-seeding from saved local history.`,
    ...(options.hasOmittedMedia
      ? [
          '- Note: Binary media attachments from earlier turns are not persisted in text-only session history; rely on text notes or ask the user to re-attach if visual/audio inspection is needed again.',
        ]
      : []),
    '',
  ];

  const footer = '</prior_session_recap>';
  const entries = messages
    .filter((msg) => msg.text.trim().length > 0 || (msg.suggestions?.length ?? 0) > 0 || Boolean(msg.quickScan))
    .map(formatMessageEntry);

  if (entries.length === 0) {
    return [...headerLines, '(No prior turns recorded.)', footer].join('\n');
  }

  const headerText = headerLines.join('\n');
  const budget = Math.max(400, maxChars - headerText.length - footer.length - 64);

  // Always try to keep the first user prompt + as many recent entries as fit in budget
  const selectedIndices = new Set<number>();
  let usedChars = 0;

  const firstUserIdx = messages.findIndex((m) => m.role === 'user');
  if (firstUserIdx >= 0 && firstUserIdx < entries.length) {
    const firstEntry = entries[firstUserIdx];
    if (firstEntry.length <= budget) {
      selectedIndices.add(firstUserIdx);
      usedChars += firstEntry.length + 2;
    }
  }

  for (let i = entries.length - 1; i >= 0; i--) {
    if (selectedIndices.has(i)) continue;
    const entry = entries[i];
    if (usedChars + entry.length + 2 > budget) {
      continue;
    }
    selectedIndices.add(i);
    usedChars += entry.length + 2;
  }

  const orderedBody: string[] = [];
  let omittedGap = false;
  for (let i = 0; i < entries.length; i++) {
    if (!selectedIndices.has(i)) {
      omittedGap = true;
      continue;
    }
    if (omittedGap && orderedBody.length > 0) {
      orderedBody.push('… [earlier intermediate turns omitted to fit recap budget] …');
      omittedGap = false;
    }
    orderedBody.push(entries[i]);
  }

  return `${headerText}${orderedBody.join('\n\n')}\n${footer}`;
}
