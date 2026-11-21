import {useEffect, useRef, useState} from 'react';
import {Check, Eye, EyeOff, KeyRound, ShieldCheck, Sparkles, Trash2, X} from 'lucide-react';
import {
  GEMINI_MODEL_OPTIONS,
  REASONING_LEVEL_OPTIONS,
  type AiSettings,
  type GeminiModelId,
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
}: Omit<AiSettingsModalProps, 'isOpen'>) {
  const [showKey, setShowKey] = useState(false);
  const [keyDraft, setKeyDraft] = useState(settings.apiKey);
  const keyInputRef = useRef<HTMLInputElement | null>(null);
  const labels = UI_LABELS.ai.settingsModal;

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
      <div className="bg-surface w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden border border-border-main text-text-main flex flex-col max-h-[90dvh]">
        {/* Header */}
        <div className={UI_TOKENS.modal.header}>
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              aria-hidden="true"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border-main bg-surface text-text-main"
            >
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <h2 className="font-serif text-[15px] font-bold tracking-tight text-text-main">
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

        {/* Body */}
        <div className="overflow-y-auto auteur-pane-scroll px-5 py-4 space-y-5">
          {/* Section 1: BYOK Gemini API Key */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="auteur-ai-api-key-input"
                className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted"
              >
                <KeyRound className="h-3.5 w-3.5 text-text-faint" />
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
                  className={`${UI_TOKENS.input.field} pr-9 font-mono`}
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
                className={`${UI_TOKENS.button.secondary} inline-flex items-center gap-1.5 py-2`}
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>{labels.clearKeyButton}</span>
              </button>
            </div>

            <div className="flex items-start gap-2 rounded-xl border border-border-subtle bg-surface-subtle px-3 py-2 text-[11px] leading-relaxed text-text-muted">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 mt-0.5 text-[var(--phase-aesthetic-text)]" />
              <span>{labels.privacyNote}</span>
            </div>

            {/* Session-only toggle */}
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle bg-surface-subtle/60 px-3 py-2">
              <div className="min-w-0">
                <div className="text-xs font-medium text-text-main">{labels.sessionOnlyLabel}</div>
                <div className="text-[11px] text-text-muted">{labels.sessionOnlyDesc}</div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.sessionOnly}
                aria-label={labels.sessionOnlyAria}
                onClick={() => onSetSessionOnly(!settings.sessionOnly)}
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors cursor-pointer ${
                  settings.sessionOnly
                    ? 'border-btn-primary-bg bg-btn-primary-bg'
                    : 'border-border-main bg-surface-muted'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full transition-transform ${
                    settings.sessionOnly
                      ? 'translate-x-4 bg-btn-primary-text'
                      : 'translate-x-0.5 bg-text-muted'
                  }`}
                />
              </button>
            </div>
          </section>

          <hr className="border-border-subtle" />

          {/* Section 2: Gemini 4 Model */}
          <section className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              {labels.modelLabel}
            </div>
            <div
              role="radiogroup"
              aria-label={labels.modelGroupAria}
              className="grid grid-cols-1 gap-1.5"
            >
              {GEMINI_MODEL_OPTIONS.map((option) => {
                const selected = settings.model === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => onUpdateSettings({model: option.id as GeminiModelId})}
                    className={`flex items-start justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors cursor-pointer ${
                      selected
                        ? 'border-btn-primary-bg bg-surface-muted'
                        : 'border-border-main bg-surface hover:bg-surface-subtle'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-text-main">
                          {option.shortLabel}
                        </span>
                        <span className="font-mono text-[10px] text-text-faint">{option.id}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] leading-snug text-text-muted">
                        {option.description}
                      </p>
                    </div>
                    <span
                      aria-hidden="true"
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                        selected
                          ? 'border-btn-primary-bg bg-btn-primary-bg text-btn-primary-text'
                          : 'border-border-main bg-surface'
                      }`}
                    >
                      {selected && <Check className="h-2.5 w-2.5" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Section 3: Reasoning Level */}
          <section className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              {labels.reasoningLabel}
            </div>
            <div
              role="radiogroup"
              aria-label={labels.reasoningGroupAria}
              className="grid grid-cols-3 gap-1.5"
            >
              {REASONING_LEVEL_OPTIONS.map((option) => {
                const selected = settings.reasoningLevel === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() =>
                      onUpdateSettings({reasoningLevel: option.id as ReasoningLevel})
                    }
                    className={`flex flex-col items-start rounded-xl border px-3 py-2 text-left transition-colors cursor-pointer ${
                      selected
                        ? 'border-btn-primary-bg bg-surface-muted text-text-main'
                        : 'border-border-main bg-surface text-text-body hover:bg-surface-subtle'
                    }`}
                  >
                    <span className="text-xs font-semibold">{option.label}</span>
                    <span className="mt-0.5 text-[10px] leading-snug text-text-muted">
                      {option.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Section 4: Display & Debugging Toggles */}
          <div className="space-y-2">
            {/* Show reasoning summary toggle */}
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle bg-surface-subtle/60 px-3 py-2.5">
              <div className="min-w-0">
                <div className="text-xs font-medium text-text-main">
                  {labels.thinkingSummaryLabel}
                </div>
                <div className="text-[11px] text-text-muted">{labels.thinkingSummaryDesc}</div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.showThinkingSummary}
                aria-label={labels.thinkingSummaryAria}
                onClick={() =>
                  onUpdateSettings({showThinkingSummary: !settings.showThinkingSummary})
                }
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors cursor-pointer ${
                  settings.showThinkingSummary
                    ? 'border-btn-primary-bg bg-btn-primary-bg'
                    : 'border-border-main bg-surface-muted'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full transition-transform ${
                    settings.showThinkingSummary
                      ? 'translate-x-4 bg-btn-primary-text'
                      : 'translate-x-0.5 bg-text-muted'
                  }`}
                />
              </button>
            </div>

            {/* Show estimated cost toggle */}
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle bg-surface-subtle/60 px-3 py-2.5">
              <div className="min-w-0">
                <div className="text-xs font-medium text-text-main">
                  {labels.estimatedCostLabel}
                </div>
                <div className="text-[11px] text-text-muted">{labels.estimatedCostDesc}</div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.showEstimatedCost}
                aria-label={labels.estimatedCostAria}
                onClick={() =>
                  onUpdateSettings({showEstimatedCost: !settings.showEstimatedCost})
                }
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors cursor-pointer ${
                  settings.showEstimatedCost
                    ? 'border-btn-primary-bg bg-btn-primary-bg'
                    : 'border-border-main bg-surface-muted'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full transition-transform ${
                    settings.showEstimatedCost
                      ? 'translate-x-4 bg-btn-primary-text'
                      : 'translate-x-0.5 bg-text-muted'
                  }`}
                />
              </button>
            </div>

            {/* Show Debug Trace toggle */}
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle bg-surface-subtle/60 px-3 py-2.5">
              <div className="min-w-0">
                <div className="text-xs font-medium text-text-main">{labels.debugTraceLabel}</div>
                <div className="text-[11px] text-text-muted">{labels.debugTraceDesc}</div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.showDebugTrace}
                aria-label={labels.debugTraceAria}
                onClick={() => onUpdateSettings({showDebugTrace: !settings.showDebugTrace})}
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors cursor-pointer ${
                  settings.showDebugTrace
                    ? 'border-btn-primary-bg bg-btn-primary-bg'
                    : 'border-border-main bg-surface-muted'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full transition-transform ${
                    settings.showDebugTrace
                      ? 'translate-x-4 bg-btn-primary-text'
                      : 'translate-x-0.5 bg-text-muted'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={UI_TOKENS.modal.footer}>
          <button type="button" onClick={onClose} className={UI_TOKENS.button.primary}>
            {labels.doneButton}
          </button>
        </div>
      </div>
    </div>
  );
}
