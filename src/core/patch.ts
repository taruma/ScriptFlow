import {fromAuteurIR, toAuteurEnvelope} from './ir.ts';
import {AuteurPatchSchema, type AuteurPatch} from './irSchemas.ts';
import {applySingleOp} from './patch/applyOp.ts';
import {buildAfterToOriginTargetMap, diffDiagnostics} from './patch/diagnostics.ts';
import {cloneIR} from './patch/irHelpers.ts';
import type {ApplyPatchOptions, PatchApplyResult} from './patch/types.ts';

export type {ApplyPatchOptions, PatchApplyResult, PatchError} from './patch/types.ts';
export {
  projectAuteurPatchPreview,
  type ExecutionPatchPreviewChange,
  type ExecutionPatchPreviewInsertion,
  type PatchPreviewProjection,
  type StagingPatchPreviewChange,
  type StagingPatchPreviewInsertion,
} from './patch/preview.ts';

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
  const beforeEnvelope = toAuteurEnvelope(rawText, options?.ruleOverrides);
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
  const nextEnvelope = toAuteurEnvelope(candidateRawText, options?.ruleOverrides);
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
