import {useEffect, useState} from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Braces,
  Check,
  ChevronRight,
  RotateCcw,
  Settings,
} from 'lucide-react';
import {LINT_RULE_REGISTRY, type LintRuleSeveritySetting} from '../core/index.ts';
import type {EditorSettings} from '../ui/editorSettings.ts';
import {UI_LABELS} from '../ui/labels.ts';
import {
  countCustomLintRules,
  DEFAULT_LINT_RULE_OVERRIDES,
  getEffectiveLintRuleSeverity,
  LINT_RULE_SEVERITY_OPTIONS,
  setLintRuleOverride,
} from '../ui/lintRules.ts';
import {
  DEFAULT_TEXT_SIZE,
  getTextSizeOption,
  stepTextSize,
  TEXT_SIZE_OPTIONS,
} from '../ui/textSize.ts';
import {THEME_OPTIONS} from '../ui/theme.ts';
import {UI_TOKENS} from '../ui/tokens/ui.ts';
import {DEFAULT_LIVE_SPLIT_PERCENT, isDefaultLiveSplit} from '../ui/workspaceSplit.ts';

interface SettingsPopoverProps {
  settings: EditorSettings;
  onUpdateSettings: (patch: Partial<EditorSettings>) => void;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  onOpenDebug?: () => void;
}

type SettingsPanel = 'main' | 'rules';

function getSeverityActiveClass(severity: LintRuleSeveritySetting): string {
  switch (severity) {
    case 'error':
      return 'bg-red-500/15 text-red-600 dark:text-red-400 font-semibold';
    case 'warning':
      return 'bg-amber-500/15 text-amber-700 dark:text-amber-400 font-semibold';
    case 'off':
      return 'bg-surface text-text-muted font-semibold shadow-2xs';
  }
}

/**
 * Unified top-bar Settings button (icon-only gear trigger) and live-preview display popover
 * housing Text Size, Clause Underlines, 4-mode Theme selection, Script Supervisor Rules,
 * and JSON IR Inspector launch.
 */
export function SettingsPopover({
  settings,
  onUpdateSettings,
  isOpen,
  onToggle,
  onClose,
  onOpenDebug,
}: SettingsPopoverProps) {
  const [panel, setPanel] = useState<SettingsPanel>('main');

  useEffect(() => {
    if (!isOpen) {
      setPanel('main');
    }
  }, [isOpen]);

  const {themeMode, textSize, clauseGuides, subStateIds, liveSplitPercent, lintRuleOverrides} =
    settings;
  const currentTextSize = getTextSizeOption(textSize);
  const canDecreaseText = textSize !== TEXT_SIZE_OPTIONS[0].id;
  const canIncreaseText = textSize !== TEXT_SIZE_OPTIONS[TEXT_SIZE_OPTIONS.length - 1].id;
  const isDefaultTextSize = textSize === DEFAULT_TEXT_SIZE;
  const isDefaultSplit = isDefaultLiveSplit(liveSplitPercent);
  const customRuleCount = countCustomLintRules(lintRuleOverrides);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-label={UI_LABELS.topBar.settingsAria}
        title={UI_LABELS.topBar.settingsButton}
        className={isOpen ? UI_TOKENS.button.iconPillActive : UI_TOKENS.button.iconPill}
      >
        <Settings
          className={`h-3.5 w-3.5 text-indigo-500 transition-transform duration-200 ${
            isOpen ? 'rotate-45' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          className={`absolute top-full right-0 mt-2 max-w-[calc(100vw-1.5rem)] bg-surface rounded-xl shadow-xl border border-border-main overflow-hidden z-50 text-text-main divide-y divide-border-subtle ${
            panel === 'rules' ? 'w-[356px]' : 'w-72'
          }`}
        >
          {panel === 'main' ? (
            <>
              <div className={UI_TOKENS.dropdown.header}>
                <span className={UI_TOKENS.dropdown.headerText}>
                  {UI_LABELS.topBar.settingsHeader}
                </span>
              </div>

              {/* Text Size Row */}
              <div className="px-3 py-2.5 flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-text-body">
                  {UI_LABELS.topBar.settingsTextSizeLabel}
                </span>
                <div
                  role="group"
                  aria-label={UI_LABELS.topBar.textSizeGroupAria}
                  className="inline-flex items-center rounded-lg border border-border-main bg-surface-subtle overflow-hidden shrink-0"
                >
                  <button
                    type="button"
                    disabled={!canDecreaseText}
                    onClick={() => onUpdateSettings({textSize: stepTextSize(textSize, -1)})}
                    title={UI_LABELS.topBar.decreaseTextSizeAria}
                    aria-label={UI_LABELS.topBar.decreaseTextSizeAria}
                    className="px-2 py-1 text-[11px] font-medium text-text-body hover:bg-surface-muted hover:text-text-main disabled:opacity-35 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors cursor-pointer"
                  >
                    {UI_LABELS.topBar.decreaseTextSizeLabel}
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdateSettings({textSize: DEFAULT_TEXT_SIZE})}
                    title={UI_LABELS.topBar.resetTextSizeTitle(
                      currentTextSize.scriptPx,
                      isDefaultTextSize
                    )}
                    aria-label={UI_LABELS.topBar.resetTextSizeAria(
                      currentTextSize.label,
                      currentTextSize.scriptPx
                    )}
                    className="inline-flex items-center justify-center border-x border-border-subtle bg-surface px-2 py-1 font-mono text-[11px] tabular-nums text-text-muted hover:text-text-main transition-colors cursor-pointer min-w-[42px]"
                  >
                    {currentTextSize.scriptPx}px
                  </button>
                  <button
                    type="button"
                    disabled={!canIncreaseText}
                    onClick={() => onUpdateSettings({textSize: stepTextSize(textSize, 1)})}
                    title={UI_LABELS.topBar.increaseTextSizeAria}
                    aria-label={UI_LABELS.topBar.increaseTextSizeAria}
                    className="px-2 py-1 text-[11px] font-medium text-text-body hover:bg-surface-muted hover:text-text-main disabled:opacity-35 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors cursor-pointer"
                  >
                    {UI_LABELS.topBar.increaseTextSizeLabel}
                  </button>
                </div>
              </div>

              {/* Clause Underlines Toggle Row */}
              <div className="px-3 py-2.5 flex items-center justify-between gap-3">
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-medium text-text-body">
                    {UI_LABELS.topBar.settingsClauseGuidesLabel}
                  </span>
                  <span className="text-[10.5px] text-text-faint leading-tight mt-0.5">
                    {UI_LABELS.topBar.settingsClauseGuidesDesc}
                  </span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={clauseGuides}
                  aria-label={UI_LABELS.topBar.clauseGuidesAria(clauseGuides)}
                  onClick={() => onUpdateSettings({clauseGuides: !clauseGuides})}
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors cursor-pointer ${
                    clauseGuides
                      ? 'bg-btn-primary-bg border-btn-primary-bg'
                      : 'bg-surface-muted border-border-main'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`inline-block h-3.5 w-3.5 rounded-full transition-transform ${
                      clauseGuides
                        ? 'translate-x-[18px] bg-btn-primary-text'
                        : 'translate-x-[2px] bg-text-faint'
                    }`}
                  />
                </button>
              </div>

              {/* Sub-State IDs Toggle Row */}
              <div className="px-3 py-2.5 flex items-center justify-between gap-3">
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-medium text-text-body">
                    {UI_LABELS.topBar.settingsSubStateIdsLabel}
                  </span>
                  <span className="text-[10.5px] text-text-faint leading-tight mt-0.5">
                    {UI_LABELS.topBar.settingsSubStateIdsDesc}
                  </span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={subStateIds}
                  aria-label={UI_LABELS.topBar.subStateIdsAria(subStateIds)}
                  onClick={() => onUpdateSettings({subStateIds: !subStateIds})}
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors cursor-pointer ${
                    subStateIds
                      ? 'bg-btn-primary-bg border-btn-primary-bg'
                      : 'bg-surface-muted border-border-main'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`inline-block h-3.5 w-3.5 rounded-full transition-transform ${
                      subStateIds
                        ? 'translate-x-[18px] bg-btn-primary-text'
                        : 'translate-x-[2px] bg-text-faint'
                    }`}
                  />
                </button>
              </div>

              {/* Column Layout Reset Row (Live Mode desktop split) */}
              <div className="hidden sm:flex px-3 py-2.5 items-center justify-between gap-3">
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-medium text-text-body">
                    {UI_LABELS.topBar.settingsLayoutLabel}
                  </span>
                  <span className="text-[10.5px] text-text-faint leading-tight mt-0.5">
                    {UI_LABELS.topBar.settingsLayoutDesc}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={isDefaultSplit}
                  onClick={() => onUpdateSettings({liveSplitPercent: DEFAULT_LIVE_SPLIT_PERCENT})}
                  aria-label={UI_LABELS.topBar.settingsLayoutResetAria}
                  className="inline-flex items-center gap-1 shrink-0 rounded-md border border-border-main bg-surface-subtle px-2 py-1 text-[11px] font-medium text-text-body hover:bg-surface-muted hover:text-text-main disabled:opacity-35 disabled:hover:bg-surface-subtle disabled:hover:text-text-body disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>{UI_LABELS.topBar.settingsLayoutReset}</span>
                </button>
              </div>

              {/* Theme 2x2 Grid */}
              <div className="px-3 py-2.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-text-faint mb-2">
                  {UI_LABELS.topBar.settingsThemeLabel}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {THEME_OPTIONS.map((option) => {
                    const isActive = option.id === themeMode;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => onUpdateSettings({themeMode: option.id})}
                        aria-pressed={isActive}
                        className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors cursor-pointer ${
                          isActive
                            ? 'border-text-main/40 bg-surface-muted font-semibold text-text-main'
                            : 'border-border-subtle bg-surface hover:bg-surface-subtle font-medium text-text-body hover:text-text-main'
                        }`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span
                            aria-hidden="true"
                            className="h-3 w-3 rounded-full border shrink-0"
                            style={{
                              backgroundColor: option.swatchBg,
                              borderColor: option.swatchBorder,
                            }}
                          />
                          <span className="truncate">{option.label}</span>
                        </span>
                        {isActive && <Check className="h-3 w-3 shrink-0 text-text-main" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Supervisor Rules Entry Row */}
              <button
                type="button"
                onClick={() => setPanel('rules')}
                aria-label={UI_LABELS.topBar.settingsRulesOpenAria}
                className="w-full px-3 py-2.5 flex items-center justify-between gap-3 text-left hover:bg-surface-subtle transition-colors cursor-pointer"
              >
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-medium text-text-body">
                    {UI_LABELS.topBar.settingsRulesLabel}
                  </span>
                  <span className="text-[10.5px] text-text-faint leading-tight mt-0.5">
                    {UI_LABELS.topBar.settingsRulesDesc}
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 shrink-0">
                  <span
                    className={`font-mono text-[10px] tabular-nums ${
                      customRuleCount > 0 ? 'font-semibold text-text-main' : 'text-text-faint'
                    }`}
                  >
                    {customRuleCount > 0
                      ? UI_LABELS.topBar.settingsRulesSummaryCustom(customRuleCount)
                      : UI_LABELS.topBar.settingsRulesSummaryDefault}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 text-text-faint" />
                </span>
              </button>

              {/* JSON IR Inspector Action Row */}
              {onOpenDebug && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenDebug();
                  }}
                  aria-label={UI_LABELS.topBar.settingsJsonIrOpenAria}
                  className="w-full px-3 py-2.5 flex items-center justify-between gap-3 text-left hover:bg-surface-subtle transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Braces className="h-3.5 w-3.5 text-purple-500 shrink-0" />
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-medium text-text-body">
                        {UI_LABELS.topBar.settingsJsonIrLabel}
                      </span>
                      <span className="text-[10.5px] text-text-faint leading-tight mt-0.5 truncate">
                        {UI_LABELS.topBar.settingsJsonIrDesc}
                      </span>
                    </div>
                  </div>
                  <ArrowUpRight className="h-3.5 w-3.5 text-text-faint shrink-0" />
                </button>
              )}
            </>
          ) : (
            <>
              {/* Supervisor Rules Sub-Panel Header */}
              <div className={UI_TOKENS.dropdown.header}>
                <div className="flex items-center gap-1.5 min-w-0">
                  <button
                    type="button"
                    onClick={() => setPanel('main')}
                    aria-label={UI_LABELS.topBar.settingsRulesBackAria}
                    className="inline-flex items-center justify-center rounded-md p-0.5 text-text-muted hover:bg-surface-muted hover:text-text-main transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </button>
                  <span className={UI_TOKENS.dropdown.headerText}>
                    {UI_LABELS.topBar.settingsRulesHeader}
                  </span>
                </div>

                <button
                  type="button"
                  disabled={customRuleCount === 0}
                  onClick={() =>
                    onUpdateSettings({lintRuleOverrides: DEFAULT_LINT_RULE_OVERRIDES})
                  }
                  aria-label={UI_LABELS.topBar.settingsRulesResetAria}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-medium text-text-muted hover:bg-surface-muted hover:text-text-main disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-text-muted disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>{UI_LABELS.topBar.settingsRulesReset}</span>
                </button>
              </div>

              {/* Declarative Rule Rows */}
              <div className="max-h-[60vh] overflow-y-auto divide-y divide-border-subtle auteur-pane-scroll">
                {LINT_RULE_REGISTRY.map((rule) => {
                  const activeSeverity = getEffectiveLintRuleSeverity(rule.id, lintRuleOverrides);
                  const isCustomized = activeSeverity !== rule.defaultSeverity;

                  return (
                    <div key={rule.id} className="px-3 py-2.5 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 pt-0.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-[11.5px] font-medium text-text-main leading-snug truncate">
                              {rule.name}
                            </span>
                            {isCustomized && (
                              <span
                                aria-hidden="true"
                                className="h-1.5 w-1.5 rounded-full bg-text-muted shrink-0"
                              />
                            )}
                          </div>
                          <span className="font-mono text-[9.5px] text-text-faint block">
                            {UI_LABELS.topBar.settingsRulesLensShort(rule.lens)}
                          </span>
                        </div>

                        <div
                          role="group"
                          aria-label={UI_LABELS.topBar.settingsRulesSeverityGroupAria(rule.name)}
                          className="inline-flex items-center rounded-lg border border-border-main bg-surface-subtle p-0.5 shrink-0"
                        >
                          {LINT_RULE_SEVERITY_OPTIONS.map((option) => {
                            const isSelected = activeSeverity === option;
                            return (
                              <button
                                key={option}
                                type="button"
                                aria-pressed={isSelected}
                                onClick={() =>
                                  onUpdateSettings({
                                    lintRuleOverrides: setLintRuleOverride(
                                      lintRuleOverrides,
                                      rule.id,
                                      option
                                    ),
                                  })
                                }
                                className={`px-1.5 py-0.5 rounded-md text-[10.5px] leading-tight transition-colors cursor-pointer ${
                                  isSelected
                                    ? getSeverityActiveClass(option)
                                    : 'text-text-faint hover:text-text-body hover:bg-surface/60 font-medium'
                                }`}
                              >
                                {UI_LABELS.topBar.settingsRulesSeverityLabels[option]}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <p className="text-[10.5px] text-text-muted leading-snug">
                        {rule.description}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Subtle Footer Note */}
              <div className="px-3 py-2 bg-surface-subtle">
                <p className="text-[10px] text-text-faint leading-snug">
                  {UI_LABELS.topBar.settingsRulesFootnote}
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
