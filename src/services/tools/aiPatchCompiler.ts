import {
  AuteurPatchSchema,
  StagingHeaderSchema,
  normalizeLineEndings,
  parseAestheticLine,
  renderStagingBlockBody,
  renderSubState,
  toAuteurEnvelope,
  type AuteurPatch,
  type AuteurPatchOp,
  type AuteurScriptIR,
  type LintRuleOverrides,
  type MacroStateIR,
  type PatchError,
  type StagingMacroBlockDraft,
  type StagingMacroBlockIR,
  type SubStateDraft,
  type SubStateIR,
} from '../../core/index.ts';

const MAX_REPLACE_RULES_PER_PATCH = 20;
const MAX_FIND_PATTERN_LENGTH = 500;
const ALLOWED_REGEX_FLAGS_PATTERN = /^[gim]*$/;

const LEGACY_AST_OP_NAMES = new Set([
  'set_macro_block',
  'insert_macro_block',
  'delete_macro_block',
  'set_aesthetic_entry',
  'delete_aesthetic_entry',
  'upsert_token_mapping',
  'delete_token_mapping',
  'replace_macro_state',
  'insert_macro_state',
  'delete_macro_state',
  'reorder_macro_states',
  'replace_sub_state',
  'insert_sub_state',
  'delete_sub_state',
]);

export function stripOuterMarkdownFence(text: string): string {
  const normalized = normalizeLineEndings(text);
  const match = /^\s*```[a-zA-Z0-9_-]*\n([\s\S]*?)\n```\s*$/.exec(normalized);
  if (match) {
    return match[1];
  }
  const singleLine = /^\s*```[a-zA-Z0-9_-]*\s+([\s\S]*?)\s*```\s*$/.exec(normalized);
  return singleLine ? singleLine[1] : normalized;
}

export function detectLeakedSourceAnnotation(text: string): string | null {
  const lines = normalizeLineEndings(text).split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^#\s*MB\d+\b/i.test(trimmed)) {
      return `Remove get_script_source annotation marker "${trimmed}" — pass canonical v0.4.0 text without "# MB#" headers.`;
    }
    if (/^S\d+\s*:/i.test(trimmed)) {
      return `Remove get_script_source line prefix "${trimmed.slice(0, 12)}..." — pass canonical v0.4.0 Sub-States without "S#:" prefixes.`;
    }
  }
  return null;
}

function escapeLiteralRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripSubStateId(sub: SubStateIR): SubStateDraft {
  const {id: _ignored, ...rest} = sub;
  return rest as SubStateDraft;
}

function renderMacroStateLine(ms: MacroStateIR): string {
  return ms.subStates
    .map((sub) => renderSubState(sub))
    .filter((segment) => segment.length > 0)
    .join(' -> ');
}

function cloneWorkingIR(ir: AuteurScriptIR): AuteurScriptIR {
  return {
    schemaVersion: ir.schemaVersion,
    preamble: [...ir.preamble],
    stagingMacroBlocks: ir.stagingMacroBlocks.map((block) =>
      block.format === 'key_value'
        ? {...block, entries: block.entries.map((e) => ({...e}))}
        : {...block}
    ),
    executionMacroBlock: ir.executionMacroBlock
      ? {
          header: ir.executionMacroBlock.header,
          macroStates: ir.executionMacroBlock.macroStates.map((ms) => ({
            id: ms.id,
            subStates: ms.subStates.map((sub) => ({...sub})),
          })),
        }
      : null,
  };
}

function resolveStagingBlockIndex(
  blocks: readonly StagingMacroBlockIR[],
  rawTarget: string
): number {
  const cleaned = rawTarget.replace(/^\[|\]$/g, '').trim();
  const upper = cleaned.toUpperCase();
  if (!upper) return -1;

  const exactIdx = blocks.findIndex((b) => b.id.toUpperCase() === upper);
  if (exactIdx !== -1) return exactIdx;

  const mbMatch = /^MB(\d+)(?:\.\d+)?$/.exec(upper);
  if (mbMatch) {
    const pos = Number.parseInt(mbMatch[1], 10);
    if (pos >= 0 && pos < blocks.length && blocks[pos].id.startsWith('__new_')) {
      return pos;
    }
  }

  return blocks.findIndex(
    (b) => b.header.trim().toUpperCase() === upper || b.kind.trim().toUpperCase() === upper
  );
}

function resolveMacroStateIndex(
  states: readonly MacroStateIR[],
  rawTarget: string
): number {
  const upper = rawTarget.trim().toUpperCase();
  if (!upper) return -1;

  const exactIdx = states.findIndex((ms) => ms.id.toUpperCase() === upper);
  if (exactIdx !== -1) return exactIdx;

  const stateMatch = /^S(\d+)(?:\.\d+)?$/.exec(upper);
  if (stateMatch) {
    const pos = Number.parseInt(stateMatch[1], 10) - 1;
    if (pos >= 0 && pos < states.length && states[pos].id.startsWith('__new_')) {
      return pos;
    }
  }

  return -1;
}

function parseSingleExecutionLine(
  rawLine: string,
  opIndex: number,
  opName: string,
  ruleOverrides?: LintRuleOverrides
): {ok: true; subStates: SubStateDraft[]} | {ok: false; error: PatchError} {
  const stripped = stripOuterMarkdownFence(rawLine).trim();
  if (stripped.length === 0) {
    return {
      ok: false,
      error: {
        opIndex,
        op: opName,
        code: 'VALIDATION_ERROR',
        message: `${opName} requires a non-empty canonical v0.4.0 Macro-State line.`,
      },
    };
  }
  if (/[\r\n]/.test(stripped)) {
    return {
      ok: false,
      error: {
        opIndex,
        op: opName,
        code: 'VALIDATION_ERROR',
        message: `${opName} expects single-line Macro-State strings (use insert_states.lines[] for multiple Macro-States).`,
      },
    };
  }
  const leaked = detectLeakedSourceAnnotation(stripped);
  if (leaked) {
    return {
      ok: false,
      error: {
        opIndex,
        op: opName,
        code: 'VALIDATION_ERROR',
        message: leaked,
      },
    };
  }
  if (/^\[EXECUTION\]$/i.test(stripped)) {
    return {
      ok: false,
      error: {
        opIndex,
        op: opName,
        code: 'VALIDATION_ERROR',
        message: `${opName} expects an Execution Macro-State line, not the [EXECUTION] header.`,
      },
    };
  }

  const parsedEnv = toAuteurEnvelope(`[EXECUTION]\n${stripped}`, ruleOverrides);
  const ms = parsedEnv.document.executionMacroBlock?.macroStates[0];
  if (!ms || ms.subStates.length === 0) {
    return {
      ok: false,
      error: {
        opIndex,
        op: opName,
        code: 'VALIDATION_ERROR',
        message: `Could not parse "${stripped}" as a valid v0.4.0 Execution Macro-State.`,
      },
    };
  }

  return {ok: true, subStates: ms.subStates.map(stripSubStateId)};
}

function parseStagingBodyToEntries(body: string) {
  const lines = body.length > 0 ? normalizeLineEndings(body).split('\n') : [];
  return lines.map((line) => {
    const parsed = parseAestheticLine(line);
    return parsed.type === 'kv'
      ? {key: parsed.key, value: parsed.value}
      : {key: null, value: parsed.raw};
  });
}

function resolveReplaceTextTargets(
  working: AuteurScriptIR,
  rawTargetIds: readonly string[] | undefined
):
  | {ok: true; stagingIndices: number[]; stateIndices: number[]}
  | {ok: false; notFoundIds: string[]} {
  if (!rawTargetIds || rawTargetIds.length === 0) {
    return {
      ok: true,
      stagingIndices: working.stagingMacroBlocks.map((_, idx) => idx),
      stateIndices: (working.executionMacroBlock?.macroStates ?? []).map((_, idx) => idx),
    };
  }

  const stagingSet = new Set<number>();
  const stateSet = new Set<number>();
  const notFoundIds: string[] = [];
  const execHeaderUpper = working.executionMacroBlock?.header.trim().toUpperCase() ?? 'EXECUTION';

  for (const rawId of rawTargetIds) {
    const cleaned = rawId.replace(/^\[|\]$/g, '').trim();
    const upper = cleaned.toUpperCase();
    if (!upper) continue;

    if (upper === 'EXECUTION' || upper === execHeaderUpper) {
      if (working.executionMacroBlock) {
        working.executionMacroBlock.macroStates.forEach((_, idx) => stateSet.add(idx));
      } else {
        notFoundIds.push(rawId);
      }
      continue;
    }

    if (/^S\d+(?:\.\d+)?$/.test(upper)) {
      const states = working.executionMacroBlock?.macroStates ?? [];
      const stateIdx = resolveMacroStateIndex(states, upper);
      if (stateIdx !== -1) {
        stateSet.add(stateIdx);
      } else {
        notFoundIds.push(rawId);
      }
      continue;
    }

    if (/^MB\d+(?:\.\d+)?$/.test(upper)) {
      const blockIdx = resolveStagingBlockIndex(working.stagingMacroBlocks, upper);
      if (blockIdx !== -1) {
        stagingSet.add(blockIdx);
      } else {
        notFoundIds.push(rawId);
      }
      continue;
    }

    let matchedHeader = false;
    working.stagingMacroBlocks.forEach((block, idx) => {
      if (
        block.header.trim().toUpperCase() === upper ||
        block.kind.trim().toUpperCase() === upper
      ) {
        stagingSet.add(idx);
        matchedHeader = true;
      }
    });
    if (!matchedHeader) {
      notFoundIds.push(rawId);
    }
  }

  if (notFoundIds.length > 0) {
    return {ok: false, notFoundIds};
  }

  return {
    ok: true,
    stagingIndices: Array.from(stagingSet).sort((a, b) => a - b),
    stateIndices: Array.from(stateSet).sort((a, b) => a - b),
  };
}

// ---------------------------------------------------------------------------
// Slim Text-First JSON Schema Builder (Shared by propose_script_patch & report_audit_review)
// ---------------------------------------------------------------------------

export function buildSlimPatchOpJsonSchema(): Record<string, unknown> {
  return {
    anyOf: [
      {
        type: 'object',
        description: 'Replace Staging Macro-Block body.',
        properties: {
          op: {type: 'string', enum: ['set_block']},
          targetId: {type: 'string', description: 'MB# or header.'},
          body: {type: 'string', description: 'Plain-text body (no [HEADER]).'},
        },
        required: ['op', 'targetId', 'body'],
      },
      {
        type: 'object',
        description: 'Insert Staging Macro-Block after afterId (null=start).',
        properties: {
          op: {type: 'string', enum: ['insert_block']},
          afterId: {type: ['string', 'null']},
          header: {type: 'string', description: 'Uppercase header.'},
          body: {type: 'string'},
        },
        required: ['op', 'afterId', 'header', 'body'],
      },
      {
        type: 'object',
        description: 'Delete Staging Macro-Block.',
        properties: {
          op: {type: 'string', enum: ['delete_block']},
          targetId: {type: 'string'},
        },
        required: ['op', 'targetId'],
      },
      {
        type: 'object',
        description: 'Replace Execution Macro-State line.',
        properties: {
          op: {type: 'string', enum: ['replace_state']},
          targetId: {type: 'string', description: 'S# ID.'},
          line: {type: 'string', description: 'v0.4.0 line (no S#:).'},
        },
        required: ['op', 'targetId', 'line'],
      },
      {
        type: 'object',
        description: 'Insert Execution Macro-States after afterId (null=start).',
        properties: {
          op: {type: 'string', enum: ['insert_states']},
          afterId: {type: ['string', 'null']},
          lines: {
            type: 'array',
            items: {type: 'string'},
            description: 'v0.4.0 lines (no S#:).',
          },
        },
        required: ['op', 'afterId', 'lines'],
      },
      {
        type: 'object',
        description: 'Delete Execution Macro-State.',
        properties: {
          op: {type: 'string', enum: ['delete_state']},
          targetId: {type: 'string'},
        },
        required: ['op', 'targetId'],
      },
      {
        type: 'object',
        description: 'Move Execution Macro-State after afterId (null=start).',
        properties: {
          op: {type: 'string', enum: ['reorder_state']},
          targetId: {type: 'string'},
          afterId: {type: ['string', 'null']},
        },
        required: ['op', 'targetId', 'afterId'],
      },
      {
        type: 'object',
        description: 'Find-and-replace across script or targetIds.',
        properties: {
          op: {type: 'string', enum: ['replace_text']},
          find: {type: 'string'},
          replace: {type: 'string'},
          isRegex: {type: 'boolean'},
          caseSensitive: {type: 'boolean'},
          wholeWord: {type: 'boolean'},
          targetIds: {
            type: 'array',
            items: {type: 'string'},
          },
        },
        required: ['op', 'find', 'replace'],
      },
    ],
  };
}

export function buildSlimPatchJsonSchema(options?: {
  includeTitle?: boolean;
  opsOptional?: boolean;
}): Record<string, unknown> {
  const includeTitle = options?.includeTitle ?? false;
  const opsOptional = options?.opsOptional ?? false;

  const properties: Record<string, unknown> = {
    expectedSnapshotHash: {
      type: 'string',
      description: 'Current snapshotHash from <live_editor_state> or get_script_source.',
    },
    summary: {
      type: 'string',
      description: 'Concise one-line summary of the staged edit or title update.',
    },
  };

  if (includeTitle) {
    properties.title = {
      type: 'string',
      description: 'Optional scene title (<= 120 chars). Omit ops to propose a title change alone.',
    };
    properties.rationale = {
      type: 'string',
      description: 'Optional concise reason when proposing a scene title.',
    };
  }

  properties.ops = {
    type: 'array',
    items: buildSlimPatchOpJsonSchema(),
    description: 'Ordered patch operations to apply atomically.',
  };

  return {
    type: 'object',
    properties,
    required: opsOptional
      ? ['expectedSnapshotHash', 'summary']
      : ['expectedSnapshotHash', 'summary', 'ops'],
  };
}

// ---------------------------------------------------------------------------
// Text-First Patch Compiler -> Canonical AuteurPatch
// ---------------------------------------------------------------------------

export type CompileAiPatchResult =
  | {ok: true; patch: AuteurPatch; matchCount?: number}
  | {ok: false; errors: PatchError[]; repairHint: string};

export function compileAiPatchToAuteurPatch(
  rawText: string,
  rawPatchInput: unknown,
  ruleOverrides?: LintRuleOverrides
): CompileAiPatchResult {
  if (!rawPatchInput || typeof rawPatchInput !== 'object' || Array.isArray(rawPatchInput)) {
    return {
      ok: false,
      errors: [{code: 'VALIDATION_ERROR', message: 'Patch payload must be an object.'}],
      repairHint: 'Pass { expectedSnapshotHash, summary, ops } to propose_script_patch.',
    };
  }

  const record =
    'patch' in rawPatchInput &&
    (rawPatchInput as Record<string, unknown>).patch &&
    typeof (rawPatchInput as Record<string, unknown>).patch === 'object' &&
    !Array.isArray((rawPatchInput as Record<string, unknown>).patch)
      ? ((rawPatchInput as Record<string, unknown>).patch as Record<string, unknown>)
      : (rawPatchInput as Record<string, unknown>);

  const baseEnvelope = toAuteurEnvelope(rawText, ruleOverrides);
  const expectedSnapshotHash =
    typeof record.expectedSnapshotHash === 'string' && record.expectedSnapshotHash.trim().length > 0
      ? record.expectedSnapshotHash.trim()
      : undefined;

  if (expectedSnapshotHash && expectedSnapshotHash !== baseEnvelope.snapshotHash) {
    return {
      ok: false,
      errors: [
        {
          code: 'SNAPSHOT_MISMATCH',
          message: `Snapshot hash mismatch: expected "${expectedSnapshotHash}", actual "${baseEnvelope.snapshotHash}".`,
        },
      ],
      repairHint: `Update expectedSnapshotHash to "${baseEnvelope.snapshotHash}" (or call get_script_source to inspect the latest text) and retry.`,
    };
  }

  const rawOps = Array.isArray(record.ops) ? record.ops : null;
  if (!rawOps || rawOps.length === 0) {
    return {
      ok: false,
      errors: [{code: 'VALIDATION_ERROR', path: 'ops', message: 'ops must be a non-empty array.'}],
      repairHint: 'Provide at least one patch operation in ops (or pass title alone to rename).',
    };
  }

  // Backward-compatible passthrough when all ops are legacy AST ops
  const allLegacyOps = rawOps.every(
    (entry) =>
      entry &&
      typeof entry === 'object' &&
      !Array.isArray(entry) &&
      typeof (entry as Record<string, unknown>).op === 'string' &&
      LEGACY_AST_OP_NAMES.has((entry as Record<string, unknown>).op as string)
  );
  if (allLegacyOps) {
    const parsed = AuteurPatchSchema.safeParse(record);
    if (!parsed.success) {
      return {
        ok: false,
        errors: parsed.error.issues.map((issue) => ({
          code: 'VALIDATION_ERROR',
          path: issue.path.join('.'),
          message: issue.message,
        })),
        repairHint: 'Fix the invalid patch fields listed in errors and retry.',
      };
    }
    return {ok: true, patch: parsed.data};
  }

  const working = cloneWorkingIR(baseEnvelope.document);
  const compiledOps: AuteurPatchOp[] = [];
  const createdBlockOpByTempId = new Map<
    string,
    Extract<AuteurPatchOp, {op: 'insert_macro_block'}>
  >();
  const createdStateOpByTempId = new Map<
    string,
    Extract<AuteurPatchOp, {op: 'insert_macro_state'}>
  >();

  let tempCounter = 0;
  const nextTempId = () => `__new_${tempCounter++}`;
  let replaceRuleCount = 0;
  let totalReplaceMatches = 0;

  const fail = (error: PatchError, repairHint: string): CompileAiPatchResult => ({
    ok: false,
    errors: [error],
    repairHint,
  });

  const summary =
    typeof record.summary === 'string' && record.summary.trim().length > 0
      ? record.summary.trim()
      : undefined;

  for (let opIdx = 0; opIdx < rawOps.length; opIdx++) {
    const rawOp = rawOps[opIdx];
    if (!rawOp || typeof rawOp !== 'object' || Array.isArray(rawOp)) {
      return fail(
        {
          opIndex: opIdx,
          code: 'VALIDATION_ERROR',
          path: `ops.${opIdx}`,
          message: `ops[${opIdx}] must be an object.`,
        },
        'Fix the malformed patch operation object and retry.'
      );
    }

    const op = rawOp as Record<string, unknown>;
    const opName = typeof op.op === 'string' ? op.op : '';

    switch (opName) {
      case 'set_block': {
        const targetId = typeof op.targetId === 'string' ? op.targetId.trim() : '';
        const rawBody = typeof op.body === 'string' ? op.body : null;
        if (!targetId || rawBody === null) {
          return fail(
            {
              opIndex: opIdx,
              op: opName,
              code: 'VALIDATION_ERROR',
              message: 'set_block requires "targetId" and "body" strings.',
            },
            'Provide targetId (e.g. "MB0" or "INTENT") and canonical plain-text body.'
          );
        }
        const cleanedBody = stripOuterMarkdownFence(rawBody);
        const leaked = detectLeakedSourceAnnotation(cleanedBody);
        if (leaked) {
          return fail(
            {opIndex: opIdx, op: opName, code: 'VALIDATION_ERROR', message: leaked},
            leaked
          );
        }

        const blockIdx = resolveStagingBlockIndex(working.stagingMacroBlocks, targetId);
        if (blockIdx === -1) {
          return fail(
            {
              opIndex: opIdx,
              op: opName,
              code: 'TARGET_NOT_FOUND',
              message: `Staging Macro-Block "${targetId}" not found.`,
            },
            'Check valid MB# IDs or header names in <live_editor_state> or get_script_source.'
          );
        }

        const block = working.stagingMacroBlocks[blockIdx];
        if (block.format === 'key_value') {
          const entries = parseStagingBodyToEntries(cleanedBody);
          block.entries = entries.map((e) => ({id: nextTempId(), ...e}));
          const createdOp = createdBlockOpByTempId.get(block.id);
          if (createdOp && createdOp.macroBlock.format === 'key_value') {
            createdOp.macroBlock.entries = entries;
          } else {
            compiledOps.push({
              op: 'set_macro_block',
              macroBlockId: block.id,
              entries,
            });
          }
        } else {
          block.body = cleanedBody;
          const createdOp = createdBlockOpByTempId.get(block.id);
          if (createdOp && createdOp.macroBlock.format === 'prose') {
            createdOp.macroBlock.body = cleanedBody;
          } else {
            compiledOps.push({
              op: 'set_macro_block',
              macroBlockId: block.id,
              body: cleanedBody,
            });
          }
        }
        break;
      }

      case 'insert_block': {
        const rawHeader = typeof op.header === 'string' ? op.header.trim().toUpperCase() : '';
        const rawBody = typeof op.body === 'string' ? op.body : null;
        const afterId =
          op.afterId === null
            ? null
            : typeof op.afterId === 'string' && op.afterId.trim().length > 0
              ? op.afterId.trim()
              : op.afterId === undefined
                ? null
                : '__INVALID__';

        const headerCheck = StagingHeaderSchema.safeParse(rawHeader);
        if (!headerCheck.success || rawBody === null || afterId === '__INVALID__') {
          return fail(
            {
              opIndex: opIdx,
              op: opName,
              code: 'VALIDATION_ERROR',
              message: !headerCheck.success
                ? headerCheck.error.issues[0]?.message ?? 'Invalid Staging header.'
                : 'insert_block requires valid afterId (string | null), uppercase header, and body string.',
            },
            'Provide an uppercase non-reserved Staging header (e.g. "CONTINUITY PROTOCOL"), body string, and afterId (MB# or null).'
          );
        }

        const cleanedBody = stripOuterMarkdownFence(rawBody);
        const leaked = detectLeakedSourceAnnotation(cleanedBody);
        if (leaked) {
          return fail(
            {opIndex: opIdx, op: opName, code: 'VALIDATION_ERROR', message: leaked},
            leaked
          );
        }

        let insertPos = 0;
        let resolvedAfterId: string | null = null;
        if (afterId !== null) {
          const afterIdx = resolveStagingBlockIndex(working.stagingMacroBlocks, afterId);
          if (afterIdx === -1) {
            return fail(
              {
                opIndex: opIdx,
                op: opName,
                code: 'TARGET_NOT_FOUND',
                message: `afterId "${afterId}" not found.`,
              },
              'Use an existing MB# / header name or null to insert at the start.'
            );
          }
          insertPos = afterIdx + 1;
          const anchor = working.stagingMacroBlocks[afterIdx];
          resolvedAfterId = anchor.id.startsWith('__new_') ? `MB${afterIdx}` : anchor.id;
        }

        const header = headerCheck.data;
        const tempId = nextTempId();
        let blockDraft: StagingMacroBlockDraft;
        let materialized: StagingMacroBlockIR;

        if (header === 'AESTHETIC') {
          const entries = parseStagingBodyToEntries(cleanedBody);
          blockDraft = {header: 'AESTHETIC', kind: 'AESTHETIC', format: 'key_value', entries};
          materialized = {
            id: tempId,
            header: 'AESTHETIC',
            kind: 'AESTHETIC',
            format: 'key_value',
            entries: entries.map((e) => ({id: nextTempId(), ...e})),
          };
        } else {
          const probe = toAuteurEnvelope(`[${header}]\n${cleanedBody}`);
          const parsedBlock = probe.document.stagingMacroBlocks[0];
          const kind = parsedBlock?.kind ?? 'CUSTOM';
          blockDraft = {header, kind, format: 'prose', body: cleanedBody};
          materialized = {id: tempId, header, kind, format: 'prose', body: cleanedBody};
        }

        working.stagingMacroBlocks.splice(insertPos, 0, materialized);
        const insertOp: Extract<AuteurPatchOp, {op: 'insert_macro_block'}> = {
          op: 'insert_macro_block',
          afterMacroBlockId: resolvedAfterId,
          macroBlock: blockDraft,
        };
        compiledOps.push(insertOp);
        createdBlockOpByTempId.set(tempId, insertOp);
        break;
      }

      case 'delete_block': {
        const targetId = typeof op.targetId === 'string' ? op.targetId.trim() : '';
        if (!targetId) {
          return fail(
            {
              opIndex: opIdx,
              op: opName,
              code: 'VALIDATION_ERROR',
              message: 'delete_block requires a "targetId" string.',
            },
            'Pass targetId (e.g. "MB3" or header name) to delete_block.'
          );
        }
        const blockIdx = resolveStagingBlockIndex(working.stagingMacroBlocks, targetId);
        if (blockIdx === -1) {
          return fail(
            {
              opIndex: opIdx,
              op: opName,
              code: 'TARGET_NOT_FOUND',
              message: `Staging Macro-Block "${targetId}" not found.`,
            },
            'Check valid MB# IDs in <live_editor_state> or get_script_source.'
          );
        }
        const removed = working.stagingMacroBlocks.splice(blockIdx, 1)[0];
        const createdOp = createdBlockOpByTempId.get(removed.id);
        if (createdOp) {
          const idxInCompiled = compiledOps.indexOf(createdOp);
          if (idxInCompiled !== -1) compiledOps.splice(idxInCompiled, 1);
          createdBlockOpByTempId.delete(removed.id);
        } else {
          compiledOps.push({op: 'delete_macro_block', macroBlockId: removed.id});
        }
        break;
      }

      case 'replace_state': {
        const targetId = typeof op.targetId === 'string' ? op.targetId.trim() : '';
        const rawLine = typeof op.line === 'string' ? op.line : null;
        if (!targetId || rawLine === null) {
          return fail(
            {
              opIndex: opIdx,
              op: opName,
              code: 'VALIDATION_ERROR',
              message: 'replace_state requires "targetId" and "line" strings.',
            },
            'Provide targetId (e.g. "S2") and a single canonical v0.4.0 line.'
          );
        }
        const exec = working.executionMacroBlock;
        if (!exec) {
          return fail(
            {
              opIndex: opIdx,
              op: opName,
              code: 'TARGET_NOT_FOUND',
              message: 'No Execution Macro-Block exists in this document.',
            },
            'Use insert_states with afterId: null to create Execution Macro-States first.'
          );
        }
        const stateIdx = resolveMacroStateIndex(exec.macroStates, targetId);
        if (stateIdx === -1) {
          return fail(
            {
              opIndex: opIdx,
              op: opName,
              code: 'TARGET_NOT_FOUND',
              message: `Macro-State "${targetId}" not found.`,
            },
            'Inspect current S# IDs via get_script_source and target an existing Macro-State.'
          );
        }

        const parsedLine = parseSingleExecutionLine(rawLine, opIdx, opName, ruleOverrides);
        if (!parsedLine.ok) {
          return fail(
            parsedLine.error,
            'Provide a valid single-line v0.4.0 Sub-State chain without "S#:" prefixes.'
          );
        }

        const targetState = exec.macroStates[stateIdx];
        targetState.subStates = parsedLine.subStates.map(
          (sub) => ({...sub, id: nextTempId()}) as SubStateIR
        );

        const createdOp = createdStateOpByTempId.get(targetState.id);
        if (createdOp) {
          createdOp.subStates = parsedLine.subStates;
        } else {
          compiledOps.push({
            op: 'replace_macro_state',
            macroStateId: targetState.id,
            subStates: parsedLine.subStates,
          });
        }
        break;
      }

      case 'insert_states': {
        const rawLines = Array.isArray(op.lines) ? op.lines : null;
        const afterId =
          op.afterId === null
            ? null
            : typeof op.afterId === 'string' && op.afterId.trim().length > 0
              ? op.afterId.trim()
              : op.afterId === undefined
                ? null
                : '__INVALID__';

        if (!rawLines || rawLines.length === 0 || afterId === '__INVALID__') {
          return fail(
            {
              opIndex: opIdx,
              op: opName,
              code: 'VALIDATION_ERROR',
              message: 'insert_states requires non-empty "lines" string[] and "afterId" (string | null).',
            },
            'Pass afterId ("S2" or null) and a non-empty lines array of canonical v0.4.0 lines.'
          );
        }

        const parsedLines: SubStateDraft[][] = [];
        for (let lineIdx = 0; lineIdx < rawLines.length; lineIdx++) {
          const item = rawLines[lineIdx];
          if (typeof item !== 'string') {
            return fail(
              {
                opIndex: opIdx,
                op: opName,
                code: 'VALIDATION_ERROR',
                message: `insert_states.lines[${lineIdx}] must be a string.`,
              },
              'Provide string entries in insert_states.lines[].'
            );
          }
          const parsedLine = parseSingleExecutionLine(item, opIdx, opName, ruleOverrides);
          if (!parsedLine.ok) {
            return fail(
              parsedLine.error,
              `Fix insert_states.lines[${lineIdx}] to be a single valid v0.4.0 line without "S#:" prefixes.`
            );
          }
          parsedLines.push(parsedLine.subStates);
        }

        if (!working.executionMacroBlock) {
          working.executionMacroBlock = {header: 'EXECUTION', macroStates: []};
        }
        const exec = working.executionMacroBlock;

        let insertPos = 0;
        let resolvedAfterId: string | null = null;
        if (afterId !== null) {
          const afterIdx = resolveMacroStateIndex(exec.macroStates, afterId);
          if (afterIdx === -1) {
            return fail(
              {
                opIndex: opIdx,
                op: opName,
                code: 'TARGET_NOT_FOUND',
                message: `afterId "${afterId}" not found.`,
              },
              'Use an existing S# ID or null to insert at the start of [EXECUTION].'
            );
          }
          insertPos = afterIdx + 1;
          const anchor = exec.macroStates[afterIdx];
          resolvedAfterId = anchor.id.startsWith('__new_') ? `S${afterIdx + 1}` : anchor.id;
        }

        const createdStates: Array<{
          state: MacroStateIR;
          op: Extract<AuteurPatchOp, {op: 'insert_macro_state'}>;
        }> = [];
        for (const subStates of parsedLines) {
          const tempId = nextTempId();
          const state: MacroStateIR = {
            id: tempId,
            subStates: subStates.map((sub) => ({...sub, id: nextTempId()}) as SubStateIR),
          };
          const insertOp: Extract<AuteurPatchOp, {op: 'insert_macro_state'}> = {
            op: 'insert_macro_state',
            afterMacroStateId: resolvedAfterId,
            subStates,
          };
          createdStates.push({state, op: insertOp});
          createdStateOpByTempId.set(tempId, insertOp);
        }

        // Update working IR in forward order
        exec.macroStates.splice(
          insertPos,
          0,
          ...createdStates.map((item) => item.state)
        );
        // Emit reverse-ordered ops anchored on the same resolvedAfterId so applyAuteurPatch
        // & projectAuteurPatchPreview place all lines in exact forward order without ID collisions
        for (let k = createdStates.length - 1; k >= 0; k--) {
          compiledOps.push(createdStates[k].op);
        }
        break;
      }

      case 'delete_state': {
        const targetId = typeof op.targetId === 'string' ? op.targetId.trim() : '';
        if (!targetId) {
          return fail(
            {
              opIndex: opIdx,
              op: opName,
              code: 'VALIDATION_ERROR',
              message: 'delete_state requires a "targetId" string.',
            },
            'Pass targetId (e.g. "S3") to delete_state.'
          );
        }
        const exec = working.executionMacroBlock;
        if (!exec) {
          return fail(
            {
              opIndex: opIdx,
              op: opName,
              code: 'TARGET_NOT_FOUND',
              message: 'No Execution Macro-Block exists in this document.',
            },
            'Verify the script has an [EXECUTION] block first.'
          );
        }
        const stateIdx = resolveMacroStateIndex(exec.macroStates, targetId);
        if (stateIdx === -1) {
          return fail(
            {
              opIndex: opIdx,
              op: opName,
              code: 'TARGET_NOT_FOUND',
              message: `Macro-State "${targetId}" not found.`,
            },
            'Inspect current S# IDs via get_script_source and target an existing Macro-State.'
          );
        }

        const removed = exec.macroStates.splice(stateIdx, 1)[0];
        const createdOp = createdStateOpByTempId.get(removed.id);
        if (createdOp) {
          const idxInCompiled = compiledOps.indexOf(createdOp);
          if (idxInCompiled !== -1) compiledOps.splice(idxInCompiled, 1);
          createdStateOpByTempId.delete(removed.id);
        } else {
          compiledOps.push({op: 'delete_macro_state', macroStateId: removed.id});
        }
        break;
      }

      case 'reorder_state': {
        const targetId = typeof op.targetId === 'string' ? op.targetId.trim() : '';
        const afterId =
          op.afterId === null
            ? null
            : typeof op.afterId === 'string' && op.afterId.trim().length > 0
              ? op.afterId.trim()
              : '__INVALID__';
        if (!targetId || afterId === '__INVALID__') {
          return fail(
            {
              opIndex: opIdx,
              op: opName,
              code: 'VALIDATION_ERROR',
              message: 'reorder_state requires "targetId" and "afterId" (string | null).',
            },
            'Pass targetId (e.g. "S4") and afterId (e.g. "S1" or null).'
          );
        }
        const exec = working.executionMacroBlock;
        if (!exec) {
          return fail(
            {
              opIndex: opIdx,
              op: opName,
              code: 'TARGET_NOT_FOUND',
              message: 'No Execution Macro-Block exists in this document.',
            },
            'Verify the script has an [EXECUTION] block first.'
          );
        }
        const fromIdx = resolveMacroStateIndex(exec.macroStates, targetId);
        if (fromIdx === -1) {
          return fail(
            {
              opIndex: opIdx,
              op: opName,
              code: 'TARGET_NOT_FOUND',
              message: `Macro-State "${targetId}" not found.`,
            },
            'Inspect current S# IDs via get_script_source.'
          );
        }

        let resolvedAfterId: string | null = null;
        if (afterId !== null) {
          const anchorIdx = resolveMacroStateIndex(exec.macroStates, afterId);
          if (anchorIdx === -1) {
            return fail(
              {
                opIndex: opIdx,
                op: opName,
                code: 'TARGET_NOT_FOUND',
                message: `afterId "${afterId}" not found.`,
              },
              'Inspect current S# IDs via get_script_source.'
            );
          }
          const anchor = exec.macroStates[anchorIdx];
          if (anchor.id.startsWith('__new_')) {
            return fail(
              {
                opIndex: opIdx,
                op: opName,
                code: 'INVALID_OPERATION',
                message: 'Cannot reorder after a Macro-State inserted in the same batch; insert directly at the target position instead.',
              },
              'Place insert_states directly at the desired position instead of reordering afterward.'
            );
          }
          resolvedAfterId = anchor.id;
        }

        const moved = exec.macroStates[fromIdx];
        if (moved.id.startsWith('__new_')) {
          return fail(
            {
              opIndex: opIdx,
              op: opName,
              code: 'INVALID_OPERATION',
              message: 'Cannot reorder a newly inserted Macro-State in the same batch; insert at the desired position directly.',
            },
            'Pass the desired afterId directly to insert_states.'
          );
        }

        exec.macroStates.splice(fromIdx, 1);
        if (resolvedAfterId === null) {
          exec.macroStates.unshift(moved);
        } else {
          const nextAnchorIdx = exec.macroStates.findIndex((m) => m.id === resolvedAfterId);
          exec.macroStates.splice(nextAnchorIdx + 1, 0, moved);
        }
        compiledOps.push({
          op: 'reorder_macro_states',
          macroStateId: moved.id,
          afterMacroStateId: resolvedAfterId,
        });
        break;
      }

      case 'replace_text': {
        replaceRuleCount += 1;
        if (replaceRuleCount > MAX_REPLACE_RULES_PER_PATCH) {
          return fail(
            {
              opIndex: opIdx,
              op: opName,
              code: 'VALIDATION_ERROR',
              message: `Exceeded maximum ${MAX_REPLACE_RULES_PER_PATCH} replace_text rules per patch.`,
            },
            `Keep replace_text rules to ${MAX_REPLACE_RULES_PER_PATCH} or fewer in a single patch.`
          );
        }

        const find = typeof op.find === 'string' ? op.find : '';
        const replace = typeof op.replace === 'string' ? op.replace : null;
        const isRegex = op.isRegex === true;
        const caseSensitive = op.caseSensitive !== false;
        const wholeWord = op.wholeWord === true;
        const rawFlags = typeof op.flags === 'string' ? op.flags.trim() : '';

        if (find.length === 0 || replace === null) {
          return fail(
            {
              opIndex: opIdx,
              op: opName,
              code: 'VALIDATION_ERROR',
              message: 'replace_text requires non-empty "find" string and "replace" string.',
            },
            'Provide both find (non-empty) and replace (string).'
          );
        }
        if (find.length > MAX_FIND_PATTERN_LENGTH) {
          return fail(
            {
              opIndex: opIdx,
              op: opName,
              code: 'VALIDATION_ERROR',
              message: `replace_text.find exceeds ${MAX_FIND_PATTERN_LENGTH} characters.`,
            },
            'Use a shorter pattern or use set_block / replace_state for full rewrites.'
          );
        }
        if (rawFlags.length > 0 && !ALLOWED_REGEX_FLAGS_PATTERN.test(rawFlags)) {
          return fail(
            {
              opIndex: opIdx,
              op: opName,
              code: 'VALIDATION_ERROR',
              message: `Unsupported regex flags "${rawFlags}". Only g, i, m are allowed.`,
            },
            'Keep only g, i, or m in flags.'
          );
        }

        const targetIds = Array.isArray(op.targetIds)
          ? op.targetIds
              .filter((id): id is string => typeof id === 'string')
              .map((id) => id.trim())
              .filter((id) => id.length > 0)
          : undefined;

        const resolvedTargets = resolveReplaceTextTargets(working, targetIds);
        if (!resolvedTargets.ok) {
          return fail(
            {
              opIndex: opIdx,
              op: opName,
              code: 'TARGET_NOT_FOUND',
              message: `replace_text references unknown targetIds: ${resolvedTargets.notFoundIds.join(', ')}.`,
            },
            'Inspect valid MB# / S# IDs via get_script_source and retry.'
          );
        }

        const patternBody = isRegex ? find : escapeLiteralRegex(find);
        const wrappedPattern = wholeWord ? `\\b(?:${patternBody})\\b` : patternBody;
        const flagSet = new Set<string>(['g']);
        if (!caseSensitive || rawFlags.includes('i')) flagSet.add('i');
        if (rawFlags.includes('m')) flagSet.add('m');
        const finalFlags = Array.from(flagSet).join('');

        let compiledRegex: RegExp;
        try {
          compiledRegex = new RegExp(wrappedPattern, finalFlags);
        } catch (err) {
          return fail(
            {
              opIndex: opIdx,
              op: opName,
              code: 'VALIDATION_ERROR',
              message: `Invalid regex in replace_text: ${err instanceof Error ? err.message : String(err)}`,
            },
            'Fix the regular expression syntax or set isRegex: false for literal matching.'
          );
        }

        const applyToText = (text: string): {nextText: string; matches: number} => {
          if (text.length === 0) return {nextText: text, matches: 0};
          const countRegex = new RegExp(compiledRegex.source, compiledRegex.flags);
          let matches = 0;
          for (const _m of text.matchAll(countRegex)) {
            matches++;
          }
          if (matches === 0) return {nextText: text, matches: 0};
          const replaceRegex = new RegExp(compiledRegex.source, compiledRegex.flags);
          const nextText = isRegex
            ? text.replace(replaceRegex, replace)
            : text.replace(replaceRegex, () => replace);
          return {nextText, matches};
        };

        let ruleMatchCount = 0;
        let ruleChanged = false;

        for (const blockIdx of resolvedTargets.stagingIndices) {
          const block = working.stagingMacroBlocks[blockIdx];
          const currentBody = renderStagingBlockBody(block);
          const {nextText, matches} = applyToText(currentBody);
          if (matches > 0) {
            ruleMatchCount += matches;
            if (nextText !== currentBody) {
              ruleChanged = true;
              if (block.format === 'key_value') {
                const entries = parseStagingBodyToEntries(nextText);
                block.entries = entries.map((e) => ({id: nextTempId(), ...e}));
                const createdOp = createdBlockOpByTempId.get(block.id);
                if (createdOp && createdOp.macroBlock.format === 'key_value') {
                  createdOp.macroBlock.entries = entries;
                } else {
                  compiledOps.push({op: 'set_macro_block', macroBlockId: block.id, entries});
                }
              } else {
                block.body = nextText;
                const createdOp = createdBlockOpByTempId.get(block.id);
                if (createdOp && createdOp.macroBlock.format === 'prose') {
                  createdOp.macroBlock.body = nextText;
                } else {
                  compiledOps.push({op: 'set_macro_block', macroBlockId: block.id, body: nextText});
                }
              }
            }
          }
        }

        const execStates = working.executionMacroBlock?.macroStates ?? [];
        for (let k = resolvedTargets.stateIndices.length - 1; k >= 0; k--) {
          const stateIdx = resolvedTargets.stateIndices[k];
          const ms = execStates[stateIdx];
          if (!ms) continue;
          const currentLine = renderMacroStateLine(ms);
          const {nextText, matches} = applyToText(currentLine);
          if (matches > 0) {
            ruleMatchCount += matches;
            if (nextText !== currentLine) {
              ruleChanged = true;
              if (nextText.trim().length === 0) {
                execStates.splice(stateIdx, 1);
                const createdOp = createdStateOpByTempId.get(ms.id);
                if (createdOp) {
                  const idxInCompiled = compiledOps.indexOf(createdOp);
                  if (idxInCompiled !== -1) compiledOps.splice(idxInCompiled, 1);
                  createdStateOpByTempId.delete(ms.id);
                } else {
                  compiledOps.push({op: 'delete_macro_state', macroStateId: ms.id});
                }
              } else {
                const parsedLine = parseSingleExecutionLine(nextText, opIdx, opName, ruleOverrides);
                if (!parsedLine.ok) {
                  return fail(
                    parsedLine.error,
                    `replace_text produced an invalid Execution line on ${ms.id}.`
                  );
                }
                ms.subStates = parsedLine.subStates.map(
                  (sub) => ({...sub, id: nextTempId()}) as SubStateIR
                );
                const createdOp = createdStateOpByTempId.get(ms.id);
                if (createdOp) {
                  createdOp.subStates = parsedLine.subStates;
                } else {
                  compiledOps.push({
                    op: 'replace_macro_state',
                    macroStateId: ms.id,
                    subStates: parsedLine.subStates,
                  });
                }
              }
            }
          }
        }

        totalReplaceMatches += ruleMatchCount;
        if (ruleMatchCount === 0 || !ruleChanged) {
          return fail(
            {
              opIndex: opIdx,
              op: opName,
              code: 'VALIDATION_ERROR',
              message:
                ruleMatchCount === 0
                  ? `replace_text found no matches for "${find}".`
                  : `replace_text matched "${find}" but produced no net changes.`,
            },
            'Read the exact current wording via get_script_source (or adjust find, caseSensitive, wholeWord, or targetIds) and retry.'
          );
        }
        break;
      }

      default:
        return fail(
          {
            opIndex: opIdx,
            op: opName || undefined,
            code: 'VALIDATION_ERROR',
            message: `Unknown patch op "${opName}".`,
          },
          'Use only supported ops: set_block, insert_block, delete_block, replace_state, insert_states, delete_state, reorder_state, replace_text.'
        );
    }
  }

  if (compiledOps.length === 0) {
    return fail(
      {
        code: 'VALIDATION_ERROR',
        message: 'Patch produced no net operations (for example, inserting and deleting the same item).',
      },
      'Submit at least one net edit operation.'
    );
  }

  return {
    ok: true,
    patch: {
      ...(expectedSnapshotHash ? {expectedSnapshotHash} : {}),
      ...(summary ? {summary} : {}),
      ops: compiledOps,
    },
    ...(totalReplaceMatches > 0 ? {matchCount: totalReplaceMatches} : {}),
  };
}
