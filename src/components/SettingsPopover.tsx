import {Check, Settings} from 'lucide-react';
import type {EditorSettings} from '../ui/editorSettings.ts';
import {UI_LABELS} from '../ui/labels.ts';
import {
  DEFAULT_TEXT_SIZE,
  getTextSizeOption,
  stepTextSize,
  TEXT_SIZE_OPTIONS,
} from '../ui/textSize.ts';
import {THEME_OPTIONS} from '../ui/theme.ts';
import {UI_TOKENS} from '../ui/tokens/ui.ts';

interface SettingsPopoverProps {
  settings: EditorSettings;
  onUpdateSettings: (patch: Partial<EditorSettings>) => void;
  isOpen: boolean;
  onToggle: () => void;
}

/**
 * Unified top-bar Settings button (gear icon) and live-preview display popover
 * housing Text Size, Clause Underlines, and 4-mode Theme selection.
 */
export function SettingsPopover({
  settings,
  onUpdateSettings,
  isOpen,
  onToggle,
}: SettingsPopoverProps) {
  const {themeMode, textSize, clauseGuides} = settings;
  const currentTextSize = getTextSizeOption(textSize);
  const canDecreaseText = textSize !== TEXT_SIZE_OPTIONS[0].id;
  const canIncreaseText = textSize !== TEXT_SIZE_OPTIONS[TEXT_SIZE_OPTIONS.length - 1].id;
  const isDefaultTextSize = textSize === DEFAULT_TEXT_SIZE;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-label={UI_LABELS.topBar.settingsAria}
        title={UI_LABELS.topBar.settingsButton}
        className={isOpen ? UI_TOKENS.button.filePillActive : UI_TOKENS.button.filePill}
      >
        <Settings className="h-3.5 w-3.5 text-text-muted" />
        <span className="hidden md:inline">{UI_LABELS.topBar.settingsButton}</span>
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-72 bg-surface rounded-xl shadow-xl border border-border-main overflow-hidden z-50 text-text-main divide-y divide-border-subtle">
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
        </div>
      )}
    </div>
  );
}
