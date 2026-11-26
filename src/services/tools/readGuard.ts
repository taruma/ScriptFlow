import {parseAuteurScript, type AuteurDocument} from '../../core/index.ts';
import type {ScriptToolName} from '../auteurKnowledge.ts';
import type {ScriptToolContext, ScriptToolExecutionResult} from './suggestions.ts';

export interface ScriptToolReadState {
  requiresFreshRead: boolean;
  changedTargetIds?: readonly string[];
  readFullSource: boolean;
  hasReadSource: boolean;
  hasInspectedSlice: boolean;
  readSourceTargetIds: ReadonlySet<string>;
}

type ReadGatedToolName =
  | 'propose_script_patch'
  | 'propose_text_replace'
  | 'propose_script_draft'
  | 'report_audit_review';

const READ_GATED_TOOLS: ReadonlySet<ScriptToolName> = new Set<ReadGatedToolName>([
  'propose_script_patch',
  'propose_text_replace',
  'propose_script_draft',
  'report_audit_review',
]);

function dedupeIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  return result;
}

function resolveSingleTargetToken(rawId: string, doc: AuteurDocument): string[] {
  const cleaned = rawId.replace(/^\[|\]$/g, '').trim();
  const upper = cleaned.toUpperCase();
  if (!upper) return [];

  const mbMatch = /^MB(\d+)(?:\.\d+)?$/.exec(upper);
  if (mbMatch) {
    const idx = Number.parseInt(mbMatch[1], 10);
    if (idx >= 0 && idx < doc.stagingBlocks.length) {
      return [`MB${idx}`];
    }
    return [];
  }

  const stateMatch = /^S(\d+)(?:\.\d+)?$/.exec(upper);
  if (stateMatch) {
    const beatNum = Number.parseInt(stateMatch[1], 10);
    const foundBeat = doc.execution?.beats.find((b) => b.index === beatNum);
    return foundBeat ? [`S${foundBeat.index}`] : [];
  }

  const execHeaderUpper = doc.execution?.headerName.trim().toUpperCase() ?? 'EXECUTION';
  if (upper === 'EXECUTION' || upper === execHeaderUpper) {
    return (doc.execution?.beats ?? []).map((beat) => `S${beat.index}`);
  }

  const matched: string[] = [];
  doc.stagingBlocks.forEach((block, idx) => {
    if (
      block.name.trim().toUpperCase() === upper ||
      block.kind.trim().toUpperCase() === upper
    ) {
      matched.push(`MB${idx}`);
    }
  });
  return matched;
}

function findAestheticMacroBlockIds(doc: AuteurDocument): string[] {
  const ids: string[] = [];
  doc.stagingBlocks.forEach((block, idx) => {
    if (
      block.kind.trim().toUpperCase() === 'AESTHETIC' ||
      block.name.trim().toUpperCase() === 'AESTHETIC'
    ) {
      ids.push(`MB${idx}`);
    }
  });
  return ids;
}

function resolveTopLevelTargetsForPatch(
  args: Record<string, unknown>,
  doc: AuteurDocument
): string[] {
  const patchObj =
    args.patch && typeof args.patch === 'object' && !Array.isArray(args.patch)
      ? (args.patch as Record<string, unknown>)
      : args;
  const ops = Array.isArray(patchObj.ops) ? patchObj.ops : [];
  const targets: string[] = [];

  for (const rawOp of ops) {
    if (!rawOp || typeof rawOp !== 'object' || Array.isArray(rawOp)) continue;
    const op = rawOp as Record<string, unknown>;
    const opName = typeof op.op === 'string' ? op.op : '';

    switch (opName) {
      case 'set_macro_block':
      case 'delete_macro_block': {
        if (typeof op.macroBlockId === 'string') {
          targets.push(...resolveSingleTargetToken(op.macroBlockId, doc));
        } else if (typeof op.header === 'string') {
          targets.push(...resolveSingleTargetToken(op.header, doc));
        }
        break;
      }
      case 'insert_macro_block': {
        if (typeof op.afterMacroBlockId === 'string') {
          targets.push(...resolveSingleTargetToken(op.afterMacroBlockId, doc));
        }
        break;
      }
      case 'set_aesthetic_entry':
      case 'delete_aesthetic_entry': {
        if (typeof op.entryId === 'string') {
          targets.push(...resolveSingleTargetToken(op.entryId, doc));
        } else {
          targets.push(...findAestheticMacroBlockIds(doc));
        }
        break;
      }
      case 'upsert_token_mapping':
      case 'delete_token_mapping': {
        targets.push(...findAestheticMacroBlockIds(doc));
        break;
      }
      case 'replace_macro_state':
      case 'delete_macro_state':
      case 'reorder_macro_states':
      case 'insert_sub_state': {
        if (typeof op.macroStateId === 'string') {
          targets.push(...resolveSingleTargetToken(op.macroStateId, doc));
        }
        break;
      }
      case 'insert_macro_state': {
        if (typeof op.afterMacroStateId === 'string') {
          targets.push(...resolveSingleTargetToken(op.afterMacroStateId, doc));
        }
        break;
      }
      case 'replace_sub_state':
      case 'delete_sub_state': {
        if (typeof op.subStateId === 'string') {
          targets.push(...resolveSingleTargetToken(op.subStateId, doc));
        }
        break;
      }
    }
  }

  return dedupeIds(targets);
}

function resolveTargetsForTextReplace(
  args: Record<string, unknown>,
  doc: AuteurDocument
): {isGlobal: boolean; targetIds: string[]} {
  const rules = Array.isArray(args.replacements) ? args.replacements : [];
  if (rules.length === 0) {
    return {isGlobal: true, targetIds: []};
  }

  let isGlobal = false;
  const targets: string[] = [];

  for (const rawRule of rules) {
    if (!rawRule || typeof rawRule !== 'object' || Array.isArray(rawRule)) {
      isGlobal = true;
      continue;
    }
    const rule = rawRule as Record<string, unknown>;
    const rawTargetIds = Array.isArray(rule.targetIds)
      ? rule.targetIds
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim())
          .filter((item) => item.length > 0)
      : [];

    if (rawTargetIds.length === 0) {
      isGlobal = true;
      continue;
    }

    for (const token of rawTargetIds) {
      targets.push(...resolveSingleTargetToken(token, doc));
    }
  }

  return {isGlobal, targetIds: dedupeIds(targets)};
}

function allChangedTargetsRead(readState: ScriptToolReadState): boolean {
  if (readState.readFullSource) return true;
  if (!readState.changedTargetIds || readState.changedTargetIds.length === 0) {
    return false;
  }
  return readState.changedTargetIds.every((id) => readState.readSourceTargetIds.has(id));
}

function buildSourceReadHint(suggestedTargetIds: readonly string[]): string {
  if (suggestedTargetIds.length >= 1 && suggestedTargetIds.length <= 8) {
    return `Call get_script_source with targetIds: ${JSON.stringify(suggestedTargetIds)} (or omit targetIds for the full script) to inspect the latest plain text, then retry.`;
  }
  return 'Call get_script_source (omitting targetIds to read the latest full script) before retrying.';
}

function buildReadRequiredFailure(
  toolName: ScriptToolName,
  message: string,
  repairHint: string
): ScriptToolExecutionResult {
  return {
    ok: false,
    toolName,
    result: {
      ok: false,
      errors: [
        {
          code: 'STALE_CONTEXT_READ_REQUIRED',
          message,
        },
      ],
      repairHint,
    },
  };
}

/**
 * Enforces a read-before-write barrier on mutation/audit tools whenever the script changed
 * since the prior turn (or a local history recap seeded the turn) so the model cannot
 * overwrite manual user edits from prior-turn memory.
 */
export function checkReadBeforeWriteGuard(
  toolName: ScriptToolName,
  args: Record<string, unknown>,
  context: ScriptToolContext,
  allowedTools: readonly ScriptToolName[]
): ScriptToolExecutionResult | null {
  if (!READ_GATED_TOOLS.has(toolName)) {
    return null;
  }

  const readState = context.readState;
  if (!readState?.requiresFreshRead || context.rawText.trim().length === 0) {
    return null;
  }

  const canReadSource = allowedTools.includes('get_script_source');
  const canReadSlice = allowedTools.includes('inspect_lens_slice');
  if (!canReadSource && !canReadSlice) {
    return null;
  }

  if (toolName === 'report_audit_review') {
    if (readState.hasReadSource || readState.hasInspectedSlice) {
      return null;
    }
    const hint = canReadSource && canReadSlice
      ? 'Call get_script_source or inspect_lens_slice to inspect the current script text before calling report_audit_review.'
      : canReadSource
        ? buildSourceReadHint(readState.changedTargetIds ?? [])
        : 'Call inspect_lens_slice to inspect the current script state before calling report_audit_review.';
    return buildReadRequiredFailure(
      toolName,
      'Fresh read required before staging an audit review because the script changed or was bridged from prior history.',
      hint
    );
  }

  if (toolName === 'propose_script_draft') {
    if (canReadSource) {
      if (allChangedTargetsRead(readState)) {
        return null;
      }
      const unreadChanged = (readState.changedTargetIds ?? []).filter(
        (id) => !readState.readSourceTargetIds.has(id)
      );
      return buildReadRequiredFailure(
        toolName,
        'Fresh read required before proposing a replacement draft because the live script changed since the previous turn.',
        buildSourceReadHint(unreadChanged)
      );
    }
    if (readState.hasInspectedSlice) {
      return null;
    }
    return buildReadRequiredFailure(
      toolName,
      'Fresh slice inspection required before proposing a replacement draft because the live script changed.',
      'Call inspect_lens_slice to inspect the current script state before retrying propose_script_draft.'
    );
  }

  const doc = parseAuteurScript(context.rawText);

  if (toolName === 'propose_script_patch') {
    if (!canReadSource) {
      if (readState.hasInspectedSlice) {
        return null;
      }
      return buildReadRequiredFailure(
        toolName,
        'Fresh slice inspection required before patching because the script changed since the previous turn.',
        'Call inspect_lens_slice to inspect the current script state before retrying propose_script_patch.'
      );
    }

    const patchTargets = resolveTopLevelTargetsForPatch(args, doc);
    if (!readState.hasReadSource) {
      const combinedTargets = dedupeIds([
        ...patchTargets,
        ...(readState.changedTargetIds ?? []),
      ]);
      return buildReadRequiredFailure(
        toolName,
        'Fresh source read required before patching because the script changed since the previous turn.',
        buildSourceReadHint(combinedTargets)
      );
    }

    if (!readState.readFullSource) {
      const unreadStaleTargets = patchTargets.filter(
        (id) =>
          !readState.readSourceTargetIds.has(id) &&
          (readState.changedTargetIds === undefined || readState.changedTargetIds.includes(id))
      );
      if (unreadStaleTargets.length > 0) {
        return buildReadRequiredFailure(
          toolName,
          `Target(s) ${unreadStaleTargets.join(', ')} have not been read since the script changed.`,
          buildSourceReadHint(unreadStaleTargets)
        );
      }
    }

    return null;
  }

  // propose_text_replace
  if (!canReadSource) {
    if (readState.hasInspectedSlice) {
      return null;
    }
    return buildReadRequiredFailure(
      toolName,
      'Fresh slice inspection required before text replacement because the script changed since the previous turn.',
      'Call inspect_lens_slice to inspect the current script state before retrying propose_text_replace.'
    );
  }

  const {isGlobal, targetIds: replaceTargets} = resolveTargetsForTextReplace(args, doc);
  if (isGlobal) {
    if (allChangedTargetsRead(readState)) {
      return null;
    }
    const unreadChanged = (readState.changedTargetIds ?? []).filter(
      (id) => !readState.readSourceTargetIds.has(id)
    );
    return buildReadRequiredFailure(
      toolName,
      'Fresh source read required before global text replacement because the script changed since the previous turn.',
      buildSourceReadHint(unreadChanged)
    );
  }

  if (!readState.hasReadSource) {
    const combinedTargets = dedupeIds([
      ...replaceTargets,
      ...(readState.changedTargetIds ?? []),
    ]);
    return buildReadRequiredFailure(
      toolName,
      'Fresh source read required before scoped text replacement because the script changed since the previous turn.',
      buildSourceReadHint(combinedTargets)
    );
  }

  if (!readState.readFullSource) {
    const unreadStaleTargets = replaceTargets.filter(
      (id) =>
        !readState.readSourceTargetIds.has(id) &&
        (readState.changedTargetIds === undefined || readState.changedTargetIds.includes(id))
    );
    if (unreadStaleTargets.length > 0) {
      return buildReadRequiredFailure(
        toolName,
        `Target(s) ${unreadStaleTargets.join(', ')} have not been read since the script changed.`,
        buildSourceReadHint(unreadStaleTargets)
      );
    }
  }

  return null;
}
