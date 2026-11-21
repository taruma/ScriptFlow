import {useEffect, useMemo, useRef, useState} from 'react';
import {
  AlertTriangle,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  FileCode2,
  Layers,
  Lock,
  Pencil,
  Plus,
  RotateCcw,
  ScanSearch,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  DEFAULT_FOUNDATIONAL_CRAFT,
  type ComposedAgentContext,
  type CustomAuteurSkill,
  type ResolvedAuteurSkill,
  type SkillPinMode,
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
import {
  isBuiltinSkillId,
  slugifyCustomSkillId,
  validateCustomSkillInput,
  type AiSkillsState,
  type CustomSkillValidationResult,
} from '../ui/aiSkillsStore.ts';
import {copyTextToClipboard} from '../ui/clipboard.ts';
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

export type ContextInspectorTabId = 'preview' | 'craft' | 'skills' | 'quick_scan';

const PIN_MODES: readonly SkillPinMode[] = ['auto', 'pinned', 'muted'];

export interface AiContextInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: ContextInspectorTabId;
  composedContext: ComposedAgentContext;
  skillsState: AiSkillsState;
  customizationCount: number;
  hasUpstreamUpdate: boolean;
  onSetFoundationalCraft: (value: string | null) => void;
  onSetPinMode: (skillId: string, pinMode: SkillPinMode) => void;
  onSetAllPinModes?: (pinMode: 'auto' | 'muted') => void;
  onSetBodyOverride: (skillId: string, bodyOverride: string | null) => void;
  onResetSkill: (skillId: string) => void;
  onSaveCustomSkill: (skill: CustomAuteurSkill, editingId?: string) => void;
  onDeleteCustomSkill: (skillId: string) => void;
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

interface CustomSkillFormState {
  editingId?: string;
  name: string;
  id: string;
  idTouched: boolean;
  triggerHint: string;
  body: string;
}

function getSkillStatusBadge(skill: ResolvedAuteurSkill): {
  label: string;
  className: string;
} {
  const labels = UI_LABELS.ai.contextInspector;
  if (skill.status === 'muted') {
    return {
      label: labels.statusMuted,
      className: 'border-border-subtle bg-surface-subtle text-text-faint',
    };
  }
  if (skill.status === 'active') {
    return skill.reason === 'pinned'
      ? {
          label: labels.statusActivePinned,
          className: 'auteur-phase-continuity',
        }
      : {
          label: labels.statusActivePassive,
          className: 'auteur-phase-aesthetic',
        };
  }
  return {
    label: labels.statusAvailable,
    className: 'border-border-main bg-surface text-text-muted',
  };
}

export function AiContextInspectorModal({
  isOpen,
  onClose,
  initialTab = 'preview',
  composedContext,
  skillsState,
  customizationCount,
  hasUpstreamUpdate,
  onSetFoundationalCraft,
  onSetPinMode,
  onSetAllPinModes,
  onSetBodyOverride,
  onResetSkill,
  onSaveCustomSkill,
  onDeleteCustomSkill,
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
  const [copiedPrompt, setCopiedPrompt] = useState<boolean>(false);
  const [expandedSkillIds, setExpandedSkillIds] = useState<Record<string, boolean>>({});
  const [customForm, setCustomForm] = useState<CustomSkillFormState | null>(null);
  const [formErrors, setFormErrors] = useState<CustomSkillValidationResult['errors']>({});
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

  const copyTimeoutRef = useRef<number | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
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

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current !== null) {
        window.clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const existingCustomIdSet = useMemo(() => {
    const editingLower = customForm?.editingId?.toLowerCase();
    const set = new Set<string>();
    for (const skill of skillsState.customSkills) {
      if (skill.id.toLowerCase() !== editingLower) {
        set.add(skill.id.toLowerCase());
      }
    }
    return set;
  }, [skillsState.customSkills, customForm?.editingId]);

  if (!isOpen) return null;

  const foundationalCraftValue =
    skillsState.foundationalCraftOverride ?? DEFAULT_FOUNDATIONAL_CRAFT;
  const isFoundationalModified = skillsState.foundationalCraftOverride !== null;

  const handleCopyPrompt = async () => {
    const ok = await copyTextToClipboard(composedContext.systemInstruction);
    if (!ok) return;
    setCopiedPrompt(true);
    if (copyTimeoutRef.current !== null) {
      window.clearTimeout(copyTimeoutRef.current);
    }
    copyTimeoutRef.current = window.setTimeout(() => {
      setCopiedPrompt(false);
    }, 1800);
  };

  const toggleSkillExpanded = (skillId: string) => {
    setExpandedSkillIds((prev) => ({
      ...prev,
      [skillId]: !prev[skillId],
    }));
  };

  const openNewCustomSkillForm = () => {
    setFormErrors({});
    setCustomForm({
      name: '',
      id: '',
      idTouched: false,
      triggerHint: '',
      body: '',
    });
  };

  const openEditCustomSkillForm = (skill: ResolvedAuteurSkill) => {
    setFormErrors({});
    setCustomForm({
      editingId: skill.id,
      name: skill.name,
      id: skill.id,
      idTouched: true,
      triggerHint: skill.triggerHint,
      body: skill.body,
    });
  };

  const handleCustomNameChange = (nextName: string) => {
    setCustomForm((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        name: nextName,
        id: prev.idTouched ? prev.id : slugifyCustomSkillId(nextName, existingCustomIdSet),
      };
    });
  };

  const handleCustomFormSubmit = () => {
    if (!customForm) return;
    const validation = validateCustomSkillInput(
      {
        id: customForm.id,
        name: customForm.name,
        triggerHint: customForm.triggerHint,
        body: customForm.body,
      },
      skillsState.customSkills,
      customForm.editingId
    );
    if (!validation.ok || !validation.normalized) {
      setFormErrors(validation.errors);
      return;
    }
    onSaveCustomSkill(validation.normalized, customForm.editingId);
    setCustomForm(null);
    setFormErrors({});
  };

  const requestDeleteCustomSkill = (skill: ResolvedAuteurSkill) => {
    setConfirmRequest({
      title: labels.confirmDeleteTitle(skill.name),
      description: labels.confirmDeleteDesc,
      excerpt: `${skill.id} — ${skill.triggerHint}`,
      confirmLabel: labels.confirmDeleteAction,
      tone: 'danger',
      onConfirm: () => {
        onDeleteCustomSkill(skill.id);
        if (customForm?.editingId === skill.id) {
          setCustomForm(null);
          setFormErrors({});
        }
      },
    });
  };

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

  const handleImportFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
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
      setCustomForm(null);
      setFormErrors({});
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

  const requestResetAll = () => {
    const builtInOverrideCount = Object.keys(skillsState.skillOverrides).filter((id) =>
      isBuiltinSkillId(id)
    ).length;
    setConfirmRequest({
      title: labels.confirmResetAllTitle,
      description: labels.confirmResetAllDetailedDesc(
        skillsState.foundationalCraftOverride !== null,
        skillsState.customSkills.length,
        builtInOverrideCount
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
        setCustomForm(null);
        setFormErrors({});
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

  const focusLabel = UI_LABELS.ai.focusLabels[composedContext.focus];

  const previewSections: Array<{
    key: string;
    title: string;
    editable: boolean;
    badgeLabel?: string;
    badgeAccent?: boolean;
    modified?: boolean;
    body: string;
    emptyNote?: string;
  }> = [
    {
      key: 'foundationalCraft',
      title: labels.sectionFoundationalCraft,
      editable: true,
      modified: composedContext.sections.foundationalCraft.isOverridden,
      body: composedContext.sections.foundationalCraft.text,
    },
    {
      key: 'liveEditorState',
      title: labels.sectionLiveEditorState,
      editable: false,
      body: composedContext.sections.liveEditorState.text,
    },
    {
      key: 'sceneBrief',
      title: labels.sectionSceneBrief,
      editable: false,
      badgeLabel: composedContext.sections.sceneBrief.isActive
        ? labels.briefActiveBadge
        : labels.briefInactiveBadge,
      badgeAccent: composedContext.sections.sceneBrief.isActive,
      body: composedContext.sections.sceneBrief.text,
      emptyNote: labels.emptySceneBrief,
    },
    {
      key: 'activeSkills',
      title: labels.sectionActiveSkills,
      editable: false,
      body: composedContext.sections.activeSkills.text,
      emptyNote: labels.emptyActiveSkills,
    },
    {
      key: 'skillDirectory',
      title: labels.sectionSkillDirectory,
      editable: false,
      body: composedContext.sections.skillDirectory.text,
      emptyNote: labels.emptyAvailableSkills,
    },
    {
      key: 'toolProtocol',
      title: labels.sectionToolProtocol,
      editable: false,
      body: composedContext.sections.toolProtocol.text,
    },
  ];

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
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] text-text-faint tabular-nums">
                  {labels.charsCount(composedContext.systemInstruction.length)}
                </span>
                <button
                  type="button"
                  onClick={() => void handleCopyPrompt()}
                  aria-label={labels.copyPromptAria}
                  className={UI_TOKENS.button.actionPill}
                >
                  {copiedPrompt ? (
                    <Check className="h-3.5 w-3.5 text-[var(--phase-aesthetic-text)]" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 text-text-muted" />
                  )}
                  <span>{copiedPrompt ? labels.copiedPromptButton : labels.copyPromptButton}</span>
                </button>
              </div>
            )}

            {activeTab === 'skills' && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px] text-text-faint tabular-nums">
                  {labels.skillsSummary(
                    composedContext.activeSkills.length,
                    composedContext.availableSkills.length,
                    composedContext.mutedSkills.length
                  )}
                </span>
                {onSetAllPinModes && composedContext.resolvedSkills.length > 0 && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={composedContext.resolvedSkills.every((s) => s.pinMode === 'auto')}
                      onClick={() => onSetAllPinModes('auto')}
                      aria-label={labels.autoAllSkillsAria}
                      className={`${UI_TOKENS.button.actionPill} disabled:opacity-40 disabled:cursor-not-allowed`}
                    >
                      <span>{labels.autoAllSkillsButton}</span>
                    </button>
                    <button
                      type="button"
                      disabled={composedContext.resolvedSkills.every((s) => s.pinMode === 'muted')}
                      onClick={() => onSetAllPinModes('muted')}
                      aria-label={labels.muteAllSkillsAria}
                      className={`${UI_TOKENS.button.actionPill} disabled:opacity-40 disabled:cursor-not-allowed`}
                    >
                      <span>{labels.muteAllSkillsButton}</span>
                    </button>
                  </div>
                )}
                {!customForm && (
                  <button
                    type="button"
                    onClick={openNewCustomSkillForm}
                    className={UI_TOKENS.button.actionPill}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>{labels.addCustomSkillButton}</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Scrollable Body */}
          <div className="flex-1 min-h-0 overflow-y-auto auteur-pane-scroll bg-app/40 px-5 py-4 space-y-4">
            {/* TAB 1: Live Prompt Preview */}
            {activeTab === 'preview' && (
              <>
                <div className="rounded-xl border border-border-subtle bg-surface px-4 py-3 space-y-2.5">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-text-faint">
                        {labels.summaryFocus}
                      </span>
                      <span className="rounded border px-1.5 py-0.5 font-mono text-[10px] auteur-phase-continuity">
                        {focusLabel}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-text-faint">
                        {labels.summaryTopology}
                      </span>
                      <span className="font-mono text-[11px] text-text-body">
                        {composedContext.editorState.sceneTopology}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-text-faint">
                        {labels.summarySnapshot}
                      </span>
                      <span className="font-mono text-[11px] text-text-body">
                        {composedContext.editorState.snapshotHash}
                      </span>
                      {composedContext.editorState.changedSinceLastTurn && (
                        <span className="rounded border px-1.5 py-0.5 font-mono text-[10px] auteur-phase-intent">
                          {labels.summaryChangedBadge}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-text-faint shrink-0">
                      {labels.summaryTools}
                    </span>
                    {composedContext.allowedToolNames.map((toolName) => (
                      <span
                        key={toolName}
                        className="rounded border border-border-subtle bg-surface-subtle px-1.5 py-0.5 font-mono text-[10px] text-text-muted"
                      >
                        {toolName}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  {previewSections.map((section) => (
                    <section
                      key={section.key}
                      className="rounded-xl border border-border-subtle bg-surface overflow-hidden"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle bg-surface-subtle/60 px-3.5 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <h3 className="text-xs font-semibold text-text-main truncate">
                            {section.title}
                          </h3>
                          {section.modified && (
                            <span className="rounded border px-1.5 py-0.5 font-mono text-[10px] auteur-phase-intent">
                              {labels.modifiedBadge}
                            </span>
                          )}
                        </div>
                        <span
                          className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] shrink-0 ${
                            section.editable || section.badgeAccent
                              ? 'auteur-phase-aesthetic'
                              : 'border-border-subtle bg-surface text-text-faint'
                          }`}
                        >
                          {!section.editable && !section.badgeLabel && <Lock className="h-2.5 w-2.5" />}
                          <span>
                            {section.badgeLabel ??
                              (section.editable ? labels.editableBadge : labels.readOnlyBadge)}
                          </span>
                        </span>
                      </div>
                      <div className="px-3.5 py-3">
                        {section.body.trim().length > 0 ? (
                          <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-text-body">
                            {section.body}
                          </pre>
                        ) : (
                          <p className="text-xs italic text-text-faint">{section.emptyNote}</p>
                        )}
                      </div>
                    </section>
                  ))}
                </div>
              </>
            )}

            {/* TAB 2: Foundational Craft */}
            {activeTab === 'craft' && (
              <div className="space-y-5">
                <section className="rounded-xl border border-border-subtle bg-surface p-4 space-y-2.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-xs font-semibold text-text-main">
                          {labels.foundationalCraftHeading}
                        </h3>
                        {isFoundationalModified && (
                          <span className="rounded border px-1.5 py-0.5 font-mono text-[10px] auteur-phase-intent">
                            {labels.modifiedBadge}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px] text-text-muted leading-relaxed">
                        {labels.foundationalCraftDesc}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={!isFoundationalModified}
                      onClick={() => onSetFoundationalCraft(null)}
                      className={`${UI_TOKENS.button.actionPill} disabled:opacity-40 disabled:cursor-not-allowed`}
                    >
                      <RotateCcw className="h-3 w-3" />
                      <span>{labels.resetToDefaultButton}</span>
                    </button>
                  </div>

                  <textarea
                    data-native-undo="true"
                    aria-label={labels.foundationalCraftAria}
                    rows={18}
                    value={foundationalCraftValue}
                    onChange={(event) => onSetFoundationalCraft(event.target.value)}
                    className={`${UI_TOKENS.input.field} font-mono text-[11px] leading-relaxed auteur-pane-scroll resize-y`}
                  />
                </section>
              </div>
            )}

            {/* TAB 3: Skills & Extensions */}
            {activeTab === 'skills' && (
              <div className="space-y-3">
                {/* Inline Add/Edit Custom Skill Form */}
                {customForm && (
                  <section className="rounded-xl border border-border-main bg-surface p-4 space-y-3 shadow-xs">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-xs font-semibold text-text-main">
                        {customForm.editingId ? labels.formEditTitle : labels.formAddTitle}
                      </h3>
                      <button
                        type="button"
                        onClick={() => {
                          setCustomForm(null);
                          setFormErrors({});
                        }}
                        className={UI_TOKENS.button.actionPill}
                      >
                        {labels.cancelFormButton}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label
                          htmlFor="auteur-custom-skill-name"
                          className="block text-[11px] font-medium text-text-body"
                        >
                          {labels.fieldNameLabel}
                        </label>
                        <input
                          id="auteur-custom-skill-name"
                          type="text"
                          data-native-undo="true"
                          value={customForm.name}
                          onChange={(event) => handleCustomNameChange(event.target.value)}
                          placeholder={labels.fieldNamePlaceholder}
                          className={UI_TOKENS.input.field}
                        />
                        {formErrors.name && (
                          <p className="text-[11px] text-red-600 dark:text-red-400">
                            {formErrors.name}
                          </p>
                        )}
                      </div>

                      <div className="space-y-1">
                        <label
                          htmlFor="auteur-custom-skill-id"
                          className="block text-[11px] font-medium text-text-body"
                        >
                          {labels.fieldIdLabel}
                        </label>
                        <input
                          id="auteur-custom-skill-id"
                          type="text"
                          data-native-undo="true"
                          value={customForm.id}
                          onChange={(event) =>
                            setCustomForm((prev) =>
                              prev ? {...prev, id: event.target.value, idTouched: true} : prev
                            )
                          }
                          placeholder={labels.fieldIdPlaceholder}
                          className={`${UI_TOKENS.input.field} font-mono text-xs`}
                        />
                        {formErrors.id ? (
                          <p className="text-[11px] text-red-600 dark:text-red-400">
                            {formErrors.id}
                          </p>
                        ) : (
                          <p className="text-[10px] text-text-faint">{labels.fieldIdHint}</p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label
                        htmlFor="auteur-custom-skill-trigger"
                        className="block text-[11px] font-medium text-text-body"
                      >
                        {labels.fieldTriggerLabel}
                      </label>
                      <input
                        id="auteur-custom-skill-trigger"
                        type="text"
                        data-native-undo="true"
                        value={customForm.triggerHint}
                        onChange={(event) =>
                          setCustomForm((prev) =>
                            prev ? {...prev, triggerHint: event.target.value} : prev
                          )
                        }
                        placeholder={labels.fieldTriggerPlaceholder}
                        className={UI_TOKENS.input.field}
                      />
                      {formErrors.triggerHint && (
                        <p className="text-[11px] text-red-600 dark:text-red-400">
                          {formErrors.triggerHint}
                        </p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <label
                        htmlFor="auteur-custom-skill-body"
                        className="block text-[11px] font-medium text-text-body"
                      >
                        {labels.fieldBodyLabel}
                      </label>
                      <textarea
                        id="auteur-custom-skill-body"
                        data-native-undo="true"
                        rows={6}
                        value={customForm.body}
                        onChange={(event) =>
                          setCustomForm((prev) =>
                            prev ? {...prev, body: event.target.value} : prev
                          )
                        }
                        placeholder={labels.fieldBodyPlaceholder}
                        className={`${UI_TOKENS.input.field} font-mono text-[11px] leading-relaxed auteur-pane-scroll resize-y`}
                      />
                      {formErrors.body && (
                        <p className="text-[11px] text-red-600 dark:text-red-400">
                          {formErrors.body}
                        </p>
                      )}
                    </div>

                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setCustomForm(null);
                          setFormErrors({});
                        }}
                        className={UI_TOKENS.button.actionPill}
                      >
                        {labels.cancelFormButton}
                      </button>
                      <button
                        type="button"
                        onClick={handleCustomFormSubmit}
                        className={UI_TOKENS.button.primary}
                      >
                        {customForm.editingId ? labels.updateSkillButton : labels.saveSkillButton}
                      </button>
                    </div>
                  </section>
                )}

                {/* Resolved Skills List */}
                {composedContext.resolvedSkills.map((skill) => {
                  const isExpanded = Boolean(expandedSkillIds[skill.id]);
                  const statusBadge = getSkillStatusBadge(skill);
                  const hasOverride = Boolean(skillsState.skillOverrides[skill.id]);
                  const categoryLabel =
                    skill.category === 'workflow'
                      ? labels.categoryWorkflow
                      : skill.category === 'module'
                        ? labels.categoryModule
                        : labels.customBadge;

                  return (
                    <article
                      key={skill.id}
                      className="rounded-xl border border-border-subtle bg-surface overflow-hidden"
                    >
                      <div className="px-3.5 py-3 flex flex-wrap items-start justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => toggleSkillExpanded(skill.id)}
                          aria-expanded={isExpanded}
                          aria-label={
                            isExpanded
                              ? labels.collapseSkillAria(skill.name)
                              : labels.expandSkillAria(skill.name)
                          }
                          className="flex flex-1 min-w-[200px] items-start gap-2 text-left cursor-pointer group"
                        >
                          <span className="mt-0.5 text-text-faint group-hover:text-text-main transition-colors">
                            {isExpanded ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" />
                            )}
                          </span>
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-xs font-semibold text-text-main">
                                {skill.name}
                              </span>
                              <span className="font-mono text-[10px] text-text-faint">
                                {skill.id}
                              </span>
                              <span className="rounded border border-border-subtle bg-surface-subtle px-1.5 py-0.5 font-mono text-[10px] text-text-muted">
                                {skill.builtIn ? labels.builtInBadge : labels.customBadge} ·{' '}
                                {categoryLabel}
                              </span>
                              <span
                                className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${statusBadge.className}`}
                              >
                                {statusBadge.label}
                              </span>
                              {skill.isBodyOverridden && (
                                <span className="rounded border px-1.5 py-0.5 font-mono text-[10px] auteur-phase-intent">
                                  {labels.modifiedBadge}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-text-muted leading-snug">
                              {skill.triggerHint}
                            </p>
                          </div>
                        </button>

                        {/* 3-Way Auto / Pin / Mute Toggle */}
                        <div
                          role="group"
                          aria-label={labels.pinModeGroupAria(skill.name)}
                          className={`${UI_TOKENS.button.segmentedGroup} inline-flex shrink-0`}
                        >
                          {PIN_MODES.map((pinMode) => {
                            const selected = skill.pinMode === pinMode;
                            return (
                              <button
                                key={pinMode}
                                type="button"
                                aria-pressed={selected}
                                onClick={() => onSetPinMode(skill.id, pinMode)}
                                className={
                                  selected
                                    ? UI_TOKENS.button.segmentedItemActive
                                    : UI_TOKENS.button.segmentedItem
                                }
                              >
                                {labels.pinModes[pinMode]}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="border-t border-border-subtle bg-surface-subtle/40 px-3.5 py-3 space-y-2.5">
                          {skill.builtIn ? (
                            <>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] font-medium text-text-muted">
                                  {labels.skillBodyOverrideLabel}
                                </span>
                                {hasOverride && (
                                  <button
                                    type="button"
                                    onClick={() => onResetSkill(skill.id)}
                                    className={UI_TOKENS.button.actionPill}
                                  >
                                    <RotateCcw className="h-3 w-3" />
                                    <span>{labels.resetSkillButton}</span>
                                  </button>
                                )}
                              </div>
                              <textarea
                                data-native-undo="true"
                                aria-label={labels.skillBodyOverrideAria(skill.name)}
                                rows={8}
                                value={skill.body}
                                onChange={(event) =>
                                  onSetBodyOverride(skill.id, event.target.value)
                                }
                                className={`${UI_TOKENS.input.field} font-mono text-[11px] leading-relaxed auteur-pane-scroll resize-y`}
                              />
                            </>
                          ) : (
                            <>
                              <pre className="whitespace-pre-wrap break-words rounded-lg border border-border-subtle bg-surface p-3 font-mono text-[11px] leading-relaxed text-text-body">
                                {skill.body}
                              </pre>
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => openEditCustomSkillForm(skill)}
                                  className={UI_TOKENS.button.actionPill}
                                >
                                  <Pencil className="h-3 w-3" />
                                  <span>{labels.editButton}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => requestDeleteCustomSkill(skill)}
                                  className={`${UI_TOKENS.button.danger} inline-flex items-center gap-1.5 !px-2.5 !py-1.5 !rounded-lg`}
                                >
                                  <Trash2 className="h-3 w-3" />
                                  <span>{labels.deleteButton}</span>
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
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
