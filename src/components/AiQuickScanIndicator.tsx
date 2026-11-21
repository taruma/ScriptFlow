import {createContext, memo, useContext, useEffect, useRef, useState} from 'react';
import {ScanSearch, ShieldAlert, X} from 'lucide-react';
import {UI_LABELS} from '../ui/labels.ts';
import type {LiveBeatQuickScanIndicator} from '../ui/quickScanIndicators.ts';
import {UI_TOKENS} from '../ui/tokens/ui.ts';

export interface LiveQuickScanActionContextValue {
  onAuditBeat?: (beatIndex: number) => void;
}

export const LiveQuickScanActionContext = createContext<LiveQuickScanActionContextValue>({});

export interface AiQuickScanIndicatorProps {
  beatIndex: number;
  indicators: readonly LiveBeatQuickScanIndicator[];
  align?: 'top' | 'center';
}

export const AiQuickScanIndicator = memo(function AiQuickScanIndicator({
  beatIndex,
  indicators,
  align = 'top',
}: AiQuickScanIndicatorProps) {
  const {onAuditBeat} = useContext(LiveQuickScanActionContext);
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isOpen = hovered || pinned;

  useEffect(() => {
    if (!pinned) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setPinned(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPinned(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [pinned]);

  if (indicators.length === 0) return null;

  const qsLabels = UI_LABELS.ai.quickScan;
  const hasFlagged = indicators.some((item) => item.status === 'flagged');
  const triggerToneClass = hasFlagged
    ? 'border-red-500/40 bg-red-500/12 text-red-600 dark:text-red-400 hover:bg-red-500/20'
    : 'border-amber-500/45 bg-amber-500/12 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20';

  return (
    <div
      ref={containerRef}
      className={`relative flex items-start justify-center ${
        align === 'center' ? 'self-center' : ''
      }`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setPinned((prev) => !prev);
        }}
        aria-label={qsLabels.liveIndicatorTriggerAria(beatIndex, indicators.length, hasFlagged)}
        aria-expanded={isOpen}
        className={`flex h-6 w-6 items-center justify-center rounded-full border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 ${triggerToneClass}`}
      >
        <ScanSearch className="h-3 w-3" />
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label={qsLabels.liveIndicatorDialogAria(beatIndex)}
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-6 z-50 pt-1.5 w-80 max-w-[calc(100vw-2.5rem)]"
        >
          <div className="rounded-xl border border-border-main bg-surface shadow-2xl text-text-main overflow-hidden">
            <div className="flex items-center justify-between border-b border-border-subtle bg-surface-subtle px-3 py-2">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-text-muted">
                <ScanSearch className="h-3 w-3 text-text-faint" />
                <span>{qsLabels.liveIndicatorHeader(beatIndex)}</span>
              </span>
              {pinned && (
                <button
                  type="button"
                  onClick={() => setPinned(false)}
                  className="rounded-md p-0.5 text-text-faint hover:bg-surface-muted hover:text-text-main cursor-pointer"
                  aria-label={qsLabels.liveIndicatorCloseAria}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="divide-y divide-border-subtle max-h-64 overflow-y-auto auteur-pane-scroll">
              {indicators.map((item) => {
                const pct = Math.round(item.probability * 100);
                const statusBadgeClass =
                  item.status === 'flagged'
                    ? 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'
                    : 'border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300';

                return (
                  <div key={item.key} className="px-3 py-2 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {item.scope === 'sub_state' && (
                          <span className="shrink-0 rounded border border-border-main bg-surface-subtle px-1 py-0.5 font-mono text-[9px] font-semibold text-text-main">
                            {item.targetId}
                          </span>
                        )}
                        <span className="text-[11px] font-medium text-text-main leading-snug">
                          {item.ruleLabel}
                        </span>
                      </div>
                      <span
                        className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold ${statusBadgeClass}`}
                      >
                        {item.source === 'deterministic' ? qsLabels.deterministicBadge : `${pct}%`}
                      </span>
                    </div>
                    <div className="text-[10px] text-text-faint">
                      {qsLabels.lensLabels[item.lens]}
                    </div>
                    {item.deterministicMessage ? (
                      <p className="text-[11px] text-text-muted leading-snug">
                        {item.deterministicMessage}
                      </p>
                    ) : (
                      item.instructions && (
                        <p className="text-[10.5px] text-text-muted leading-snug">
                          {item.instructions}
                        </p>
                      )
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-border-subtle bg-surface-subtle px-3 py-2">
              <span className="text-[10px] text-text-faint leading-tight">
                {qsLabels.liveIndicatorFooterHint}
              </span>
              {onAuditBeat && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAuditBeat(beatIndex);
                    setPinned(false);
                    setHovered(false);
                  }}
                  className={`${UI_TOKENS.button.primary} shrink-0 inline-flex items-center gap-1 px-2.5 py-1 text-[11px]`}
                >
                  <ShieldAlert className="h-3 w-3" />
                  <span>{qsLabels.liveIndicatorAuditButton(beatIndex)}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
