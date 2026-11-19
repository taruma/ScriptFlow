import {useEffect, useRef, useState} from 'react';
import {
  AlertCircle,
  AlertTriangle,
  BookOpen,
  Braces,
  Check,
  ChevronDown,
  Code2,
  Copy,
  Eye,
  FilePlus2,
  Settings,
} from 'lucide-react';
import type {LintDiagnostic} from '../core/types.ts';
import type {ScriptPreset} from '../data/presets.ts';
import {APP_META, UI_LABELS} from '../ui/labels.ts';
import {
  DEFAULT_TEXT_SIZE,
  getTextSizeOption,
  stepTextSize,
  TEXT_SIZE_OPTIONS,
  type TextSizePreset,
} from '../ui/textSize.ts';
import {THEME_OPTIONS, type ThemeMode} from '../ui/theme.ts';
import {UI_TOKENS} from '../ui/tokens/ui.ts';

export type ViewMode = 'live' | 'source';

interface TopSlateBarProps {
  title: string;
  onTitleChange: (nextTitle: string) => void;
  beatCount: number;
  diagnostics: LintDiagnostic[];
  onJumpToFirstDiagnostic: () => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  presets: ScriptPreset[];
  activePresetId: string | null;
  onSelectPreset: (preset: ScriptPreset) => void;
  onNewBlank: () => void;
  themeMode: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
  textSize: TextSizePreset;
  onTextSizeChange: (preset: TextSizePreset) => void;
  clauseGuides: boolean;
  onToggleClauseGuides: () => void;
  onCopyPlainText: () => void;
  onCopyTagless: () => void;
  copiedKind: 'plain' | 'tagless' | null;
  onOpenDebug?: () => void;
  isDebugOpen?: boolean;
}

type OpenMenu = 'presets' | 'settings' | 'copy' | null;

export function TopSlateBar({
  title,
  onTitleChange,
  beatCount,
  diagnostics,
  onJumpToFirstDiagnostic,
  viewMode,
  onViewModeChange,
  presets,
  activePresetId,
  onSelectPreset,
  onNewBlank,
  themeMode,
  onThemeChange,
  textSize,
  onTextSizeChange,
  clauseGuides,
  onToggleClauseGuides,
  onCopyPlainText,
  onCopyTagless,
  copiedKind,
  onOpenDebug,
  isDebugOpen = false,
}: TopSlateBarProps) {
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const barRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!openMenu) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenu(null);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openMenu]);

  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
  const warningCount = diagnostics.filter((d) => d.severity === 'warning').length;
  const currentTextSize = getTextSizeOption(textSize);
  const canDecreaseText = textSize !== TEXT_SIZE_OPTIONS[0].id;
  const canIncreaseText = textSize !== TEXT_SIZE_OPTIONS[TEXT_SIZE_OPTIONS.length - 1].id;
  const isDefaultTextSize = textSize === DEFAULT_TEXT_SIZE;

  return (
    <header ref={barRef} className={`${UI_TOKENS.layout.appHeader} sticky top-0`}>
      {/* Left Zone: Scene Title + Live Beat Count + Quiet Diagnostic Jump */}
      <div className="flex min-w-0 flex-1 items-center gap-2 pr-2">
        <div className="inline-grid min-w-0 max-w-[260px] items-center">
          <span
            aria-hidden="true"
            className="invisible col-start-1 row-start-1 whitespace-pre truncate px-1.5 py-1 font-serif text-sm font-bold tracking-tight"
          >
            {title || APP_META.untitledScene}
          </span>
          <input
            type="text"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            aria-label={UI_LABELS.topBar.sceneTitleAria}
            placeholder={APP_META.untitledScene}
            className="col-start-1 row-start-1 min-w-[4ch] w-full truncate rounded-md bg-transparent px-1.5 py-1 font-serif text-sm font-bold tracking-tight text-text-main hover:bg-surface-subtle focus:bg-surface-subtle focus:outline-none focus:ring-1 focus:ring-border-main"
          />
        </div>

        <div className="hidden sm:flex items-center gap-2 text-xs text-text-faint whitespace-nowrap shrink-0">
          <span aria-hidden="true">·</span>
          <span className="font-mono text-[11px] tabular-nums">
            {beatCount} {UI_LABELS.topBar.beatUnit(beatCount)}
          </span>
        </div>

        {diagnostics.length > 0 && (
          <button
            type="button"
            onClick={onJumpToFirstDiagnostic}
            title={UI_LABELS.topBar.jumpToFirstDiagnostic}
            className={`hidden md:inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-medium tabular-nums transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              errorCount > 0
                ? 'text-red-500 hover:bg-red-500/10'
                : 'text-amber-500 hover:bg-amber-500/10'
            }`}
          >
            {errorCount > 0 ? (
              <AlertCircle className="h-3.5 w-3.5" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5" />
            )}
            <span>
              {errorCount > 0 && UI_LABELS.topBar.errorShort(errorCount)}
              {errorCount > 0 && warningCount > 0 && ' · '}
              {warningCount > 0 && UI_LABELS.topBar.warningShort(warningCount)}
            </span>
          </button>
        )}
      </div>

      {/* Center Zone: [ Live | Source ] Segmented Toggle */}
      <div className="flex items-center justify-center shrink-0">
        <div
          role="tablist"
          aria-label={UI_LABELS.topBar.viewModeAria}
          className={UI_TOKENS.button.segmentedGroup}
        >
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'live'}
            onClick={() => onViewModeChange('live')}
            className={
              viewMode === 'live'
                ? UI_TOKENS.button.segmentedItemActive
                : UI_TOKENS.button.segmentedItem
            }
          >
            <Eye className="h-3.5 w-3.5" />
            <span>{UI_LABELS.topBar.liveMode}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'source'}
            onClick={() => onViewModeChange('source')}
            className={
              viewMode === 'source'
                ? UI_TOKENS.button.segmentedItemActive
                : UI_TOKENS.button.segmentedItem
            }
          >
            <Code2 className="h-3.5 w-3.5" />
            <span>{UI_LABELS.topBar.sourceMode}</span>
          </button>
        </div>
      </div>

      {/* Right Zone: Optional Debug Inspector, Presets, Settings, Copy */}
      <div className="flex flex-1 items-center justify-end gap-1.5 pl-2">
        {onOpenDebug && (
          <button
            type="button"
            onClick={() => {
              setOpenMenu(null);
              onOpenDebug();
            }}
            aria-label={UI_LABELS.topBar.debugAria}
            aria-expanded={isDebugOpen}
            className={isDebugOpen ? UI_TOKENS.button.filePillActive : UI_TOKENS.button.filePill}
          >
            <Braces className="h-3.5 w-3.5 text-text-muted" />
            <span className="hidden lg:inline">{UI_LABELS.topBar.debugButton}</span>
          </button>
        )}

        {/* Presets Menu */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpenMenu((prev) => (prev === 'presets' ? null : 'presets'))}
            aria-expanded={openMenu === 'presets'}
            className={
              openMenu === 'presets' ? UI_TOKENS.button.filePillActive : UI_TOKENS.button.filePill
            }
          >
            <BookOpen className="h-3.5 w-3.5 text-text-muted" />
            <span className="hidden sm:inline">{UI_LABELS.topBar.presetsButton}</span>
            <ChevronDown className="h-3 w-3 text-text-faint" />
          </button>

          {openMenu === 'presets' && (
            <div className={UI_TOKENS.dropdown.menuWide}>
              <div className={UI_TOKENS.dropdown.header}>
                <span className={UI_TOKENS.dropdown.headerText}>
                  {UI_LABELS.topBar.presetsHeader}
                </span>
              </div>
              <div className="py-1">
                {presets.map((preset) => {
                  const isActive = preset.id === activePresetId;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        onSelectPreset(preset);
                        setOpenMenu(null);
                      }}
                      className={`${
                        isActive ? UI_TOKENS.dropdown.itemActive : UI_TOKENS.dropdown.item
                      } flex-col items-start gap-0.5 py-2`}
                    >
                      <div className="flex w-full items-center justify-between gap-2">
                        <span className="truncate">{preset.title}</span>
                        {isActive && <Check className="h-3.5 w-3.5 shrink-0 text-text-main" />}
                      </div>
                      <span className="font-mono text-[10px] text-text-faint">
                        {preset.topology}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="py-1">
                <button
                  type="button"
                  onClick={() => {
                    onNewBlank();
                    setOpenMenu(null);
                  }}
                  className={UI_TOKENS.dropdown.item}
                >
                  <span className="inline-flex items-center gap-2">
                    <FilePlus2 className="h-3.5 w-3.5 text-text-muted" />
                    <span>{UI_LABELS.topBar.newBlankScript}</span>
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Settings Popover (Text Size, Clause Underlines, Theme) */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpenMenu((prev) => (prev === 'settings' ? null : 'settings'))}
            aria-expanded={openMenu === 'settings'}
            aria-label={UI_LABELS.topBar.settingsAria}
            title={UI_LABELS.topBar.settingsButton}
            className={
              openMenu === 'settings' ? UI_TOKENS.button.filePillActive : UI_TOKENS.button.filePill
            }
          >
            <Settings className="h-3.5 w-3.5 text-text-muted" />
            <span className="hidden md:inline">{UI_LABELS.topBar.settingsButton}</span>
          </button>

          {openMenu === 'settings' && (
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
                    onClick={() => onTextSizeChange(stepTextSize(textSize, -1))}
                    title={UI_LABELS.topBar.decreaseTextSizeAria}
                    aria-label={UI_LABELS.topBar.decreaseTextSizeAria}
                    className="px-2 py-1 text-[11px] font-medium text-text-body hover:bg-surface-muted hover:text-text-main disabled:opacity-35 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors cursor-pointer"
                  >
                    {UI_LABELS.topBar.decreaseTextSizeLabel}
                  </button>
                  <button
                    type="button"
                    onClick={() => onTextSizeChange(DEFAULT_TEXT_SIZE)}
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
                    onClick={() => onTextSizeChange(stepTextSize(textSize, 1))}
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
                  onClick={onToggleClauseGuides}
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
                        onClick={() => onThemeChange(option.id)}
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

        {/* Copy Menu */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpenMenu((prev) => (prev === 'copy' ? null : 'copy'))}
            aria-expanded={openMenu === 'copy'}
            className={
              copiedKind ? UI_TOKENS.button.actionPillActive : UI_TOKENS.button.filePill
            }
          >
            {copiedKind ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-text-muted" />
            )}
            <span>
              {copiedKind === 'plain'
                ? UI_LABELS.topBar.copiedPlain
                : copiedKind === 'tagless'
                  ? UI_LABELS.topBar.copiedTagless
                  : UI_LABELS.topBar.copyButton}
            </span>
            {!copiedKind && <ChevronDown className="h-3 w-3 text-text-faint" />}
          </button>

          {openMenu === 'copy' && (
            <div className={UI_TOKENS.dropdown.menuRight}>
              <div className={UI_TOKENS.dropdown.header}>
                <span className={UI_TOKENS.dropdown.headerText}>
                  {UI_LABELS.topBar.copyHeader}
                </span>
              </div>
              <div className="py-1">
                <button
                  type="button"
                  onClick={() => {
                    onCopyPlainText();
                    setOpenMenu(null);
                  }}
                  className={`${UI_TOKENS.dropdown.item} flex-col items-start gap-0.5 py-2`}
                >
                  <span>{UI_LABELS.topBar.copyPlainTitle}</span>
                  <span className="text-[10px] font-normal text-text-faint">
                    {UI_LABELS.topBar.copyPlainDesc}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onCopyTagless();
                    setOpenMenu(null);
                  }}
                  className={`${UI_TOKENS.dropdown.item} flex-col items-start gap-0.5 py-2`}
                >
                  <span>{UI_LABELS.topBar.copyTaglessTitle}</span>
                  <span className="text-[10px] font-normal text-text-faint">
                    {UI_LABELS.topBar.copyTaglessDesc}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
