import {useEffect, useMemo, useState} from 'react';
import {AlertTriangle, Check, FileUp, FolderArchive, X} from 'lucide-react';
import {
  analyzeAgentContextImport,
  createDefaultImportSelection,
  summarizeAgentContextImportImpact,
  type AgentContextImportMode,
  type AgentContextImportSelection,
  type AuteurAgentContextPack,
} from '../ui/agentContextCodec.ts';
import type {AiSkillsState} from '../ui/aiSkillsStore.ts';
import {UI_LABELS} from '../ui/labels.ts';
import type {QuickScanRulesState} from '../ui/quickScanRulesStore.ts';
import {UI_TOKENS} from '../ui/tokens/ui.ts';
import {
  formatAppliedParts,
  formatExportedDate,
  formatRemovalParts,
  toggleIdInList,
} from './ai/importDialog/importDialogFormatters.ts';
import {
  QuickScanImportSection,
  SkillsImportSection,
} from './ai/importDialog/ImportSectionChecklist.tsx';

export interface AgentContextImportDialogProps {
  filename: string;
  pack: AuteurAgentContextPack;
  warnings: readonly string[];
  currentSkills: AiSkillsState;
  currentQuickScanRules: QuickScanRulesState;
  onExportCurrentBackup: () => boolean;
  onConfirm: (
    selection: AgentContextImportSelection,
    mode: AgentContextImportMode,
    impactSummaryText: string
  ) => void;
  onClose: () => void;
}

export function AgentContextImportDialog({
  filename,
  pack,
  warnings,
  currentSkills,
  currentQuickScanRules,
  onExportCurrentBackup,
  onConfirm,
  onClose,
}: AgentContextImportDialogProps) {
  const analysis = useMemo(
    () => analyzeAgentContextImport(pack, currentSkills, currentQuickScanRules),
    [pack, currentSkills, currentQuickScanRules]
  );

  const [mode, setMode] = useState<AgentContextImportMode>('merge');
  const [selection, setSelection] = useState<AgentContextImportSelection>(() =>
    createDefaultImportSelection(analysis)
  );
  const [backupExported, setBackupExported] = useState(false);

  const labels = UI_LABELS.ai.contextInspector.exportImport;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const impact = useMemo(
    () =>
      summarizeAgentContextImportImpact(
        pack,
        selection,
        mode,
        currentSkills,
        currentQuickScanRules
      ),
    [pack, selection, mode, currentSkills, currentQuickScanRules]
  );

  const appliedParts = useMemo(() => formatAppliedParts(impact), [impact]);
  const removalParts = useMemo(() => formatRemovalParts(impact), [impact]);
  const formattedExportedAt = useMemo(() => formatExportedDate(pack.exportedAt), [pack.exportedAt]);

  const skillsItemsTotal =
    (analysis.foundationalCraft ? 1 : 0) +
    analysis.builtInSkillOverrides.length +
    analysis.customSkills.length;
  const quickScanItemsTotal =
    analysis.builtInQuickScanOverrides.length + analysis.customQuickScanRules.length;

  const setAllSkillsSelected = (checked: boolean) => {
    setSelection((prev) => ({
      ...prev,
      applySkills: checked ? analysis.hasSkillsSection : false,
      includeFoundationalCraft: checked ? analysis.foundationalCraft !== null : false,
      builtInSkillOverrideIds: checked
        ? analysis.builtInSkillOverrides.map((item) => item.id)
        : [],
      customSkillIds: checked ? analysis.customSkills.map((item) => item.skill.id) : [],
    }));
  };

  const setAllQuickScanSelected = (checked: boolean) => {
    setSelection((prev) => ({
      ...prev,
      applyQuickScan: checked ? analysis.hasQuickScanSection : false,
      builtInQuickScanOverrideIds: checked
        ? analysis.builtInQuickScanOverrides.map((item) => item.id)
        : [],
      customQuickScanRuleIds: checked
        ? analysis.customQuickScanRules.map((item) => item.rule.id)
        : [],
    }));
  };

  const handleToggleFoundationalCraft = (checked: boolean) => {
    setSelection((prev) => ({
      ...prev,
      applySkills: checked ? true : prev.applySkills,
      includeFoundationalCraft: checked,
    }));
  };

  const handleToggleBuiltInSkillOverride = (id: string) => {
    setSelection((prev) => {
      const nextIds = toggleIdInList(prev.builtInSkillOverrideIds, id);
      return {
        ...prev,
        applySkills:
          nextIds.length > prev.builtInSkillOverrideIds.length ? true : prev.applySkills,
        builtInSkillOverrideIds: nextIds,
      };
    });
  };

  const handleToggleCustomSkill = (id: string) => {
    setSelection((prev) => {
      const nextIds = toggleIdInList(prev.customSkillIds, id);
      return {
        ...prev,
        applySkills: nextIds.length > prev.customSkillIds.length ? true : prev.applySkills,
        customSkillIds: nextIds,
      };
    });
  };

  const handleToggleBuiltInRuleOverride = (id: string) => {
    setSelection((prev) => {
      const nextIds = toggleIdInList(prev.builtInQuickScanOverrideIds, id);
      return {
        ...prev,
        applyQuickScan:
          nextIds.length > prev.builtInQuickScanOverrideIds.length ? true : prev.applyQuickScan,
        builtInQuickScanOverrideIds: nextIds,
      };
    });
  };

  const handleToggleCustomRule = (id: string) => {
    setSelection((prev) => {
      const nextIds = toggleIdInList(prev.customQuickScanRuleIds, id);
      return {
        ...prev,
        applyQuickScan:
          nextIds.length > prev.customQuickScanRuleIds.length ? true : prev.applyQuickScan,
        customQuickScanRuleIds: nextIds,
      };
    });
  };

  const handleConfirm = () => {
    if (!impact.canApply) return;
    const summaryText =
      appliedParts.length > 0
        ? appliedParts.join(', ')
        : labels.impactNoItemsReplaceBaseline;
    onConfirm(selection, mode, summaryText);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={labels.dialogAria}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      className={UI_TOKENS.modal.overlay}
    >
      <div className="bg-surface w-full max-w-2xl max-h-[88vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden border border-border-main text-text-main">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-border-subtle px-5 py-4 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <FileUp className="h-4 w-4 shrink-0 text-[var(--phase-continuity-text)]" />
              <h3 className="font-serif text-base font-bold tracking-tight text-text-main">
                {labels.dialogTitle}
              </h3>
              <span className="rounded border border-border-subtle bg-surface-subtle px-1.5 py-0.5 font-mono text-[10px] text-text-faint">
                {labels.packVersionMeta(pack.packVersion)}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-text-muted">
              <span className="font-mono text-text-body truncate max-w-[340px]">{filename}</span>
              {formattedExportedAt && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{labels.exportedAtMeta(formattedExportedAt)}</span>
                </>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={labels.closeDialogAria}
            className={UI_TOKENS.button.iconClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 min-h-0 overflow-y-auto auteur-pane-scroll px-5 py-4 space-y-4">
          {/* Sanitizer Warnings */}
          {warnings.length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-text-main">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                <span>{labels.warningsHeading}</span>
              </div>
              <ul className="list-disc pl-5 text-[11px] text-text-muted space-y-0.5">
                {warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Mode Selector: Merge vs Replace */}
          <section className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-text-faint">
              {labels.modeHeading}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                aria-pressed={mode === 'merge'}
                onClick={() => setMode('merge')}
                className={`rounded-xl border p-3 text-left transition-colors cursor-pointer ${
                  mode === 'merge'
                    ? 'border-[var(--phase-continuity-border)] bg-surface-subtle ring-1 ring-[var(--phase-continuity-border)]'
                    : 'border-border-subtle bg-surface hover:bg-surface-hover'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-text-main">
                    {labels.modeMergeTitle}
                  </span>
                  <span
                    aria-hidden="true"
                    className={`h-3.5 w-3.5 rounded-full border flex items-center justify-center ${
                      mode === 'merge'
                        ? 'border-[var(--phase-continuity-text)] bg-[var(--phase-continuity-text)]'
                        : 'border-border-main'
                    }`}
                  >
                    {mode === 'merge' && <span className="h-1.5 w-1.5 rounded-full bg-surface" />}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-snug text-text-muted">
                  {labels.modeMergeDesc}
                </p>
              </button>

              <button
                type="button"
                aria-pressed={mode === 'replace'}
                onClick={() => setMode('replace')}
                className={`rounded-xl border p-3 text-left transition-colors cursor-pointer ${
                  mode === 'replace'
                    ? 'border-amber-500/50 bg-amber-500/10 ring-1 ring-amber-500/40'
                    : 'border-border-subtle bg-surface hover:bg-surface-hover'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-text-main">
                    {labels.modeReplaceTitle}
                  </span>
                  <span
                    aria-hidden="true"
                    className={`h-3.5 w-3.5 rounded-full border flex items-center justify-center ${
                      mode === 'replace'
                        ? 'border-amber-600 dark:border-amber-400 bg-amber-600 dark:bg-amber-400'
                        : 'border-border-main'
                    }`}
                  >
                    {mode === 'replace' && <span className="h-1.5 w-1.5 rounded-full bg-surface" />}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-snug text-text-muted">
                  {labels.modeReplaceDesc}
                </p>
              </button>
            </div>
          </section>

          {/* Domain 1: Foundational Craft & Skills */}
          {analysis.hasSkillsSection && (
            <SkillsImportSection
              analysis={analysis}
              selection={selection}
              itemsTotal={skillsItemsTotal}
              onSetAllSelected={setAllSkillsSelected}
              onToggleFoundationalCraft={handleToggleFoundationalCraft}
              onToggleBuiltInSkillOverride={handleToggleBuiltInSkillOverride}
              onToggleCustomSkill={handleToggleCustomSkill}
            />
          )}

          {/* Domain 2: Quick Scan Rules */}
          {analysis.hasQuickScanSection && (
            <QuickScanImportSection
              analysis={analysis}
              selection={selection}
              itemsTotal={quickScanItemsTotal}
              onSetAllSelected={setAllQuickScanSelected}
              onToggleBuiltInRuleOverride={handleToggleBuiltInRuleOverride}
              onToggleCustomRule={handleToggleCustomRule}
            />
          )}
        </div>

        {/* Live Impact Summary */}
        <div className="border-t border-border-subtle bg-surface-subtle/60 px-5 py-3 space-y-2 shrink-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-text-faint">
            {labels.impactHeading}
          </div>

          {!impact.canApply ? (
            <p className="text-[11px] text-text-muted">
              {mode === 'merge' ? labels.impactNoSelectionMerge : labels.impactNoDomainReplace}
            </p>
          ) : (
            <div className="space-y-1.5 text-[11px] leading-snug">
              <p className="text-text-body">
                {appliedParts.length > 0 ? (
                  <>
                    <span className="font-semibold text-text-main">
                      {labels.impactWillApplyPrefix}
                    </span>
                    <span>{appliedParts.join(', ')}.</span>
                  </>
                ) : (
                  <span>{labels.impactNoItemsReplaceBaseline}</span>
                )}
              </p>

              {impact.hasDestructiveRemovals && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-2">
                  <div className="flex items-start gap-1.5 min-w-0 flex-1 text-red-700 dark:text-red-300">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>{labels.impactDestructiveWarning(removalParts.join(', '))}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const ok = onExportCurrentBackup();
                      if (ok) setBackupExported(true);
                    }}
                    className={`${UI_TOKENS.button.actionPill} shrink-0`}
                  >
                    {backupExported ? (
                      <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <FolderArchive className="h-3 w-3" />
                    )}
                    <span>
                      {backupExported
                        ? labels.exportCurrentBeforeReplaceDone
                        : labels.exportCurrentBeforeReplace}
                    </span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border-subtle bg-surface px-5 py-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className={UI_TOKENS.button.secondary}
          >
            {labels.cancelButton}
          </button>
          <button
            type="button"
            disabled={!impact.canApply}
            onClick={handleConfirm}
            className={`${
              mode === 'replace' && impact.hasDestructiveRemovals
                ? UI_TOKENS.button.danger
                : UI_TOKENS.button.primary
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {mode === 'merge'
              ? labels.confirmMergeButton(impact.selectedItemCount)
              : labels.confirmReplaceButton}
          </button>
        </div>
      </div>
    </div>
  );
}
