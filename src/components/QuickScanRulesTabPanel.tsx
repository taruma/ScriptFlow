import {type FormEvent, useMemo, useState} from 'react';
import {AlertTriangle, Plus} from 'lucide-react';
import {
  QUICK_SCAN_RULE_LENSES,
  type QuickScanRuleLens,
  type QuickScanRulePredicate,
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
import {
  CustomQuickScanRuleForm,
  type CustomRuleFormState,
} from './ai/quickScan/CustomQuickScanRuleForm.tsx';
import {QuickScanRuleRow} from './ai/quickScan/QuickScanRuleRow.tsx';

export interface QuickScanRulesTabPanelProps {
  rulesState: QuickScanRulesState;
  hasUpstreamUpdate: boolean;
  onSetRuleEnabled: (ruleId: string, enabled: boolean) => void;
  onSetAllRulesEnabled?: (enabled: boolean) => void;
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
  onRequestResetAllRules?: () => void;
  onAcknowledgeUpdate: () => void;
  onRequestConfirm: (request: ConfirmDialogRequest) => void;
}

export function QuickScanRulesTabPanel({
  rulesState,
  hasUpstreamUpdate,
  onSetRuleEnabled,
  onSetAllRulesEnabled,
  onSetRuleTextOverride,
  onResetRule,
  onSaveCustomRule,
  onDeleteCustomRule,
  onResetAllRules,
  onRequestResetAllRules,
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

  const handleSubmitForm = (event: FormEvent) => {
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

  const handleToggleExpand = (ruleId: string) => {
    setExpandedRuleIds((prev) => ({
      ...prev,
      [ruleId]: !prev[ruleId],
    }));
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
    if (onRequestResetAllRules) {
      onRequestResetAllRules();
      return;
    }
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

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {onSetAllRulesEnabled && resolvedRules.length > 0 && (
            <>
              <button
                type="button"
                disabled={enabledCount === resolvedRules.length}
                onClick={() => onSetAllRulesEnabled(true)}
                aria-label={qsRuleLabels.enableAllRulesAria}
                className={`${UI_TOKENS.button.actionPill} disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                <span>{qsRuleLabels.enableAllRulesButton}</span>
              </button>
              <button
                type="button"
                disabled={enabledCount === 0}
                onClick={() => onSetAllRulesEnabled(false)}
                aria-label={qsRuleLabels.disableAllRulesAria}
                className={`${UI_TOKENS.button.actionPill} disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                <span>{qsRuleLabels.disableAllRulesButton}</span>
              </button>
            </>
          )}
          <button
            type="button"
            onClick={customForm ? () => setCustomForm(null) : openAddForm}
            className={UI_TOKENS.button.actionPill}
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{customForm ? ctxLabels.cancelFormButton : qsRuleLabels.addCustomRuleButton}</span>
          </button>
        </div>
      </div>

      {/* Add / Edit Custom Rule Form */}
      {customForm && (
        <CustomQuickScanRuleForm
          form={customForm}
          errors={formErrors}
          onSubmit={handleSubmitForm}
          onCancel={() => {
            setCustomForm(null);
            setFormErrors({});
          }}
          onLabelChange={handleLabelChange}
          onIdChange={(value) =>
            setCustomForm((prev) => (prev ? {...prev, id: value, idTouched: true} : prev))
          }
          onLensChange={(lens) => setCustomForm((prev) => (prev ? {...prev, lens} : prev))}
          onScopeChange={(scope) => setCustomForm((prev) => (prev ? {...prev, scope} : prev))}
          onToggleWhenPredicate={handleToggleWhenPredicate}
          onInstructionsChange={(instructions) =>
            setCustomForm((prev) => (prev ? {...prev, instructions} : prev))
          }
          onTrueDescriptionChange={(trueDescription) =>
            setCustomForm((prev) => (prev ? {...prev, trueDescription} : prev))
          }
          onFalseDescriptionChange={(falseDescription) =>
            setCustomForm((prev) => (prev ? {...prev, falseDescription} : prev))
          }
          onEscalationHintChange={(escalationHint) =>
            setCustomForm((prev) => (prev ? {...prev, escalationHint} : prev))
          }
        />
      )}

      {/* Grouped Rules List */}
      <div className="space-y-4">
        {groupedRules.map((group) => (
          <div key={group.lens} className="space-y-2">
            <div className="text-[10.5px] font-semibold uppercase tracking-wider text-text-faint">
              {lensLabels[group.lens]}
            </div>
            <div className="space-y-2">
              {group.rules.map((rule) => (
                <QuickScanRuleRow
                  key={rule.id}
                  rule={rule}
                  isExpanded={Boolean(expandedRuleIds[rule.id])}
                  hasOverride={Boolean(rulesState.ruleOverrides[rule.id])}
                  onToggleExpand={handleToggleExpand}
                  onSetRuleEnabled={onSetRuleEnabled}
                  onSetRuleTextOverride={onSetRuleTextOverride}
                  onResetRule={onResetRule}
                  onEditCustomRule={openEditForm}
                  onDeleteCustomRule={requestDeleteRule}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
