import {memo} from 'react';
import {BookOpen, GitFork} from 'lucide-react';
import {UI_LABELS} from '../../ui/labels.ts';
import type {ScriptRecord} from '../../ui/scriptLibraryDb.ts';
import {
  formatRelativeUpdatedTime,
  type ScriptLineageNode,
  type ScriptOriginExample,
} from '../../ui/scriptLibraryView.ts';

export interface ScriptLineageTreeProps {
  nodes: readonly ScriptLineageNode[];
  activeScriptId: string;
  selectedNodeId: string | null;
  originExample?: ScriptOriginExample | null;
  nowMs: number;
  compact?: boolean;
  onSelectNode: (record: ScriptRecord) => void;
  onActivateNode?: (record: ScriptRecord) => void;
  onSelectOriginExample?: (exampleId: string) => void;
}

/**
 * Pure presentational hierarchical tree of connected scripts in a branch family.
 * Displays strictly Title + Timestamp + optional 1-line Branch Note (no line-diff clutter).
 */
export const ScriptLineageTree = memo(function ScriptLineageTree({
  nodes,
  activeScriptId,
  selectedNodeId,
  originExample,
  nowMs,
  compact = false,
  onSelectNode,
  onActivateNode,
  onSelectOriginExample,
}: ScriptLineageTreeProps) {
  const showRootBadge = nodes.length > 1;

  return (
    <div className="space-y-1.5">
      {originExample && (
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border-subtle bg-surface-subtle/70 text-[11px] text-text-muted">
          <BookOpen className="h-3 w-3 text-text-faint shrink-0" />
          <span className="truncate">
            {UI_LABELS.versionHistory.lineageOriginExampleLabel(originExample.title)}
          </span>
          {onSelectOriginExample && (
            <button
              type="button"
              onClick={() => onSelectOriginExample(originExample.id)}
              className="ml-auto shrink-0 font-mono text-[10px] font-medium text-text-body hover:text-text-main underline underline-offset-2 cursor-pointer"
            >
              {UI_LABELS.library.lineageOpenNodeAction}
            </button>
          )}
        </div>
      )}

      <div className="space-y-1">
        {nodes.map((node) => {
          const isSelected = selectedNodeId === node.id;
          const isCurrent = activeScriptId === node.id;
          const relTime = formatRelativeUpdatedTime(node.record.updatedAt, nowMs);

          return (
            <div key={node.id} className="flex items-stretch">
              {/* Tree guide rails for nested branches */}
              {node.depth > 0 && (
                <div aria-hidden="true" className="flex items-stretch shrink-0 select-none">
                  {node.ancestorHasNextSibling.map((hasSibling, idx) => (
                    <span
                      key={idx}
                      className="relative w-4 shrink-0"
                    >
                      {hasSibling && (
                        <span className="absolute left-2 top-0 bottom-0 w-px bg-border-main" />
                      )}
                    </span>
                  ))}
                  <span className="relative w-4 shrink-0">
                    <span
                      className={`absolute left-2 top-0 w-px bg-border-main ${
                        node.isLastChild ? 'h-4' : 'bottom-0'
                      }`}
                    />
                    <span className="absolute left-2 top-4 w-2 h-px bg-border-main" />
                  </span>
                </div>
              )}

              <button
                type="button"
                onClick={() => onSelectNode(node.record)}
                onDoubleClick={() => onActivateNode?.(node.record)}
                title={UI_LABELS.library.lineageSelectNodeTitle(node.record.title)}
                className={`flex-1 min-w-0 text-left rounded-xl border transition-colors cursor-pointer ${
                  compact ? 'px-2.5 py-2' : 'px-3 py-2.5'
                } ${
                  isSelected
                    ? 'border-text-main/40 bg-surface-muted text-text-main shadow-2xs'
                    : 'border-border-subtle bg-surface hover:bg-surface-subtle/80 text-text-body'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {node.depth > 0 && (
                      <GitFork className="h-3 w-3 text-text-faint shrink-0" />
                    )}
                    <span className="truncate font-serif text-[13px] font-bold tracking-tight text-text-main">
                      {node.record.title}
                    </span>
                    {showRootBadge && node.depth === 0 && (
                      <span className="inline-flex shrink-0 items-center rounded border border-border-subtle bg-surface-subtle px-1 py-px font-mono text-[9px] font-semibold uppercase tracking-wide text-text-faint">
                        {UI_LABELS.versionHistory.lineageRootBadge}
                      </span>
                    )}
                    {isCurrent && (
                      <span className="auteur-phase-continuity inline-flex shrink-0 items-center rounded border px-1.5 py-px font-mono text-[9px] font-semibold uppercase tracking-wide">
                        {UI_LABELS.versionHistory.lineageCurrentBadge}
                      </span>
                    )}
                  </div>

                  {relTime && (
                    <span className="font-mono text-[10px] text-text-faint shrink-0 tabular-nums">
                      {relTime}
                    </span>
                  )}
                </div>

                {node.record.branchNote && (
                  <p className="mt-1 truncate text-[11px] leading-snug text-text-muted">
                    {node.record.branchNote}
                  </p>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
});
