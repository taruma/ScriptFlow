import {ChevronDown, ChevronRight, Pencil, RotateCcw, Trash2} from 'lucide-react';
import type {ResolvedQuickScanRule} from '../../../services/geminiDecisions.ts';
import {UI_LABELS} from '../../../ui/labels.ts';
import {UI_TOKENS} from '../../../ui/tokens/ui.ts';

export interface QuickScanRuleRowProps {
  rule: ResolvedQuickScanRule;
  isExpanded: boolean;
  hasOverride: boolean;
  onToggleExpand: (ruleId: string) => void;
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
  onEditCustomRule: (rule: ResolvedQuickScanRule) => void;
  onDeleteCustomRule: (rule: ResolvedQuickScanRule) => void;
}

export function QuickScanRuleRow({
  rule,
  isExpanded,
  hasOverride,
  onToggleExpand,
  onSetRuleEnabled,
  onSetRuleTextOverride,
  onResetRule,
  onEditCustomRule,
  onDeleteCustomRule,
}: QuickScanRuleRowProps) {
  const ctxLabels = UI_LABELS.ai.contextInspector;
  const qsRuleLabels = ctxLabels.quickScanRules;

  return (
    <article
      className={`rounded-xl border border-border-main bg-surface overflow-hidden transition-opacity ${
        rule.enabled ? '' : 'opacity-65'
      }`}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => onToggleExpand(rule.id)}
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
              <span className="text-xs font-semibold text-text-main">{rule.label}</span>
              <span className="rounded border border-border-subtle bg-surface-subtle px-1.5 py-0.5 font-mono text-[9.5px] text-text-muted">
                {rule.scope === 'document'
                  ? 'Doc'
                  : rule.scope === 'macro_state'
                    ? 'Per S#'
                    : 'Per S#.#'}
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
              <span>{rule.when.map((w) => qsRuleLabels.whenLabels[w]).join(' + ')}</span>
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
                  <span className="font-semibold text-red-600 dark:text-red-400">True: </span>
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
                  onClick={() => onEditCustomRule(rule)}
                  className={UI_TOKENS.button.actionPill}
                >
                  <Pencil className="h-3 w-3" />
                  <span>{ctxLabels.editButton}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteCustomRule(rule)}
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
}
