import {useEffect, useMemo, useState} from 'react';
import {
  AlertTriangle,
  Check,
  FileUp,
  FolderArchive,
  Layers,
  ScanSearch,
  X,
} from 'lucide-react';
import {
  analyzeAgentContextImport,
  createDefaultImportSelection,
  summarizeAgentContextImportImpact,
  type AgentContextImportImpact,
  type AgentContextImportMode,
  type AgentContextImportSelection,
  type AuteurAgentContextPack,
} from '../ui/agentContextCodec.ts';
import type {AiSkillsState} from '../ui/aiSkillsStore.ts';
import {UI_LABELS} from '../ui/labels.ts';
import type {QuickScanRulesState} from '../ui/quickScanRulesStore.ts';
import {UI_TOKENS} from '../ui/tokens/ui.ts';

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

function toggleIdInList(list: readonly string[], id: string): string[] {
  return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
}

function formatAppliedParts(impact: AgentContextImportImpact): string[] {
  const parts: string[] = [];
  if (impact.craftApplied) {
    parts.push(impact.craftOverwritten ? 'Foundational Craft (overwrite)' : 'Foundational Craft');
  }
  if (impact.customSkillsAdded > 0) {
    parts.push(
      `+${impact.customSkillsAdded} new custom ${impact.customSkillsAdded === 1 ? 'skill' : 'skills'}`
    );
  }
  if (impact.customSkillsOverwritten > 0) {
    parts.push(
      `${impact.customSkillsOverwritten} custom ${
        impact.customSkillsOverwritten === 1 ? 'skill' : 'skills'
      } overwritten`
    );
  }
  if (impact.builtInSkillOverridesApplied > 0) {
    parts.push(
      `${impact.builtInSkillOverridesApplied} built-in skill ${
        impact.builtInSkillOverridesApplied === 1 ? 'override' : 'overrides'
      }`
    );
  }
  if (impact.customRulesAdded > 0) {
    parts.push(
      `+${impact.customRulesAdded} new Quick Scan ${impact.customRulesAdded === 1 ? 'rule' : 'rules'}`
    );
  }
  if (impact.customRulesOverwritten > 0) {
    parts.push(
      `${impact.customRulesOverwritten} custom Quick Scan ${
        impact.customRulesOverwritten === 1 ? 'rule' : 'rules'
      } overwritten`
    );
  }
  if (impact.builtInRuleOverridesApplied > 0) {
    parts.push(
      `${impact.builtInRuleOverridesApplied} built-in rule ${
        impact.builtInRuleOverridesApplied === 1 ? 'override' : 'overrides'
      }`
    );
  }
  return parts;
}

function formatRemovalParts(impact: AgentContextImportImpact): string[] {
  const parts: string[] = [];
  if (impact.craftCleared) {
    parts.push('Foundational Craft edit');
  }
  if (impact.customSkillsRemoved > 0) {
    parts.push(
      `${impact.customSkillsRemoved} local custom ${
        impact.customSkillsRemoved === 1 ? 'skill' : 'skills'
      }`
    );
  }
  if (impact.builtInSkillOverridesReset > 0) {
    parts.push(
      `${impact.builtInSkillOverridesReset} built-in skill ${
        impact.builtInSkillOverridesReset === 1 ? 'override' : 'overrides'
      }`
    );
  }
  if (impact.customRulesRemoved > 0) {
    parts.push(
      `${impact.customRulesRemoved} local custom Quick Scan ${
        impact.customRulesRemoved === 1 ? 'rule' : 'rules'
      }`
    );
  }
  if (impact.builtInRuleOverridesReset > 0) {
    parts.push(
      `${impact.builtInRuleOverridesReset} built-in Quick Scan ${
        impact.builtInRuleOverridesReset === 1 ? 'override' : 'overrides'
      }`
    );
  }
  return parts;
}

function formatExportedDate(iso: string): string | null {
  if (!iso.trim()) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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

  const ctxLabels = UI_LABELS.ai.contextInspector;
  const labels = ctxLabels.exportImport;

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
            <section className="rounded-xl border border-border-subtle bg-surface-subtle/35 overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle bg-surface-subtle/70 px-3.5 py-2.5">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={selection.applySkills}
                    aria-label={labels.domainSkillsToggleAria}
                    onChange={(event) => setAllSkillsSelected(event.target.checked)}
                    className="h-3.5 w-3.5 rounded border-border-main accent-[var(--phase-continuity-text)] cursor-pointer"
                  />
                  <Layers className="h-3.5 w-3.5 text-[var(--phase-continuity-text)]" />
                  <span className="text-xs font-semibold text-text-main">
                    {labels.domainSkillsTitle}
                  </span>
                  <span className="font-mono text-[10px] text-text-faint">
                    ({skillsItemsTotal})
                  </span>
                </label>

                {skillsItemsTotal > 0 && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setAllSkillsSelected(true)}
                      className={UI_TOKENS.button.actionPill}
                    >
                      {labels.selectAllButton}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAllSkillsSelected(false)}
                      className={UI_TOKENS.button.actionPill}
                    >
                      {labels.selectNoneButton}
                    </button>
                  </div>
                )}
              </div>

              <div
                className={`p-3.5 space-y-3 ${
                  selection.applySkills ? '' : 'opacity-50'
                }`}
              >
                {skillsItemsTotal === 0 ? (
                  <p className="text-[11px] italic text-text-muted">
                    {labels.domainSkillsEmptyNote}
                  </p>
                ) : (
                  <>
                    {/* Foundational Craft Override */}
                    {analysis.foundationalCraft && (
                      <div className="space-y-1.5">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-text-faint">
                          {labels.groupFoundationalCraft}
                        </div>
                        <label className="flex items-start gap-2.5 rounded-lg border border-border-subtle bg-surface px-3 py-2 cursor-pointer hover:bg-surface-hover transition-colors">
                          <input
                            type="checkbox"
                            checked={selection.applySkills && selection.includeFoundationalCraft}
                            onChange={(event) => {
                              const checked = event.target.checked;
                              setSelection((prev) => ({
                                ...prev,
                                applySkills: checked ? true : prev.applySkills,
                                includeFoundationalCraft: checked,
                              }));
                            }}
                            className="mt-0.5 h-3.5 w-3.5 rounded border-border-main accent-[var(--phase-continuity-text)] cursor-pointer"
                          />
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-xs font-medium text-text-main">
                                {ctxLabels.foundationalCraftHeading}
                              </span>
                              <span className="font-mono text-[10px] text-text-faint">
                                {ctxLabels.charsCount(analysis.foundationalCraft.charCount)}
                              </span>
                              <span
                                className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${
                                  analysis.foundationalCraft.willOverwrite
                                    ? 'border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                                    : 'auteur-phase-aesthetic'
                                }`}
                              >
                                {analysis.foundationalCraft.willOverwrite
                                  ? labels.badgeOverwrites
                                  : labels.badgeNew}
                              </span>
                            </div>
                            <p className="text-[11px] font-mono text-text-muted truncate">
                              {analysis.foundationalCraft.preview}
                            </p>
                          </div>
                        </label>
                      </div>
                    )}

                    {/* Built-in Skill Overrides */}
                    {analysis.builtInSkillOverrides.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-text-faint">
                          {labels.groupBuiltInSkillOverrides(analysis.builtInSkillOverrides.length)}
                        </div>
                        <div className="space-y-1.5">
                          {analysis.builtInSkillOverrides.map((item) => {
                            const checked =
                              selection.applySkills &&
                              selection.builtInSkillOverrideIds.includes(item.id);
                            return (
                              <label
                                key={item.id}
                                className="flex items-start gap-2.5 rounded-lg border border-border-subtle bg-surface px-3 py-2 cursor-pointer hover:bg-surface-hover transition-colors"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() =>
                                    setSelection((prev) => {
                                      const nextIds = toggleIdInList(
                                        prev.builtInSkillOverrideIds,
                                        item.id
                                      );
                                      return {
                                        ...prev,
                                        applySkills:
                                          nextIds.length > prev.builtInSkillOverrideIds.length
                                            ? true
                                            : prev.applySkills,
                                        builtInSkillOverrideIds: nextIds,
                                      };
                                    })
                                  }
                                  className="mt-0.5 h-3.5 w-3.5 rounded border-border-main accent-[var(--phase-continuity-text)] cursor-pointer"
                                />
                                <div className="min-w-0 flex-1 flex flex-wrap items-center gap-1.5">
                                  <span className="text-xs font-medium text-text-main">
                                    {item.name}
                                  </span>
                                  <span className="font-mono text-[10px] text-text-faint">
                                    {item.id}
                                  </span>
                                  {item.pinMode && (
                                    <span className="rounded border border-border-subtle bg-surface-subtle px-1.5 py-0.5 font-mono text-[10px] text-text-muted">
                                      {ctxLabels.pinModes[item.pinMode]}
                                    </span>
                                  )}
                                  {item.hasBodyOverride && (
                                    <span className="rounded border px-1.5 py-0.5 font-mono text-[10px] auteur-phase-intent">
                                      {labels.badgeEditedBody}
                                    </span>
                                  )}
                                  {item.willOverwrite && (
                                    <span className="rounded border border-amber-500/35 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] text-amber-700 dark:text-amber-300">
                                      {labels.badgeOverwrites}
                                    </span>
                                  )}
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Custom Skills */}
                    {analysis.customSkills.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-text-faint">
                          {labels.groupCustomSkills(analysis.customSkills.length)}
                        </div>
                        <div className="space-y-1.5">
                          {analysis.customSkills.map((item) => {
                            const checked =
                              selection.applySkills &&
                              selection.customSkillIds.includes(item.skill.id);
                            return (
                              <label
                                key={item.skill.id}
                                className="flex items-start gap-2.5 rounded-lg border border-border-subtle bg-surface px-3 py-2 cursor-pointer hover:bg-surface-hover transition-colors"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() =>
                                    setSelection((prev) => {
                                      const nextIds = toggleIdInList(
                                        prev.customSkillIds,
                                        item.skill.id
                                      );
                                      return {
                                        ...prev,
                                        applySkills:
                                          nextIds.length > prev.customSkillIds.length
                                            ? true
                                            : prev.applySkills,
                                        customSkillIds: nextIds,
                                      };
                                    })
                                  }
                                  className="mt-0.5 h-3.5 w-3.5 rounded border-border-main accent-[var(--phase-continuity-text)] cursor-pointer"
                                />
                                <div className="min-w-0 flex-1 space-y-0.5">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="text-xs font-medium text-text-main">
                                      {item.skill.name}
                                    </span>
                                    <span className="font-mono text-[10px] text-text-faint">
                                      {item.skill.id}
                                    </span>
                                    {item.pinMode !== 'auto' && (
                                      <span className="rounded border border-border-subtle bg-surface-subtle px-1.5 py-0.5 font-mono text-[10px] text-text-muted">
                                        {ctxLabels.pinModes[item.pinMode]}
                                      </span>
                                    )}
                                    <span
                                      className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${
                                        item.willOverwrite
                                          ? 'border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                                          : 'auteur-phase-aesthetic'
                                      }`}
                                    >
                                      {item.willOverwrite
                                        ? labels.badgeOverwrites
                                        : labels.badgeNew}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-text-muted truncate">
                                    {item.skill.triggerHint}
                                  </p>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </section>
          )}

          {/* Domain 2: Quick Scan Rules */}
          {analysis.hasQuickScanSection && (
            <section className="rounded-xl border border-border-subtle bg-surface-subtle/35 overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle bg-surface-subtle/70 px-3.5 py-2.5">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={selection.applyQuickScan}
                    aria-label={labels.domainQuickScanToggleAria}
                    onChange={(event) => setAllQuickScanSelected(event.target.checked)}
                    className="h-3.5 w-3.5 rounded border-border-main accent-[var(--phase-continuity-text)] cursor-pointer"
                  />
                  <ScanSearch className="h-3.5 w-3.5 text-[var(--phase-continuity-text)]" />
                  <span className="text-xs font-semibold text-text-main">
                    {labels.domainQuickScanTitle}
                  </span>
                  <span className="font-mono text-[10px] text-text-faint">
                    ({quickScanItemsTotal})
                  </span>
                </label>

                {quickScanItemsTotal > 0 && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setAllQuickScanSelected(true)}
                      className={UI_TOKENS.button.actionPill}
                    >
                      {labels.selectAllButton}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAllQuickScanSelected(false)}
                      className={UI_TOKENS.button.actionPill}
                    >
                      {labels.selectNoneButton}
                    </button>
                  </div>
                )}
              </div>

              <div
                className={`p-3.5 space-y-3 ${
                  selection.applyQuickScan ? '' : 'opacity-50'
                }`}
              >
                {quickScanItemsTotal === 0 ? (
                  <p className="text-[11px] italic text-text-muted">
                    {labels.domainQuickScanEmptyNote}
                  </p>
                ) : (
                  <>
                    {/* Built-in Quick Scan Rule Overrides */}
                    {analysis.builtInQuickScanOverrides.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-text-faint">
                          {labels.groupBuiltInRuleOverrides(
                            analysis.builtInQuickScanOverrides.length
                          )}
                        </div>
                        <div className="space-y-1.5">
                          {analysis.builtInQuickScanOverrides.map((item) => {
                            const checked =
                              selection.applyQuickScan &&
                              selection.builtInQuickScanOverrideIds.includes(item.id);
                            return (
                              <label
                                key={item.id}
                                className="flex items-start gap-2.5 rounded-lg border border-border-subtle bg-surface px-3 py-2 cursor-pointer hover:bg-surface-hover transition-colors"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() =>
                                    setSelection((prev) => {
                                      const nextIds = toggleIdInList(
                                        prev.builtInQuickScanOverrideIds,
                                        item.id
                                      );
                                      return {
                                        ...prev,
                                        applyQuickScan:
                                          nextIds.length > prev.builtInQuickScanOverrideIds.length
                                            ? true
                                            : prev.applyQuickScan,
                                        builtInQuickScanOverrideIds: nextIds,
                                      };
                                    })
                                  }
                                  className="mt-0.5 h-3.5 w-3.5 rounded border-border-main accent-[var(--phase-continuity-text)] cursor-pointer"
                                />
                                <div className="min-w-0 flex-1 flex flex-wrap items-center gap-1.5">
                                  <span className="text-xs font-medium text-text-main">
                                    {item.label}
                                  </span>
                                  <span className="font-mono text-[10px] text-text-faint">
                                    {item.id}
                                  </span>
                                  {item.enabledOverride !== undefined && (
                                    <span className="rounded border border-border-subtle bg-surface-subtle px-1.5 py-0.5 font-mono text-[10px] text-text-muted">
                                      {item.enabledOverride
                                        ? labels.badgeEnabled
                                        : labels.badgeDisabled}
                                    </span>
                                  )}
                                  {item.hasTextOverride && (
                                    <span className="rounded border px-1.5 py-0.5 font-mono text-[10px] auteur-phase-intent">
                                      {labels.badgeEditedCriteria}
                                    </span>
                                  )}
                                  {item.willOverwrite && (
                                    <span className="rounded border border-amber-500/35 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] text-amber-700 dark:text-amber-300">
                                      {labels.badgeOverwrites}
                                    </span>
                                  )}
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Custom Quick Scan Rules */}
                    {analysis.customQuickScanRules.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-text-faint">
                          {labels.groupCustomRules(analysis.customQuickScanRules.length)}
                        </div>
                        <div className="space-y-1.5">
                          {analysis.customQuickScanRules.map((item) => {
                            const checked =
                              selection.applyQuickScan &&
                              selection.customQuickScanRuleIds.includes(item.rule.id);
                            const scopeLabel =
                              item.rule.scope === 'sub_state'
                                ? labels.scopeShortSubState
                                : item.rule.scope === 'macro_state'
                                  ? labels.scopeShortMacroState
                                  : labels.scopeShortDocument;
                            return (
                              <label
                                key={item.rule.id}
                                className="flex items-start gap-2.5 rounded-lg border border-border-subtle bg-surface px-3 py-2 cursor-pointer hover:bg-surface-hover transition-colors"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() =>
                                    setSelection((prev) => {
                                      const nextIds = toggleIdInList(
                                        prev.customQuickScanRuleIds,
                                        item.rule.id
                                      );
                                      return {
                                        ...prev,
                                        applyQuickScan:
                                          nextIds.length > prev.customQuickScanRuleIds.length
                                            ? true
                                            : prev.applyQuickScan,
                                        customQuickScanRuleIds: nextIds,
                                      };
                                    })
                                  }
                                  className="mt-0.5 h-3.5 w-3.5 rounded border-border-main accent-[var(--phase-continuity-text)] cursor-pointer"
                                />
                                <div className="min-w-0 flex-1 space-y-0.5">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="text-xs font-medium text-text-main">
                                      {item.rule.label}
                                    </span>
                                    <span className="font-mono text-[10px] text-text-faint">
                                      {item.rule.id}
                                    </span>
                                    <span className="rounded border border-border-subtle bg-surface-subtle px-1.5 py-0.5 font-mono text-[10px] text-text-muted">
                                      {scopeLabel}
                                    </span>
                                    {!item.enabled && (
                                      <span className="rounded border border-border-subtle bg-surface-subtle px-1.5 py-0.5 font-mono text-[10px] text-text-faint">
                                        {labels.badgeDisabled}
                                      </span>
                                    )}
                                    <span
                                      className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${
                                        item.willOverwrite
                                          ? 'border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                                          : 'auteur-phase-aesthetic'
                                      }`}
                                    >
                                      {item.willOverwrite
                                        ? labels.badgeOverwrites
                                        : labels.badgeNew}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-text-muted truncate">
                                    {item.rule.instructions}
                                  </p>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </section>
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
