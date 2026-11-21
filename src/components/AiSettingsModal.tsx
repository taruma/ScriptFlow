import {useEffect, useRef, useState} from 'react';
import {
  Check,
  Eye,
  EyeOff,
  KeyRound,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {getGeminiModelPricing} from '../ui/aiPricing.ts';
import {
  GEMINI_MODEL_OPTIONS,
  isDefaultAiPreferences,
  QUICK_SCAN_SENSITIVITY_OPTIONS,
  REASONING_LEVEL_OPTIONS,
  type AiSettings,
  type GeminiModelId,
  type QuickScanSensitivity,
  type ReasoningLevel,
} from '../ui/aiSettings.ts';
import {UI_LABELS} from '../ui/labels.ts';
import {UI_TOKENS} from '../ui/tokens/ui.ts';

export interface AiSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AiSettings;
  hasApiKey: boolean;
  onUpdateSettings: (patch: Partial<AiSettings>) => void;
  onSetApiKey: (apiKey: string) => void;
  onSetSessionOnly: (sessionOnly: boolean) => void;
  onClearApiKey: () => void;
  onResetDefaults: () => void;
}

function formatCompactRate(usdPer1M: number): string {
  return Number.isInteger(usdPer1M) ? `$${usdPer1M}` : `$${usdPer1M.toFixed(2)}`;
}

interface CompactToggleSwitchProps {
  checked: boolean;
  ariaLabel: string;
  onToggle: () => void;
}

function CompactToggleSwitch({checked, ariaLabel, onToggle}: CompactToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={onToggle}
      className={`relative inline-flex h-[18px] w-8 shrink-0 items-center rounded-full border transition-colors cursor-pointer ${
        checked
          ? 'border-btn-primary-bg bg-btn-primary-bg'
          : 'border-border-main bg-surface-muted'
      }`}
    >
      <span
        className={`inline-block h-3 w-3 rounded-full transition-transform ${
          checked ? 'translate-x-[15px] bg-btn-primary-text' : 'translate-x-0.5 bg-text-muted'
        }`}
      />
    </button>
  );
}

export function AiSettingsModal(props: AiSettingsModalProps) {
  if (!props.isOpen) return null;
  return <AiSettingsModalContent {...props} />;
}

function AiSettingsModalContent({
  onClose,
  settings,
  hasApiKey,
  onUpdateSettings,
  onSetApiKey,
  onSetSessionOnly,
  onClearApiKey,
  onResetDefaults,
}: Omit<AiSettingsModalProps, 'isOpen'>) {
  const [showKey, setShowKey] = useState(false);
  const [keyDraft, setKeyDraft] = useState(settings.apiKey);
  const keyInputRef = useRef<HTMLInputElement | null>(null);
  const labels = UI_LABELS.ai.settingsModal;

  const isAlreadyDefault = isDefaultAiPreferences(settings);
  const selectedReasoning =
    REASONING_LEVEL_OPTIONS.find((r) => r.id === settings.reasoningLevel) ??
    REASONING_LEVEL_OPTIONS[1];
  const selectedSensitivity =
    QUICK_SCAN_SENSITIVITY_OPTIONS.find((s) => s.id === settings.quickScanSensitivity) ??
    QUICK_SCAN_SENSITIVITY_OPTIONS[1];

  useEffect(() => {
    setKeyDraft(settings.apiKey);
  }, [settings.apiKey]);

  useEffect(() => {
    if (!hasApiKey) {
      keyInputRef.current?.focus();
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [hasApiKey, onClose]);

  const handleKeyInputChange = (value: string) => {
    setKeyDraft(value);
    onSetApiKey(value);
  };

  const handleClear = () => {
    setKeyDraft('');
    setShowKey(false);
    onClearApiKey();
    keyInputRef.current?.focus();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={labels.dialogAria}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      className={UI_TOKENS.modal.overlay}
    >
      <div className="bg-surface w-full max-w-[540px] rounded-2xl shadow-2xl overflow-hidden border border-border-main text-text-main flex flex-col max-h-[92dvh]">
        {/* Compact Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle bg-surface-subtle shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              aria-hidden="true"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border-main bg-surface text-text-main"
            >
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <h2 className="font-serif text-[15px] font-bold tracking-tight text-text-main leading-tight">
                {labels.title}
              </h2>
              <p className="text-[11px] text-text-muted truncate">{labels.subtitle}</p>
            </div>
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

        {/* Compact Body */}
        <div className="overflow-y-auto auteur-pane-scroll px-4 py-3.5 space-y-3.5">
          {/* Section 1: BYOK Gemini API Key */}
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="auteur-ai-api-key-input"
                className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted"
              >
                <KeyRound className="h-3 w-3 text-text-faint" />
                <span>{labels.apiKeyLabel}</span>
              </label>
              <span
                className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium ${
                  hasApiKey
                    ? 'auteur-phase-aesthetic'
                    : 'border-border-main bg-surface-subtle text-text-faint'
                }`}
              >
                {hasApiKey && <Check className="h-2.5 w-2.5" />}
                <span>{hasApiKey ? labels.keyConfiguredBadge : labels.keyMissingBadge}</span>
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <div className="relative flex-1 min-w-0">
                <input
                  ref={keyInputRef}
                  id="auteur-ai-api-key-input"
                  type={showKey ? 'text' : 'password'}
                  data-native-undo="true"
                  autoComplete="off"
                  spellCheck={false}
                  value={keyDraft}
                  onChange={(e) => handleKeyInputChange(e.target.value)}
                  placeholder={labels.apiKeyPlaceholder}
                  aria-label={labels.apiKeyAria}
                  className={`${UI_TOKENS.input.field} py-1.5 pr-8 font-mono`}
                />
                <button
                  type="button"
                  onClick={() => setShowKey((prev) => !prev)}
                  aria-label={showKey ? labels.hideKeyAria : labels.showKeyAria}
                  title={showKey ? labels.hideKeyAria : labels.showKeyAria}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-text-faint hover:text-text-main hover:bg-surface-muted transition-colors cursor-pointer"
                >
                  {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>

              <button
                type="button"
                onClick={handleClear}
                disabled={!hasApiKey && keyDraft.length === 0}
                aria-label={labels.clearKeyAria}
                className={`${UI_TOKENS.button.secondary} inline-flex items-center gap-1.5 px-3 py-1.5`}
              >
                <Trash2 className="h-3 w-3" />
                <span>{labels.clearKeyButton}</span>
              </button>
            </div>

            {/* Inline privacy assurance + Session-only toggle */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-[11px] text-text-muted">
              <div
                title={labels.privacyNote}
                className="flex items-center gap-1.5 min-w-0 text-[11px] text-text-muted"
              >
                <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[var(--phase-aesthetic-text)]" />
                <span className="truncate">{labels.privacyNoteShort}</span>
              </div>

              <div
                title={labels.sessionOnlyDesc}
                className="flex items-center gap-2 shrink-0 ml-auto"
              >
                <span className="text-[11px] font-medium text-text-body">
                  {labels.sessionOnlyLabel}
                </span>
                <CompactToggleSwitch
                  checked={settings.sessionOnly}
                  ariaLabel={labels.sessionOnlyAria}
                  onToggle={() => onSetSessionOnly(!settings.sessionOnly)}
                />
              </div>
            </div>
          </section>

          <hr className="border-border-subtle" />

          {/* Section 2: Gemini Models (3-col Gemini 4: Hydrogen -> Neon -> Carbon + slim Flash-Lite row) */}
          <section className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                {labels.modelLabel}
              </span>
              <span className="font-mono text-[10px] text-text-faint">{labels.modelMetaHint}</span>
            </div>

            <div
              role="radiogroup"
              aria-label={labels.modelGroupAria}
              className="space-y-1.5"
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {GEMINI_MODEL_OPTIONS.filter((option) => option.tier !== 'lite').map((option) => {
                  const selected = settings.model === option.id;
                  const pricing = getGeminiModelPricing(option.id);
                  const rateText = `${formatCompactRate(pricing.inputPer1M)} / ${formatCompactRate(
                    pricing.outputPer1M
                  )}`;

                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      title={`${option.id} — ${option.description}`}
                      onClick={() => onUpdateSettings({model: option.id as GeminiModelId})}
                      className={`flex flex-col justify-between gap-1.5 rounded-xl border px-2.5 py-2 text-left transition-colors cursor-pointer ${
                        selected
                          ? 'border-btn-primary-bg bg-surface-muted'
                          : 'border-border-main bg-surface hover:bg-surface-subtle'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="text-xs font-semibold text-text-main truncate">
                            {option.shortLabel}
                          </span>
                          <span
                            aria-hidden="true"
                            className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border ${
                              selected
                                ? 'border-btn-primary-bg bg-btn-primary-bg text-btn-primary-text'
                                : 'border-border-main bg-surface'
                            }`}
                          >
                            {selected && <Check className="h-2.5 w-2.5" />}
                          </span>
                        </div>
                        <p className="text-[10.5px] leading-snug text-text-muted">
                          {option.compactDesc}
                        </p>
                      </div>

                      <div className="flex items-center justify-between gap-1 pt-0.5 border-t border-border-subtle/70 font-mono text-[10px] text-text-faint tabular-nums">
                        <span>{rateText}</span>
                        {pricing.isPromoRate && (
                          <span className="rounded px-1 py-0.25 text-[9px] auteur-phase-aesthetic">
                            {labels.modelPromoBadge}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {GEMINI_MODEL_OPTIONS.filter((option) => option.tier === 'lite').map((option) => {
                const selected = settings.model === option.id;
                const pricing = getGeminiModelPricing(option.id);
                const rateText = `${formatCompactRate(pricing.inputPer1M)} / ${formatCompactRate(
                  pricing.outputPer1M
                )}`;

                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    title={`${option.id} — ${option.description}`}
                    onClick={() => onUpdateSettings({model: option.id as GeminiModelId})}
                    className={`w-full flex items-center justify-between gap-2.5 rounded-xl border px-2.5 py-1.5 text-left transition-colors cursor-pointer ${
                      selected
                        ? 'border-btn-primary-bg bg-surface-muted'
                        : 'border-border-main bg-surface hover:bg-surface-subtle'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-semibold text-text-main shrink-0">
                        {option.shortLabel}
                      </span>
                      <span className="rounded px-1 py-0.25 font-mono text-[9px] auteur-phase-slate shrink-0">
                        {labels.modelLiteBadge}
                      </span>
                      <span className="text-[10.5px] text-text-muted truncate">
                        {option.compactDesc}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono text-[10px] text-text-faint tabular-nums">
                        {rateText}
                      </span>
                      <span
                        aria-hidden="true"
                        className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border ${
                          selected
                            ? 'border-btn-primary-bg bg-btn-primary-bg text-btn-primary-text'
                            : 'border-border-main bg-surface'
                        }`}
                      >
                        {selected && <Check className="h-2.5 w-2.5" />}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Section 3: Compact Reasoning Level Segmented Control */}
          <section className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted shrink-0">
                {labels.reasoningLabel}
              </span>
              <span className="text-[11px] text-text-muted truncate">
                {selectedReasoning.description}
              </span>
            </div>

            <div
              role="radiogroup"
              aria-label={labels.reasoningGroupAria}
              className={`${UI_TOKENS.button.segmentedGroup} grid grid-cols-3 w-full`}
            >
              {REASONING_LEVEL_OPTIONS.map((option) => {
                const selected = settings.reasoningLevel === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    title={option.description}
                    onClick={() =>
                      onUpdateSettings({reasoningLevel: option.id as ReasoningLevel})
                    }
                    className={`${
                      selected
                        ? UI_TOKENS.button.segmentedItemActive
                        : UI_TOKENS.button.segmentedItem
                    } justify-center py-1`}
                  >
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Section 3b: Quick Scan Sensitivity Segmented Control */}
          <section className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted shrink-0">
                {labels.quickScanSensitivityLabel}
              </span>
              <span className="font-mono text-[10px] text-text-faint truncate">
                {labels.quickScanSensitivityMeta}
              </span>
            </div>

            <div
              role="radiogroup"
              aria-label={labels.quickScanSensitivityGroupAria}
              className={`${UI_TOKENS.button.segmentedGroup} grid grid-cols-3 w-full`}
            >
              {QUICK_SCAN_SENSITIVITY_OPTIONS.map((option) => {
                const selected = settings.quickScanSensitivity === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    title={option.description}
                    onClick={() =>
                      onUpdateSettings({
                        quickScanSensitivity: option.id as QuickScanSensitivity,
                      })
                    }
                    className={`${
                      selected
                        ? UI_TOKENS.button.segmentedItemActive
                        : UI_TOKENS.button.segmentedItem
                    } justify-center py-1`}
                  >
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[10.5px] text-text-muted">{selectedSensitivity.description}</p>
          </section>

          {/* Section 4: Unified Compact Display & Diagnostics Toggles */}
          <section className="rounded-xl border border-border-subtle bg-surface-subtle/60 divide-y divide-border-subtle">
            {/* Show reasoning summary */}
            <div className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <div className="text-xs font-medium text-text-main leading-tight">
                  {labels.thinkingSummaryLabel}
                </div>
                <div className="text-[11px] text-text-muted truncate">
                  {labels.thinkingSummaryDesc}
                </div>
              </div>
              <CompactToggleSwitch
                checked={settings.showThinkingSummary}
                ariaLabel={labels.thinkingSummaryAria}
                onToggle={() =>
                  onUpdateSettings({showThinkingSummary: !settings.showThinkingSummary})
                }
              />
            </div>

            {/* Show estimated cost */}
            <div className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <div className="text-xs font-medium text-text-main leading-tight">
                  {labels.estimatedCostLabel}
                </div>
                <div className="text-[11px] text-text-muted truncate">
                  {labels.estimatedCostDesc}
                </div>
              </div>
              <CompactToggleSwitch
                checked={settings.showEstimatedCost}
                ariaLabel={labels.estimatedCostAria}
                onToggle={() =>
                  onUpdateSettings({showEstimatedCost: !settings.showEstimatedCost})
                }
              />
            </div>

            {/* Show Debug Trace */}
            <div className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <div className="text-xs font-medium text-text-main leading-tight">
                  {labels.debugTraceLabel}
                </div>
                <div className="text-[11px] text-text-muted truncate">
                  {labels.debugTraceDesc}
                </div>
              </div>
              <CompactToggleSwitch
                checked={settings.showDebugTrace}
                ariaLabel={labels.debugTraceAria}
                onToggle={() => onUpdateSettings({showDebugTrace: !settings.showDebugTrace})}
              />
            </div>
          </section>
        </div>

        {/* Compact Footer: Reset to defaults (left) + Done (right) */}
        <div className="px-4 py-2.5 border-t border-border-subtle bg-surface-subtle flex items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            disabled={isAlreadyDefault}
            onClick={onResetDefaults}
            title={labels.resetDefaultsTitle}
            aria-label={labels.resetDefaultsAria}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-medium text-text-muted hover:text-text-main hover:bg-surface-muted transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-muted disabled:cursor-not-allowed cursor-pointer"
          >
            <RotateCcw className="h-3 w-3" />
            <span>{labels.resetDefaultsButton}</span>
          </button>

          <button type="button" onClick={onClose} className={`${UI_TOKENS.button.primary} py-1.5`}>
            {labels.doneButton}
          </button>
        </div>
      </div>
    </div>
  );
}
