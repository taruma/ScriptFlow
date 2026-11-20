import {useEffect, useMemo, useRef, useState} from 'react';
import {
  AlertTriangle,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  FileCode2,
  Layers,
  Lock,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import {
  DEFAULT_DRAFT_WRAPPER_TEMPLATE,
  DEFAULT_FOUNDATIONAL_CRAFT,
  type ComposedAgentContext,
  type CustomAuteurSkill,
  type ResolvedAuteurSkill,
  type SkillPinMode,
} from '../services/auteurKnowledge.ts';
import {
  slugifyCustomSkillId,
  validateCustomSkillInput,
  type AiSkillsState,
  type CustomSkillValidationResult,
} from '../ui/aiSkillsStore.ts';
import {copyTextToClipboard} from '../ui/clipboard.ts';
import {UI_LABELS} from '../ui/labels.ts';
import {UI_TOKENS} from '../ui/tokens/ui.ts';
import {ConfirmDialog, type ConfirmDialogRequest} from './ConfirmDialog.tsx';

export type ContextInspectorTabId = 'preview' | 'craft' | 'skills';

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
  onSetDraftWrapperTemplate: (value: string | null) => void;
  onSetPinMode: (skillId: string, pinMode: SkillPinMode) => void;
  onSetBodyOverride: (skillId: string, bodyOverride: string | null) => void;
  onResetSkill: (skillId: string) => void;
  onSaveCustomSkill: (skill: CustomAuteurSkill, editingId?: string) => void;
  onDeleteCustomSkill: (skillId: string) => void;
  onResetAll: () => void;
  onAcknowledgeUpdate: () => void;
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
  onSetDraftWrapperTemplate,
  onSetPinMode,
  onSetBodyOverride,
  onResetSkill,
  onSaveCustomSkill,
  onDeleteCustomSkill,
  onResetAll,
  onAcknowledgeUpdate,
}: AiContextInspectorModalProps) {
  const [activeTab, setActiveTab] = useState<ContextInspectorTabId>(initialTab);
  const [copiedPrompt, setCopiedPrompt] = useState<boolean>(false);
  const [expandedSkillIds, setExpandedSkillIds] = useState<Record<string, boolean>>({});
  const [customForm, setCustomForm] = useState<CustomSkillFormState | null>(null);
  const [formErrors, setFormErrors] = useState<CustomSkillValidationResult['errors']>({});
  const [confirmRequest, setConfirmRequest] = useState<ConfirmDialogRequest | null>(null);

  const copyTimeoutRef = useRef<number | null>(null);
  const labels = UI_LABELS.ai.contextInspector;

  // Sync active tab whenever the modal opens with a requested initialTab
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Close on Escape unless nested ConfirmDialog is open
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !confirmRequest) {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, confirmRequest]);

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

  const draftTemplateValue =
    skillsState.draftWrapperTemplateOverride ?? DEFAULT_DRAFT_WRAPPER_TEMPLATE;
  const isDraftTemplateModified = skillsState.draftWrapperTemplateOverride !== null;

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

  const requestResetAll = () => {
    setConfirmRequest({
      title: labels.confirmResetAllTitle,
      description: labels.confirmResetAllDesc,
      confirmLabel: labels.confirmResetAllAction,
      tone: 'danger',
      onConfirm: () => {
        onResetAll();
        setCustomForm(null);
        setFormErrors({});
      },
    });
  };

  const focusLabel = UI_LABELS.ai.focusLabels[composedContext.focus];

  const previewSections: Array<{
    key: string;
    title: string;
    editable: boolean;
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
          if (event.target === event.currentTarget && !confirmRequest) {
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
            <button
              type="button"
              onClick={onClose}
              aria-label={labels.closeAria}
              className={UI_TOKENS.button.iconClose}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

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
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-[11px] text-text-faint tabular-nums">
                  {labels.skillsSummary(
                    composedContext.activeSkills.length,
                    composedContext.availableSkills.length,
                    composedContext.mutedSkills.length
                  )}
                </span>
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
                            section.editable
                              ? 'auteur-phase-aesthetic'
                              : 'border-border-subtle bg-surface text-text-faint'
                          }`}
                        >
                          {!section.editable && <Lock className="h-2.5 w-2.5" />}
                          <span>{section.editable ? labels.editableBadge : labels.readOnlyBadge}</span>
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

            {/* TAB 2: Craft & Template */}
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
                    rows={14}
                    value={foundationalCraftValue}
                    onChange={(event) => onSetFoundationalCraft(event.target.value)}
                    className={`${UI_TOKENS.input.field} font-mono text-[11px] leading-relaxed auteur-pane-scroll resize-y`}
                  />
                </section>

                <section className="rounded-xl border border-border-subtle bg-surface p-4 space-y-2.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-xs font-semibold text-text-main">
                          {labels.draftTemplateHeading}
                        </h3>
                        {isDraftTemplateModified && (
                          <span className="rounded border px-1.5 py-0.5 font-mono text-[10px] auteur-phase-intent">
                            {labels.modifiedBadge}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px] text-text-muted leading-relaxed">
                        {labels.draftTemplateDesc}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={!isDraftTemplateModified}
                      onClick={() => onSetDraftWrapperTemplate(null)}
                      className={`${UI_TOKENS.button.actionPill} disabled:opacity-40 disabled:cursor-not-allowed`}
                    >
                      <RotateCcw className="h-3 w-3" />
                      <span>{labels.resetToDefaultButton}</span>
                    </button>
                  </div>

                  <textarea
                    data-native-undo="true"
                    aria-label={labels.draftTemplateAria}
                    rows={7}
                    value={draftTemplateValue}
                    onChange={(event) => onSetDraftWrapperTemplate(event.target.value)}
                    className={`${UI_TOKENS.input.field} font-mono text-[11px] leading-relaxed auteur-pane-scroll resize-y`}
                  />

                  <p className="font-mono text-[10px] text-text-faint">
                    {labels.draftTemplatePlaceholdersHint}
                  </p>
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
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 border-t border-border-subtle bg-surface px-5 py-3 shrink-0">
            <button
              type="button"
              disabled={customizationCount === 0}
              onClick={requestResetAll}
              className={`${UI_TOKENS.button.danger} inline-flex items-center gap-1.5 !px-3 !py-1.5 !rounded-lg disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <RotateCcw className="h-3 w-3" />
              <span>{labels.resetAllDefaultsButton}</span>
            </button>

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

      <ConfirmDialog
        request={confirmRequest}
        onClose={() => setConfirmRequest(null)}
      />
    </>
  );
}
