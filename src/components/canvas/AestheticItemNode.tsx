import {memo} from 'react';
import {Handle, Position, type NodeProps} from '@xyflow/react';
import type {
  AestheticItemAccentKind,
  GraphAestheticItem,
  GraphDirection,
} from '../../ui/canvas/index.ts';
import {UI_LABELS} from '../../ui/labels.ts';
import {AnnotatedProse} from './AnnotatedProse.tsx';

export interface AestheticItemNodeData extends Record<string, unknown> {
  item: GraphAestheticItem;
  direction: GraphDirection;
  isTraced: boolean;
  isDimmed: boolean;
}

function getAestheticAccentColor(kind: AestheticItemAccentKind): string {
  switch (kind) {
    case 'location':
      return 'var(--graph-obj-location)';
    case 'wardrobe':
      return 'var(--graph-obj-wardrobe)';
    case 'prop':
      return 'var(--graph-obj-prop)';
    case 'staging_ref':
      return 'var(--graph-obj-staging_ref)';
    case 'general':
    default:
      return 'var(--phase-aesthetic-text)';
  }
}

/**
 * Lookbook Key-Value swatch mini-card for expanded `[AESTHETIC]` Staging Macro-Blocks.
 * Visually distinct from Execution Sub-State cards: uses a top swatch hairline, dashed spec
 * framing, uppercase key kicker, and semicolon-split value entries with clickable entity chips.
 */
export const AestheticItemNode = memo(function AestheticItemNode({data}: NodeProps) {
  const {item, direction, isTraced, isDimmed} = data as AestheticItemNodeData;
  const isLR = direction === 'LR';
  const accentColor = getAestheticAccentColor(item.accentKind);
  const outHandleStyle = isLR ? {left: '44%'} : {top: '44%'};
  const matchHandleStyle = isLR ? {left: '56%'} : {top: '56%'};

  const segments = item.value
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  const displaySegments = segments.length > 0 ? segments : [item.value || '—'];

  return (
    <div
      style={{
        borderColor: isTraced
          ? 'var(--tok-continuity)'
          : `color-mix(in srgb, ${accentColor} 32%, var(--border-main))`,
      }}
      className={`relative rounded-xl border border-dashed bg-surface-subtle/90 overflow-hidden shadow-2xs transition-[opacity,box-shadow,border-color] duration-150 ${
        isTraced ? 'auteur-graph-traced' : ''
      } ${isDimmed ? 'auteur-graph-dimmed' : ''}`}
    >
      {/* Tree connection from parent [AESTHETIC] header */}
      <Handle type="target" id="aes-branch-in" position={isLR ? Position.Top : Position.Left} />
      {/* Tier 1 -> Tier 2 extraction & Tier 2 -> Tier 1 reference ports */}
      <Handle
        type="source"
        id="aes-out"
        position={isLR ? Position.Bottom : Position.Right}
        style={outHandleStyle}
      />
      <Handle
        type="target"
        id="aes-match-in"
        position={isLR ? Position.Bottom : Position.Right}
        style={matchHandleStyle}
      />

      {/* Top Lookbook Swatch Hairline (visually distinct from Execution Sub-State left bar) */}
      <div
        className="h-[3px] w-full"
        style={{backgroundColor: accentColor, opacity: 0.85}}
        aria-hidden="true"
      />

      <div className="px-3 py-2">
        <div className="flex items-center justify-between gap-2 pb-1.5 mb-1.5 border-b border-dashed border-border-subtle">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className="h-1.5 w-1.5 rounded-xs shrink-0"
              style={{backgroundColor: accentColor}}
              aria-hidden="true"
            />
            <span
              className="font-mono text-[10px] font-bold uppercase tracking-wider truncate"
              style={{color: accentColor}}
            >
              {item.key}
            </span>
          </div>

          {item.extractedObjectIds.length > 0 && (
            <span className="font-mono text-[9.5px] tabular-nums text-text-faint shrink-0">
              {UI_LABELS.graph.aestheticTokensBadge(item.extractedObjectIds.length)}
            </span>
          )}
        </div>

        <div className="space-y-1">
          {displaySegments.map((seg, idx) => (
            <p
              key={idx}
              className="text-[11.5px] leading-snug text-text-body break-words"
            >
              <AnnotatedProse text={seg} />
            </p>
          ))}
        </div>
      </div>
    </div>
  );
});
