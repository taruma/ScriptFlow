import {memo} from 'react';
import {Handle, Position, type NodeProps} from '@xyflow/react';
import {Code2, Layers, Minimize2} from 'lucide-react';
import type {MacroBlockKind} from '../../core/types.ts';
import type {GraphDirection, GraphStagingBlockItem} from '../../ui/canvas/index.ts';
import {UI_LABELS} from '../../ui/labels.ts';
import {AnnotatedProse} from './AnnotatedProse.tsx';
import {useGraphInteraction} from './graphContext.tsx';

export interface StagingBlockNodeData extends Record<string, unknown> {
  block: GraphStagingBlockItem;
  direction: GraphDirection;
  isExpanded?: boolean;
  isRawOpen?: boolean;
  isTraced: boolean;
  isSecondaryTraced?: boolean;
  isDimmed: boolean;
}

function getHeaderAccentColor(kind: MacroBlockKind): string {
  switch (kind) {
    case 'INTENT':
      return 'var(--phase-intent-text)';
    case 'LOGIC':
      return 'var(--phase-logic-text)';
    case 'AESTHETIC':
      return 'var(--phase-aesthetic-text)';
    case 'OPENING':
      return 'var(--phase-opening-text)';
    case 'CONTINUITY PROTOCOL':
      return 'var(--phase-continuity-text)';
    default:
      return 'var(--phase-slate-text)';
  }
}

export const StagingBlockNode = memo(function StagingBlockNode({data}: NodeProps) {
  const {
    block,
    direction,
    isExpanded = false,
    isRawOpen = false,
    isTraced,
    isSecondaryTraced = false,
    isDimmed,
  } = data as StagingBlockNodeData;
  const {onToggleStagingExpand, onToggleRaw} = useGraphInteraction();

  const isLR = direction === 'LR';
  const portPosition = isLR ? Position.Bottom : Position.Right;
  const outHandleStyle = isLR ? {left: '42%'} : {top: '42%'};
  const matchHandleStyle = isLR ? {left: '58%'} : {top: '58%'};
  const aesBranchStyle = isLR ? {left: '50%'} : {left: '13px'};
  const headerColor = getHeaderAccentColor(block.kind);
  const isAesthetic = block.kind === 'AESTHETIC';
  const hasAestheticItems = isAesthetic && block.aestheticItems.length > 0;

  return (
    <div
      style={
        isSecondaryTraced
          ? {borderColor: 'color-mix(in srgb, var(--tok-continuity) 42%, var(--border-main))'}
          : undefined
      }
      className={`relative rounded-xl border bg-surface p-3.5 shadow-2xs transition-[opacity,box-shadow,border-color] duration-150 ${
        isTraced
          ? 'auteur-graph-traced border-[var(--tok-continuity)]'
          : isSecondaryTraced
            ? 'auteur-graph-secondary-traced border-border-main'
            : 'border-border-main'
      } ${isDimmed ? 'auteur-graph-dimmed' : ''}`}
    >
      <Handle type="source" id="staging-out" position={portPosition} style={outHandleStyle} />
      <Handle type="target" id="staging-match-in" position={portPosition} style={matchHandleStyle} />
      <Handle type="target" id="raw-in" position={isLR ? Position.Top : Position.Left} />
      <Handle
        type="source"
        id="aes-branch-out"
        position={Position.Bottom}
        style={aesBranchStyle}
      />

      <div className="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-border-subtle">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="font-mono text-[11px] font-bold tracking-wide truncate"
            style={{color: headerColor}}
          >
            [{block.name}]
          </span>
          <span className="font-mono text-[10px] tabular-nums text-text-faint shrink-0">
            {block.mbId}
          </span>
          {hasAestheticItems && (
            <span className="font-mono text-[10px] tabular-nums text-text-muted shrink-0">
              · {UI_LABELS.graph.aestheticKeysCount(block.aestheticItems.length)}
            </span>
          )}
        </div>

        {isAesthetic && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleRaw(block.mbId);
              }}
              title={UI_LABELS.graph.rawToggleTitle(`[${block.name}]`)}
              aria-label={UI_LABELS.graph.rawToggleTitle(`[${block.name}]`)}
              aria-pressed={isRawOpen}
              style={
                isRawOpen
                  ? {
                      borderColor: 'var(--tok-continuity)',
                      color: 'var(--tok-continuity)',
                      backgroundColor:
                        'color-mix(in srgb, var(--tok-continuity) 12%, transparent)',
                    }
                  : undefined
              }
              className={`nodrag nopan inline-flex items-center justify-center rounded-md border px-1.5 py-1 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                isRawOpen
                  ? ''
                  : 'border-border-main bg-surface text-text-muted hover:text-text-main hover:bg-surface-hover'
              }`}
            >
              <Code2 className="h-3 w-3" aria-hidden="true" />
            </button>

            {hasAestheticItems && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleStagingExpand(block.mbId);
                }}
                title={
                  isExpanded
                    ? UI_LABELS.graph.aestheticFoldTitle(block.name)
                    : UI_LABELS.graph.aestheticExpandTitle(block.name)
                }
                aria-expanded={isExpanded}
                className="nodrag nopan inline-flex items-center gap-1 rounded-md border border-border-main bg-surface px-1.5 py-0.5 text-[11px] font-medium text-text-muted hover:text-text-main hover:bg-surface-hover transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                {isExpanded ? (
                  <Minimize2 className="h-3 w-3" aria-hidden="true" />
                ) : (
                  <Layers className="h-3 w-3" aria-hidden="true" />
                )}
                <span>
                  {isExpanded
                    ? UI_LABELS.graph.aestheticFoldCard
                    : UI_LABELS.graph.aestheticKeysCard}
                </span>
              </button>
            )}
          </div>
        )}
      </div>

      {hasAestheticItems && isExpanded ? (
        <p className="text-[11.5px] text-text-muted">
          {UI_LABELS.graph.aestheticExpandedSummary(block.aestheticItems.length, '↓')}
        </p>
      ) : block.lines.length > 0 ? (
        <div className="space-y-1.5">
          {block.lines.map((line, idx) => (
            <p key={idx} className="text-xs leading-relaxed text-text-body break-words">
              <AnnotatedProse text={line} />
            </p>
          ))}
        </div>
      ) : (
        <p className="text-xs italic text-text-faint">—</p>
      )}
    </div>
  );
});
