import type {
  AgentMediaAttachment,
  AgentRoundTrace,
  PendingFunctionCall,
} from './interactionTypes.ts';

/**
 * Builds the Round 1 `input` payload for Gemini Interactions API (`v1`).
 * Prepends any delta-only `turnContextPreamble` (`<live_editor_state>`, `<scene_brief>`,
 * `<turn_directive>`) to keep `system_instruction` and `previous_interaction_id` history cache-stable.
 */
export function buildInitialInteractionInput(
  prompt: string,
  attachments?: readonly AgentMediaAttachment[],
  turnContextPreamble?: string
): string | Array<{type: 'user_input'; content: Array<Record<string, unknown>>}> {
  const preamble = turnContextPreamble?.trim() ?? '';

  if (!attachments || attachments.length === 0) {
    return preamble.length > 0 ? `${preamble}\n\n${prompt}` : prompt;
  }

  const blocks: Array<Record<string, unknown>> = [];

  for (const att of attachments) {
    const isMessageAttachment = att.origin === 'message';
    const messageDisplayName = att.fileName?.trim() || att.label.trim() || att.mimeType;
    const labelText = [
      att.handle || `@${att.kind}`,
      att.label ? `(${att.label})` : '',
      att.note ? `— ${att.note}` : '',
    ]
      .filter((part) => part.length > 0)
      .join(' ');

    if (att.source === 'inline' && typeof att.inlineText === 'string') {
      const sectionTag = att.sectionTag?.trim();
      if (isMessageAttachment && sectionTag) {
        blocks.push({
          type: 'text',
          text: `<${sectionTag}>\n${att.inlineText}\n</${sectionTag}>`,
        });
        continue;
      }
      const fileHeader = att.fileName ? ` · ${att.fileName}` : '';
      const header = isMessageAttachment
        ? `[Attached ${att.kind}: ${messageDisplayName}]`
        : `[Reference ${labelText}${fileHeader}]`;
      blocks.push({
        type: 'text',
        text: `${header}\n${att.inlineText}`,
      });
      continue;
    }

    if (att.source === 'inline' && att.inlineBase64) {
      blocks.push({
        type: 'text',
        text: isMessageAttachment
          ? `[Attached ${att.kind}: ${messageDisplayName}]`
          : `[Reference ${labelText}]`,
      });
      blocks.push({
        type: att.kind === 'image' ? 'image' : att.kind,
        data: att.inlineBase64,
        mime_type: att.mimeType,
      });
      continue;
    }

    if (att.source === 'youtube' && att.uri) {
      blocks.push({
        type: 'text',
        text: isMessageAttachment
          ? `[Attached ${att.kind}: ${messageDisplayName} — YouTube video]`
          : `[Reference ${labelText} — YouTube video]`,
      });
      blocks.push({
        type: 'video',
        uri: att.uri,
        ...(att.processingMode === 'agentic' ? {processing: 'agentic'} : {}),
      });
      continue;
    }

    if (att.source === 'files_api' && att.uri) {
      blocks.push({
        type: 'text',
        text: isMessageAttachment
          ? `[Attached ${att.kind}: ${messageDisplayName}]`
          : `[Reference ${labelText}]`,
      });
      if (att.kind === 'video') {
        blocks.push({
          type: 'video',
          uri: att.uri,
          mime_type: att.mimeType,
          ...(att.processingMode === 'agentic' ? {processing: 'agentic'} : {}),
        });
      } else if (att.kind === 'image') {
        blocks.push({
          type: 'image',
          uri: att.uri,
          mime_type: att.mimeType,
        });
      } else if (att.kind === 'audio') {
        blocks.push({
          type: 'audio',
          uri: att.uri,
          mime_type: att.mimeType,
        });
      } else {
        blocks.push({
          type: 'document',
          uri: att.uri,
          mime_type: att.mimeType,
        });
      }
    }
  }

  if (blocks.length === 0) {
    return preamble.length > 0 ? `${preamble}\n\n${prompt}` : prompt;
  }

  if (preamble.length > 0) {
    blocks.push({type: 'text', text: preamble});
  }
  blocks.push({type: 'text', text: prompt});
  return [{type: 'user_input', content: blocks}];
}

function sanitizeTraceContentBlock(item: unknown): unknown {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
  const record = item as Record<string, unknown>;
  if (typeof record.data === 'string' && record.data.length > 128) {
    const approxKb = Math.max(1, Math.round((record.data.length * 3) / 4 / 1024));
    return {
      ...record,
      data: `<base64 ~${approxKb} KB omitted>`,
    };
  }
  if (typeof record.text === 'string' && record.text.length > 4000) {
    return {
      ...record,
      text: `${record.text.slice(0, 1200)}\n... <truncated ${record.text.length - 1200} chars>`,
    };
  }
  if (Array.isArray(record.content)) {
    return {
      ...record,
      content: record.content.map(sanitizeTraceContentBlock),
    };
  }
  return record;
}

/**
 * Strips bulky base64 payloads from trace snapshots (including nested `user_input.content`)
 * so AI Trace Inspector & Copy Trace JSON remain fast, readable, and lightweight.
 */
export function sanitizeTraceInput(input: unknown): unknown {
  if (!Array.isArray(input)) return input;
  return input.map(sanitizeTraceContentBlock);
}

export function parseJsonObjectSafe(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Fallback to empty arguments; tool validator will return a structured self-repair error
  }
  return {};
}

export function extractThoughtSummaryText(delta: Record<string, unknown>): string {
  const content = delta.content;
  if (content && typeof content === 'object' && !Array.isArray(content)) {
    const rec = content as Record<string, unknown>;
    if (rec.type === 'text' && typeof rec.text === 'string') {
      return rec.text;
    }
  }
  if (typeof delta.text === 'string') {
    return delta.text;
  }
  return '';
}

export function extractFunctionCallsFromSteps(
  steps: Array<Record<string, unknown>> | undefined
): PendingFunctionCall[] {
  if (!Array.isArray(steps)) return [];
  const calls: PendingFunctionCall[] = [];
  for (const step of steps) {
    if (step?.type === 'function_call' && typeof step.id === 'string' && typeof step.name === 'string') {
      const args =
        step.arguments && typeof step.arguments === 'object' && !Array.isArray(step.arguments)
          ? (step.arguments as Record<string, unknown>)
          : {};
      calls.push({
        id: step.id,
        name: step.name,
        arguments: args,
      });
    }
  }
  return calls;
}

export function extractModelOutputTextFromSteps(
  steps: Array<Record<string, unknown>> | undefined
): string {
  if (!Array.isArray(steps)) return '';
  let combined = '';
  for (const step of steps) {
    if (step?.type === 'model_output' && Array.isArray(step.content)) {
      for (const part of step.content as Array<Record<string, unknown>>) {
        if (part?.type === 'text' && typeof part.text === 'string') {
          combined += part.text;
        }
      }
    }
  }
  return combined;
}

export function redactSecret(text: string, secret: string): string {
  if (!secret || !text.includes(secret)) return text;
  return text.split(secret).join('[REDACTED]');
}

interface ModalityTokenEntry {
  modality: string;
  tokens: number;
}

function isModalityTokenEntry(value: unknown): value is ModalityTokenEntry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.modality === 'string' &&
    typeof record.tokens === 'number' &&
    Number.isFinite(record.tokens)
  );
}

function isModalityTokenArray(value: unknown): value is ModalityTokenEntry[] {
  return Array.isArray(value) && value.length > 0 && value.every(isModalityTokenEntry);
}

function mergeModalityTokenArrays(
  existing: unknown,
  incoming: readonly ModalityTokenEntry[]
): ModalityTokenEntry[] {
  const totalsByModality = new Map<string, number>();

  if (isModalityTokenArray(existing)) {
    for (const entry of existing) {
      totalsByModality.set(
        entry.modality,
        (totalsByModality.get(entry.modality) ?? 0) + entry.tokens
      );
    }
  }

  for (const entry of incoming) {
    totalsByModality.set(
      entry.modality,
      (totalsByModality.get(entry.modality) ?? 0) + entry.tokens
    );
  }

  return Array.from(totalsByModality, ([modality, tokens]) => ({modality, tokens}));
}

export function aggregateRoundUsage(
  rounds: readonly AgentRoundTrace[]
): Record<string, unknown> | undefined {
  const usages = rounds
    .map((round) => round.usage)
    .filter((u): u is Record<string, unknown> => Boolean(u && typeof u === 'object'));

  if (usages.length === 0) return undefined;

  const aggregated: Record<string, unknown> = {};
  for (const usage of usages) {
    for (const [key, value] of Object.entries(usage)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        const prev = aggregated[key];
        aggregated[key] = typeof prev === 'number' ? prev + value : value;
      } else if (isModalityTokenArray(value)) {
        aggregated[key] = mergeModalityTokenArrays(aggregated[key], value);
      } else if (Array.isArray(value) && value.length === 0 && isModalityTokenArray(aggregated[key])) {
        continue;
      } else {
        aggregated[key] = value;
      }
    }
  }
  return aggregated;
}
