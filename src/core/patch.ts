import {parseAestheticLine, parseAestheticTokenSegment} from './aesthetic.ts';
import {fromAuteurIR, renderSubState, toAuteurEnvelope} from './ir.ts';
import {
  AuteurPatchSchema,
  type AestheticEntryDraft,
  type AuteurEnvelope,
  type AuteurPatch,
  type AuteurPatchOp,
  type AuteurScriptIR,
  type DerivedDiagnosticIR,
  type MacroStateIR,
  type StagingMacroBlockDraft,
  type StagingMacroBlockIR,
  type SubStateDraft,
  type SubStateIR,
} from './irSchemas.ts';
import {classifyMacroBlock, normalizeLineEndings} from './parser.ts';

export interface ApplyPatchOptions {
  /** When true, rejects patches that introduce new severity='error' Script Supervisor diagnostics */
  rejectOnNewErrors?: boolean;
}

export interface PatchError {
  opIndex?: number;
  op?: string;
  code:
    | 'VALIDATION_ERROR'
    | 'SNAPSHOT_MISMATCH'
    | 'TARGET_NOT_FOUND'
    | 'INVALID_OPERATION'
    | 'LINT_ERROR_INTRODUCED';
  path?: string;
  message: string;
}

export interface PatchApplyResult {
  ok: boolean;
  /** Canonical v0.4.0 plain text when applied (unchanged rawText when rejected before compilation) */
  nextRawText: string;
  /** Candidate compiled plain text even when rejected by rejectOnNewErrors, useful for self-repair */
  candidateRawText?: string;
  nextEnvelope?: AuteurEnvelope;
  appliedOpsCount: number;
  diagnosticsBefore: DerivedDiagnosticIR[];
  diagnosticsAfter: DerivedDiagnosticIR[];
  introducedErrors: DerivedDiagnosticIR[];
  introducedWarnings: DerivedDiagnosticIR[];
  resolvedDiagnostics: DerivedDiagnosticIR[];
  errors: PatchError[];
}

function normalizeDiagnosticMessage(message: string): string {
  return message.replace(/(?<![@\[A-Za-z0-9_-])S\d+(?![A-Za-z0-9_\]-])/g, 'S#');
}

function diagnosticSignature(d: DerivedDiagnosticIR, originTargetId = d.targetId): string {
  return `${originTargetId}::${d.ruleId}::${d.severity}::${normalizeDiagnosticMessage(d.message)}`;
}

/**
 * Maps each post-compilation snapshot ID (`MB#`, `S#`) back to its pre-patch origin ID
 * (`MB#`/`S#` for surviving nodes, or `__new_*` for newly inserted nodes) so beat or block
 * index shifts never cause false `LINT_ERROR_INTRODUCED` rejections or false resolutions.
 */
function buildAfterToOriginTargetMap(working: AuteurScriptIR): Map<string, string> {
  const map = new Map<string, string>();

  working.stagingMacroBlocks.forEach((block, idx) => {
    map.set(`MB${idx}`, block.id);
  });

  if (working.executionMacroBlock) {
    let beatIdx = 0;
    for (const ms of working.executionMacroBlock.macroStates) {
      const renderedLine = ms.subStates
        .map((sub) => renderSubState(sub))
        .filter((segment) => segment.length > 0)
        .join(' -> ');
      if (renderedLine.length > 0) {
        beatIdx += 1;
        map.set(`S${beatIdx}`, ms.id);
      }
    }
  }

  return map;
}

function diffDiagnostics(
  diagnosticsBefore: DerivedDiagnosticIR[],
  diagnosticsAfter: DerivedDiagnosticIR[],
  afterToOriginTargetId: Map<string, string>
): {
  introduced: DerivedDiagnosticIR[];
  resolved: DerivedDiagnosticIR[];
} {
  const beforeCounts = new Map<string, number>();
  for (const d of diagnosticsBefore) {
    const sig = diagnosticSignature(d);
    beforeCounts.set(sig, (beforeCounts.get(sig) ?? 0) + 1);
  }

  const remainingBefore = new Map(beforeCounts);
  const introduced: DerivedDiagnosticIR[] = [];
  const afterCounts = new Map<string, number>();

  for (const d of diagnosticsAfter) {
    const originId = afterToOriginTargetId.get(d.targetId) ?? d.targetId;
    const sig = diagnosticSignature(d, originId);
    afterCounts.set(sig, (afterCounts.get(sig) ?? 0) + 1);

    const prevCount = remainingBefore.get(sig) ?? 0;
    if (prevCount > 0) {
      remainingBefore.set(sig, prevCount - 1);
    } else {
      introduced.push(d);
    }
  }

  const remainingAfter = new Map(afterCounts);
  const resolved: DerivedDiagnosticIR[] = [];
  for (const d of diagnosticsBefore) {
    const sig = diagnosticSignature(d);
    const nextCount = remainingAfter.get(sig) ?? 0;
    if (nextCount > 0) {
      remainingAfter.set(sig, nextCount - 1);
    } else {
      resolved.push(d);
    }
  }

  return {introduced, resolved};
}

function cloneIR(ir: AuteurScriptIR): AuteurScriptIR {
  return {
    schemaVersion: ir.schemaVersion,
    preamble: [...ir.preamble],
    stagingMacroBlocks: ir.stagingMacroBlocks.map((block) =>
      block.format === 'key_value'
        ? {
            ...block,
            entries: block.entries.map((e) => ({...e})),
          }
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

function materializeSubState(draft: SubStateDraft, tempId: string): SubStateIR {
  return {
    ...draft,
    id: draft.id ?? tempId,
  } as SubStateIR;
}

function materializeStagingBlock(
  draft: StagingMacroBlockDraft,
  tempId: string,
  nextId: () => string
): StagingMacroBlockIR {
  const header = draft.header.trim().toUpperCase();
  if (draft.format === 'key_value') {
    return {
      id: draft.id ?? tempId,
      header,
      kind: 'AESTHETIC',
      format: 'key_value',
      entries: draft.entries.map((entry) => ({
        id: entry.id ?? nextId(),
        key: entry.key,
        value: entry.value,
      })),
    };
  }

  const inferredKind = classifyMacroBlock(header);
  return {
    id: draft.id ?? tempId,
    header,
    kind: draft.kind ?? (inferredKind === 'EXECUTION' ? 'CUSTOM' : inferredKind),
    format: 'prose',
    body: draft.body,
  };
}

function findStagingBlockIndex(
  blocks: StagingMacroBlockIR[],
  macroBlockId?: string,
  header?: string
): number {
  if (macroBlockId) {
    return blocks.findIndex((b) => b.id === macroBlockId);
  }
  if (header) {
    const upper = header.trim().toUpperCase();
    return blocks.findIndex((b) => b.header.toUpperCase() === upper);
  }
  return -1;
}

function ensureAestheticBlock(
  working: AuteurScriptIR,
  nextId: () => string
): Extract<StagingMacroBlockIR, {format: 'key_value'}> {
  const existing = working.stagingMacroBlocks.find(
    (b): b is Extract<StagingMacroBlockIR, {format: 'key_value'}> => b.format === 'key_value'
  );
  if (existing) return existing;

  const created: Extract<StagingMacroBlockIR, {format: 'key_value'}> = {
    id: nextId(),
    header: 'AESTHETIC',
    kind: 'AESTHETIC',
    format: 'key_value',
    entries: [],
  };
  working.stagingMacroBlocks.push(created);
  return created;
}

function ensureExecutionMacroBlock(working: AuteurScriptIR) {
  if (!working.executionMacroBlock) {
    working.executionMacroBlock = {
      header: 'EXECUTION',
      macroStates: [],
    };
  }
  return working.executionMacroBlock;
}

function applySingleOp(
  working: AuteurScriptIR,
  op: AuteurPatchOp,
  opIndex: number,
  nextId: () => string
): PatchError | null {
  switch (op.op) {
    case 'set_macro_block': {
      const idx = findStagingBlockIndex(working.stagingMacroBlocks, op.macroBlockId, op.header);
      if (idx === -1) {
        return {
          opIndex,
          op: op.op,
          code: 'TARGET_NOT_FOUND',
          message: `Staging Macro-Block not found (${op.macroBlockId ?? op.header}).`,
        };
      }
      const target = working.stagingMacroBlocks[idx];
      if (target.format === 'key_value') {
        if (op.entries !== undefined) {
          target.entries = op.entries.map((entry: AestheticEntryDraft) => ({
            id: entry.id ?? nextId(),
            key: entry.key,
            value: entry.value,
          }));
        } else if (op.body !== undefined) {
          const lines = normalizeLineEndings(op.body).split('\n');
          target.entries = lines.map((line) => {
            const parsed = parseAestheticLine(line);
            return parsed.type === 'kv'
              ? {id: nextId(), key: parsed.key, value: parsed.value}
              : {id: nextId(), key: null, value: parsed.raw};
          });
        }
      } else {
        if (op.body === undefined) {
          return {
            opIndex,
            op: op.op,
            code: 'INVALID_OPERATION',
            message: `Macro-Block [${target.header}] is prose format and requires a "body" string.`,
          };
        }
        target.body = op.body;
      }
      return null;
    }

    case 'insert_macro_block': {
      const materialized = materializeStagingBlock(op.macroBlock, nextId(), nextId);
      if (op.afterMacroBlockId === null) {
        working.stagingMacroBlocks.unshift(materialized);
        return null;
      }
      const afterIdx = working.stagingMacroBlocks.findIndex((b) => b.id === op.afterMacroBlockId);
      if (afterIdx === -1) {
        return {
          opIndex,
          op: op.op,
          code: 'TARGET_NOT_FOUND',
          message: `afterMacroBlockId "${op.afterMacroBlockId}" not found.`,
        };
      }
      working.stagingMacroBlocks.splice(afterIdx + 1, 0, materialized);
      return null;
    }

    case 'delete_macro_block': {
      const idx = findStagingBlockIndex(working.stagingMacroBlocks, op.macroBlockId, op.header);
      if (idx === -1) {
        return {
          opIndex,
          op: op.op,
          code: 'TARGET_NOT_FOUND',
          message: `Staging Macro-Block not found (${op.macroBlockId ?? op.header}).`,
        };
      }
      working.stagingMacroBlocks.splice(idx, 1);
      return null;
    }

    case 'set_aesthetic_entry': {
      const aesthetic = ensureAestheticBlock(working, nextId);
      if (op.entryId) {
        const entry = aesthetic.entries.find((e) => e.id === op.entryId);
        if (!entry) {
          return {
            opIndex,
            op: op.op,
            code: 'TARGET_NOT_FOUND',
            message: `[AESTHETIC] entry "${op.entryId}" not found.`,
          };
        }
        if (op.key !== undefined) {
          entry.key = op.key.trim();
        }
        entry.value = op.value;
        return null;
      }

      const targetKey = op.key!.trim();
      const existing = aesthetic.entries.find(
        (e) => e.key !== null && e.key.toLowerCase() === targetKey.toLowerCase()
      );
      if (existing) {
        existing.value = op.value;
      } else {
        aesthetic.entries.push({
          id: nextId(),
          key: targetKey,
          value: op.value,
        });
      }
      return null;
    }

    case 'delete_aesthetic_entry': {
      const aesthetic = working.stagingMacroBlocks.find(
        (b): b is Extract<StagingMacroBlockIR, {format: 'key_value'}> => b.format === 'key_value'
      );
      if (!aesthetic) {
        return {
          opIndex,
          op: op.op,
          code: 'TARGET_NOT_FOUND',
          message: 'No [AESTHETIC] Macro-Block exists in this document.',
        };
      }
      const idx = op.entryId
        ? aesthetic.entries.findIndex((e) => e.id === op.entryId)
        : aesthetic.entries.findIndex(
            (e) => e.key !== null && e.key.toLowerCase() === op.key!.trim().toLowerCase()
          );

      if (idx === -1) {
        return {
          opIndex,
          op: op.op,
          code: 'TARGET_NOT_FOUND',
          message: `[AESTHETIC] entry not found (${op.entryId ?? op.key}).`,
        };
      }
      aesthetic.entries.splice(idx, 1);
      return null;
    }

    case 'upsert_token_mapping': {
      const aesthetic = ensureAestheticBlock(working, nextId);
      const category = op.category.trim();
      const description = op.description.trim();
      const token = op.token.trim();
      const formattedSegment = `${description} -> ${token}`;

      // First check if token already exists in any entry; if found in same category, update in place;
      // if found in a different category, remove old occurrence before inserting into target category.
      for (let i = aesthetic.entries.length - 1; i >= 0; i--) {
        const entry = aesthetic.entries[i];
        const segments = entry.value
          .split(';')
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        const matchIdx = segments.findIndex((seg) => {
          const parsed = parseAestheticTokenSegment(seg);
          return parsed !== null && parsed.token === token;
        });

        if (matchIdx !== -1) {
          if (entry.key !== null && entry.key.toLowerCase() === category.toLowerCase()) {
            segments[matchIdx] = formattedSegment;
            entry.value = segments.join('; ');
            return null;
          } else {
            segments.splice(matchIdx, 1);
            if (segments.length === 0) {
              aesthetic.entries.splice(i, 1);
            } else {
              entry.value = segments.join('; ');
            }
          }
        }
      }

      const targetEntry = aesthetic.entries.find(
        (e) => e.key !== null && e.key.toLowerCase() === category.toLowerCase()
      );
      if (targetEntry) {
        const trimmed = targetEntry.value.trim();
        targetEntry.value = trimmed.length > 0 ? `${trimmed}; ${formattedSegment}` : formattedSegment;
      } else {
        aesthetic.entries.push({
          id: nextId(),
          key: category,
          value: formattedSegment,
        });
      }
      return null;
    }

    case 'delete_token_mapping': {
      const aesthetic = working.stagingMacroBlocks.find(
        (b): b is Extract<StagingMacroBlockIR, {format: 'key_value'}> => b.format === 'key_value'
      );
      if (!aesthetic) {
        return {
          opIndex,
          op: op.op,
          code: 'TARGET_NOT_FOUND',
          message: 'No [AESTHETIC] Macro-Block exists in this document.',
        };
      }

      const token = op.token.trim();
      let found = false;

      for (let i = aesthetic.entries.length - 1; i >= 0; i--) {
        const entry = aesthetic.entries[i];
        const segments = entry.value
          .split(';')
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        const nextSegments = segments.filter((seg) => {
          const parsed = parseAestheticTokenSegment(seg);
          if (parsed !== null && parsed.token === token) {
            found = true;
            return false;
          }
          return true;
        });

        if (nextSegments.length !== segments.length) {
          if (nextSegments.length === 0) {
            aesthetic.entries.splice(i, 1);
          } else {
            entry.value = nextSegments.join('; ');
          }
        }
      }

      if (!found) {
        return {
          opIndex,
          op: op.op,
          code: 'TARGET_NOT_FOUND',
          message: `Token mapping "${token}" not found in [AESTHETIC].`,
        };
      }
      return null;
    }

    case 'replace_macro_state': {
      const exec = working.executionMacroBlock;
      if (!exec) {
        return {
          opIndex,
          op: op.op,
          code: 'TARGET_NOT_FOUND',
          message: 'No Execution Macro-Block exists in this document.',
        };
      }
      const ms = exec.macroStates.find((m) => m.id === op.macroStateId);
      if (!ms) {
        return {
          opIndex,
          op: op.op,
          code: 'TARGET_NOT_FOUND',
          message: `Macro-State "${op.macroStateId}" not found.`,
        };
      }
      ms.subStates = op.subStates.map((sub) => materializeSubState(sub, nextId()));
      return null;
    }

    case 'insert_macro_state': {
      const exec = ensureExecutionMacroBlock(working);
      const created: MacroStateIR = {
        id: nextId(),
        subStates: op.subStates.map((sub) => materializeSubState(sub, nextId())),
      };
      if (op.afterMacroStateId === null) {
        exec.macroStates.unshift(created);
        return null;
      }
      const afterIdx = exec.macroStates.findIndex((m) => m.id === op.afterMacroStateId);
      if (afterIdx === -1) {
        return {
          opIndex,
          op: op.op,
          code: 'TARGET_NOT_FOUND',
          message: `afterMacroStateId "${op.afterMacroStateId}" not found.`,
        };
      }
      exec.macroStates.splice(afterIdx + 1, 0, created);
      return null;
    }

    case 'delete_macro_state': {
      const exec = working.executionMacroBlock;
      if (!exec) {
        return {
          opIndex,
          op: op.op,
          code: 'TARGET_NOT_FOUND',
          message: 'No Execution Macro-Block exists in this document.',
        };
      }
      const idx = exec.macroStates.findIndex((m) => m.id === op.macroStateId);
      if (idx === -1) {
        return {
          opIndex,
          op: op.op,
          code: 'TARGET_NOT_FOUND',
          message: `Macro-State "${op.macroStateId}" not found.`,
        };
      }
      exec.macroStates.splice(idx, 1);
      return null;
    }

    case 'reorder_macro_states': {
      const exec = working.executionMacroBlock;
      if (!exec) {
        return {
          opIndex,
          op: op.op,
          code: 'TARGET_NOT_FOUND',
          message: 'No Execution Macro-Block exists in this document.',
        };
      }
      if (op.afterMacroStateId === op.macroStateId) {
        return null;
      }
      const fromIdx = exec.macroStates.findIndex((m) => m.id === op.macroStateId);
      if (fromIdx === -1) {
        return {
          opIndex,
          op: op.op,
          code: 'TARGET_NOT_FOUND',
          message: `Macro-State "${op.macroStateId}" not found.`,
        };
      }
      if (
        op.afterMacroStateId !== null &&
        !exec.macroStates.some((m) => m.id === op.afterMacroStateId)
      ) {
        return {
          opIndex,
          op: op.op,
          code: 'TARGET_NOT_FOUND',
          message: `afterMacroStateId "${op.afterMacroStateId}" not found.`,
        };
      }

      const [moved] = exec.macroStates.splice(fromIdx, 1);
      if (op.afterMacroStateId === null) {
        exec.macroStates.unshift(moved);
      } else {
        const anchorIdx = exec.macroStates.findIndex((m) => m.id === op.afterMacroStateId);
        exec.macroStates.splice(anchorIdx + 1, 0, moved);
      }
      return null;
    }

    case 'replace_sub_state': {
      const exec = working.executionMacroBlock;
      if (!exec) {
        return {
          opIndex,
          op: op.op,
          code: 'TARGET_NOT_FOUND',
          message: 'No Execution Macro-Block exists in this document.',
        };
      }
      for (const ms of exec.macroStates) {
        const subIdx = ms.subStates.findIndex((s) => s.id === op.subStateId);
        if (subIdx !== -1) {
          ms.subStates[subIdx] = materializeSubState(op.subState, op.subStateId);
          return null;
        }
      }
      return {
        opIndex,
        op: op.op,
        code: 'TARGET_NOT_FOUND',
        message: `Sub-State "${op.subStateId}" not found.`,
      };
    }

    case 'insert_sub_state': {
      const exec = working.executionMacroBlock;
      if (!exec) {
        return {
          opIndex,
          op: op.op,
          code: 'TARGET_NOT_FOUND',
          message: 'No Execution Macro-Block exists in this document.',
        };
      }
      const ms = exec.macroStates.find((m) => m.id === op.macroStateId);
      if (!ms) {
        return {
          opIndex,
          op: op.op,
          code: 'TARGET_NOT_FOUND',
          message: `Macro-State "${op.macroStateId}" not found.`,
        };
      }
      const created = materializeSubState(op.subState, nextId());
      if (op.afterSubStateId === null) {
        ms.subStates.unshift(created);
        return null;
      }
      const afterIdx = ms.subStates.findIndex((s) => s.id === op.afterSubStateId);
      if (afterIdx === -1) {
        return {
          opIndex,
          op: op.op,
          code: 'TARGET_NOT_FOUND',
          message: `afterSubStateId "${op.afterSubStateId}" not found in Macro-State "${op.macroStateId}".`,
        };
      }
      ms.subStates.splice(afterIdx + 1, 0, created);
      return null;
    }

    case 'delete_sub_state': {
      const exec = working.executionMacroBlock;
      if (!exec) {
        return {
          opIndex,
          op: op.op,
          code: 'TARGET_NOT_FOUND',
          message: 'No Execution Macro-Block exists in this document.',
        };
      }
      for (let msIdx = 0; msIdx < exec.macroStates.length; msIdx++) {
        const ms = exec.macroStates[msIdx];
        const subIdx = ms.subStates.findIndex((s) => s.id === op.subStateId);
        if (subIdx !== -1) {
          ms.subStates.splice(subIdx, 1);
          if (ms.subStates.length === 0) {
            exec.macroStates.splice(msIdx, 1);
          }
          return null;
        }
      }
      return {
        opIndex,
        op: op.op,
        code: 'TARGET_NOT_FOUND',
        message: `Sub-State "${op.subStateId}" not found.`,
      };
    }
  }
}

/**
 * Applies a Zod-validated semantic AuteurPatch transactionally against canonical plain text.
 * Resolves all snapshot IDs (MB#, MB#.#, S#, S#.#) without index drift across multi-op batches,
 * compiles deterministically to canonical v0.4.0 plain text, and evaluates Script Supervisor diagnostics.
 */
export function applyAuteurPatch(
  rawText: string,
  patchInput: AuteurPatch | unknown,
  options?: ApplyPatchOptions
): PatchApplyResult {
  const beforeEnvelope = toAuteurEnvelope(rawText);
  const diagnosticsBefore = beforeEnvelope.derived.diagnostics;

  const parsed = AuteurPatchSchema.safeParse(patchInput);
  if (!parsed.success) {
    return {
      ok: false,
      nextRawText: rawText,
      appliedOpsCount: 0,
      diagnosticsBefore,
      diagnosticsAfter: diagnosticsBefore,
      introducedErrors: [],
      introducedWarnings: [],
      resolvedDiagnostics: [],
      errors: parsed.error.issues.map((issue) => ({
        code: 'VALIDATION_ERROR',
        path: issue.path.join('.'),
        message: issue.message,
      })),
    };
  }

  const patch = parsed.data;

  if (patch.expectedSnapshotHash && patch.expectedSnapshotHash !== beforeEnvelope.snapshotHash) {
    return {
      ok: false,
      nextRawText: rawText,
      appliedOpsCount: 0,
      diagnosticsBefore,
      diagnosticsAfter: diagnosticsBefore,
      introducedErrors: [],
      introducedWarnings: [],
      resolvedDiagnostics: [],
      errors: [
        {
          code: 'SNAPSHOT_MISMATCH',
          message: `Snapshot hash mismatch: expected "${patch.expectedSnapshotHash}", actual "${beforeEnvelope.snapshotHash}".`,
        },
      ],
    };
  }

  const working = cloneIR(beforeEnvelope.document);
  let tempCounter = 0;
  const nextId = () => `__new_${tempCounter++}`;

  for (let i = 0; i < patch.ops.length; i++) {
    const err = applySingleOp(working, patch.ops[i], i, nextId);
    if (err) {
      return {
        ok: false,
        nextRawText: rawText,
        appliedOpsCount: 0,
        diagnosticsBefore,
        diagnosticsAfter: diagnosticsBefore,
        introducedErrors: [],
        introducedWarnings: [],
        resolvedDiagnostics: [],
        errors: [err],
      };
    }
  }

  const afterToOriginTargetId = buildAfterToOriginTargetMap(working);
  const candidateRawText = fromAuteurIR(working);
  const nextEnvelope = toAuteurEnvelope(candidateRawText);
  const diagnosticsAfter = nextEnvelope.derived.diagnostics;

  const {introduced, resolved: resolvedDiagnostics} = diffDiagnostics(
    diagnosticsBefore,
    diagnosticsAfter,
    afterToOriginTargetId
  );
  const introducedErrors = introduced.filter((d) => d.severity === 'error');
  const introducedWarnings = introduced.filter((d) => d.severity === 'warning');

  if (options?.rejectOnNewErrors && introducedErrors.length > 0) {
    return {
      ok: false,
      nextRawText: rawText,
      candidateRawText,
      nextEnvelope,
      appliedOpsCount: 0,
      diagnosticsBefore,
      diagnosticsAfter,
      introducedErrors,
      introducedWarnings,
      resolvedDiagnostics,
      errors: introducedErrors.map((d) => ({
        code: 'LINT_ERROR_INTRODUCED',
        path: d.targetId,
        message: `[${d.ruleId}] ${d.message} ${d.repairHint}`,
      })),
    };
  }

  return {
    ok: true,
    nextRawText: candidateRawText,
    candidateRawText,
    nextEnvelope,
    appliedOpsCount: patch.ops.length,
    diagnosticsBefore,
    diagnosticsAfter,
    introducedErrors,
    introducedWarnings,
    resolvedDiagnostics,
    errors: [],
  };
}
