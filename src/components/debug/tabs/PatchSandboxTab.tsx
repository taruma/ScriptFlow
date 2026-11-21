import {useCallback, useEffect, type Dispatch, type SetStateAction} from 'react';
import {AlertCircle, Play} from 'lucide-react';
import {
  applyAuteurPatch,
  type AuteurEnvelope,
  type LintRuleOverrides,
  type PatchApplyResult,
} from '../../../core/index.ts';
import {UI_LABELS} from '../../../ui/labels.ts';
import {UI_TOKENS} from '../../../ui/tokens/ui.ts';
import {
  buildActionEditSample,
  buildLintGateSample,
  buildTokenMappingSample,
} from '../debugSamples.ts';

export interface PatchSandboxState {
  patchText: string;
  rejectOnNewErrors: boolean;
  patchResult: PatchApplyResult | null;
  patchParseError: string | null;
}

export const INITIAL_PATCH_SANDBOX_STATE: PatchSandboxState = {
  patchText: '',
  rejectOnNewErrors: true,
  patchResult: null,
  patchParseError: null,
};

export interface PatchSandboxTabProps {
  envelope: AuteurEnvelope;
  rawText: string;
  readOnly: boolean;
  ruleOverrides?: LintRuleOverrides;
  onCommitRawText: (nextRawText: string, toastMessage?: string) => void;
  state: PatchSandboxState;
  setState: Dispatch<SetStateAction<PatchSandboxState>>;
}

export function PatchSandboxTab({
  envelope,
  rawText,
  readOnly,
  ruleOverrides,
  onCommitRawText,
  state,
  setState,
}: PatchSandboxTabProps) {
  useEffect(() => {
    if (state.patchText.trim().length === 0) {
      setState((prev) => ({
        ...prev,
        patchText: buildActionEditSample(envelope),
      }));
    }
  }, [state.patchText, envelope, setState]);

  const runPatch = useCallback(
    (commit: boolean) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(state.patchText);
      } catch (err) {
        setState((prev) => ({
          ...prev,
          patchResult: null,
          patchParseError:
            err instanceof Error ? err.message : UI_LABELS.debug.invalidJsonSyntax,
        }));
        return;
      }

      const result = applyAuteurPatch(rawText, parsed, {
        rejectOnNewErrors: state.rejectOnNewErrors,
        ruleOverrides,
      });
      setState((prev) => ({
        ...prev,
        patchParseError: null,
        patchResult: result,
      }));

      if (commit && !readOnly && result.ok) {
        onCommitRawText(result.nextRawText, UI_LABELS.debug.patch.committedToast);
      }
    },
    [state.patchText, state.rejectOnNewErrors, rawText, ruleOverrides, readOnly, onCommitRawText, setState]
  );

  const loadSample = useCallback(
    (nextPatchText: string) => {
      setState((prev) => ({
        ...prev,
        patchText: nextPatchText,
        patchResult: null,
        patchParseError: null,
      }));
    },
    [setState]
  );

  return (
    <div className="h-full grid grid-cols-1 md:grid-cols-2 min-h-0">
      {/* Left Patch Input */}
      <div className="flex flex-col min-h-0 border-b md:border-b-0 md:border-r border-border-main bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-border-subtle bg-surface-subtle shrink-0">
          <span className={UI_TOKENS.layout.sectionTitleMini}>
            {UI_LABELS.debug.patch.inputHeading}
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => loadSample(buildActionEditSample(envelope))}
              className={UI_TOKENS.button.actionPill}
            >
              {UI_LABELS.debug.patch.sampleEditAction}
            </button>
            <button
              type="button"
              onClick={() => loadSample(buildTokenMappingSample(envelope.snapshotHash))}
              className={UI_TOKENS.button.actionPill}
            >
              {UI_LABELS.debug.patch.sampleTokenMapping}
            </button>
            <button
              type="button"
              onClick={() => loadSample(buildLintGateSample(envelope))}
              className={UI_TOKENS.button.actionPill}
            >
              {UI_LABELS.debug.patch.sampleLintFail}
            </button>
          </div>
        </div>

        <textarea
          value={state.patchText}
          onChange={(e) => {
            const nextVal = e.target.value;
            setState((prev) => ({...prev, patchText: nextVal}));
          }}
          data-native-undo="true"
          spellCheck={false}
          aria-label={UI_LABELS.debug.patch.inputHeading}
          placeholder={UI_LABELS.debug.patch.placeholder}
          className="flex-1 w-full resize-none bg-surface p-4 font-mono text-xs leading-relaxed text-text-body focus:outline-none"
        />

        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-t border-border-subtle bg-surface-subtle shrink-0">
          <label className="flex items-center gap-2 text-xs text-text-body cursor-pointer">
            <input
              type="checkbox"
              checked={state.rejectOnNewErrors}
              onChange={(e) => {
                const checked = e.target.checked;
                setState((prev) => ({...prev, rejectOnNewErrors: checked}));
              }}
            />
            <span>{UI_LABELS.debug.patch.rejectOnNewErrors}</span>
          </label>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => runPatch(false)}
              className={UI_TOKENS.button.secondary}
            >
              <span className="inline-flex items-center gap-1.5">
                <Play className="h-3.5 w-3.5" />
                <span>{UI_LABELS.debug.patch.dryRun}</span>
              </span>
            </button>
            <button
              type="button"
              disabled={readOnly}
              title={readOnly ? UI_LABELS.debug.readOnlyCommitHint : undefined}
              onClick={() => runPatch(true)}
              className={`${UI_TOKENS.button.primary} disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {UI_LABELS.debug.patch.commitToEditor}
            </button>
          </div>
        </div>
      </div>

      {/* Right Patch Result */}
      <div className="flex flex-col min-h-0 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-subtle bg-surface-subtle shrink-0">
          <span className={UI_TOKENS.layout.sectionTitleMini}>
            {UI_LABELS.debug.patch.resultHeading}
          </span>
          {state.patchResult && (
            <span
              className={`font-mono text-[10px] px-2 py-0.5 rounded-md border ${
                state.patchResult.ok
                  ? 'auteur-phase-aesthetic'
                  : 'border-red-500/40 bg-red-500/10 text-red-500'
              }`}
            >
              {state.patchResult.ok
                ? UI_LABELS.debug.patch.statusOk(state.patchResult.appliedOpsCount)
                : UI_LABELS.debug.patch.statusRejected(
                    state.patchResult.errors[0]?.code ?? UI_LABELS.debug.patch.fallbackErrorCode
                  )}
            </span>
          )}
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-4">
          {state.patchParseError && (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-500 font-mono">
              {UI_LABELS.debug.jsonParseErrorPrefix}
              {state.patchParseError}
            </div>
          )}

          {!state.patchParseError && !state.patchResult && (
            <p className="text-xs text-text-muted">
              {UI_LABELS.debug.patch.emptyHintLead}{' '}
              <code className="font-mono">{UI_LABELS.debug.patch.emptyHintType}</code>{' '}
              {UI_LABELS.debug.patch.emptyHintMid}{' '}
              <strong>{UI_LABELS.debug.patch.dryRun}</strong>{' '}
              {UI_LABELS.debug.patch.emptyHintOr}{' '}
              <strong>{UI_LABELS.debug.patch.commitToEditor}</strong>{' '}
              {UI_LABELS.debug.patch.emptyHintTail}
            </p>
          )}

          {state.patchResult && (
            <>
              {state.patchResult.errors.length > 0 && (
                <div className="space-y-1.5">
                  {state.patchResult.errors.map((err, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-500 space-y-1"
                    >
                      <div className="font-mono font-semibold flex items-center gap-1.5">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        <span>
                          {err.code}
                          {err.path ? ` (${err.path})` : ''}
                        </span>
                      </div>
                      <p>{err.message}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-3 gap-2 font-mono text-[11px]">
                <div className="rounded-xl border border-border-main bg-surface p-2.5">
                  <div className="text-text-faint">
                    {UI_LABELS.debug.patch.introducedErrLabel}
                  </div>
                  <div className="text-sm font-bold text-text-main tabular-nums">
                    {state.patchResult.introducedErrors.length}
                  </div>
                </div>
                <div className="rounded-xl border border-border-main bg-surface p-2.5">
                  <div className="text-text-faint">
                    {UI_LABELS.debug.patch.introducedWarnLabel}
                  </div>
                  <div className="text-sm font-bold text-text-main tabular-nums">
                    {state.patchResult.introducedWarnings.length}
                  </div>
                </div>
                <div className="rounded-xl border border-border-main bg-surface p-2.5">
                  <div className="text-text-faint">
                    {UI_LABELS.debug.patch.resolvedLabel}
                  </div>
                  <div className="text-sm font-bold text-text-main tabular-nums">
                    {state.patchResult.resolvedDiagnostics.length}
                  </div>
                </div>
              </div>

              {state.patchResult.candidateRawText && (
                <div className="space-y-1.5">
                  <div className={UI_TOKENS.layout.sectionTitleMini}>
                    {UI_LABELS.debug.patch.candidateHeading}
                  </div>
                  <pre className="rounded-xl border border-border-main bg-surface p-3.5 font-mono text-xs leading-relaxed text-text-body whitespace-pre-wrap select-text">
                    {state.patchResult.candidateRawText}
                  </pre>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
