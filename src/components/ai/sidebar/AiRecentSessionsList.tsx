import {History, Pin} from 'lucide-react';
import {getGeminiModelOption} from '../../../ui/aiSettings.ts';
import type {AiSessionRecord, ResolvedAiSessionSummary} from '../../../ui/aiSessions.ts';
import {UI_LABELS} from '../../../ui/labels.ts';
import {formatRelativeUpdatedTime} from '../../../ui/scriptLibraryView.ts';

export interface AiRecentSessionsListProps {
  sessions: readonly ResolvedAiSessionSummary[];
  onSelectSession: (summary: ResolvedAiSessionSummary) => void;
  onOpenHistoryModal: () => void;
  now?: number;
}

export function AiRecentSessionsList({
  sessions,
  onSelectSession,
  onOpenHistoryModal,
  now,
}: AiRecentSessionsListProps) {
  const labels = UI_LABELS.ai.history;
  if (sessions.length === 0) return null;

  return (
    <div className="rounded-xl border border-border-main bg-surface/80 p-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <History className="h-3 w-3 text-text-faint shrink-0" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-text-faint">
            {labels.recentHeading}
          </span>
        </div>
        <button
          type="button"
          onClick={onOpenHistoryModal}
          className="text-[11px] font-medium text-text-muted hover:text-text-main transition-colors cursor-pointer"
        >
          {labels.viewAllButton}
        </button>
      </div>

      <div className="space-y-1">
        {sessions.map((item) => {
          const session: AiSessionRecord = item.session;
          const modelShort = getGeminiModelOption(session.model).shortLabel;
          const timeLabel = formatRelativeUpdatedTime(session.updatedAt, now);
          const isDeleted = item.scriptStatus === 'deleted';
          const isCurrent = item.scriptStatus === 'current';

          return (
            <button
              key={session.id}
              type="button"
              onClick={() => onSelectSession(item)}
              className="w-full text-left rounded-lg border border-border-subtle bg-surface-subtle/60 hover:bg-surface-hover hover:border-border-main px-2.5 py-2 transition-colors cursor-pointer space-y-1"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 min-w-0 text-xs font-medium text-text-main">
                  {session.pinned && (
                    <Pin className="h-2.5 w-2.5 text-[var(--phase-continuity-text)] shrink-0" />
                  )}
                  <span className="truncate">{session.title}</span>
                </span>
                <span className="text-[10px] text-text-faint tabular-nums shrink-0">
                  {timeLabel}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2 text-[10px] text-text-muted">
                <span className="flex items-center gap-1.5 min-w-0 truncate">
                  <span
                    className={`rounded border px-1 py-0.25 text-[9.5px] font-medium truncate max-w-[140px] ${
                      isCurrent
                        ? 'auteur-phase-continuity'
                        : isDeleted
                          ? 'border-border-subtle bg-surface text-text-faint italic'
                          : 'border-border-subtle bg-surface text-text-muted'
                    }`}
                  >
                    {isCurrent
                      ? labels.thisScriptBadge
                      : isDeleted
                        ? `${item.resolvedScriptTitle} · ${labels.scriptDeletedBadge}`
                        : item.resolvedScriptTitle}
                  </span>
                  <span className="shrink-0 text-text-faint">·</span>
                  <span className="shrink-0 tabular-nums">
                    {labels.turnsLabel(session.turnCount)}
                  </span>
                </span>
                <span className="font-mono text-[9.5px] text-text-faint shrink-0">
                  {modelShort}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
