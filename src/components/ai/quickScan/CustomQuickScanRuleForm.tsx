import type {FormEvent} from 'react';
import {
  QUICK_SCAN_RULE_LENSES,
  QUICK_SCAN_RULE_PREDICATES,
  QUICK_SCAN_RULE_SCOPES,
  type QuickScanRuleLens,
  type QuickScanRulePredicate,
  type QuickScanRuleScope,
} from '../../../data/knowledge/index.ts';
import {UI_LABELS} from '../../../ui/labels.ts';
import type {CustomQuickScanRuleValidationResult} from '../../../ui/quickScanRulesStore.ts';
import {UI_TOKENS} from '../../../ui/tokens/ui.ts';

export interface CustomRuleFormState {
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

export interface CustomQuickScanRuleFormProps {
  form: CustomRuleFormState;
  errors: CustomQuickScanRuleValidationResult['errors'];
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
  onLabelChange: (value: string) => void;
  onIdChange: (value: string) => void;
  onLensChange: (lens: QuickScanRuleLens) => void;
  onScopeChange: (scope: QuickScanRuleScope) => void;
  onToggleWhenPredicate: (predicate: QuickScanRulePredicate) => void;
  onInstructionsChange: (value: string) => void;
  onTrueDescriptionChange: (value: string) => void;
  onFalseDescriptionChange: (value: string) => void;
  onEscalationHintChange: (value: string) => void;
}

export function CustomQuickScanRuleForm({
  form,
  errors,
  onSubmit,
  onCancel,
  onLabelChange,
  onIdChange,
  onLensChange,
  onScopeChange,
  onToggleWhenPredicate,
  onInstructionsChange,
  onTrueDescriptionChange,
  onFalseDescriptionChange,
  onEscalationHintChange,
}: CustomQuickScanRuleFormProps) {
  const ctxLabels = UI_LABELS.ai.contextInspector;
  const qsRuleLabels = ctxLabels.quickScanRules;
  const lensLabels = UI_LABELS.ai.quickScan.lensLabels;

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl border border-border-main bg-surface-subtle p-4 space-y-3"
    >
      <div className="text-xs font-semibold text-text-main">
        {form.editingId ? qsRuleLabels.formEditTitle : qsRuleLabels.formAddTitle}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-text-muted">
            {qsRuleLabels.fieldLabel}
          </label>
          <input
            type="text"
            data-native-undo="true"
            value={form.label}
            onChange={(e) => onLabelChange(e.target.value)}
            placeholder={qsRuleLabels.fieldLabelPlaceholder}
            className={UI_TOKENS.input.field}
          />
          {errors.label && (
            <p className="text-[10.5px] text-red-600 dark:text-red-400">{errors.label}</p>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-[11px] font-medium text-text-muted">
            {qsRuleLabels.fieldId}
          </label>
          <input
            type="text"
            data-native-undo="true"
            value={form.id}
            onChange={(e) => onIdChange(e.target.value)}
            placeholder={qsRuleLabels.fieldIdPlaceholder}
            className={`${UI_TOKENS.input.field} font-mono`}
          />
          {errors.id && (
            <p className="text-[10.5px] text-red-600 dark:text-red-400">{errors.id}</p>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-[11px] font-medium text-text-muted">
            {qsRuleLabels.fieldLens}
          </label>
          <select
            value={form.lens}
            onChange={(e) => onLensChange(e.target.value as QuickScanRuleLens)}
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
            value={form.scope}
            onChange={(e) => onScopeChange(e.target.value as QuickScanRuleScope)}
            className={UI_TOKENS.input.field}
          >
            {QUICK_SCAN_RULE_SCOPES.map((scope) => (
              <option key={scope} value={scope}>
                {scope === 'document'
                  ? qsRuleLabels.scopeDocument
                  : scope === 'macro_state'
                    ? qsRuleLabels.scopeMacroState
                    : qsRuleLabels.scopeSubState}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="text-[11px] font-medium text-text-muted">{qsRuleLabels.fieldWhen}</div>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_SCAN_RULE_PREDICATES.map((pred) => {
            const active = form.when.includes(pred);
            return (
              <button
                key={pred}
                type="button"
                onClick={() => onToggleWhenPredicate(pred)}
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
          value={form.instructions}
          onChange={(e) => onInstructionsChange(e.target.value)}
          placeholder={qsRuleLabels.fieldInstructionsPlaceholder}
          className={`${UI_TOKENS.input.field} resize-y`}
        />
        {errors.instructions && (
          <p className="text-[10.5px] text-red-600 dark:text-red-400">{errors.instructions}</p>
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
            value={form.trueDescription}
            onChange={(e) => onTrueDescriptionChange(e.target.value)}
            placeholder={qsRuleLabels.fieldTrueDescPlaceholder}
            className={`${UI_TOKENS.input.field} resize-y`}
          />
          {errors.trueDescription && (
            <p className="text-[10.5px] text-red-600 dark:text-red-400">
              {errors.trueDescription}
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
            value={form.falseDescription}
            onChange={(e) => onFalseDescriptionChange(e.target.value)}
            placeholder={qsRuleLabels.fieldFalseDescPlaceholder}
            className={`${UI_TOKENS.input.field} resize-y`}
          />
          {errors.falseDescription && (
            <p className="text-[10.5px] text-red-600 dark:text-red-400">
              {errors.falseDescription}
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
          value={form.escalationHint}
          onChange={(e) => onEscalationHintChange(e.target.value)}
          placeholder={qsRuleLabels.fieldEscalationHintPlaceholder}
          className={UI_TOKENS.input.field}
        />
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className={UI_TOKENS.button.actionPill}>
          {ctxLabels.cancelFormButton}
        </button>
        <button type="submit" className={UI_TOKENS.button.primary}>
          {form.editingId ? qsRuleLabels.updateRuleButton : qsRuleLabels.saveRuleButton}
        </button>
      </div>
    </form>
  );
}
