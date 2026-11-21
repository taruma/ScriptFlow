import {useCallback, type Dispatch, type SetStateAction} from 'react';
import {AlertCircle, AlertTriangle} from 'lucide-react';
import {
  compileAuteurDraft,
  type AuteurScriptIR,
  type CompileDraftResult,
  type LintRuleOverrides,
} from '../../../core/index.ts';
import {UI_LABELS} from '../../../ui/labels.ts';
import {UI_TOKENS} from '../../../ui/tokens/ui.ts';
import {buildDraftFromDocument, buildSampleDraftJson} from '../debugSamples.ts';

export interface DraftCompilerState {
  draftText: string;
  draftResult: CompileDraftResult | null;
  draftParseError: string | null;
}

export function createInitialDraftCompilerState(): DraftCompilerState {
  return {
    draftText: buildSampleDraftJson(),
    draftResult: null,
    draftParseError: null,
  };
}

export interface DraftCompilerTabProps {
  document: AuteurScriptIR;
  readOnly: boolean;
  ruleOverrides?: LintRuleOverrides;
  onCommitRawText: (nextRawText: string, toastMessage?: string) => void;
  state: DraftCompilerState;
  setState: Dispatch<SetStateAction<DraftCompilerState>>;
}

export function DraftCompilerTab({
  document,
  readOnly,
  ruleOverrides,
  onCommitRawText,
  state,
  setState,
}: DraftCompilerTabProps) {
  const runDraftCompile = useCallback(
    (applyToEditor: boolean) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(state.draftText);
      } catch (err) {
        setState((prev) => ({
          ...prev,
          draftResult: null,
          draftParseError:
            err instanceof Error ? err.message : UI_LABELS.debug.invalidJsonSyntax,
        }));
        return;
      }

      const result = compileAuteurDraft(parsed, ruleOverrides);
      setState((prev) => ({
        ...prev,
        draftParseError: null,
        draftResult: result,
      }));

      if (applyToEditor && !readOnly && result.ok) {
        onCommitRawText(result.rawText, UI_LABELS.debug.draft.appliedToast);
      }
    },
    [state.draftText, ruleOverrides, readOnly, onCommitRawText, setState]
  );

  const loadCurrentAsDraft = useCallback(() => {
    setState({
      draftText: buildDraftFromDocument(document),
      draftResult: null,
      draftParseError: null,
    });
  }, [document, setState]);

  const loadSample = useCallback(() => {
    setState({
      draftText: buildSampleDraftJson(),
      draftResult: null,
      draftParseError: null,
    });
  }, [setState]);

  return (
    <div className="h-full grid grid-cols-1 md:grid-cols-2 min-h-0">
      {/* Left Draft Input */}
      <div className="flex flex-col min-h-0 border-b md:border-b-0 md:border-r border-border-main bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-border-subtle bg-surface-subtle shrink-0">
          <span className={UI_TOKENS.layout.sectionTitleMini}>
            {UI_LABELS.debug.draft.inputHeading}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={loadCurrentAsDraft}
              className={UI_TOKENS.button.actionPill}
            >
              {UI_LABELS.debug.draft.loadCurrent}
            </button>
            <button
              type="button"
              onClick={loadSample}
              className={UI_TOKENS.button.actionPill}
            >
              {UI_LABELS.debug.draft.loadSample}
            </button>
          </div>
        </div>

        <textarea
          value={state.draftText}
          onChange={(e) => {
            const nextVal = e.target.value;
            setState((prev) => ({...prev, draftText: nextVal}));
          }}
          data-native-undo="true"
          spellCheck={false}
          aria-label={UI_LABELS.debug.draft.inputHeading}
          className="flex-1 w-full resize-none bg-surface p-4 font-mono text-xs leading-relaxed text-text-body focus:outline-none"
        />

        <div className="flex items-center justify-end gap-2 px-4 py-2.5 border-t border-border-subtle bg-surface-subtle shrink-0">
          <button
            type="button"
            onClick={() => runDraftCompile(false)}
            className={UI_TOKENS.button.secondary}
          >
            {UI_LABELS.debug.draft.compileButton}
          </button>
          <button
            type="button"
            disabled={readOnly}
            title={readOnly ? UI_LABELS.debug.readOnlyCommitHint : undefined}
            onClick={() => runDraftCompile(true)}
            className={`${UI_TOKENS.button.primary} disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {UI_LABELS.debug.draft.applyToEditor}
          </button>
        </div>
      </div>

      {/* Right Draft Output */}
      <div className="flex flex-col min-h-0 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-subtle bg-surface-subtle shrink-0">
          <span className={UI_TOKENS.layout.sectionTitleMini}>
            {UI_LABELS.debug.draft.resultHeading}
          </span>
          {state.draftResult && (
            <span
              className={`font-mono text-[10px] px-2 py-0.5 rounded-md border ${
                state.draftResult.ok
                  ? 'auteur-phase-aesthetic'
                  : 'border-red-500/40 bg-red-500/10 text-red-500'
              }`}
            >
              {state.draftResult.ok
                ? UI_LABELS.debug.draft.statusValid(state.draftResult.diagnostics.length)
                : UI_LABELS.debug.draft.statusInvalid(state.draftResult.errors.length)}
            </span>
          )}
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-4">
          {state.draftParseError && (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-500 font-mono">
              {UI_LABELS.debug.jsonParseErrorPrefix}
              {state.draftParseError}
            </div>
          )}

          {!state.draftParseError && !state.draftResult && (
            <p className="text-xs text-text-muted">
              {UI_LABELS.debug.draft.emptyHintLead}{' '}
              <strong>{UI_LABELS.debug.draft.compileButton}</strong>{' '}
              {UI_LABELS.debug.draft.emptyHintMid}{' '}
              <code className="font-mono">
                {UI_LABELS.debug.draft.emptyHintSchemaName}
              </code>{' '}
              {UI_LABELS.debug.draft.emptyHintAnd}{' '}
              <code className="font-mono">{UI_LABELS.debug.draft.emptyHintVersion}</code>{' '}
              {UI_LABELS.debug.draft.emptyHintTail}
            </p>
          )}

          {state.draftResult && !state.draftResult.ok && (
            <div className="space-y-1.5">
              {state.draftResult.errors.map((err, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-500 font-mono"
                >
                  <span className="font-semibold">
                    {err.path || UI_LABELS.debug.draft.rootPathFallback}:
                  </span>{' '}
                  {err.message}
                </div>
              ))}
            </div>
          )}

          {state.draftResult && state.draftResult.ok && (
            <>
              {state.draftResult.diagnostics.length > 0 && (
                <div className="space-y-1.5">
                  {state.draftResult.diagnostics.map((d) => (
                    <div
                      key={d.id}
                      className={`rounded-xl border p-2.5 text-xs ${
                        d.severity === 'error'
                          ? 'border-red-500/40 bg-red-500/10 text-red-500'
                          : 'border-amber-500/40 bg-amber-500/10 text-amber-500'
                      }`}
                    >
                      <div className="font-mono font-semibold flex items-center gap-1.5">
                        {d.severity === 'error' ? (
                          <AlertCircle className="h-3.5 w-3.5" />
                        ) : (
                          <AlertTriangle className="h-3.5 w-3.5" />
                        )}
                        <span>
                          {d.targetId} · {d.ruleId}
                        </span>
                      </div>
                      <p className="mt-1">{d.message}</p>
                    </div>
                  ))}
                </div>
              )}

              <pre className="rounded-xl border border-border-main bg-surface p-3.5 font-mono text-xs leading-relaxed text-text-body whitespace-pre-wrap select-text">
                {state.draftResult.rawText}
              </pre>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
