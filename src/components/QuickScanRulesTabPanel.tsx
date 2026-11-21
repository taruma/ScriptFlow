import {useMemo, useState} from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import {
  QUICK_SCAN_RULE_LENSES,
  QUICK_SCAN_RULE_PREDICATES,
  QUICK_SCAN_RULE_SCOPES,
  type QuickScanRuleLens,
  type QuickScanRulePredicate,
  type QuickScanRuleScope,
} from '../data/knowledge/index.ts';
import {
  resolveQuickScanRules,
  type CustomQuickScanRule,
  type ResolvedQuickScanRule,
} from '../services/geminiDecisions.ts';
import {UI_LABELS} from '../ui/labels.ts';
import {
  slugifyCustomQuickScanRuleId,
  validateCustomQuickScanRuleInput,
  type CustomQuickScanRuleValidationResult,
  type QuickScanRulesState,
} from '../ui/quickScanRulesStore.ts';
import {UI_TOKENS} from '../ui/tokens/ui.ts';
import type {ConfirmDialogRequest} from './ConfirmDialog.tsx';

export interface QuickScanRulesTabPanelProps {
  rulesState: QuickScanRulesState;
  hasUpstreamUpdate: boolean;
  onSetRuleEnabled: (ruleId: string, enabled: boolean) => void;
  onSetRuleTextOverride: (
    ruleId: string,
    patch: {
      instructionsOverride?: string | null;
      trueDescriptionOverride?: string | null;
      falseDescriptionOverride?: string | null;
    }
  ) => void;
  onResetRule: (ruleId: string) => void;
  onSaveCustomRule: (rule: CustomQuickScanRule, editingId?: string) => void;
  onDeleteCustomRule: (ruleId: string) => void;
  onResetAllRules: () => void;
  onAcknowledgeUpdate: () => void;
  onRequestConfirm: (request: ConfirmDialogRequest) => void;
}

interface CustomRuleFormState {
  editingId?: string;
  label: string;
  id: string;
  idTouched: boolean;
  lens: QuickScanRuleLens;
  scope: QuickScanRuleScope;
  when: QuickScanRulePredicate[];
  instructions: string;
  trueDescription: string;
  falseDescription: string;
  escalationHint: string;
}

export function QuickScanRulesTabPanel({
  rulesState,
  hasUpstreamUpdate,
  onSetRuleEnabled,
  onSetRuleTextOverride,
  onResetRule,
  onSaveCustomRule,
  onDeleteCustomRule,
  onResetAllRules,
  onAcknowledgeUpdate,
  onRequestConfirm,
}: QuickScanRulesTabPanelProps) {
  const [expandedRuleIds, setExpandedRuleIds] = useState<Record<string, boolean>>({});
  const [customForm, setCustomForm] = useState<CustomRuleFormState | null>(null);
  const [formErrors, setFormErrors] = useState<CustomQuickScanRuleValidationResult['errors']>({});

  const ctxLabels = UI_LABELS.ai.contextInspector;
  const qsRuleLabels = ctxLabels.quickScanRules;
  const lensLabels = UI_LABELS.ai.quickScan.lensLabels;

  const resolvedRules = useMemo(
    () => resolveQuickScanRules(rulesState.ruleOverrides, rulesState.customRules),
    [rulesState.ruleOverrides, rulesState.customRules]
  );

  const enabledCount = useMemo(
    () => resolvedRules.filter((r) => r.enabled).length,
    [resolvedRules]
  );

  const existingCustomIdSet = useMemo(() => {
    const editingLower = customForm?.editingId?.toLowerCase();
    const set = new Set<string>();
    for (const rule of rulesState.customRules) {
      if (rule.id.toLowerCase() !== editingLower) {
        set.add(rule.id.toLowerCase());
      }
    }
    return set;
  }, [rulesState.customRules, customForm?.editingId]);

  const groupedRules = useMemo(() => {
    const groups: Array<{lens: QuickScanRuleLens; rules: ResolvedQuickScanRule[]}> = [];
    for (const lens of QUICK_SCAN_RULE_LENSES) {
      const items = resolvedRules.filter((r) => r.lens === lens);
      if (items.length > 0) {
        groups.push({lens, rules: items});
      }
    }
    return groups;
  }, [resolvedRules]);

  const openAddForm = () => {
    setFormErrors({});
    setCustomForm({
      label: '',
      id: '',
      idTouched: false,
      lens: 'lens5_blocks_grammar',
      scope: 'macro_state',
      when: ['all'],
      instructions: '',
      trueDescription: '',
      falseDescription: '',
      escalationHint: '',
    });
  };

  const openEditForm = (rule: ResolvedQuickScanRule) => {
    setFormErrors({});
    setCustomForm({
      editingId: rule.id,
      label: rule.label,
      id: rule.id,
      idTouched: true,
      lens: rule.lens,
      scope: rule.scope,
      when: [...rule.when],
      instructions: rule.instructions,
      trueDescription: rule.trueDescription,
      falseDescription: rule.falseDescription,
      escalationHint: rule.escalationHint ?? '',
    });
  };

  const handleLabelChange = (value: string) => {
    setCustomForm((prev) => {
      if (!prev) return prev;
      const nextId = prev.idTouched
        ? prev.id
        : value.trim().length > 0
          ? slugifyCustomQuickScanRuleId(value, existingCustomIdSet)
          : '';
      return {...prev, label: value, id: nextId};
    });
  };

  const handleToggleWhenPredicate = (predicate: QuickScanRulePredicate) => {
    setCustomForm((prev) => {
      if (!prev) return prev;
      if (predicate === 'all') {
        return {...prev, when: ['all']};
      }
      const withoutAll = prev.when.filter((p) => p !== 'all');
      const exists = withoutAll.includes(predicate);
      const next = exists
        ? withoutAll.filter((p) => p !== predicate)
        : [...withoutAll, predicate];
      return {...prev, when: next.length > 0 ? next : ['all']};
    });
  };

  const handleSubmitForm = (event: React.FormEvent) => {
    event.preventDefault();
    if (!customForm) return;
    const validation = validateCustomQuickScanRuleInput(
      {
        id: customForm.id,
        label: customForm.label,
        lens: customForm.lens,
        scope: customForm.scope,
        when: customForm.when,
        instructions: customForm.instructions,
        trueDescription: customForm.trueDescription,
        falseDescription: customForm.falseDescription,
        ...(customForm.escalationHint.trim()
          ? {escalationHint: customForm.escalationHint.trim()}
          : {}),
      },
      rulesState.customRules,
      customForm.editingId
    );
    if (!validation.ok || !validation.normalized) {
      setFormErrors(validation.errors);
      return;
    }
    onSaveCustomRule(validation.normalized, customForm.editingId);
    setCustomForm(null);
    setFormErrors({});
  };

  const requestDeleteRule = (rule: ResolvedQuickScanRule) => {
    onRequestConfirm({
      title: qsRuleLabels.confirmDeleteTitle(rule.label),
      description: qsRuleLabels.confirmDeleteDesc,
      confirmLabel: qsRuleLabels.confirmDeleteAction,
      tone: 'danger',
      onConfirm: () => {
        onDeleteCustomRule(rule.id);
        if (customForm?.editingId === rule.id) {
          setCustomForm(null);
          setFormErrors({});
        }
      },
    });
  };

  const requestResetAll = () => {
    onRequestConfirm({
      title: qsRuleLabels.confirmResetAllTitle,
      description: qsRuleLabels.confirmResetAllDesc,
      confirmLabel: qsRuleLabels.confirmResetAllAction,
      tone: 'danger',
      onConfirm: () => {
        onResetAllRules();
        setCustomForm(null);
        setFormErrors({});
      },
    });
  };

  return (
    <div className="space-y-4">
      {hasUpstreamUpdate && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-text-main">
                {qsRuleLabels.upstreamUpdateTitle}
              </div>
              <p className="text-[11px] text-text-muted leading-snug">
                {qsRuleLabels.upstreamUpdateDesc}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onAcknowledgeUpdate}
              className={UI_TOKENS.button.actionPill}
            >
              {ctxLabels.acknowledgeButton}
            </button>
            <button
              type="button"
              onClick={requestResetAll}
              className={`${UI_TOKENS.button.danger} inline-flex items-center gap-1.5 !px-2.5 !py-1.5 !rounded-lg`}
            >
              {ctxLabels.resetAllButton}
            </button>
          </div>
        </div>
      )}

      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-text-main">
            {qsRuleLabels.summary(
              enabledCount,
              resolvedRules.length,
              rulesState.customRules.length
            )}
          </div>
          <p className="text-[11px] text-text-muted leading-snug mt-0.5">
            {qsRuleLabels.description}
          </p>
        </div>

        <button
          type="button"
          onClick={customForm ? () => setCustomForm(null) : openAddForm}
          className={UI_TOKENS.button.actionPill}
        >
          <Plus className="h-3.5 w-3.5" />
          <span>{customForm ? ctxLabels.cancelFormButton : qsRuleLabels.addCustomRuleButton}</span>
        </button>
      </div>

      {/* Add / Edit Custom Rule Form */}
      {customForm && (
        <form
          onSubmit={handleSubmitForm}
          className="rounded-xl border border-border-main bg-surface-subtle p-4 space-y-3"
        >
          <div className="text-xs font-semibold text-text-main">
            {customForm.editingId ? qsRuleLabels.formEditTitle : qsRuleLabels.formAddTitle}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-text-muted">
                {qsRuleLabels.fieldLabel}
              </label>
              <input
                type="text"
                data-native-undo="true"
                value={customForm.label}
                onChange={(e) => handleLabelChange(e.target.value)}
                placeholder={qsRuleLabels.fieldLabelPlaceholder}
                className={UI_TOKENS.input.field}
              />
              {formErrors.label && (
                <p className="text-[10.5px] text-red-600 dark:text-red-400">{formErrors.label}</p>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-text-muted">
                {qsRuleLabels.fieldId}
              </label>
              <input
                type="text"
                data-native-undo="true"
                value={customForm.id}
                onChange={(e) =>
                  setCustomForm((prev) =>
                    prev ? {...prev, id: e.target.value, idTouched: true} : prev
                  )
                }
                placeholder={qsRuleLabels.fieldIdPlaceholder}
                className={`${UI_TOKENS.input.field} font-mono`}
              />
              {formErrors.id && (
                <p className="text-[10.5px] text-red-600 dark:text-red-400">{formErrors.id}</p>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-text-muted">
                {qsRuleLabels.fieldLens}
              </label>
              <select
                value={customForm.lens}
                onChange={(e) =>
                  setCustomForm((prev) =>
                    prev ? {...prev, lens: e.target.value as QuickScanRuleLens} : prev
                  )
                }
                className={UI_TOKENS.input.field}
              >
                {QUICK_SCAN_RULE_LENSES.map((lens) => (
                  <option key={lens} value={lens}>
                    {lensLabels[lens]}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-text-muted">
                {qsRuleLabels.fieldScope}
              </label>
              <select
                value={customForm.scope}
                onChange={(e) =>
                  setCustomForm((prev) =>
                    prev ? {...prev, scope: e.target.value as QuickScanRuleScope} : prev
                  )
                }
                className={UI_TOKENS.input.field}
              >
                {QUICK_SCAN_RULE_SCOPES.map((scope) => (
                  <option key={scope} value={scope}>
                    {scope === 'document'
                      ? qsRuleLabels.scopeDocument
                      : qsRuleLabels.scopeMacroState}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="text-[11px] font-medium text-text-muted">{qsRuleLabels.fieldWhen}</div>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_SCAN_RULE_PREDICATES.map((pred) => {
                const active = customForm.when.includes(pred);
                return (
                  <button
                    key={pred}
                    type="button"
                    onClick={() => handleToggleWhenPredicate(pred)}
                    className={`rounded-md border px-2 py-0.5 text-[10.5px] transition-colors cursor-pointer ${
                      active
                        ? 'border-btn-primary-bg bg-btn-primary-bg text-btn-primary-text font-medium'
                        : 'border-border-main bg-surface text-text-muted hover:bg-surface-muted'
                    }`}
                  >
                    {qsRuleLabels.whenLabels[pred]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-text-muted">
              {qsRuleLabels.fieldInstructions}
            </label>
            <textarea
              data-native-undo="true"
              rows={2}
              value={customForm.instructions}
              onChange={(e) =>
                setCustomForm((prev) => (prev ? {...prev, instructions: e.target.value} : prev))
              }
              placeholder={qsRuleLabels.fieldInstructionsPlaceholder}
              className={`${UI_TOKENS.input.field} resize-y`}
            />
            {formErrors.instructions && (
              <p className="text-[10.5px] text-red-600 dark:text-red-400">
                {formErrors.instructions}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-text-muted">
                {qsRuleLabels.fieldTrueDesc}
              </label>
              <textarea
                data-native-undo="true"
                rows={2}
                value={customForm.trueDescription}
                onChange={(e) =>
                  setCustomForm((prev) =>
                    prev ? {...prev, trueDescription: e.target.value} : prev
                  )
                }
                placeholder={qsRuleLabels.fieldTrueDescPlaceholder}
                className={`${UI_TOKENS.input.field} resize-y`}
              />
              {formErrors.trueDescription && (
                <p className="text-[10.5px] text-red-600 dark:text-red-400">
                  {formErrors.trueDescription}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-text-muted">
                {qsRuleLabels.fieldFalseDesc}
              </label>
              <textarea
                data-native-undo="true"
                rows={2}
                value={customForm.falseDescription}
                onChange={(e) =>
                  setCustomForm((prev) =>
                    prev ? {...prev, falseDescription: e.target.value} : prev
                  )
                }
                placeholder={qsRuleLabels.fieldFalseDescPlaceholder}
                className={`${UI_TOKENS.input.field} resize-y`}
              />
              {formErrors.falseDescription && (
                <p className="text-[10.5px] text-red-600 dark:text-red-400">
                  {formErrors.falseDescription}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-text-muted">
              {qsRuleLabels.fieldEscalationHint}
            </label>
            <input
              type="text"
              data-native-undo="true"
              value={customForm.escalationHint}
              onChange={(e) =>
                setCustomForm((prev) => (prev ? {...prev, escalationHint: e.target.value} : prev))
              }
              placeholder={qsRuleLabels.fieldEscalationHintPlaceholder}
              className={UI_TOKENS.input.field}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setCustomForm(null);
                setFormErrors({});
              }}
              className={UI_TOKENS.button.actionPill}
            >
              {ctxLabels.cancelFormButton}
            </button>
            <button type="submit" className={UI_TOKENS.button.primary}>
              {customForm.editingId ? qsRuleLabels.updateRuleButton : qsRuleLabels.saveRuleButton}
            </button>
          </div>
        </form>
      )}

      {/* Grouped Rules List */}
      <div className="space-y-4">
        {groupedRules.map((group) => (
          <div key={group.lens} className="space-y-2">
            <div className="text-[10.5px] font-semibold uppercase tracking-wider text-text-faint">
              {lensLabels[group.lens]}
            </div>
            <div className="space-y-2">
              {group.rules.map((rule) => {
                const isExpanded = Boolean(expandedRuleIds[rule.id]);
                const hasOverride = Boolean(rulesState.ruleOverrides[rule.id]);

                return (
                  <article
                    key={rule.id}
                    className={`rounded-xl border border-border-main bg-surface overflow-hidden transition-opacity ${
                      rule.enabled ? '' : 'opacity-65'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedRuleIds((prev) => ({
                            ...prev,
                            [rule.id]: !prev[rule.id],
                          }))
                        }
                        aria-expanded={isExpanded}
                        className="flex flex-1 items-start gap-2 min-w-0 text-left cursor-pointer"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-text-faint mt-0.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-faint mt-0.5" />
                        )}
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-semibold text-text-main">
                              {rule.label}
                            </span>
                            <span className="rounded border border-border-subtle bg-surface-subtle px-1.5 py-0.5 font-mono text-[9.5px] text-text-muted">
                              {rule.scope === 'document' ? 'Doc' : 'Per S#'}
                            </span>
                            <span className="rounded border border-border-subtle bg-surface-subtle px-1.5 py-0.5 font-mono text-[9.5px] text-text-faint">
                              {rule.builtIn ? ctxLabels.builtInBadge : ctxLabels.customBadge}
                            </span>
                            {rule.isTextOverridden && (
                              <span className="rounded border px-1.5 py-0.5 font-mono text-[9.5px] auteur-phase-intent">
                                {ctxLabels.modifiedBadge}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-1 text-[10px] text-text-faint">
                            <span className="font-mono">{rule.id}</span>
                            <span>·</span>
                            <span>
                              {rule.when.map((w) => qsRuleLabels.whenLabels[w]).join(' + ')}
                            </span>
                          </div>
                        </div>
                      </button>

                      {/* Enable/Disable Switch */}
                      <button
                        type="button"
                        role="switch"
                        aria-checked={rule.enabled}
                        aria-label={qsRuleLabels.toggleAria(rule.label, rule.enabled)}
                        onClick={() => onSetRuleEnabled(rule.id, !rule.enabled)}
                        className={`relative inline-flex h-[18px] w-8 shrink-0 items-center rounded-full border transition-colors cursor-pointer ${
                          rule.enabled
                            ? 'border-btn-primary-bg bg-btn-primary-bg'
                            : 'border-border-main bg-surface-muted'
                        }`}
                      >
                        <span
                          className={`inline-block h-3 w-3 rounded-full transition-transform ${
                            rule.enabled
                              ? 'translate-x-[15px] bg-btn-primary-text'
                              : 'translate-x-0.5 bg-text-muted'
                          }`}
                        />
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-border-subtle bg-surface-subtle/50 px-3.5 py-3 space-y-2.5">
                        {rule.builtIn ? (
                          <>
                            <div className="space-y-1">
                              <label className="text-[10.5px] font-medium text-text-muted">
                                {qsRuleLabels.fieldInstructions}
                              </label>
                              <textarea
                                data-native-undo="true"
                                rows={2}
                                value={rule.instructions}
                                onChange={(e) =>
                                  onSetRuleTextOverride(rule.id, {
                                    instructionsOverride: e.target.value,
                                  })
                                }
                                className={`${UI_TOKENS.input.field} text-[11px] resize-y`}
                              />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              <div className="space-y-1">
                                <label className="text-[10.5px] font-medium text-text-muted">
                                  {qsRuleLabels.fieldTrueDesc}
                                </label>
                                <textarea
                                  data-native-undo="true"
                                  rows={2}
                                  value={rule.trueDescription}
                                  onChange={(e) =>
                                    onSetRuleTextOverride(rule.id, {
                                      trueDescriptionOverride: e.target.value,
                                    })
                                  }
                                  className={`${UI_TOKENS.input.field} text-[11px] resize-y`}
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10.5px] font-medium text-text-muted">
                                  {qsRuleLabels.fieldFalseDesc}
                                </label>
                                <textarea
                                  data-native-undo="true"
                                  rows={2}
                                  value={rule.falseDescription}
                                  onChange={(e) =>
                                    onSetRuleTextOverride(rule.id, {
                                      falseDescriptionOverride: e.target.value,
                                    })
                                  }
                                  className={`${UI_TOKENS.input.field} text-[11px] resize-y`}
                                />
                              </div>
                            </div>
                            {hasOverride && (
                              <div className="flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => onResetRule(rule.id)}
                                  className={UI_TOKENS.button.actionPill}
                                >
                                  <RotateCcw className="h-3 w-3" />
                                  <span>{ctxLabels.resetSkillButton}</span>
                                </button>
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            <div className="space-y-1.5 text-[11px] text-text-body">
                              <p>
                                <span className="font-semibold text-text-muted">Q: </span>
                                {rule.instructions}
                              </p>
                              <p>
                                <span className="font-semibold text-red-600 dark:text-red-400">
                                  True:{' '}
                                </span>
                                {rule.trueDescription}
                              </p>
                              <p>
                                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                  False:{' '}
                                </span>
                                {rule.falseDescription}
                              </p>
                            </div>
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => openEditForm(rule)}
                                className={UI_TOKENS.button.actionPill}
                              >
                                <Pencil className="h-3 w-3" />
                                <span>{ctxLabels.editButton}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => requestDeleteRule(rule)}
                                className={`${UI_TOKENS.button.danger} inline-flex items-center gap-1.5 !px-2.5 !py-1.5 !rounded-lg`}
                              >
                                <Trash2 className="h-3 w-3" />
                                <span>{ctxLabels.deleteButton}</span>
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
          </div>
        ))}
      </div>
    </div>
  );
}
