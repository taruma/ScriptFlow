import type {AuteurEnvelope, AuteurPatchOp} from '../irSchemas.ts';
import type {LintRuleOverrides} from '../types.ts';

export interface ApplyPatchOptions {
  /** When true, rejects patches that introduce new severity='error' Script Supervisor diagnostics */
  rejectOnNewErrors?: boolean;
  /** Optional per-rule Script Supervisor severity overrides applied during pre- and post-patch linting */
  ruleOverrides?: LintRuleOverrides;
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
  diagnosticsBefore: AuteurEnvelope['derived']['diagnostics'];
  diagnosticsAfter: AuteurEnvelope['derived']['diagnostics'];
  introducedErrors: AuteurEnvelope['derived']['diagnostics'];
  introducedWarnings: AuteurEnvelope['derived']['diagnostics'];
  resolvedDiagnostics: AuteurEnvelope['derived']['diagnostics'];
  errors: PatchError[];
}

export function createOpError(
  opIndex: number,
  op: AuteurPatchOp['op'],
  code: Extract<PatchError['code'], 'TARGET_NOT_FOUND' | 'INVALID_OPERATION'>,
  message: string
): PatchError {
  return {
    opIndex,
    op,
    code,
    message,
  };
}
