import {type Ref, useEffect, useImperativeHandle, useMemo, useState} from 'react';
import {ChevronDown, ChevronRight, Pencil, Plus, RotateCcw, Trash2} from 'lucide-react';
import type {
  ComposedAgentContext,
  CustomAuteurSkill,
  ResolvedAuteurSkill,
  SkillPinMode,
} from '../../../services/auteurKnowledge.ts';
import {
  slugifyCustomSkillId,
  validateCustomSkillInput,
  type AiSkillsState,
  type CustomSkillValidationResult,
} from '../../../ui/aiSkillsStore.ts';
import {UI_LABELS} from '../../../ui/labels.ts';
import {UI_TOKENS} from '../../../ui/tokens/ui.ts';
import type {ConfirmDialogRequest} from '../../ConfirmDialog.tsx';

const PIN_MODES: readonly SkillPinMode[] = ['auto', 'pinned', 'muted'];

interface CustomSkillFormState {
  editingId?: string;
  name: string;
  id: string;
  idTouched: boolean;
  triggerHint: string;
  body: string;
}

export function getSkillStatusBadge(skill: ResolvedAuteurSkill): {
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

export interface SkillsManagerToolbarProps {
  composedContext: ComposedAgentContext;
  onSetAllPinModes?: (pinMode: 'auto' | 'muted') => void;
  isCustomFormOpen: boolean;
  onOpenAddForm: () => void;
}

export function SkillsManagerToolbar({
  composedContext,
  onSetAllPinModes,
  isCustomFormOpen,
  onOpenAddForm,
}: SkillsManagerToolbarProps) {
  const labels = UI_LABELS.ai.contextInspector;

  return (
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
      {!isCustomFormOpen && (
        <button
          type="button"
          onClick={onOpenAddForm}
          className={UI_TOKENS.button.actionPill}
        >
          <Plus className="h-3.5 w-3.5" />
          <span>{labels.addCustomSkillButton}</span>
        </button>
      )}
    </div>
  );
}

export interface SkillsManagerTabHandle {
  openAddForm: () => void;
  closeForm: () => void;
}

export interface SkillsManagerTabProps {
  ref?: Ref<SkillsManagerTabHandle>;
  composedContext: ComposedAgentContext;
  skillsState: AiSkillsState;
  onSetPinMode: (skillId: string, pinMode: SkillPinMode) => void;
  onSetBodyOverride: (skillId: string, bodyOverride: string | null) => void;
  onResetSkill: (skillId: string) => void;
  onSaveCustomSkill: (skill: CustomAuteurSkill, editingId?: string) => void;
  onDeleteCustomSkill: (skillId: string) => void;
  onRequestConfirm: (request: ConfirmDialogRequest) => void;
  onCustomFormOpenChange?: (isOpen: boolean) => void;
}

export function SkillsManagerTab({
  ref,
  composedContext,
  skillsState,
  onSetPinMode,
  onSetBodyOverride,
  onResetSkill,
  onSaveCustomSkill,
  onDeleteCustomSkill,
  onRequestConfirm,
  onCustomFormOpenChange,
}: SkillsManagerTabProps) {
  const [expandedSkillIds, setExpandedSkillIds] = useState<Record<string, boolean>>({});
  const [customForm, setCustomForm] = useState<CustomSkillFormState | null>(null);
  const [formErrors, setFormErrors] = useState<CustomSkillValidationResult['errors']>({});
  const labels = UI_LABELS.ai.contextInspector;

  useImperativeHandle(
    ref,
    () => ({
      openAddForm: () => {
        setFormErrors({});
        setCustomForm({
          name: '',
          id: '',
          idTouched: false,
          triggerHint: '',
          body: '',
        });
      },
      closeForm: () => {
        setCustomForm(null);
        setFormErrors({});
      },
    }),
    []
  );

  useEffect(() => {
    onCustomFormOpenChange?.(customForm !== null);
  }, [customForm, onCustomFormOpenChange]);

  useEffect(() => {
    return () => {
      onCustomFormOpenChange?.(false);
    };
  }, [onCustomFormOpenChange]);

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

  const toggleSkillExpanded = (skillId: string) => {
    setExpandedSkillIds((prev) => ({
      ...prev,
      [skillId]: !prev[skillId],
    }));
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
    onRequestConfirm({
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

  return (
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
                <p className="text-[11px] text-red-600 dark:text-red-400">{formErrors.name}</p>
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
                <p className="text-[11px] text-red-600 dark:text-red-400">{formErrors.id}</p>
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
                setCustomForm((prev) => (prev ? {...prev, body: event.target.value} : prev))
              }
              placeholder={labels.fieldBodyPlaceholder}
              className={`${UI_TOKENS.input.field} font-mono text-[11px] leading-relaxed auteur-pane-scroll resize-y`}
            />
            {formErrors.body && (
              <p className="text-[11px] text-red-600 dark:text-red-400">{formErrors.body}</p>
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
                    <span className="text-xs font-semibold text-text-main">{skill.name}</span>
                    <span className="font-mono text-[10px] text-text-faint">{skill.id}</span>
                    <span className="rounded border border-border-subtle bg-surface-subtle px-1.5 py-0.5 font-mono text-[10px] text-text-muted">
                      {skill.builtIn ? labels.builtInBadge : labels.customBadge} · {categoryLabel}
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
                  <p className="text-[11px] text-text-muted leading-snug">{skill.triggerHint}</p>
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
                      onChange={(event) => onSetBodyOverride(skill.id, event.target.value)}
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
  );
}
