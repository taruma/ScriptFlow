import {
  memo,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import {
  ArrowUp,
  FileText,
  HelpCircle,
  ScanSearch,
  Settings2,
  ShieldAlert,
  Square,
} from 'lucide-react';
import type {AssistantFocus} from '../../../services/auteurKnowledge.ts';
import {
  AUDIT_QUICK_CHECKS,
  type AiTargetScope,
  type AuditQuickCheckId,
} from '../../../ui/aiAssistant.ts';
import {UI_LABELS} from '../../../ui/labels.ts';
import {UI_TOKENS} from '../../../ui/tokens/ui.ts';

const ASSISTANT_FOCUSES: readonly AssistantFocus[] = ['auto', 'draft', 'refine', 'audit'];

export interface AiComposerDockProps {
  composerRef: RefObject<HTMLTextAreaElement | null>;
  inputValue: string;
  placeholder: string;
  isStreaming: boolean;
  isEmpty: boolean;
  focus: AssistantFocus;
  targetOptions: readonly AiTargetScope[];
  activeTargetKey: string;
  isBriefOpen: boolean;
  briefHasContent: boolean;
  briefIsActive: boolean;
  briefSummaryLabel: string | undefined;
  askFirstEnabled: boolean;
  showEstimatedCost: boolean;
  sessionCostTurnCount: number;
  formattedSessionCost: string;
  hasApiKey: boolean;
  modelShortLabel: string;
  reasoningLabel: string;
  onInputChange: (value: string) => void;
  onComposerKeyDown: (event: ReactKeyboardEvent<HTMLTextAreaElement>) => void;
  onComposerSend: () => void;
  onStopRun: () => void;
  onComposerResizePointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onComposerResizeReset: () => void;
  onFocusChange: (focus: AssistantFocus) => void;
  onTargetKeyChange: (key: string) => void;
  onQuickScan: () => void | Promise<void>;
  onQuickAudit: (checkId: AuditQuickCheckId) => void;
  onOpenBrief: () => void;
  onToggleAskFirst: () => void;
  onSessionCostMouseEnter: (event: ReactMouseEvent<HTMLElement>) => void;
  onSessionCostMouseLeave: () => void;
  onOpenSettings: () => void;
}

export const AiComposerDock = memo(function AiComposerDock({
  composerRef,
  inputValue,
  placeholder,
  isStreaming,
  isEmpty,
  focus,
  targetOptions,
  activeTargetKey,
  isBriefOpen,
  briefHasContent,
  briefIsActive,
  briefSummaryLabel,
  askFirstEnabled,
  showEstimatedCost,
  sessionCostTurnCount,
  formattedSessionCost,
  hasApiKey,
  modelShortLabel,
  reasoningLabel,
  onInputChange,
  onComposerKeyDown,
  onComposerSend,
  onStopRun,
  onComposerResizePointerDown,
  onComposerResizeReset,
  onFocusChange,
  onTargetKeyChange,
  onQuickScan,
  onQuickAudit,
  onOpenBrief,
  onToggleAskFirst,
  onSessionCostMouseEnter,
  onSessionCostMouseLeave,
  onOpenSettings,
}: AiComposerDockProps) {
  return (
    <div className="relative border-t border-border-main bg-surface px-3 pb-2.5 pt-2 shrink-0 space-y-2">
      {/* Drag-to-resize top handle for the prompt box */}
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label={UI_LABELS.ai.composerResizeAria}
        title={UI_LABELS.ai.composerResizeTitle}
        onPointerDown={onComposerResizePointerDown}
        onDoubleClick={onComposerResizeReset}
        className="group absolute -top-1.5 inset-x-0 h-3 flex items-center justify-center cursor-row-resize z-10 select-none"
      >
        <span
          aria-hidden="true"
          className="h-1 w-9 rounded-full bg-border-main/90 group-hover:bg-text-faint/70 transition-colors"
        />
      </div>

      {/* Resizable Prompt Box */}
      <div className="flex items-end gap-2 rounded-xl border border-border-main bg-surface-subtle px-2.5 py-2 focus-within:bg-surface focus-within:ring-1 focus-within:ring-border-main transition-colors">
        <textarea
          ref={composerRef}
          rows={2}
          data-native-undo="true"
          value={inputValue}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={onComposerKeyDown}
          placeholder={placeholder}
          aria-label={UI_LABELS.ai.composerAria}
          className="min-h-[56px] flex-1 resize-none overflow-y-auto bg-transparent text-xs leading-relaxed text-text-main placeholder-text-placeholder outline-none auteur-pane-scroll"
        />

        {isStreaming ? (
          <button
            type="button"
            onClick={onStopRun}
            aria-label={UI_LABELS.ai.stopAria}
            title={UI_LABELS.ai.stopButton}
            className="inline-flex h-7 items-center gap-1 rounded-lg bg-red-500 px-2.5 text-[11px] font-semibold text-white hover:bg-red-600 transition-colors cursor-pointer shrink-0"
          >
            <Square className="h-2.5 w-2.5 fill-current" />
            <span>{UI_LABELS.ai.stopButton}</span>
          </button>
        ) : (
          <button
            type="button"
            disabled={inputValue.trim().length === 0}
            onClick={onComposerSend}
            aria-label={UI_LABELS.ai.sendAria}
            title={`${UI_LABELS.ai.sendButton} (${UI_LABELS.ai.composerHint})`}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-btn-primary-bg text-btn-primary-text hover:bg-btn-primary-hover transition-colors disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer shrink-0"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* 4-Tab Focus Bar (Auto | Draft | Refine | Audit) */}
      <div
        role="group"
        aria-label={UI_LABELS.ai.focusAria}
        className={`${UI_TOKENS.button.segmentedGroup} grid grid-cols-4 w-full`}
      >
        {ASSISTANT_FOCUSES.map((item) => {
          const active = focus === item;
          return (
            <button
              key={item}
              type="button"
              aria-pressed={active}
              onClick={() => onFocusChange(item)}
              className={`${
                active ? UI_TOKENS.button.segmentedItemActive : UI_TOKENS.button.segmentedItem
              } justify-center`}
            >
              <span>{UI_LABELS.ai.focusLabels[item]}</span>
            </button>
          );
        })}
      </div>

      {/* Contextual Scope / Quick Audit Controls */}
      {!isEmpty && (focus === 'auto' || focus === 'refine') && (
        <div className="flex items-center gap-2">
          <label
            htmlFor="auteur-ai-target-scope"
            className="text-[10px] font-semibold uppercase tracking-wider text-text-faint shrink-0"
          >
            {UI_LABELS.ai.refineTargetLabel}
          </label>
          <select
            id="auteur-ai-target-scope"
            aria-label={UI_LABELS.ai.refineTargetAria}
            value={activeTargetKey}
            onChange={(e) => onTargetKeyChange(e.target.value)}
            className="min-w-0 flex-1 truncate rounded-lg border border-border-main bg-surface-subtle px-2 py-1 font-mono text-[11px] text-text-body focus:outline-none focus:ring-1 focus:ring-border-main cursor-pointer"
          >
            {targetOptions.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
          {focus === 'auto' && (
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                disabled={isStreaming}
                onClick={onQuickScan}
                title={UI_LABELS.ai.quickScanTitle}
                className={`${UI_TOKENS.ai.pillButton} text-[10px] py-1 px-2`}
              >
                <ScanSearch className="h-3 w-3 text-text-faint" />
                <span>{UI_LABELS.ai.quickScanButton}</span>
              </button>
              <button
                type="button"
                disabled={isStreaming}
                onClick={() => onQuickAudit('all')}
                title={UI_LABELS.ai.quickAuditAllTitle}
                className={`${UI_TOKENS.ai.pillButton} text-[10px] py-1 px-2`}
              >
                <ShieldAlert className="h-3 w-3 text-text-faint" />
                <span>{UI_LABELS.ai.quickAuditAllButton}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {focus === 'audit' && (
        <div
          role="group"
          aria-label={UI_LABELS.ai.auditQuickGroupAria}
          className="flex flex-wrap gap-1"
        >
          {!isEmpty && (
            <button
              type="button"
              disabled={isStreaming}
              onClick={onQuickScan}
              title={UI_LABELS.ai.quickScanTitle}
              className={`${UI_TOKENS.ai.pillButton} text-[10px] py-0.5 px-2 font-semibold`}
            >
              <ScanSearch className="h-3 w-3 text-text-faint" />
              <span>{UI_LABELS.ai.quickScanButton}</span>
            </button>
          )}
          {AUDIT_QUICK_CHECKS.map((check) => {
            const label =
              check.id === 'all'
                ? UI_LABELS.ai.auditQuickAll
                : UI_LABELS.ai.auditQuickLensShort[check.id];
            return (
              <button
                key={check.id}
                type="button"
                disabled={isStreaming}
                onClick={() => onQuickAudit(check.id)}
                className={`${UI_TOKENS.ai.pillButton} text-[10px] py-0.5 px-2`}
              >
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Bottom Utility Row: Brief + Ask First Toggle | Session Cost + Model Settings Chip */}
      <div className="flex items-center justify-between gap-2 pt-0.5 border-t border-border-subtle">
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={isBriefOpen}
            aria-label={UI_LABELS.ai.briefToggleAria(
              isBriefOpen,
              briefHasContent,
              briefIsActive
            )}
            title={UI_LABELS.ai.briefToggleTitle}
            onClick={onOpenBrief}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 font-medium text-[11px] transition-colors cursor-pointer shrink-0 ${
              isBriefOpen || briefIsActive
                ? 'auteur-phase-aesthetic'
                : 'border-border-main bg-surface text-text-body hover:bg-surface-hover hover:text-text-main'
            }`}
          >
            <FileText className="h-3 w-3" />
            <span>
              {briefSummaryLabel ??
                (briefHasContent ? UI_LABELS.ai.briefPausedLabel : UI_LABELS.ai.briefToggle)}
            </span>
          </button>

          {focus !== 'audit' && (
            <button
              type="button"
              aria-pressed={askFirstEnabled}
              aria-label={UI_LABELS.ai.askFirstAria(askFirstEnabled)}
              title={UI_LABELS.ai.askFirstTitle}
              onClick={onToggleAskFirst}
              className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 font-medium text-[11px] transition-colors cursor-pointer shrink-0 ${
                askFirstEnabled
                  ? 'auteur-phase-logic'
                  : 'border-border-main bg-surface text-text-muted hover:bg-surface-hover hover:text-text-main'
              }`}
            >
              <HelpCircle className="h-3 w-3" />
              <span>{UI_LABELS.ai.askFirstToggle}</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 min-w-0">
          {showEstimatedCost && sessionCostTurnCount > 0 && (
            <span
              aria-label={UI_LABELS.ai.cost.sessionBadgeAria(
                formattedSessionCost,
                sessionCostTurnCount
              )}
              onMouseEnter={onSessionCostMouseEnter}
              onMouseLeave={onSessionCostMouseLeave}
              className="inline-flex items-center rounded-lg border border-border-subtle bg-surface-subtle px-2 py-1 font-mono text-[10px] font-medium text-text-muted tabular-nums hover:border-border-main hover:text-text-main transition-colors cursor-default select-none shrink-0"
            >
              {formattedSessionCost}
            </span>
          )}

          <button
            type="button"
            onClick={onOpenSettings}
            title={UI_LABELS.ai.settingsChipTitle}
            aria-label={UI_LABELS.ai.settingsChipAria(modelShortLabel, reasoningLabel)}
            className={`${UI_TOKENS.ai.statusChip} min-w-0`}
          >
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                hasApiKey ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
            />
            <span className="truncate">
              {modelShortLabel} · {reasoningLabel}
            </span>
            <Settings2 className="h-3 w-3 shrink-0 text-text-faint" />
          </button>
        </div>
      </div>
    </div>
  );
});
