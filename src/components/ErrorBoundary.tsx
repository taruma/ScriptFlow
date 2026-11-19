import {Component, type ErrorInfo, type ReactNode} from 'react';
import {AlertTriangle, Check, Copy, RotateCw} from 'lucide-react';
import {copyTextToClipboard} from '../ui/clipboard.ts';
import {UI_LABELS} from '../ui/labels.ts';
import {readSavedScript} from '../ui/scriptStorage.ts';
import {applyThemeMode, loadStoredTheme} from '../ui/theme.ts';
import {UI_TOKENS} from '../ui/tokens/ui.ts';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  hasSavedScript: boolean;
  copyStatus: 'idle' | 'copied' | 'failed';
}

/**
 * Minimal theme-aware top-level Error Boundary with Reload and
 * "Copy Saved Script" recovery from localStorage.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private resetCopyTimer: number | null = null;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      hasSavedScript: false,
      copyStatus: 'idle',
    };
  }

  static getDerivedStateFromError(): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      hasSavedScript: readSavedScript() !== null,
      copyStatus: 'idle',
    };
  }

  componentDidCatch(_error: Error, _errorInfo: ErrorInfo): void {
    // Ensure the stored 4-mode theme is applied even if the crash happened before App mounted.
    applyThemeMode(loadStoredTheme(), false);
  }

  componentWillUnmount(): void {
    if (this.resetCopyTimer !== null) {
      window.clearTimeout(this.resetCopyTimer);
    }
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleCopySavedScript = async () => {
    const saved = readSavedScript();
    if (!saved) {
      this.setState({hasSavedScript: false, copyStatus: 'idle'});
      return;
    }

    const ok = await copyTextToClipboard(saved);
    this.setState({copyStatus: ok ? 'copied' : 'failed'});

    if (this.resetCopyTimer !== null) {
      window.clearTimeout(this.resetCopyTimer);
    }
    this.resetCopyTimer = window.setTimeout(() => {
      this.setState({copyStatus: 'idle'});
      this.resetCopyTimer = null;
    }, 2400);
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const {hasSavedScript, copyStatus} = this.state;

    return (
      <div className="min-h-screen bg-app text-text-main flex items-center justify-center p-6">
        <div
          role="alert"
          className="w-full max-w-md rounded-2xl border border-border-main bg-surface p-6 shadow-xl space-y-5"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border-main bg-surface-subtle text-text-main">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div className="min-w-0 space-y-1.5">
              <h1 className="font-serif text-base font-bold tracking-tight text-text-main">
                {UI_LABELS.errorBoundary.title}
              </h1>
              <p className="text-xs leading-relaxed text-text-muted">
                {UI_LABELS.errorBoundary.description}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={this.handleReload}
              className={`${UI_TOKENS.button.primary} inline-flex items-center gap-1.5`}
            >
              <RotateCw className="h-3.5 w-3.5" />
              <span>{UI_LABELS.errorBoundary.reloadAction}</span>
            </button>

            <button
              type="button"
              onClick={this.handleCopySavedScript}
              disabled={!hasSavedScript}
              className={`${UI_TOKENS.button.secondary} inline-flex items-center gap-1.5`}
            >
              {copyStatus === 'copied' ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              <span>
                {copyStatus === 'copied'
                  ? UI_LABELS.errorBoundary.copiedSavedScript
                  : UI_LABELS.errorBoundary.copySavedScript}
              </span>
            </button>
          </div>

          {!hasSavedScript && (
            <p className="text-[11px] text-text-faint">
              {UI_LABELS.errorBoundary.noSavedScriptNote}
            </p>
          )}

          {copyStatus === 'failed' && (
            <p className="text-[11px] text-red-500">
              {UI_LABELS.errorBoundary.copyFailedNote}
            </p>
          )}
        </div>
      </div>
    );
  }
}
