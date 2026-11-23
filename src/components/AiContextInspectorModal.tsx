import {type ChangeEvent, useEffect, useRef, useState} from 'react';
import {
  AlertTriangle,
  BookOpen,
  Check,
  Download,
  FileCode2,
  Layers,
  RotateCcw,
  ScanSearch,
  Upload,
  Wrench,
  X,
} from 'lucide-react';
import type {
  ComposedAgentContext,
  CustomAuteurSkill,
  ScriptToolName,
  SkillPinMode,
  ToolActivationMode,
} from '../services/auteurKnowledge.ts';
import type {CustomQuickScanRule} from '../services/geminiDecisions.ts';
import {
  applyAgentContextImport,
  buildAgentContextPackExport,
  parseAgentContextPack,
  type AgentContextImportMode,
  type AgentContextImportSelection,
  type AuteurAgentContextPack,
} from '../ui/agentContextCodec.ts';
import {countToolCustomizations, isBuiltinSkillId, type AiSkillsState} from '../ui/aiSkillsStore.ts';
import {UI_LABELS} from '../ui/labels.ts';
import {
  DEFAULT_QUICK_SCAN_RULES_STATE,
  isBuiltinQuickScanRuleId,
  type QuickScanRulesState,
} from '../ui/quickScanRulesStore.ts';
import {triggerTextFileDownload} from '../ui/scriptFileIO.ts';
import {UI_TOKENS} from '../ui/tokens/ui.ts';
import {AgentContextImportDialog} from './AgentContextImportDialog.tsx';
import {ConfirmDialog, type ConfirmDialogRequest} from './ConfirmDialog.tsx';
import {QuickScanRulesTabPanel} from './QuickScanRulesTabPanel.tsx';
import {
  ContextPreviewTab,
  ContextPreviewToolbar,
} from './ai/context/ContextPreviewTab.tsx';
import {FoundationalCraftTab} from './ai/context/FoundationalCraftTab.tsx';
import {
  FunctionToolsTab,
  FunctionToolsToolbar,
} from './ai/context/FunctionToolsTab.tsx';
import {
  SkillsManagerTab,
  SkillsManagerToolbar,
  type SkillsManagerTabHandle,
} from './ai/context/SkillsManagerTab.tsx';

export type ContextInspectorTabId = 'preview' | 'craft' | 'skills' | 'tools' | 'quick_scan';

export interface AiContextInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: ContextInspectorTabId;
  composedContext: ComposedAgentContext;
  skillsState: AiSkillsState;
  customizationCount: number;
  toolCustomizationCount?: number;
  hasUpstreamUpdate: boolean;
  onSetFoundationalCraft: (value: string | null) => void;
  onSetPinMode: (skillId: string, pinMode: SkillPinMode) => void;
  onSetAllPinModes?: (pinMode: 'auto' | 'muted') => void;
  onSetBodyOverride: (skillId: string, bodyOverride: string | null) => void;
  onResetSkill: (skillId: string) => void;
  onSaveCustomSkill: (skill: CustomAuteurSkill, editingId?: string) => void;
  onDeleteCustomSkill: (skillId: string) => void;
  onSetToolProtocol?: (value: string | null) => void;
  onSetEnforceLinterGate?: (enforce: boolean) => void;
  onSetToolMode?: (toolName: ScriptToolName, mode: ToolActivationMode) => void;
  onSetAllToolModes?: (mode: 'auto' | 'disabled') => void;
  onSetToolDescription?: (toolName: ScriptToolName, description: string | null) => void;
  onSetToolGuidance?: (toolName: ScriptToolName, guidance: string | null) => void;
  onResetTool?: (toolName: ScriptToolName) => void;
  onResetAllTools?: () => void;
  onReplaceSkillsState?: (nextState: AiSkillsState) => void;
  onResetAll: () => void;
  onAcknowledgeUpdate: () => void;
  quickScanRulesState?: QuickScanRulesState;
  quickScanCustomizationCount?: number;
  hasQuickScanUpstreamUpdate?: boolean;
  onSetQuickScanRuleEnabled?: (ruleId: string, enabled: boolean) => void;
  onSetAllQuickScanRulesEnabled?: (enabled: boolean) => void;
  onSetQuickScanRuleTextOverride?: (
    ruleId: string,
    patch: {
      instructionsOverride?: string | null;
      trueDescriptionOverride?: string | null;
      falseDescriptionOverride?: string | null;
    }
  ) => void;
  onResetQuickScanRule?: (ruleId: string) => void;
  onSaveCustomQuickScanRule?: (rule: CustomQuickScanRule, editingId?: string) => void;
  onDeleteCustomQuickScanRule?: (ruleId: string) => void;
  onReplaceQuickScanRulesState?: (nextState: QuickScanRulesState) => void;
  onResetAllQuickScanRules?: () => void;
  onAcknowledgeQuickScanUpdate?: () => void;
}

export function AiContextInspectorModal({
  isOpen,
  onClose,
  initialTab = 'preview',
  composedContext,
  skillsState,
  customizationCount,
  toolCustomizationCount,
  hasUpstreamUpdate,
  onSetFoundationalCraft,
  onSetPinMode,
  onSetAllPinModes,
  onSetBodyOverride,
  onResetSkill,
  onSaveCustomSkill,
  onDeleteCustomSkill,
  onSetToolProtocol,
  onSetEnforceLinterGate,
  onSetToolMode,
  onSetAllToolModes,
  onSetToolDescription,
  onSetToolGuidance,
  onResetTool,
  onResetAllTools,
  onReplaceSkillsState,
  onResetAll,
  onAcknowledgeUpdate,
  quickScanRulesState,
  quickScanCustomizationCount = 0,
  hasQuickScanUpstreamUpdate = false,
  onSetQuickScanRuleEnabled,
  onSetAllQuickScanRulesEnabled,
  onSetQuickScanRuleTextOverride,
  onResetQuickScanRule,
  onSaveCustomQuickScanRule,
  onDeleteCustomQuickScanRule,
  onReplaceQuickScanRulesState,
  onResetAllQuickScanRules,
  onAcknowledgeQuickScanUpdate,
}: AiContextInspectorModalProps) {
  const [activeTab, setActiveTab] = useState<ContextInspectorTabId>(initialTab);
  const [isCustomSkillFormOpen, setIsCustomSkillFormOpen] = useState<boolean>(false);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmDialogRequest | null>(null);
  const [pendingImport, setPendingImport] = useState<{
    filename: string;
    pack: AuteurAgentContextPack;
    warnings: string[];
  } | null>(null);
  const [transferNotice, setTransferNotice] = useState<{
    tone: 'success' | 'error';
    message: string;
    details?: string[];
  } | null>(null);

  const importInputRef = useRef<HTMLInputElement | null>(null);
  const skillsTabRef = useRef<SkillsManagerTabHandle | null>(null);
  const labels = UI_LABELS.ai.contextInspector;
  const effectiveQuickScanRulesState = quickScanRulesState ?? DEFAULT_QUICK_SCAN_RULES_STATE;

  // Sync active tab whenever the modal opens with a requested initialTab
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setTransferNotice(null);
    }
  }, [isOpen, initialTab]);

  // Close on Escape unless nested ConfirmDialog or ImportDialog is open
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !confirmRequest && !pendingImport) {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, confirmRequest, pendingImport]);

  if (!isOpen) return null;

  const handleExportAgentContext = (showNotice = true): boolean => {
    const exported = buildAgentContextPackExport(skillsState, effectiveQuickScanRulesState);
    const ok = triggerTextFileDownload(exported.filename, exported.content, exported.mimeType);
    if (showNotice) {
      setTransferNotice(
        ok
          ? {
              tone: 'success',
              message: labels.exportImport.exportedNotice(exported.filename),
            }
          : {
              tone: 'error',
              message: labels.exportImport.exportFailedNotice,
            }
      );
    }
    return ok;
  };

  const handleImportFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const content = await file.text();
      const parsed = parseAgentContextPack(content);
      if (!parsed.ok) {
        setTransferNotice({
          tone: 'error',
          message: parsed.error,
          details: parsed.issues?.slice(0, 4).map((issue) =>
            issue.path ? `${issue.path}: ${issue.message}` : issue.message
          ),
        });
        return;
      }
      setTransferNotice(null);
      setPendingImport({
        filename: file.name,
        pack: parsed.pack,
        warnings: parsed.warnings,
      });
    } catch {
      setTransferNotice({
        tone: 'error',
        message: labels.exportImport.importReadError,
      });
    }
  };

  const handleConfirmImport = (
    selection: AgentContextImportSelection,
    mode: AgentContextImportMode,
    impactSummaryText: string
  ) => {
    if (!pendingImport) return;
    const applied = applyAgentContextImport(
      pendingImport.pack,
      selection,
      mode,
      skillsState,
      effectiveQuickScanRulesState
    );
    if (applied.skillsChanged) {
      onReplaceSkillsState?.(applied.skills);
      skillsTabRef.current?.closeForm();
    }
    if (applied.quickScanChanged) {
      onReplaceQuickScanRulesState?.(applied.quickScanRules);
    }
    setPendingImport(null);
    setTransferNotice({
      tone: 'success',
      message: labels.exportImport.importedSuccessNotice(impactSummaryText),
    });
  };

  const effectiveToolCustomizationCount =
    toolCustomizationCount ?? countToolCustomizations(skillsState);

  const requestResetAll = () => {
    const builtInOverrideCount = Object.keys(skillsState.skillOverrides).filter((id) =>
      isBuiltinSkillId(id)
    ).length;
    setConfirmRequest({
      title: labels.confirmResetAllTitle,
      description: labels.confirmResetAllDetailedDesc(
        skillsState.foundationalCraftOverride !== null,
        skillsState.customSkills.length,
        builtInOverrideCount,
        effectiveToolCustomizationCount
      ),
      confirmLabel: labels.confirmResetAllAction,
      tone: 'danger',
      auxiliaryAction: {
        label: labels.exportBackupBeforeResetButton,
        completedLabel: labels.exportBackupBeforeResetDone,
        onAction: () => {
          handleExportAgentContext(false);
        },
      },
      onConfirm: () => {
        onResetAll();
        skillsTabRef.current?.closeForm();
      },
    });
  };

  const requestResetAllTools = () => {
    if (!onResetAllTools) return;
    const toolOverrideCount = Object.keys(skillsState.toolOverrides ?? {}).length;
    setConfirmRequest({
      title: labels.functionTools.confirmResetAllToolsTitle,
      description: labels.functionTools.confirmResetAllToolsDesc(
        skillsState.toolProtocolOverride !== null,
        skillsState.enforceToolLinterGate === false,
        toolOverrideCount
      ),
      confirmLabel: labels.functionTools.confirmResetAllToolsAction,
      tone: 'danger',
      auxiliaryAction: {
        label: labels.exportBackupBeforeResetButton,
        completedLabel: labels.exportBackupBeforeResetDone,
        onAction: () => {
          handleExportAgentContext(false);
        },
      },
      onConfirm: () => {
        onResetAllTools();
      },
    });
  };

  const requestResetAllQuickScanRules = () => {
    if (!onResetAllQuickScanRules) return;
    const builtInRuleOverrideCount = Object.keys(
      effectiveQuickScanRulesState.ruleOverrides
    ).filter((id) => isBuiltinQuickScanRuleId(id)).length;
    setConfirmRequest({
      title: labels.quickScanRules.confirmResetAllTitle,
      description: labels.quickScanRules.confirmResetAllDetailedDesc(
        effectiveQuickScanRulesState.customRules.length,
        builtInRuleOverrideCount
      ),
      confirmLabel: labels.quickScanRules.confirmResetAllAction,
      tone: 'danger',
      auxiliaryAction: {
        label: labels.exportBackupBeforeResetButton,
        completedLabel: labels.exportBackupBeforeResetDone,
        onAction: () => {
          handleExportAgentContext(false);
        },
      },
      onConfirm: () => {
        onResetAllQuickScanRules();
      },
    });
  };

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={labels.dialogAria}
        className={UI_TOKENS.modal.overlay}
        onClick={(event) => {
          if (event.target === event.currentTarget && !confirmRequest && !pendingImport) {
            onClose();
          }
        }}
      >
        <div
          className={`${UI_TOKENS.modal.containerLg} flex h-[min(88vh,780px)] flex-col !rounded-2xl`}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-border-subtle px-5 py-4 shrink-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 shrink-0 text-[var(--phase-continuity-text)]" />
                <h2 className="font-serif text-base font-bold tracking-tight text-text-main">
                  {labels.title}
                </h2>
                <span className="rounded border border-border-subtle bg-surface-subtle px-1.5 py-0.5 font-mono text-[10px] text-text-faint">
                  {composedContext.knowledgeVersion}
                </span>
              </div>
              <p className="mt-1 text-xs text-text-muted">{labels.subtitle}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <input
                ref={importInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleImportFileSelected}
              />
              {onReplaceSkillsState && (
                <button
                  type="button"
                  onClick={() => importInputRef.current?.click()}
                  aria-label={labels.exportImport.importAria}
                  title={labels.exportImport.importTitle}
                  className={UI_TOKENS.button.actionPill}
                >
                  <Upload className="h-3 w-3" />
                  <span>{labels.exportImport.importButton}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => handleExportAgentContext(true)}
                aria-label={labels.exportImport.exportAria}
                title={labels.exportImport.exportTitle}
                className={UI_TOKENS.button.actionPill}
              >
                <Download className="h-3 w-3" />
                <span>{labels.exportImport.exportButton}</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label={labels.closeAria}
                className={UI_TOKENS.button.iconClose}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Export / Import Status Banner */}
          {transferNotice && (
            <div
              role="status"
              className={`border-b px-5 py-2.5 flex items-start justify-between gap-2 shrink-0 ${
                transferNotice.tone === 'error'
                  ? 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'
                  : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
              }`}
            >
              <div className="flex items-start gap-2 min-w-0">
                {transferNotice.tone === 'error' ? (
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                ) : (
                  <Check className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                )}
                <div className="min-w-0 text-[11px] leading-snug space-y-0.5">
                  <div className="font-medium">{transferNotice.message}</div>
                  {transferNotice.details && transferNotice.details.length > 0 && (
                    <ul className="list-disc pl-4 opacity-90 space-y-0.5">
                      {transferNotice.details.map((detail) => (
                        <li key={detail} className="font-mono text-[10px]">
                          {detail}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTransferNotice(null)}
                aria-label={labels.exportImport.dismissNoticeAria}
                className="shrink-0 opacity-70 hover:opacity-100 transition-opacity cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Upstream Knowledge Update Notice */}
          {hasUpstreamUpdate && (
            <div className="border-b border-amber-500/30 bg-amber-500/10 px-5 py-2.5 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="flex items-start gap-2 min-w-0">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-text-main">
                    {labels.upstreamUpdateTitle}
                  </div>
                  <p className="text-[11px] text-text-muted leading-snug">
                    {labels.upstreamUpdateDesc}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={onAcknowledgeUpdate}
                  className={UI_TOKENS.button.actionPill}
                >
                  {labels.acknowledgeButton}
                </button>
                <button
                  type="button"
                  onClick={requestResetAll}
                  className={`${UI_TOKENS.button.danger} inline-flex items-center gap-1.5 !px-2.5 !py-1.5 !rounded-lg`}
                >
                  {labels.resetAllButton}
                </button>
              </div>
            </div>
          )}

          {/* Tab Bar */}
          <div className="border-b border-border-subtle bg-surface px-5 py-2.5 flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div
              role="tablist"
              aria-label={labels.tabsAria}
              className={`${UI_TOKENS.button.segmentedGroup} inline-flex`}
            >
              {(
                [
                  {id: 'preview', label: labels.tabPreview, icon: FileCode2},
                  {id: 'craft', label: labels.tabCraft, icon: BookOpen},
                  {id: 'skills', label: labels.tabSkills, icon: Layers},
                  {id: 'tools', label: labels.tabTools, icon: Wrench},
                  ...(quickScanRulesState
                    ? [{id: 'quick_scan' as const, label: labels.tabQuickScan, icon: ScanSearch}]
                    : []),
                ] as const
              ).map(({id, label, icon: Icon}) => {
                const isSelected = activeTab === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    onClick={() => setActiveTab(id)}
                    className={
                      isSelected
                        ? UI_TOKENS.button.segmentedItemActive
                        : UI_TOKENS.button.segmentedItem
                    }
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>

            {activeTab === 'preview' && (
              <ContextPreviewToolbar systemInstruction={composedContext.systemInstruction} />
            )}

            {activeTab === 'skills' && (
              <SkillsManagerToolbar
                composedContext={composedContext}
                onSetAllPinModes={onSetAllPinModes}
                isCustomFormOpen={isCustomSkillFormOpen}
                onOpenAddForm={() => skillsTabRef.current?.openAddForm()}
              />
            )}

            {activeTab === 'tools' && (
              <FunctionToolsToolbar
                composedContext={composedContext}
                onSetAllToolModes={onSetAllToolModes}
              />
            )}
          </div>

          {/* Scrollable Body */}
          <div className="flex-1 min-h-0 overflow-y-auto auteur-pane-scroll bg-app/40 px-5 py-4 space-y-4">
            {activeTab === 'preview' && (
              <ContextPreviewTab composedContext={composedContext} onJumpToTab={setActiveTab} />
            )}

            {activeTab === 'craft' && (
              <FoundationalCraftTab
                foundationalCraftOverride={skillsState.foundationalCraftOverride}
                onSetFoundationalCraft={onSetFoundationalCraft}
              />
            )}

            {activeTab === 'skills' && (
              <SkillsManagerTab
                ref={skillsTabRef}
                composedContext={composedContext}
                skillsState={skillsState}
                onSetPinMode={onSetPinMode}
                onSetBodyOverride={onSetBodyOverride}
                onResetSkill={onResetSkill}
                onSaveCustomSkill={onSaveCustomSkill}
                onDeleteCustomSkill={onDeleteCustomSkill}
                onRequestConfirm={setConfirmRequest}
                onCustomFormOpenChange={setIsCustomSkillFormOpen}
              />
            )}

            {activeTab === 'tools' && (
              <FunctionToolsTab
                composedContext={composedContext}
                skillsState={skillsState}
                onSetToolProtocol={(value) => onSetToolProtocol?.(value)}
                onSetEnforceLinterGate={(enforce) => onSetEnforceLinterGate?.(enforce)}
                onSetToolMode={(name, mode) => onSetToolMode?.(name, mode)}
                onSetToolDescription={(name, desc) => onSetToolDescription?.(name, desc)}
                onSetToolGuidance={(name, guidance) => onSetToolGuidance?.(name, guidance)}
                onResetTool={(name) => onResetTool?.(name)}
              />
            )}

            {activeTab === 'quick_scan' && quickScanRulesState && (
              <QuickScanRulesTabPanel
                rulesState={quickScanRulesState}
                hasUpstreamUpdate={hasQuickScanUpstreamUpdate}
                onSetRuleEnabled={(ruleId, enabled) =>
                  onSetQuickScanRuleEnabled?.(ruleId, enabled)
                }
                onSetAllRulesEnabled={onSetAllQuickScanRulesEnabled}
                onSetRuleTextOverride={(ruleId, patch) =>
                  onSetQuickScanRuleTextOverride?.(ruleId, patch)
                }
                onResetRule={(ruleId) => onResetQuickScanRule?.(ruleId)}
                onSaveCustomRule={(rule, editingId) =>
                  onSaveCustomQuickScanRule?.(rule, editingId)
                }
                onDeleteCustomRule={(ruleId) => onDeleteCustomQuickScanRule?.(ruleId)}
                onResetAllRules={() => onResetAllQuickScanRules?.()}
                onRequestResetAllRules={requestResetAllQuickScanRules}
                onAcknowledgeUpdate={() => onAcknowledgeQuickScanUpdate?.()}
                onRequestConfirm={setConfirmRequest}
              />
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 border-t border-border-subtle bg-surface px-5 py-3 shrink-0">
            {activeTab === 'quick_scan' && onResetAllQuickScanRules ? (
              <button
                type="button"
                disabled={quickScanCustomizationCount === 0}
                onClick={requestResetAllQuickScanRules}
                className={`${UI_TOKENS.button.danger} inline-flex items-center gap-1.5 !px-3 !py-1.5 !rounded-lg disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                <RotateCcw className="h-3 w-3" />
                <span>{labels.quickScanRules.resetAllRulesButton}</span>
              </button>
            ) : activeTab === 'tools' && onResetAllTools ? (
              <button
                type="button"
                disabled={effectiveToolCustomizationCount === 0}
                onClick={requestResetAllTools}
                className={`${UI_TOKENS.button.danger} inline-flex items-center gap-1.5 !px-3 !py-1.5 !rounded-lg disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                <RotateCcw className="h-3 w-3" />
                <span>{labels.functionTools.resetAllToolsButton}</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={customizationCount === 0}
                onClick={requestResetAll}
                className={`${UI_TOKENS.button.danger} inline-flex items-center gap-1.5 !px-3 !py-1.5 !rounded-lg disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                <RotateCcw className="h-3 w-3" />
                <span>{labels.resetAllDefaultsButton}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className={UI_TOKENS.button.primary}
            >
              {labels.doneButton}
            </button>
          </div>
        </div>
      </div>

      {pendingImport && (
        <AgentContextImportDialog
          filename={pendingImport.filename}
          pack={pendingImport.pack}
          warnings={pendingImport.warnings}
          currentSkills={skillsState}
          currentQuickScanRules={effectiveQuickScanRulesState}
          onExportCurrentBackup={() => handleExportAgentContext(false)}
          onConfirm={handleConfirmImport}
          onClose={() => setPendingImport(null)}
        />
      )}

      <ConfirmDialog
        request={confirmRequest}
        onClose={() => setConfirmRequest(null)}
      />
    </>
  );
}
